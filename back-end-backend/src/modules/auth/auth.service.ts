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
import {
  assertBcryptPasswordLength,
  BCRYPT_MAX_PASSWORD_BYTES,
  BCRYPT_ROUNDS,
} from './password-policy.js';

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
      roles?: string[];
      createdAt?: string | null;
    };
  };
  refreshToken: string;
}

type SessionUser = Pick<
  UserEntity,
  | 'userId'
  | 'username'
  | 'email'
  | 'nickname'
  | 'avatar'
  | 'role'
  | 'roles'
  | 'sessionVersion'
> & { createdAt?: Date | null }

@Injectable()
/** 处理本地认证、凭证设置及 Access/Refresh Token 会话生命周期。 */
export class AuthService {
  private dummyPasswordHash: Promise<string> | undefined;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async login(username: string, password: string, ipAddress?: string) {
    const passwordTooLong =
      Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES;
    const user = await this.usersService.findByUsernameForAuthentication(
      username,
    );
    if (
      !user ||
      mapEnabledStatus(user.status) !== 'active' ||
      !user.password ||
      passwordTooLong
    ) {
      await bcrypt.compare(password, await this.getDummyPasswordHash());
      throw new UnauthorizedException('用户名或密码错误');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    await this.usersService.updateLastLogin(user, ipAddress);
    return this.createSession(user, user.sessionVersion);
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= bcrypt.hash(
      randomBytes(32).toString('base64url'),
      BCRYPT_ROUNDS,
    );
    return this.dummyPasswordHash;
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
    assertBcryptPasswordLength(newPassword);
    if (currentHash) {
      if (!currentPassword) {
        throw new UnauthorizedException('当前密码不正确');
      }
      assertBcryptPasswordLength(currentPassword);
      if (!(await bcrypt.compare(currentPassword, currentHash))) {
        throw new UnauthorizedException('当前密码不正确');
      }
    } else if (currentPassword) {
      throw new BadRequestException('该账号尚未设置本地密码');
    }

    // OAuth 初始内部账号不能作为用户长期使用的本地登录名。
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
        await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
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

  async createSession(
    user: SessionUser,
    expectedSessionVersion?: number,
  ): Promise<AuthSession> {
    const refreshToken = randomBytes(32).toString('base64url');
    const sessionVersion = await this.refreshTokens.create(
      refreshToken,
      user.userId,
      expectedSessionVersion,
    );
    if (sessionVersion === null) {
      throw new UnauthorizedException('该账号当前不可登录');
    }
    return this.sessionForToken(user, refreshToken, sessionVersion);
  }

  private async sessionForToken(
    user: SessionUser,
    refreshToken: string,
    sessionVersion = user.sessionVersion,
  ): Promise<AuthSession> {
    // JWT payload 只放最小必要字段：sub(用户ID)、tokenType、sessionVersion。
    // 不放 username / role / email——JWT 是 base64 编码可被任何人解码，
    // 放敏感信息会泄露用户资料；而且 role 放 token 里会导致降级后 15 分钟内仍有效，
    // role 改由 AuthGuard 每次请求实时查库后挂到 request.user。
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.userId,
        tokenType: 'access',
        sessionVersion,
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
          roles: (user.roles ?? []).map((r) => r.key),
          createdAt: user.createdAt?.toISOString?.() ?? null,
        },
      },
      refreshToken,
    };
  }
}
