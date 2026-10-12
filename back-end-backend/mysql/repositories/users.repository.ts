import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserProfileEntity } from '../entities/index.js';

export interface EditableUserProfile {
  nickname?: string | null;
  mobile?: string | null;
  sex?: number;
}

export interface UserProfile {
  email: string;
  nickname: string | null;
  avatar: string | null;
  mobile: string | null;
  sex: number | null;
}

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
  | 'sessionVersion'
>;

export type AuthenticationState = Pick<
  UserEntity,
  'status' | 'sessionVersion'
>;

@Injectable()
/** 封装认证账号和用户详情的数据库读写操作。 */
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly profileRepository: Repository<UserProfileEntity>,
  ) {}

  /** 通过登录名查询认证信息，并一并装载资料和角色。 */
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

  findAuthenticationState(userId: string): Promise<AuthenticationState | null> {
    return this.repository.findOne({
      select: { status: true, sessionVersion: true },
      where: { userId },
    });
  }

  /** 每次成功登录后更新最后登录时间和客户端 IP。 */
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

  /** 查询用户的本地密码哈希；未设置密码时返回 null。 */
  async findPasswordHash(userId: string): Promise<string | null> {
    const user = await this.repository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.userId = :userId', { userId })
      .getOne();
    return user?.password ?? null;
  }

  /** 查询账号名和本地密码哈希，供账号安全流程使用。 */
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

  /** 保存本地登录名及密码哈希，并记录最后操作人。 */
  async setLocalCredentials(
    userId: string,
    username: string,
    passwordHash: string,
    operator: string,
  ): Promise<void> {
    await this.repository.update(
      { userId },
      {
        username,
        password: passwordHash,
        operator,
        operatorId: userId,
      },
    );
  }

  /** 读取用户详情表中的公开个人资料字段。 */
  async findProfile(userId: string): Promise<UserProfile | null> {
    const profile = await this.profileRepository.findOne({
      where: { userId },
    });
    if (!profile) return null;
    return {
      email: profile.email,
      nickname: profile.nickname,
      avatar: profile.avatar,
      mobile: profile.mobile,
      sex: profile.sex,
    };
  }

  /** 更新允许用户编辑的字段，并以当前用户作为审计操作人。 */
  async updateProfile(
    userId: string,
    operator: string,
    changes: EditableUserProfile,
  ): Promise<UserProfile | null> {
    const result = await this.profileRepository.update(
      { userId },
      {
        ...changes,
        operator,
        operatorId: userId,
      },
    );
    if (!result.affected) return null;
    return this.findProfile(userId);
  }
}
