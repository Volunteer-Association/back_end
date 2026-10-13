import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { REFRESH_TOKEN_TTL_SECONDS, REFRESH_COOKIE } from '../../../config/auth.constants.js';
import { normalizeHttpOrigin } from '../../../config/config.js';
import { LoggingService } from '../logging/logging.service.js';
import type { LogLevel } from '../../../mysql/entities/log.entity.js';
import type { AuthSession } from './auth.service.js';

/** 各认证相关控制器共用的响应/审计辅助，集中处理 Cookie、Origin 校验与会话序列化。 */
@Injectable()
export class AuthResponseHelper {
  constructor(
    private readonly config: ConfigService,
    private readonly loggingService: LoggingService,
  ) {}

  /** 会话响应统一结构，不直接返回 refreshToken。 */
  publicSession(session: AuthSession) {
    return {
      code: session.code,
      message: session.message,
      data: session.data,
    };
  }

  /** 写入 HttpOnly Refresh Token Cookie；生产环境启用 Secure/SameSite=None。 */
  setRefreshCookie(response: Response, token: string): void {
    const production =
      this.config.getOrThrow<string>('app.nodeEnv') === 'production';
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: production,
      sameSite: production ? 'none' : 'lax',
      path: '/',
      maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    });
  }

  clearRefreshCookie(response: Response): void {
    const production =
      this.config.getOrThrow<string>('app.nodeEnv') === 'production';
    response.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: production,
      sameSite: production ? 'none' : 'lax',
      path: '/',
    });
  }

  /** 校验请求 Origin 在 CORS 白名单内；缺失或不在列表均抛 403。 */
  assertAllowedOrigin(request: Request): void {
    const origin = request.headers.origin;
    let normalizedOrigin: string;
    try {
      if (!origin) throw new Error('Missing origin');
      normalizedOrigin = normalizeHttpOrigin(origin);
    } catch {
      throw new ForbiddenException('请求来源无效，请检查 CORS_ORIGINS 配置');
    }
    if (
      !this.config
        .getOrThrow<string[]>('app.corsOrigins')
        .includes(normalizedOrigin)
    ) {
      throw new ForbiddenException(
        '请求来源不在允许列表中，请将前端 Origin 添加到 CORS_ORIGINS',
      );
    }
  }

  /** 写业务事件审计日志；LoggingService 自身已捕获写库失败。 */
  async audit(
    request: Request,
    level: LogLevel,
    message: string,
    userId?: string,
  ): Promise<void> {
    await this.loggingService.audit({
      level,
      message,
      userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
