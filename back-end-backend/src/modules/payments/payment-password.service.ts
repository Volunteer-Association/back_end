import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { RiskService } from './risk.service.js';

/** 连续错误多少次后锁定（可被 risk_configs.pay_password_max_fail 覆盖）。 */
const DEFAULT_MAX_FAIL = 5;
/** 锁定时长（分钟，可被 risk_configs.pay_password_lock_minutes 覆盖）。 */
const DEFAULT_LOCK_MINUTES = 30;

interface AttemptRow {
  failure_count: number;
  locked_until: Date | null;
  remain_seconds?: number;
}

/**
 * 支付密码错误次数与锁定（类微信/支付宝）。
 *
 * 风险点：支付密码是 6 位数字，只有 100 万种组合，若不限制尝试次数，
 * 攻击者可在转账/提现/红包/支付账单等入口无限爆破。
 *
 * 规则（阈值与锁定时长走 risk_configs，运营可在风控配置页调整）：
 * - 连续错误达到 pay_password_max_fail（默认 5）次后，锁定支付功能
 *   pay_password_lock_minutes（默认 30）分钟；
 * - 锁定期内直接拒绝（不再消耗比对），到期后自动解锁、计数清零重新开始；
 * - 任意一次校验成功，连续错误计数清零。
 *
 * 计数按用户维度（支付密码属于用户，不是按 IP/设备），落库后多实例共享，
 * 失败累加使用行锁 + 单条 UPDATE，避免并发请求把计数写错。
 */
@Injectable()
export class PaymentPasswordService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly risk: RiskService,
  ) {}

  /**
   * 统一校验支付密码：锁定判断 → 哈希比对 → 失败计数 / 成功清零。
   * 任何不通过都会抛异常（BadRequest / Forbidden），通过则正常返回。
   */
  async verify(userId: string, paymentPassword: string): Promise<void> {
    if (!paymentPassword) {
      throw new BadRequestException('请输入支付密码');
    }

    const rows = await this.dataSource.query(
      `SELECT payment_password_hash FROM users WHERE user_id = ?`,
      [userId],
    );
    const hash = (rows as Array<{ payment_password_hash: string | null }>)[0]
      ?.payment_password_hash;
    if (!hash) {
      throw new BadRequestException('尚未设置支付密码，请先在钱包页设置');
    }

    // 锁定期内直接拒绝，不再进行哈希比对。
    await this.assertNotLocked(userId);

    const ok = await bcrypt.compare(paymentPassword, hash);
    if (!ok) {
      // recordFailure 内部必然抛出带剩余次数/锁定信息的异常。
      await this.recordFailure(userId);
    }
    await this.clearFailures(userId);
  }

  /** 若当前处于锁定期，抛 403 并给出剩余分钟数。 */
  async assertNotLocked(userId: string): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT GREATEST(1, TIMESTAMPDIFF(SECOND, NOW(), locked_until)) AS remain_seconds
       FROM payment_password_attempts
       WHERE user_id = ? AND locked_until IS NOT NULL AND locked_until > NOW()`,
      [userId],
    );
    const remain = Number(
      (rows as Array<{ remain_seconds: number }>)[0]?.remain_seconds ?? 0,
    );
    if (remain > 0) {
      const minutes = Math.ceil(remain / 60);
      throw new ForbiddenException(
        `支付密码已锁定，请 ${minutes} 分钟后再试，或重置支付密码`,
      );
    }
  }

  /**
   * 记录一次失败并返回最新状态；阈值已做正整数校验。
   * 行锁 + 单条 UPDATE 完成“过期重置 / 累加 / 锁定”，避免并发计数错误。
   */
  private async recordFailure(userId: string): Promise<never> {
    const maxFail = Math.max(
      1,
      Math.round(await this.risk.getNum('pay_password_max_fail', DEFAULT_MAX_FAIL)),
    );
    const lockMinutes = Math.max(
      1,
      Math.round(
        await this.risk.getNum('pay_password_lock_minutes', DEFAULT_LOCK_MINUTES),
      ),
    );

    const after = await this.dataSource.transaction(async (manager) => {
      // 确保计数行存在（首次失败）。
      await manager.query(
        `INSERT IGNORE INTO payment_password_attempts
           (user_id, failure_count, locked_until, last_attempt_at)
         VALUES (?, 0, NULL, NOW())`,
        [userId],
      );
      // 行锁串行化并发的失败写入。
      await manager.query(
        `SELECT user_id FROM payment_password_attempts WHERE user_id = ? FOR UPDATE`,
        [userId],
      );
      // 单条 UPDATE：锁定已过期则重置为 1；否则累加，达到阈值则置锁定时间。
      // UPDATE 右侧引用的是该行的旧值，故第二个 CASE 中的 failure_count+1 即旧计数+1。
      await manager.query(
        `UPDATE payment_password_attempts
         SET failure_count = CASE
               WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1
               ELSE failure_count + 1
             END,
             locked_until = CASE
               WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN NULL
               WHEN failure_count + 1 >= ? THEN DATE_ADD(NOW(), INTERVAL ${lockMinutes} MINUTE)
               ELSE locked_until
             END,
             last_attempt_at = NOW()
         WHERE user_id = ?`,
        [maxFail, userId],
      );
      const rows = await manager.query(
        `SELECT failure_count,
                GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), locked_until)) AS remain_seconds
         FROM payment_password_attempts WHERE user_id = ?`,
        [userId],
      );
      return rows[0] as AttemptRow;
    });

    const remainSeconds = Number(after?.remain_seconds ?? 0);
    if (remainSeconds > 0) {
      const minutes = Math.ceil(remainSeconds / 60);
      throw new ForbiddenException(
        `支付密码连续错误已达 ${maxFail} 次，支付功能已锁定 ${minutes} 分钟，请稍后再试或重置支付密码`,
      );
    }
    const left = Math.max(0, maxFail - Number(after?.failure_count ?? 0));
    throw new BadRequestException(`支付密码错误，还可尝试 ${left} 次`);
  }

  /** 校验成功后清零连续错误计数并解除锁定。 */
  async clearFailures(userId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO payment_password_attempts
         (user_id, failure_count, locked_until, last_attempt_at)
       VALUES (?, 0, NULL, NOW())
       ON DUPLICATE KEY UPDATE
         failure_count = 0,
         locked_until = NULL,
         last_attempt_at = NOW()`,
      [userId],
    );
  }

  /** 查询当前锁定状态（供前端在密码输入页主动提示）。 */
  async getStatus(userId: string): Promise<{
    locked: boolean;
    remainSeconds: number;
    failureCount: number;
    maxFail: number;
  }> {
    const maxFail = Math.max(
      1,
      Math.round(await this.risk.getNum('pay_password_max_fail', DEFAULT_MAX_FAIL)),
    );
    const rows = await this.dataSource.query(
      `SELECT failure_count,
              GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), locked_until)) AS remain_seconds
       FROM payment_password_attempts WHERE user_id = ?`,
      [userId],
    );
    const r = (rows as AttemptRow[])[0];
    const remainSeconds = Number(r?.remain_seconds ?? 0);
    return {
      locked: remainSeconds > 0,
      remainSeconds,
      // 未锁定时连续错误计数不对外强调，避免泄露爆破进度；锁定时回传计数。
      failureCount: remainSeconds > 0 ? Number(r?.failure_count ?? 0) : 0,
      maxFail,
    };
  }
}
