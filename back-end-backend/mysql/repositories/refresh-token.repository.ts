import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, LessThan } from 'typeorm';
import {
  RefreshTokenEntity,
  UserEntity,
} from '../entities/index.js';
import { mapEnabledStatus } from '../entities/user.entity.js';
import { REFRESH_TOKEN_TTL_SECONDS } from '../../config/auth.constants.js';

@Injectable()
/** 管理 Refresh Token 哈希，提供一次性轮换和撤销操作。 */
export class RefreshTokenRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(token: string, userId: string): Promise<number | null> {
    return this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity);
      const user = await users
        .createQueryBuilder('user')
        .where('user.userId = :userId', { userId })
        .setLock('pessimistic_write')
        .getOne();
      if (!user || mapEnabledStatus(user.status) !== 'active') return null;

      const tokens = manager.getRepository(RefreshTokenEntity);
      const now = new Date();
      await tokens.delete({ expiresAt: LessThan(now) });

      if (Number(user.isAllowMulti) !== 1) {
        user.sessionVersion += 1;
        await users.update(
          { userId },
          { sessionVersion: user.sessionVersion },
        );
        await tokens
          .createQueryBuilder()
          .delete()
          .where('user_id = :userId', { userId })
          .execute();
      }

      await tokens.save(
        tokens.create({
          tokenHash: this.hash(token),
          user: { userId },
          expiresAt: new Date(
            now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000,
          ),
        }),
      );
      return user.sessionVersion;
    });
  }

  async rotate(
    currentToken: string,
    nextToken: string,
  ): Promise<UserEntity | null> {
    const currentHash = this.hash(currentToken);
    return this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(RefreshTokenEntity);
      const now = new Date();
      const current = await tokens
        .createQueryBuilder('refreshToken')
        .innerJoinAndSelect('refreshToken.user', 'user')
        .leftJoinAndSelect('user.profile', 'profile')
        .leftJoinAndSelect('user.roles', 'role')
        .where('refreshToken.tokenHash = :currentHash', { currentHash })
        .andWhere('refreshToken.expiresAt > :now', { now })
        .setLock('pessimistic_write')
        .getOne();
      if (!current) return null;

      const deletion = await tokens.delete({ tokenHash: currentHash });
      if (deletion.affected !== 1) return null;

      await tokens.save(
        tokens.create({
          tokenHash: this.hash(nextToken),
          user: current.user,
          expiresAt: new Date(
            now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000,
          ),
        }),
      );
      return current.user;
    });
  }

  async revoke(token: string): Promise<void> {
    await this.dataSource
      .getRepository(RefreshTokenEntity)
      .delete({ tokenHash: this.hash(token) });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
