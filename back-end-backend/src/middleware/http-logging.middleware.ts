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
        void this.writeDatabaseLog('error', entry);
        void this.writeFileLog(
          `error-${entry.timestamp.slice(0, 10)}.log`,
          line,
        );
      } else if (entry.level === 'warn') {
        this.logger.warn(line);
        void this.writeDatabaseLog('warn', entry);
      } else {
        this.logger.log(line);
      }
      void this.writeFileLog(`http-${entry.timestamp.slice(0, 10)}.log`, line);
    });

    next();
  }

  private async writeDatabaseLog(
    level: 'warn' | 'error',
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
  ): Promise<void> {
    if (!this.loggingService) return;
    await this.loggingService.audit({
      level,
      message: `${entry.message} request_id=${entry.requestId}`,
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
