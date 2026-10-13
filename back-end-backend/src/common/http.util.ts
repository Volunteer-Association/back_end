/** HTTP 层通用纯函数：从 Express Request 读取 Cookie、解析分页参数、提取已认证用户 ID。 */
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

/** 从 Cookie 请求头读取指定名称的值，未设置时返回 undefined。 */
export function readCookie(
  request: Request,
  name: string,
): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  const entry = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}

/** 解析分页 query 参数，非法时抛 400。 */
export function parsePageValue(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new BadRequestException('分页参数无效');
  }
  return parsed;
}

/** 从已认证请求中取雪花用户 ID；载荷缺失或格式非法时抛 400。 */
export function authenticatedUserId(user: unknown): string {
  if (
    !user ||
    typeof user !== 'object' ||
    !('sub' in user) ||
    typeof user.sub !== 'string' ||
    !/^[1-9]\d{0,18}$/.test(user.sub)
  ) {
    throw new BadRequestException('当前登录账号信息无效');
  }
  return user.sub;
}
