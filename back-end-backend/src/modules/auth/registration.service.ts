import {
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { hash } from 'bcryptjs';
import {
  EmailVerificationEntity,
  RoleEntity,
  UserEntity,
  UserProfileEntity,
} from '../../../mysql/entities/index.js';
import {
  SNOWFLAKE_ID_GENERATOR,
  SnowflakeIdGenerator,
} from '../../../mysql/snowflake-id.js';
import { Inject } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegistrationMailerService } from './registration-mailer.service.js';
import {
  assertBcryptPasswordLength,
  BCRYPT_ROUNDS,
} from './password-policy.js';

type RegistrationResult =
  | { type: 'registered'; user: UserEntity }
  | { type: 'invalid-code' }
  | { type: 'expired' }
  | { type: 'email-conflict' }
  | { type: 'username-conflict' };

function isDuplicateKeyError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError: unknown = error.driverError;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    driverError.code === 'ER_DUP_ENTRY'
  );
}

@Injectable()
/** 管理邮箱验证码发送、校验和本地账号原子注册。 */
export class RegistrationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(SNOWFLAKE_ID_GENERATOR)
    private readonly snowflakeIds: SnowflakeIdGenerator,
    private readonly authService: AuthService,
    private readonly mailer: RegistrationMailerService,
  ) {}

  /** 校验邮箱和重发间隔，保存验证码摘要后发送邮件。 */
  async sendCode(emailInput: string): Promise<number> {
    this.mailer.ensureConfigured();
    const email = emailInput.trim().toLowerCase();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = new Date();
    const cooldownSeconds =
      this.config.getOrThrow<number>('app.email.verificationCooldown');
    const expiresMs = this.config.getOrThrow<number>('app.email.expires');
    const expiresAt = new Date(now.getTime() + expiresMs);
    // 数据库只保存带服务端密钥的摘要，即使验证码表泄漏也不能直接还原验证码。
    const codeHash = this.hashCode(email, code);

    let maySend: boolean;
    try {
      maySend = await this.dataSource.transaction(async (manager) => {
        const profiles = manager.getRepository(UserProfileEntity);
        if (await profiles.exists({ where: { email } })) return false;

        const verifications = manager.getRepository(EmailVerificationEntity);
        const current = await verifications
          .createQueryBuilder('verification')
          .where('verification.email = :email', { email })
          .setLock('pessimistic_write')
          .getOne();
        if (
          current &&
          now.getTime() - current.lastSentAt.getTime() <
            cooldownSeconds * 1000
        ) {
          throw new HttpException(
            `请等待 ${cooldownSeconds} 秒后再获取验证码`,
            429,
          );
        }

        await verifications.save(
          verifications.create({
            ...(current ? { id: current.id } : {}),
            email,
            codeHash,
            expiresAt,
            lastSentAt: now,
            attempts: 0,
          }),
        );
        return true;
      });
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw new HttpException('验证码请求过于频繁，请稍后重试', 429);
      }
      throw error;
    }

    if (!maySend) return cooldownSeconds;

    try {
      await this.mailer.sendVerificationCode(email, code, expiresMs);
    } catch (error: unknown) {
      // 邮件发送失败时删除本次验证码，避免数据库保留用户实际未收到的有效码。
      await this.dataSource
        .getRepository(EmailVerificationEntity)
        .delete({ email, codeHash });
      throw error;
    }
    return cooldownSeconds;
  }

  /** 在单个事务内消费验证码并创建账号、资料和默认角色关联。 */
  async register(input: {
    username: string;
    email: string;
    password: string;
    emailCode: string;
  }, ipAddress?: string) {
    assertBcryptPasswordLength(input.password);
    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();
    let result: RegistrationResult;
    try {
      result = await this.dataSource.transaction(
        async (manager): Promise<RegistrationResult> => {
        // 对验证码行加锁，保证并发注册/重试时验证码只能被成功消费一次。
        const verifications = manager.getRepository(EmailVerificationEntity);
        const verification = await verifications
          .createQueryBuilder('verification')
          .where('verification.email = :email', { email })
          .setLock('pessimistic_write')
          .getOne();
        if (!verification) return { type: 'expired' };

        const now = new Date();
        if (verification.expiresAt <= now || verification.attempts >= 5) {
          await verifications.delete({ id: verification.id });
          return { type: 'expired' };
        }

        const expected = Buffer.from(verification.codeHash, 'hex');
        const received = Buffer.from(this.hashCode(email, input.emailCode), 'hex');
        if (
          expected.length !== received.length ||
          !timingSafeEqual(expected, received)
        ) {
          verification.attempts += 1;
          if (verification.attempts >= 5) {
            await verifications.delete({ id: verification.id });
          } else {
            await verifications.save(verification);
          }
          return { type: 'invalid-code' };
        }

        const users = manager.getRepository(UserEntity);
        if (await users.exists({ where: { username } })) {
          return { type: 'username-conflict' };
        }
        const profiles = manager.getRepository(UserProfileEntity);
        if (await profiles.exists({ where: { email } })) {
          await verifications.delete({ id: verification.id });
          return { type: 'email-conflict' };
        }

        const userRole = await manager
          .getRepository(RoleEntity)
          .findOneBy({ key: 'user' });
        if (!userRole) throw new Error('Required default user role is missing');

        const userId = await this.snowflakeIds.nextId();
        const user = users.create({
          userId,
          username,
          password: await hash(input.password, BCRYPT_ROUNDS),
          status: 'active',
          lastLoginIp: ipAddress?.slice(0, 50) ?? null,
          lastLoginAt: new Date(),
          creater: '系统',
          createrId: 'system',
          operator: username,
          operatorId: userId,
          roles: [userRole],
        });
        const savedUser = await users.save(user);
        const profile = profiles.create({
          userId: savedUser.userId,
          email,
          nickname: username,
          creater: '系统',
          createrId: 'system',
          operator: username,
          operatorId: savedUser.userId,
        });
        await profiles.save(profile);
        savedUser.profile = profile;
        savedUser.roles = [userRole];
        await verifications.delete({ id: verification.id });
        return { type: 'registered', user: savedUser };
        },
      );
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('用户名或邮箱已被使用');
      }
      throw error;
    }

    switch (result.type) {
      case 'registered':
        return this.authService.createSession(result.user);
      case 'invalid-code':
        throw new ConflictException('邮箱验证码错误');
      case 'expired':
        throw new ConflictException('邮箱验证码已过期，请重新获取');
      case 'email-conflict':
        throw new ConflictException('该邮箱已注册');
      case 'username-conflict':
        throw new ConflictException('用户名已被使用');
    }
  }

  private hashCode(email: string, code: string): string {
    const secret = this.config.getOrThrow<string>('app.jwt.secret');
    return createHmac('sha256', secret)
      .update(`registration:${email}:${code}`)
      .digest('hex');
  }
}
