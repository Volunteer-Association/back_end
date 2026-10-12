import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { RefreshTokenRepository } from '../../../mysql/repositories/refresh-token.repository.js';
import { UserEntity, type UserRole } from '../../../mysql/entities/index.js';
import { UsersService } from '../users/users.service.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../../config/auth.constants.js';

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

  async login(username: string, password: string) {
    const user = await this.usersService.findByUsernameForAuthentication(
      username,
    );
    if (!user || user.status !== 'active' || !user.password) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    await this.usersService.updateLastLogin(user);
    return this.createSession(user);
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
    if (user.status !== 'active') {
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
