import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/index.js';

export type AuthenticationUser = Pick<
  UserEntity,
  | 'userId'
  | 'username'
  | 'email'
  | 'password'
  | 'nickname'
  | 'avatar'
  | 'role'
  | 'status'
>;

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  findByUsernameForAuthentication(
    username: string,
  ): Promise<AuthenticationUser | null> {
    return this.repository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      // 密码字段默认不查询，仅认证流程需要取出哈希值进行比对。
      .addSelect('user.password')
      .where('user.username = :username', { username })
      .getOne();
  }

  async updateLastLogin(
    userId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.repository.update(
      { userId },
      {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress?.slice(0, 50) ?? null,
      },
    );
  }

  async findPasswordHash(userId: string): Promise<string | null> {
    const user = await this.repository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.userId = :userId', { userId })
      .getOne();
    return user?.password ?? null;
  }

  async findLocalCredentials(
    userId: string,
  ): Promise<{ username: string; password: string | null } | null> {
    const user = await this.repository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.userId = :userId', { userId })
      .getOne();
    return user
      ? { username: user.username, password: user.password }
      : null;
  }

  async setLocalCredentials(
    userId: string,
    username: string,
    passwordHash: string,
  ): Promise<void> {
    await this.repository.update(
      { userId },
      { username, password: passwordHash },
    );
  }
}
