import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(
    private readonly logDirectory = resolve(process.cwd(), 'logs'),
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = randomUUID();
    const startedAt = Date.now();
    response.setHeader('X-Request-Id', requestId);

    response.on('finish', () => {
      const entry = {
        timestamp: new Date().toISOString(),
        requestId,
        method: request.method,
        path: request.path.slice(0, 200),
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
        ip: request.ip,
      };
      const line = JSON.stringify(entry);
      if (response.statusCode >= 500) this.logger.error(line);
      else if (response.statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
      void this.writeFileLog(entry.timestamp.slice(0, 10), line);
    });

    next();
  }

  private async writeFileLog(date: string, line: string): Promise<void> {
    try {
      await mkdir(this.logDirectory, { recursive: true });
      await appendFile(
        resolve(this.logDirectory, `http-${date}.log`),
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
