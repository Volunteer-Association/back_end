import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RefreshTokenEntity,
  UserEntity,
  UserProfileEntity,
} from '../entities/index.js';

export interface EditableUserProfile {
  nickname?: string | null;
  email?: string;
  mobile?: string | null;
  sex?: number;
  idType?: number | null;
  idTypeLabel?: string | null;
  idNumber?: string | null;
  address?: string | null;
  avatar?: string | null;
}

export interface UserProfile {
  email: string;
  nickname: string | null;
  avatar: string | null;
  mobile: string | null;
  sex: number | null;
  idType: number | null;
  idTypeLabel: string | null;
  idNumber: string | null;
  address: string | null;
  createdAt: Date | null;
}

export interface SessionSettings {
  allowMultiLogin: boolean;
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
  | 'roles'
  | 'status'
  | 'sessionVersion'
>;

export type AuthenticationState = {
  status: UserEntity['status'];
  sessionVersion: number;
  /** 用户拥有的所有角色 key 列表（如 ['user','admin','super_admin']），权限叠加而非互斥。 */
  roles: string[];
  /** 兼容旧逻辑：取最高优先级角色（super_admin > admin > user）。 */
  role: UserEntity['role'];
};

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

  async findAuthenticationState(userId: string): Promise<AuthenticationState | null> {
    // role 不是 pms_user 的列，而是 user_roles 关联表的多对多结果，
    // 这里 leftJoin 出来后在 service 层用同样的逻辑算出 'admin'/'user'。
    const user = await this.repository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.user_id = :userId', { userId })
      .getOne();
    if (!user) return null;
    return {
      status: user.status,
      sessionVersion: user.sessionVersion,
      roles: (user.roles ?? []).map((r) => r.key),
      role: user.role,
    };
  }

  async findSessionSettings(userId: string): Promise<SessionSettings | null> {
    const user = await this.repository.findOne({
      select: { isAllowMulti: true },
      where: { userId },
    });
    return user
      ? { allowMultiLogin: Number(user.isAllowMulti) === 1 }
      : null;
  }

  async updateSessionSettings(
    userId: string,
    operator: string,
    settings: SessionSettings,
  ): Promise<SessionSettings | null> {
    const result = await this.repository.update(
      { userId },
      {
        isAllowMulti: settings.allowMultiLogin ? 1 : 0,
        operator,
        operatorId: userId,
      },
    );
    return result.affected ? this.findSessionSettings(userId) : null;
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
    await this.repository.manager.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity);
      const user = await users
        .createQueryBuilder('user')
        .where('user.userId = :userId', { userId })
        .setLock('pessimistic_write')
        .getOne();
      if (!user) return;

      await users.update(
        { userId },
        {
          username,
          password: passwordHash,
          operator,
          operatorId: userId,
          sessionVersion: user.sessionVersion + 1,
        },
      );
      await manager
        .getRepository(RefreshTokenEntity)
        .createQueryBuilder()
        .delete()
        .where('user_id = :userId', { userId })
        .execute();
    });
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
      idType: profile.idType,
      idTypeLabel: profile.idTypeLabel,
      idNumber: profile.idNumber,
      address: profile.address,
      createdAt: profile.createdAt ?? null,
    };
  }

  /** 更新允许用户编辑的字段，并以当前用户作为审计操作人。 */
  async updateProfile(
    userId: string,
    operator: string,
    changes: EditableUserProfile,
  ): Promise<UserProfile | null> {
    try {
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
    } catch (e) {
      // email 有唯一索引，冲突时抛出友好错误
      const driver = (e as { driverError?: { code?: string } })?.driverError;
      if (driver?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('该邮箱已被其他账号使用');
      }
      throw e;
    }
  }
}
