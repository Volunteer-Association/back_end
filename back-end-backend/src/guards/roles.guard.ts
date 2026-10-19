import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY, type RoleKey } from '../decorators/roles.decorator.js';

/**
 * 角色层级：super_admin > admin > user。
 * 用户可能拥有多个叠加角色，取其中最高层级与接口所需最低层级比较。
 */
const ROLE_RANK: Record<RoleKey, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
};

interface AuthedRequest extends Request {
  user?: { roles?: string[] };
}

/**
 * 声明式角色授权守卫。
 *
 * 与 AuthGuard 的分工：
 * - AuthGuard：认证（校验 Access Token、账号状态、会话版本），并挂 request.user.roles；
 * - RolesGuard：授权（按 @Roles() 声明的最低角色放行）。
 *
 * 使用方式：`@UseGuards(AuthGuard, RolesGuard)` + `@Roles('admin')`。
 * 未声明 @Roles 的接口不做角色限制（仅认证即可），与原行为一致。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleKey[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // 未声明所需角色：不属于角色保护接口，放行（认证已由 AuthGuard 完成）。
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const userRoles = request.user?.roles ?? [];
    const userMaxRank = userRoles.reduce(
      (max, key) => Math.max(max, ROLE_RANK[key as RoleKey] ?? -1),
      -1,
    );
    // 接口所需的最低层级 = 声明角色里层级最低的那个。
    const requiredRank = Math.min(
      ...required.map((key) => ROLE_RANK[key] ?? Number.MAX_SAFE_INTEGER),
    );

    if (userMaxRank < requiredRank) {
      throw new ForbiddenException('权限不足，需要管理员权限');
    }
    return true;
  }
}
