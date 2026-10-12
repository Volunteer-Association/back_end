import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { RefreshTokenRepository } from '../../../mysql/repositories/refresh-token.repository.js';
import { UserEntity, type UserRole } from '../../../mysql/entities/index.js';
import { mapEnabledStatus } from '../../../mysql/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../../config/auth.constants.js';
import { QueryFailedError } from 'typeorm';

const GENERATED_OAUTH_USERNAME = /^(?:gitee|github)_[a-f0-9]{40}$/;

export interface AuthSession {
  code: number;
  message: string;
  data: {
    accessToken: string;
    user: {
      id: string;
      username: string;
      email: string;
      nickname: string | null;
      avatar: string | null;
      role: UserRole;
    };
  };
  refreshToken: string;
}

type SessionUser = Pick<
  UserEntity,
  'userId' | 'username' | 'email' | 'nickname' | 'avatar' | 'role'
>;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async login(username: string, password: string, ipAddress?: string) {
    const user = await this.usersService.findByUsernameForAuthentication(
      username,
    );
    if (!user || mapEnabledStatus(user.status) !== 'active' || !user.password) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    await this.usersService.updateLastLogin(user, ipAddress);
    return this.createSession(user);
  }

  async hasLocalPassword(userId: string): Promise<boolean> {
    return Boolean(
      (await this.usersService.findLocalCredentials(userId))?.password,
    );
  }

  async getLocalAccountStatus(userId: string): Promise<{
    username: string;
    hasLocalPassword: boolean;
    requiresUsernameSetup: boolean;
  }> {
    const credentials = await this.usersService.findLocalCredentials(userId);
    if (!credentials) throw new UnauthorizedException('当前账号不存在');
    return {
      username: credentials.username,
      hasLocalPassword: Boolean(credentials.password),
      requiresUsernameSetup: GENERATED_OAUTH_USERNAME.test(
        credentials.username,
      ),
    };
  }

  async setLocalPassword(
    userId: string,
    currentPassword: string | undefined,
    newPassword: string,
    requestedUsername?: string,
  ): Promise<string> {
    const credentials = await this.usersService.findLocalCredentials(userId);
    if (!credentials) throw new UnauthorizedException('当前账号不存在');
    const currentHash = credentials.password;
    if (currentHash) {
      if (
        !currentPassword ||
        !(await bcrypt.compare(currentPassword, currentHash))
      ) {
        throw new UnauthorizedException('当前密码不正确');
      }
    } else if (currentPassword) {
      throw new BadRequestException('该账号尚未设置本地密码');
    }

    const username = requestedUsername?.trim() || credentials.username;
    if (
      GENERATED_OAUTH_USERNAME.test(credentials.username) &&
      !requestedUsername?.trim()
    ) {
      throw new BadRequestException('请先设置自己的本地登录账号');
    }
    if (!/^[A-Za-z0-9_-]{3,60}$/.test(username)) {
      throw new BadRequestException(
        '登录账号需为 3-60 位字母、数字、下划线或连字符',
      );
    }

    try {
      await this.usersService.setLocalCredentials(
        userId,
        username,
        await bcrypt.hash(newPassword, 12),
        username,
      );
    } catch (error: unknown) {
      if (
        error instanceof QueryFailedError &&
        typeof error.driverError === 'object' &&
        error.driverError !== null &&
        'code' in error.driverError &&
        error.driverError.code === 'ER_DUP_ENTRY'
      ) {
        throw new ConflictException('该登录账号已被使用');
      }
      throw error;
    }
    return username;
  }

  async refreshSession(refreshToken: string) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(refreshToken)) {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
    const nextRefreshToken = randomBytes(32).toString('base64url');
    const user = await this.refreshTokens.rotate(
      refreshToken,
      nextRefreshToken,
    );
    if (!user) {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
    if (mapEnabledStatus(user.status) !== 'active') {
      await this.refreshTokens.revoke(nextRefreshToken);
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
    return this.sessionForToken(user, nextRefreshToken);
  }

  async revokeRefreshToken(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken || !/^[A-Za-z0-9_-]{40,60}$/.test(refreshToken)) return;
    await this.refreshTokens.revoke(refreshToken);
  }

  async createSession(user: SessionUser): Promise<AuthSession> {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.refreshTokens.create(refreshToken, user.userId);
    return this.sessionForToken(user, refreshToken);
  }

  private async sessionForToken(
    user: SessionUser,
    refreshToken: string,
  ): Promise<AuthSession> {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.userId,
        username: user.username,
        role: user.role,
        tokenType: 'access',
      },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    return {
      code: 200,
      message: '登录成功',
      data: {
        accessToken,
        user: {
          id: user.userId,
          username: user.username,
          email: user.email,
          nickname: user.nickname,
          avatar: user.avatar,
          role: user.role,
        },
      },
      refreshToken,
    };
  }
}
