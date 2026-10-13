import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import type { LoggingService } from '../modules/logging/logging.service.js';
import type { LogLevel } from '../../mysql/entities/log.entity.js';

@Injectable()
/** 记录请求 ID、响应状态和耗时，并按日期追加到受限权限的日志文件。 */
export class HttpLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(
    private readonly logDirectory = resolve(process.cwd(), 'logs'),
    private readonly loggingService?: Pick<LoggingService, 'audit'>,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = randomUUID();
    const startedAt = Date.now();
    response.setHeader('X-Request-Id', requestId);

    response.on('finish', () => {
      // 请求日志按响应状态定级；成功响应也入库，便于管理员按 http 分类完整检索。
      const level: LogLevel =
        response.statusCode >= 500
          ? 'error'
          : response.statusCode >= 400
            ? 'warn'
            : 'info';
      const entry = {
        level,
        message: `HTTP ${request.method} ${request.path.slice(0, 200)} returned ${response.statusCode} in ${Date.now() - startedAt}ms`,
        requestId,
        method: request.method,
        path: request.path.slice(0, 200),
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
        ip: request.ip,
        userAgent: request.headers?.['user-agent'],
        timestamp: new Date().toISOString(),
      };
      const line = JSON.stringify(entry);
      if (entry.level === 'error') {
        this.logger.error(line);
        void this.writeFileLog(
          `error-${entry.timestamp.slice(0, 10)}.log`,
          line,
        );
      } else if (entry.level === 'warn') {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
      const requestUser = (request as Request & { user?: unknown }).user;
      // 中间件在 Guard 前注册，user 可能尚未写入；只在认证载荷可用时关联用户。
      const userId =
        requestUser &&
        typeof requestUser === 'object' &&
        'sub' in requestUser &&
        typeof requestUser.sub === 'string'
          ? requestUser.sub
          : undefined;
      void this.writeDatabaseLog(level, entry, userId);
      void this.writeFileLog(`http-${entry.timestamp.slice(0, 10)}.log`, line);
    });

    next();
  }

  private async writeDatabaseLog(
    level: LogLevel,
    entry: {
      requestId: string;
      method: string;
      path: string;
      status: number;
      durationMs: number;
      ip: string;
      message: string;
      userAgent?: string;
    },
    userId?: string,
  ): Promise<void> {
    if (!this.loggingService) return;
    await this.loggingService.audit({
      level,
      category: 'http',
      message: `${entry.message} request_id=${entry.requestId}`,
      userId,
      ipAddress: entry.ip,
      userAgent: entry.userAgent,
    });
  }

  private async writeFileLog(fileName: string, line: string): Promise<void> {
    try {
      await mkdir(this.logDirectory, { recursive: true });
      await appendFile(
        resolve(this.logDirectory, fileName),
        `${line}\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
    } catch (error: unknown) {
      this.logger.error(
        `HTTP 日志文件写入失败 [${error instanceof Error ? error.name : 'UnknownError'}]`,
      );
    }
  }
}
