import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Inject } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, LessThan, MoreThan, QueryFailedError } from 'typeorm';
import {
  OAuthIdentityEntity,
  OAuthLoginCodeEntity,
  OAuthStateEntity,
  RoleEntity,
  type OAuthProvider,
  UserEntity,
  UserProfileEntity,
} from '../entities/index.js';
import { SNOWFLAKE_ID_GENERATOR, SnowflakeIdGenerator } from '../snowflake-id.js';

export interface OAuthProfile {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface OAuthState {
  provider: OAuthProvider;
  userId: string | null;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

@Injectable()
export class OAuthRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(SNOWFLAKE_ID_GENERATOR)
    private readonly snowflakeIds: SnowflakeIdGenerator,
  ) {}

  async findOrCreateUser(
    provider: OAuthProvider,
    profile: OAuthProfile,
  ): Promise<UserEntity> {
    const identities = this.dataSource.getRepository(OAuthIdentityEntity);
    const linked = await identities.findOne({
      where: { provider, providerUserId: profile.id },
      relations: { user: { profile: true, roles: true } },
    });
    if (linked) return linked.user;

    try {
      return await this.dataSource.transaction(async (manager) => {
        const identityRepository = manager.getRepository(OAuthIdentityEntity);
        const existingIdentity = await identityRepository.findOne({
          where: { provider, providerUserId: profile.id },
          relations: { user: { profile: true, roles: true } },
        });
        if (existingIdentity) return existingIdentity.user;

        const users = manager.getRepository(UserEntity);
        const profiles = manager.getRepository(UserProfileEntity);
        const userRole = await manager
          .getRepository(RoleEntity)
          .findOneBy({ key: 'user' });
        if (!userRole) {
          throw new Error('Required default user role is missing from roles');
        }
        const providerHash = createHash('sha256')
          .update(`${provider}:${profile.id}`)
          .digest('hex');
        const username = `${provider}_${providerHash.slice(0, 40)}`;
        const generatedEmail = `oauth-${providerHash}@users.invalid`;
        const candidateEmail = profile.email?.trim().toLowerCase();
        const emailExists =
          candidateEmail && candidateEmail.length <= 100
            ? await profiles
                .createQueryBuilder('profile')
                .where('LOWER(profile.email) = :email', {
                  email: candidateEmail,
                })
                .getExists()
            : false;
        const user = users.create({
          userId: await this.snowflakeIds.nextId(),
          username,
          password: null,
          status: 'active',
          lastLoginAt: new Date(),
          roles: [userRole],
        });
        const savedUser = await users.save(user);
        await profiles.save(
          profiles.create({
            userId: savedUser.userId,
            email:
              candidateEmail && candidateEmail.length <= 100 && !emailExists
                ? candidateEmail
                : generatedEmail,
            nickname: (
              profile.displayName ||
              profile.username ||
              provider
            ).slice(0, 60),
            avatar: profile.avatarUrl?.slice(0, 255) || null,
          }),
        );
        await identityRepository.save(
          identityRepository.create({
            provider,
            providerUserId: profile.id,
            user: savedUser,
          }),
        );
        return savedUser;
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) throw error;

      const concurrentIdentity = await identities.findOne({
        where: { provider, providerUserId: profile.id },
        relations: { user: { profile: true, roles: true } },
      });
      if (concurrentIdentity) return concurrentIdentity.user;
      throw new ConflictException('无法创建第三方登录对应的本地用户');
    }
  }

  async linkIdentity(
    userId: string,
    provider: OAuthProvider,
    profile: OAuthProfile,
  ): Promise<void> {
    const identities = this.dataSource.getRepository(OAuthIdentityEntity);
    const existing = await identities.findOne({
      where: { provider, providerUserId: profile.id },
      relations: { user: true },
    });
    if (existing) {
      if (existing.user.userId === userId) return;
      throw new ConflictException(
        '此第三方账号已关联其他本地账号，请先登录对应账号',
      );
    }

    try {
      await identities.save(
        identities.create({
          provider,
          providerUserId: profile.id,
          user: { userId },
        }),
      );
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) throw error;
      const racedIdentity = await identities.findOne({
        where: { provider, providerUserId: profile.id },
        relations: { user: true },
      });
      if (racedIdentity?.user.userId === userId) return;
      throw new ConflictException(
        '此第三方账号已关联其他本地账号，请先登录对应账号',
      );
    }
  }

  async getLinkedProviders(userId: string): Promise<OAuthProvider[]> {
    const identities = await this.dataSource
      .getRepository(OAuthIdentityEntity)
      .find({
        select: { provider: true },
        where: { user: { userId } },
      });
    return identities.map(({ provider }) => provider);
  }

  async createState(
    state: string,
    provider: OAuthProvider,
    userId: string | null,
  ): Promise<void> {
    const states = this.dataSource.getRepository(OAuthStateEntity);
    const now = new Date();
    await states.delete({ expiresAt: LessThan(now) });
    await states.save(
      states.create({
        stateHash: createHash('sha256').update(state).digest('hex'),
        provider,
        user: userId === null ? null : { userId },
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      }),
    );
  }

  async consumeState(
    state: string,
    provider: OAuthProvider,
  ): Promise<OAuthState | null> {
    const stateHash = createHash('sha256').update(state).digest('hex');
    return this.dataSource.transaction(async (manager) => {
      const states = manager.getRepository(OAuthStateEntity);
      const now = new Date();
      const oauthState = await states
        .createQueryBuilder('oauthState')
        .leftJoinAndSelect('oauthState.user', 'user')
        .where('oauthState.stateHash = :stateHash', { stateHash })
        .andWhere('oauthState.provider = :provider', { provider })
        .andWhere('oauthState.expiresAt > :now', { now })
        .getOne();
      if (!oauthState) return null;

      const deletion = await states.delete({ stateHash, provider });
      if (deletion.affected !== 1) return null;
      return {
        provider: oauthState.provider,
        userId: oauthState.user?.userId ?? null,
      };
    });
  }

  async createLoginCode(userId: string): Promise<string> {
    const rawCode = randomBytes(32).toString('base64url');
    const loginCodes = this.dataSource.getRepository(OAuthLoginCodeEntity);
    await loginCodes.delete({ expiresAt: LessThan(new Date()) });
    await loginCodes.save(
      loginCodes.create({
        codeHash: createHash('sha256').update(rawCode).digest('hex'),
        user: { userId },
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      }),
    );
    return rawCode;
  }

  async consumeLoginCode(code: string): Promise<UserEntity | null> {
    const codeHash = createHash('sha256').update(code).digest('hex');
    return this.dataSource.transaction(async (manager) => {
      const codes = manager.getRepository(OAuthLoginCodeEntity);
      const now = new Date();
      const loginCode = await codes
        .createQueryBuilder('loginCode')
        .innerJoinAndSelect('loginCode.user', 'user')
        .leftJoinAndSelect('user.profile', 'profile')
        .leftJoinAndSelect('user.roles', 'role')
        .where('loginCode.codeHash = :codeHash', { codeHash })
        .andWhere('loginCode.expiresAt > :now', { now })
        .getOne();
      if (!loginCode) return null;

      const deletion = await codes.delete({
        codeHash,
        expiresAt: MoreThan(now),
      });
      if (deletion.affected !== 1) return null;

      loginCode.user.lastLoginAt = now;
      return manager.getRepository(UserEntity).save(loginCode.user);
    });
  }
}
