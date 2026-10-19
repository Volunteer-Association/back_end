import { SetMetadata } from '@nestjs/common';

/**
 * 角色授权元数据键。RolesGuard 读取它来判断接口所需的最低角色。
 */
export const ROLES_KEY = 'required_roles';

/** 平台角色 key（与 user_roles / role 表保持一致，权限叠加）。 */
export type RoleKey = 'user' | 'admin' | 'super_admin';

/**
 * 声明接口 / 控制器所需角色。
 *
 * - `@Roles('admin')`：管理员及以上（admin、super_admin）可访问；
 * - `@Roles('super_admin')`：仅超级管理员可访问。
 *
 * 必须与 AuthGuard、RolesGuard 配合使用：AuthGuard 负责认证并把实时
 * roles 挂到 request.user，RolesGuard 负责按角色层级做授权。
 * 方法级声明会覆盖控制器级声明。
 */
export const Roles = (...roles: RoleKey[]) => SetMetadata(ROLES_KEY, roles);
