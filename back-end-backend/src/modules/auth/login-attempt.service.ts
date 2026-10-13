import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHmac } from 'node:crypto';
import { DataSource } from 'typeorm';

const WINDOW_MINUTES = 15;
const IP_FAILURE_LIMIT = 30;
const ACCOUNT_IP_FAILURE_LIMIT = 5;

interface LoginAttemptRow {
  retry_after_seconds: number | string;
}

@Injectable()
/** 以数据库共享的短期计数器限制来源及账号组合的密码猜测。 */
export class LoginAttemptService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async getRetryAfterSeconds(
    username: string,
    ipAddress: string,
  ): Promise<number> {
    const [ipBucket, accountIpBucket] = this.createBuckets(username, ipAddress);
    const rows = (await this.dataSource.query(
      `SELECT GREATEST(
           1,
           TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), locked_until)
         ) AS retry_after_seconds
       FROM auth_login_attempts
       WHERE bucket_hash IN (?, ?)
         AND locked_until > UTC_TIMESTAMP()`,
      [ipBucket, accountIpBucket],
    )) as LoginAttemptRow[];
    return rows.reduce((maximum, row) => {
      const retryAfter = Number(row.retry_after_seconds);
      if (!Number.isSafeInteger(retryAfter) || retryAfter < 1) {
        throw new Error('登录限流记录包含无效的锁定时间');
      }
      return Math.max(maximum, retryAfter);
    }, 0);
  }

  async recordFailure(username: string, ipAddress: string): Promise<void> {
    const buckets = this.createBuckets(username, ipAddress);
    const limits = [IP_FAILURE_LIMIT, ACCOUNT_IP_FAILURE_LIMIT];
    await this.dataSource.query(
      `DELETE FROM auth_login_attempts
       WHERE last_attempt_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)`,
    );
    for (let index = 0; index < buckets.length; index += 1) {
      await this.dataSource.query(
        `INSERT INTO auth_login_attempts
           (bucket_hash, failure_count, window_started_at, locked_until, last_attempt_at)
         VALUES (?, 1, UTC_TIMESTAMP(), NULL, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           failure_count = IF(
             window_started_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${WINDOW_MINUTES} MINUTE),
             1,
             failure_count + 1
           ),
           locked_until = IF(
             window_started_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${WINDOW_MINUTES} MINUTE),
             NULL,
             IF(
               failure_count >= ?,
               DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${WINDOW_MINUTES} MINUTE),
               locked_until
             )
           ),
           window_started_at = IF(
             window_started_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${WINDOW_MINUTES} MINUTE),
             UTC_TIMESTAMP(),
             window_started_at
           ),
           last_attempt_at = UTC_TIMESTAMP()`,
        [buckets[index], limits[index]],
      );
    }
  }

  private createBuckets(username: string, ipAddress: string): [string, string] {
    const secret = this.config.getOrThrow<string>('app.jwt.secret');
    const normalizedIp = ipAddress.trim().toLowerCase() || 'unknown';
    const normalizedUsername = username.trim().toLowerCase();
    return [
      this.hashBucket(secret, `ip:${normalizedIp}`),
      this.hashBucket(
        secret,
        `account-ip:${normalizedUsername}:${normalizedIp}`,
      ),
    ];
  }

  private hashBucket(secret: string, value: string): string {
    return createHmac('sha256', secret).update(value).digest('hex');
  }
}
