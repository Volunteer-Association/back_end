import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BankCardEntity } from '../../../mysql/entities/bank-card.entity.js';
import { WithdrawalEntity } from '../../../mysql/entities/withdrawal.entity.js';
import { BalanceTransactionEntity } from '../../../mysql/entities/balance-transaction.entity.js';
import { UserBalanceEntity } from '../../../mysql/entities/user-balance.entity.js';
import { PaymentNoGenerator } from '../common/payment-no.generator.js';
import { RiskService } from './risk.service.js';
import { PaymentPasswordService } from './payment-password.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  FEE_INCOME_ACCOUNT_ID,
  FEE_TXN_TYPE,
} from './common/platform-account.constants.js';

/** 提现手续费费率：0.10%（按申请金额实时计算）。 */
export const WITHDRAW_FEE_RATE = 0.001;
/**
 * 提现手续费最低收费（单位：分）= 1 分（¥0.01）。
 * 对齐微信/支付宝“按费率收取、设最低手续费”的口径，避免金额很小时手续费为 0。
 */
export const WITHDRAW_FEE_MIN_CENTS = 1;
/**
 * 计算提现手续费（单位：分）。
 * 手续费 = max(申请金额 × 0.10% 四舍五入到分, 最低 1 分)。
 * 后端以此为准入账，前端按同一口径实时预估。
 */
export function calcWithdrawFee(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.max(WITHDRAW_FEE_MIN_CENTS, Math.round(amountCents * WITHDRAW_FEE_RATE));
}
const WITHDRAW_MIN = 100;       // 1 元
const WITHDRAW_MAX = 5_000_000; // 5 万
/** 单次超时扫描最多处理的提现单数，避免一次性长事务。 */
const TIMEOUT_SCAN_BATCH = 100;
/** 待审核超时时间的默认值（小时），可由 risk_configs.withdraw_timeout_hours 覆盖。 */
const DEFAULT_WITHDRAW_TIMEOUT_HOURS = 48;
/** 系统自动操作的操作人标识。 */
const SYSTEM_OPERATOR = 'system';

@Injectable()
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name);

  constructor(
    @InjectRepository(BankCardEntity)
    private readonly cards: Repository<BankCardEntity>,
    @InjectRepository(WithdrawalEntity)
    private readonly withdrawals: Repository<WithdrawalEntity>,
    private readonly dataSource: DataSource,
    private readonly paymentNo: PaymentNoGenerator,
    private readonly risk: RiskService,
    private readonly paymentPassword: PaymentPasswordService,
    private readonly notifications: NotificationsService,
  ) {}

  // ===== 用户端 =====

  async listCards(userId: string) {
    const rows = await this.cards.find({
      where: { userId, status: 1 },
      order: { isDefault: 'DESC', id: 'DESC' },
    });
    return rows.map((c) => ({
      id: c.id,
      bankName: c.bankName,
      cardNo: this.maskCard(c.cardNo),
      cardHolder: c.cardHolder,
      branchName: c.branchName,
      isDefault: c.isDefault === 1,
    }));
  }

  async addCard(userId: string, body: {
    bankName: string; cardNo: string; cardHolder: string; branchName?: string;
  }) {
    // 必须已实名
    const kyc = await this.dataSource.query(
      `SELECT verify_status, real_name FROM users WHERE user_id = ?`,
      [userId],
    );
    const k = (kyc as any[])[0];
    if (!k || k.verify_status !== 2) throw new BadRequestException('请先完成实名认证');
    if (k.real_name !== body.cardHolder) throw new BadRequestException('持卡人姓名必须与实名认证一致');

    const exists = await this.cards.findOne({
      where: { userId, cardNo: body.cardNo.replace(/\s/g, '') },
    });
    if (exists) throw new BadRequestException('该银行卡已绑定');

    const card = this.cards.create({
      userId,
      bankName: body.bankName,
      cardNo: body.cardNo.replace(/\s/g, ''),
      cardHolder: body.cardHolder,
      branchName: body.branchName ?? null,
      isDefault: 0,
      status: 1,
    });
    const saved = await this.cards.save(card);
    return { id: saved.id };
  }

  async removeCard(userId: string, cardId: number) {
    const card = await this.cards.findOne({ where: { id: cardId, userId } });
    if (!card) throw new NotFoundException('银行卡不存在');
    card.status = 0;
    await this.cards.save(card);
  }

  /** 发起提现：扣余额，写 withdraw 流水，生成待审核单 */
  async requestWithdraw(userId: string, body: {
    bankCardId: number; amountYuan: string; paymentPassword: string;
  }) {
    const amountCents = Math.round(Number(body.amountYuan) * 100);
    if (!amountCents || amountCents < WITHDRAW_MIN) throw new BadRequestException('提现金额不能小于 1 元');
    if (amountCents > WITHDRAW_MAX) throw new BadRequestException('单笔提现不能超过 5 万元');

    // 风控：日累计提现上限
    const dailyMaxCents = (await this.risk.getNum('withdraw_daily_max_yuan', 200000)) * 100;
    const todayOut = await this.risk.todayOutflow(userId, ['withdraw_out']);
    if (todayOut + amountCents > dailyMaxCents) {
      throw new BadRequestException(`今日提现累计已达上限（${(dailyMaxCents / 100).toFixed(0)} 元）`);
    }

    const card = await this.cards.findOne({
      where: { id: body.bankCardId, userId, status: 1 },
    });
    if (!card) throw new NotFoundException('银行卡不存在');

    // 校验支付密码（含连续错误 5 次锁定，统一走 PaymentPasswordService）
    await this.paymentPassword.verify(userId, body.paymentPassword);

    // 手续费 = max(0.10% 四舍五入到分, 最低 1 分)
    const fee = calcWithdrawFee(amountCents);
    const actual = amountCents - fee;

    const orderId = this.paymentNo.nextWithdrawNo();
    const txnNo = this.paymentNo.nextTxnNo('withdraw_out');

    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // 悲观行锁：version 是普通字段（非 @VersionColumn），乐观锁不生效，
      // 并发提现/转账必须靠行锁串行化，否则可能读到相同余额而超扣。
      const bal = await manager.findOne(UserBalanceEntity, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      const current = bal ? Number(bal.balanceCents) : 0;
      if (current < amountCents) throw new BadRequestException('余额不足');

      // 扣余额
      bal!.balanceCents = String(current - amountCents);
      bal!.version += 1;
      await manager.save(bal);

      // 写流水
      await manager.save(BalanceTransactionEntity, {
        id: txnNo,
        txnNo: txnNo,
        userId,
        type: 'withdraw_out',
        amountCents: String(-amountCents),
        balanceAfterCents: String(current - amountCents),
        refType: 'withdraw',
        refId: orderId,
        note: `提现到 ${card.bankName} ${card.cardNo.slice(-4)}`,
      });

      // 写提现单
      await manager.save(WithdrawalEntity, {
        id: orderId,
        userId,
        bankCardId: String(card.id),
        amountCents: String(amountCents),
        feeCents: String(fee),
        actualAmountCents: String(actual),
        status: 0,
      });
    });

    return { orderId, feeYuan: (fee / 100).toFixed(2), actualYuan: (actual / 100).toFixed(2) };
  }

  async listMyWithdrawals(userId: string) {
    const rows = await this.withdrawals.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const cards = await this.cards.find({ where: { userId } });
    return rows.map((w) => {
      const c = cards.find((x) => String(x.id) === String(w.bankCardId));
      return {
        id: w.id,
        amountYuan: (Number(w.amountCents) / 100).toFixed(2),
        feeYuan: (Number(w.feeCents) / 100).toFixed(2),
        actualYuan: (Number(w.actualAmountCents) / 100).toFixed(2),
        status: w.status,
        bankName: c?.bankName ?? '',
        cardNo: c ? this.maskCard(c.cardNo) : '',
        rejectReason: w.rejectReason,
        createdAt: w.createdAt,
      };
    });
  }

  // ===== 管理员端 =====

  async adminPending() {
    const rows = await this.withdrawals.find({
      where: { status: 0 },
      order: { createdAt: 'ASC' },
    });
    const cards = await this.cards.find();
    const users = await this.dataSource.query(
      `SELECT user_id, login_name FROM pms_user`,
    );
    return rows.map((w) => {
      const c = cards.find((x) => String(x.id) === String(w.bankCardId));
      const u = (users as any[]).find((x) => x.user_id === w.userId);
      return {
        id: w.id,
        userId: w.userId,
        username: u?.login_name ?? '',
        amountYuan: (Number(w.amountCents) / 100).toFixed(2),
        feeYuan: (Number(w.feeCents) / 100).toFixed(2),
        actualYuan: (Number(w.actualAmountCents) / 100).toFixed(2),
        bankName: c?.bankName ?? '',
        cardNo: c?.cardNo ?? '',
        cardHolder: c?.cardHolder ?? '',
        branchName: c?.branchName ?? '',
        createdAt: w.createdAt,
      };
    });
  }

  /**
   * 平台提现手续费收入统计。
   * 统计口径：平台手续费收入账户 PLATFORM_FEE_INCOME 下的 withdraw_fee 流水。
   * 返回累计 / 今日 / 本月的金额与笔数，以及最近 N 天的按日明细（无收入日期补 0）。
   */
  async adminFeeStats(days = 30) {
    const d = Math.min(Math.max(Number(days) || 30, 1), 365);

    const agg = (await this.dataSource.query(
      `SELECT
         COALESCE(SUM(amount_cents), 0) AS total_cents,
         COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN amount_cents ELSE 0 END), 0) AS today_cents,
         COALESCE(SUM(CASE WHEN DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
                           THEN amount_cents ELSE 0 END), 0) AS month_cents,
         COUNT(*) AS total_count,
         COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today_count,
         COALESCE(SUM(CASE WHEN DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
                           THEN 1 ELSE 0 END), 0) AS month_count
       FROM balance_transactions
       WHERE user_id = ? AND type = ?`,
      [FEE_INCOME_ACCOUNT_ID, FEE_TXN_TYPE],
    )) as Array<{
      total_cents: string;
      today_cents: string;
      month_cents: string;
      total_count: string;
      today_count: string;
      month_count: string;
    }>;
    const a: Partial<Record<string, string>> = agg[0] ?? {};

    // d 已校验为正整数，安全内联，规避参数化 INTERVAL 的驱动兼容问题。
    const rows = (await this.dataSource.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d,
              SUM(amount_cents) AS cents,
              COUNT(*) AS cnt
       FROM balance_transactions
       WHERE user_id = ? AND type = ?
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL ${d} DAY)
       GROUP BY d
       ORDER BY d ASC`,
      [FEE_INCOME_ACCOUNT_ID, FEE_TXN_TYPE],
    )) as Array<{ d: string; cents: string; cnt: string }>;
    const byDate = new Map(rows.map((r) => [r.d, r]));

    // 补齐无收入日期，便于前端连续展示。
    const daily: Array<{ date: string; cents: string; count: number }> = [];
    const start = new Date();
    start.setDate(start.getDate() - (d - 1));
    for (let i = 0; i < d; i += 1) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i);
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      const hit = byDate.get(key);
      daily.push({
        date: key,
        cents: hit?.cents ?? '0',
        count: hit ? Number(hit.cnt) : 0,
      });
    }

    return {
      days: d,
      totalCents: String(a.total_cents ?? '0'),
      totalCount: Number(a.total_count ?? 0),
      todayCents: String(a.today_cents ?? '0'),
      todayCount: Number(a.today_count ?? 0),
      monthCents: String(a.month_cents ?? '0'),
      monthCount: Number(a.month_count ?? 0),
      daily,
    };
  }

  /**
   * 确认打款：将提现单置为 status=1，并把手续费计入平台收入账户。
   *
   * 资金拆分（提现申请金额 amount = 实际到账 actual + 手续费 fee）：
   * - actual：管理员线下打款到用户银行卡（发生在系统外，本系统不记账）；
   * - fee：平台收入，必须在打款成功时记入平台手续费收入账户并写流水，
   *   否则手续费只从用户余额扣除、却没有任何账户承接，会“凭空消失”。
   *
   * 手续费只在「打款成功」这一刻确认收入；拒绝/超时是全额退回，不产生手续费。
   * 全程事务 + 提现单 status=0→1 状态守卫，保证同一单据只打款一次、手续费只入账一次。
   */
  async adminApprove(orderId: string, operator: string) {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // 行锁锁定提现单并复查 status=0，与「拒绝/超时」互斥，杜绝重复打款。
      const w = await manager.findOne(WithdrawalEntity, {
        where: { id: orderId, status: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!w) throw new BadRequestException('提现单不存在或已处理');

      w.status = 1;
      w.operator = operator;
      w.approvedAt = new Date();
      await manager.save(WithdrawalEntity, w);

      const fee = Number(w.feeCents);
      if (fee > 0) {
        // 手续费计入平台收入账户（首次自动开户），余额 +fee 并写一笔正向流水。
        let feeBal = await manager.findOne(UserBalanceEntity, {
          where: { userId: FEE_INCOME_ACCOUNT_ID },
          lock: { mode: 'pessimistic_write' },
        });
        if (!feeBal) {
          feeBal = manager.create(UserBalanceEntity, {
            userId: FEE_INCOME_ACCOUNT_ID,
            balanceCents: '0',
            version: 0,
          });
        }
        const feeAfter = Number(feeBal.balanceCents) + fee;
        feeBal.balanceCents = String(feeAfter);
        feeBal.version += 1;
        await manager.save(feeBal);

        const feeTxnNo = this.paymentNo.nextTxnNo(FEE_TXN_TYPE);
        await manager.save(BalanceTransactionEntity, {
          id: feeTxnNo,
          txnNo: feeTxnNo,
          userId: FEE_INCOME_ACCOUNT_ID,
          type: FEE_TXN_TYPE,
          amountCents: String(fee),
          balanceAfterCents: String(feeAfter),
          refType: 'withdraw',
          refId: w.id,
          note: `提现手续费收入：单号 ${w.id}`,
        });
      }
    });
  }

  async adminReject(orderId: string, operator: string, reason?: string) {
    const text = reason ?? '提现失败';
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // 行锁锁定提现单并复查 status=0，与「通过」互斥，避免重复处理。
      const w = await manager.findOne(WithdrawalEntity, {
        where: { id: orderId, status: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!w) throw new NotFoundException('提现单不存在或已处理');
      // 拒绝要退回余额（与超时自动取消共用退款逻辑）
      await this.refundInTx(manager, w, {
        status: 2,
        operator,
        reason: text,
        note: `提现被退回：${text}`,
      });
    });
  }

  /**
   * 扫描并自动取消「超时仍未审核」的提现单。
   *
   * 由定时任务周期性调用。超时阈值由 risk_configs.withdraw_timeout_hours 控制（默认 48h，
   * 配置为 0 或非正数视为关闭）。每个提现单单独事务：
   * 1. FOR UPDATE 锁定提现单并复查 status=0（多实例/重复执行只成功一次）；
   * 2. 退回申请时已扣的金额到用户余额，写 withdraw_refund 流水；
   * 3. 单据置为 status=3（超时自动取消）并发送站内信。
   *
   * 注意：手续费随本金一并退回（提现未打款，不产生实际成本）。
   */
  async autoCancelExpired(): Promise<{ scanned: number; canceled: number; amountCents: number }> {
    const timeoutHours = await this.risk.getNum(
      'withdraw_timeout_hours',
      DEFAULT_WITHDRAW_TIMEOUT_HOURS,
    );
    const hours = Math.floor(timeoutHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return { scanned: 0, canceled: 0, amountCents: 0 };
    }

    // hours 已校验为正整数，安全拼接，避免参数化 INTERVAL/LIMIT 在不同驱动上的兼容问题。
    const rows = (await this.dataSource.query(
      `SELECT id FROM withdrawals
       WHERE status = 0 AND created_at < DATE_SUB(NOW(), INTERVAL ${hours} HOUR)
       ORDER BY created_at ASC LIMIT ${TIMEOUT_SCAN_BATCH}`,
    )) as Array<{ id: string }>;

    let canceled = 0;
    let amountCentsTotal = 0;

    for (const { id } of rows) {
      let userId = '';
      let amountCents = 0;
      try {
        await this.dataSource.transaction('READ COMMITTED', async (manager) => {
          const w = await manager.findOne(WithdrawalEntity, {
            where: { id, status: 0 },
            lock: { mode: 'pessimistic_write' },
          });
          if (!w) return; // 已被管理员处理或被其它实例取消。
          const reason = `超过 ${hours} 小时未审核，系统自动取消并退款`;
          await this.refundInTx(manager, w, {
            status: 3,
            operator: SYSTEM_OPERATOR,
            reason,
            note: `提现超时自动退回：${reason}`,
          });
          userId = w.userId;
          amountCents = Number(w.amountCents);
        });
      } catch (error) {
        // 单据失败不阻断整批，下轮仍会捞到（status 仍为 0）。
        this.logger.error(
          `提现超时取消失败 orderId=${id}：${(error as Error)?.message ?? String(error)}`,
        );
        continue;
      }

      if (userId) {
        canceled += 1;
        amountCentsTotal += amountCents;
        await this.notifications.createSafe({
          userId,
          type: 'withdraw',
          title: '提现已超时自动取消',
          content: `你的一笔 ¥${(amountCents / 100).toFixed(2)} 提现因超过 ${hours} 小时未审核，已自动取消并退回余额。`,
          bizType: 'withdraw',
          bizId: id,
        });
      }
    }

    if (rows.length > 0) {
      this.logger.log(
        `提现超时扫描完成：共 ${rows.length} 单，取消 ${canceled} 单，合计退回 ¥${(amountCentsTotal / 100).toFixed(2)}`,
      );
    }
    return { scanned: rows.length, canceled, amountCents: amountCentsTotal };
  }

  /**
   * 在已持有提现单悲观行锁的事务内执行「退回余额」并落终态。
   * 人工拒绝（status=2）与超时自动取消（status=3）共用，保证两条退款路径口径一致。
   */
  private async refundInTx(
    manager: EntityManager,
    w: WithdrawalEntity,
    params: { status: number; operator: string; reason: string; note: string },
  ): Promise<void> {
    w.status = params.status;
    w.rejectReason = params.reason;
    w.operator = params.operator;
    w.approvedAt = new Date();
    await manager.save(WithdrawalEntity, w);

    const bal = await manager.findOne(UserBalanceEntity, {
      where: { userId: w.userId },
      lock: { mode: 'pessimistic_write' },
    });
    // 提现申请时已扣款、余额行必然存在；缺失属于异常数据，抛错让事务回滚，下轮重试。
    if (!bal) throw new Error(`提现退款失败：用户 ${w.userId} 余额记录不存在`);
    const after = Number(bal.balanceCents) + Number(w.amountCents);
    bal.balanceCents = String(after);
    bal.version += 1;
    await manager.save(bal);

    const refTxnNo = this.paymentNo.nextTxnNo('withdraw_refund');
    await manager.save(BalanceTransactionEntity, {
      id: refTxnNo,
      txnNo: refTxnNo,
      userId: w.userId,
      type: 'withdraw_refund',
      amountCents: String(w.amountCents),
      balanceAfterCents: String(after),
      refType: 'withdraw',
      refId: w.id,
      note: params.note,
    });
  }

  private maskCard(no: string) {
    if (no.length <= 8) return no;
    return no.slice(0, 4) + ' **** **** ' + no.slice(-4);
  }
}
