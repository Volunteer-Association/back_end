import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { mapEnabledStatus } from '../../mysql/entities/user.entity.js';
import { UsersService } from '../modules/users/users.service.js';

@Injectable()
/** 校验 Bearer Access Token，并将令牌载荷放入请求 user 供控制器使用。 */
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Token not found');
    }
    
    let tokenPayload: Record<string, unknown> & {
      sub: string;
      sessionVersion: number;
    };
    try {
      const payload: unknown = await this.jwtService.verifyAsync(token);
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('tokenType' in payload) ||
        payload.tokenType !== 'access' ||
        !('sub' in payload) ||
        typeof payload.sub !== 'string' ||
        !/^[1-9]\d{0,18}$/.test(payload.sub) ||
        !('sessionVersion' in payload) ||
        typeof payload.sessionVersion !== 'number' ||
        !Number.isSafeInteger(payload.sessionVersion) ||
        payload.sessionVersion < 0
      ) {
        throw new UnauthorizedException('Invalid access token');
      }
      tokenPayload = {
        ...payload,
        sub: payload.sub,
        sessionVersion: payload.sessionVersion,
      };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    // JWT 只验证签名和载荷；再查一次账号状态、版本和角色，
    // 确保封禁/降级/撤销会话可立即生效（不等 access token 过期）。
    const authenticationState =
      await this.usersService.findAuthenticationState(tokenPayload.sub);
    if (
      !authenticationState ||
      mapEnabledStatus(authenticationState.status) !== 'active' ||
      authenticationState.sessionVersion !== tokenPayload.sessionVersion
    ) {
      throw new UnauthorizedException('Invalid or expired session');
    }
    // request.user 挂最小必要信息：sub、实时 roles 数组（权限叠加）、最高优先级 role（兼容旧代码）、sessionVersion。
    // 业务接口应该用 roles.includes('xxx') 判断权限，而不是比较 role === 'admin'。
    Object.assign(request, {
      user: {
        sub: tokenPayload.sub,
        roles: authenticationState.roles,
        role: authenticationState.role,
        sessionVersion: tokenPayload.sessionVersion,
      },
    });

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    // 只接受一个规范的 Bearer 值，拒绝多段或其他认证方案。
    const [type, token, extra] = request.headers.authorization?.split(' ') ?? [];
    return type?.toLowerCase() === 'bearer' && token && !extra
      ? token
      : undefined;
  }
}
