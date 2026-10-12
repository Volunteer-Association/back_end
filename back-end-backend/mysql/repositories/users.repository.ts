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
>;

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly profileRepository: Repository<UserProfileEntity>,
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
