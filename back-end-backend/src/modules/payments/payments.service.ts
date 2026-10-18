import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  BalanceTransactionEntity,
  RechargeOrderEntity,
  UserBalanceEntity,
  UserEntity,
  UserProfileEntity,
  type BalanceTxnType,
  type RechargeChannel,
  type RechargeStatus,
} from '../../../mysql/entities/index.js';
import {
  SNOWFLAKE_ID_GENERATOR,
  SnowflakeIdGenerator,
} from '../../../mysql/snowflake-id.js';
import { PaymentNoGenerator } from '../common/payment-no.generator.js';
import { RiskService } from './risk.service.js';
import { BCRYPT_ROUNDS } from '../auth/password-policy.js';

export interface RechargeRequest {
  amountCents: number;
  channel: RechargeChannel;
  userNote?: string | null;
}

/**
 * 充值单对外视图（管理员，完整）。
 * - 金额 BIGINT 统一转成 number（单笔限额 10 万元，远小于 JS 安全整数上限），
 *   与前端 TypeScript 类型保持一致；
 * - reviewedByName 是审核人昵称（join users / pms_user 得到），便于页面展示；
 * - adminNote 是仅管理员可见的内部备注，不能出现在用户端视图里。
 */
export interface RechargeOrderView {
  id: string;
  orderNo: string;
  userId: string;
  amountCents: number;
  channel: RechargeChannel;
  status: RechargeStatus;
  userNote: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  adminNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 充值单用户端视图（精简）。
 * 出于安全考虑，不返回审核人ID/姓名、管理员内部备注，
 * 用户只能看到自己的审核结果说明（reviewNote）和审核时间。
 */
export interface MyRechargeOrderView {
  id: string;
  orderNo: string;
  userId: string;
  amountCents: number;
  channel: RechargeChannel;
  status: RechargeStatus;
  userNote: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 余额流水对外视图，金额字段同样转 number。 */
export interface BalanceTxnView {
  id: string;
  txnNo: string;
  userId: string;
  type: BalanceTxnType;
  amountCents: number;
  balanceAfterCents: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdAt: Date;
}

/** 把 "128.50" 这样的元字符串转成整数分。 */
export function yuanToCents(amountYuan: string): number {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amountYuan.trim());
  if (!match) throw new BadRequestException('金额格式不正确');
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return match[1] === '-' ? -cents : cents;
}

/**
 * 把分转成 "128.50" 元字符串，便于 JSON 传输。
 *
 * 注意：不能用 Number() 中转——JS 安全整数上限只有 2^53-1（约 9e15 分），
 * 而数据库 BIGINT 能存到 9.2e18。因此这里全程做字符串切分，任意位数安全。
 */
export function centsToYuan(cents: number | string): string {
  const raw = String(cents).trim();
  const negative = raw.startsWith('-');
  const digits = negative ? raw.slice(1) : raw;
  if (!digits) return '0.00';
  const normalized = digits.replace(/^0+(?=\d)/, '') || '0';
  const intPart = normalized.length <= 2 ? '0' : normalized.slice(0, -2);
  const fracPart = normalized.slice(-2).padStart(2, '0');
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

/**
 * ===== 钱包金额限额（单位：分）=====
 * 全项目唯一调整入口：以后改充值/转账/调整额度，只改这里的常量，
 * 不要在各方法里散落数字——分散写是上一次限额改错（10 万写成 1 万）的根因。
 */
/** 单笔交易下限：1 元 = 100 分。 */
export const MIN_TXN_CENTS = 100;
/** 单笔交易上限：10 万元 = 10,000,000 分。充值 / 转账 / 管理员调整共用。 */
export const MAX_TXN_CENTS = 10_000_000;

/**
 * 校验金额是正整数分，不合法直接抛 400。
 * @param action 用于报错文案，如「充值」「转账」「退款」「扣款」
 */
function assertPositiveCents(amountCents: number, action: string): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new BadRequestException(`${action}金额必须为正整数（分）`);
  }
}

/** 校验单笔金额不超过 MAX_TXN_CENTS（10 万元）。 */
function assertSingleLimit(amountCents: number, action: string): void {
  if (amountCents > MAX_TXN_CENTS) {
    throw new BadRequestException(`单笔${action}不能超过 10 万元`);
  }
}

/**
 * 钱包支付核心服务。
 *
 * 设计要点：
 * - 所有金额以「分」为单位存储（整数），避免浮点精度问题；
 *   对外 JSON 用元字符串（如 "128.50"），内部统一转成分计算。
 * - 所有余额变动都在数据库事务里完成，加「悲观行锁」防止并发超扣。
 * - 每笔变动都写一条 balance_transactions 流水（带符号金额 + 变动后余额），
 *   保证「用户余额 = 所有流水金额加总」，可随时对账。
 * - 雪花 ID 生成器生成业务单号（充值单号、转账单号等），全局唯一。
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(UserBalanceEntity)
    private readonly balances: Repository<UserBalanceEntity>,
    @InjectRepository(RechargeOrderEntity)
    private readonly recharges: Repository<RechargeOrderEntity>,
    @InjectRepository(BalanceTransactionEntity)
    private readonly txns: Repository<BalanceTransactionEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly profiles: Repository<UserProfileEntity>,
    @InjectRepository(UserEntity)
    private readonly accounts: Repository<UserEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(SNOWFLAKE_ID_GENERATOR)
    private readonly idGenerator: SnowflakeIdGenerator,
    private readonly paymentNo: PaymentNoGenerator,
    private readonly risk: RiskService,
  ) {}

  // ===== 用户端 =====

  /**
   * 批量把用户 userId 解析为展示名。
   * 优先 users.nickname，其次 pms_user.login_name（登录账号），都没有则用兜底名。
   * 用于把审核人（reviewedBy）等内部 userId 转成可读姓名。
   */
  private async resolveDisplayNames(
    ids: string[],
    fallback = '管理员',
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (uniqueIds.length === 0) return nameMap;

    const [profiles, accounts] = await Promise.all([
      this.profiles.find({ where: uniqueIds.map((userId) => ({ userId })) }),
      this.accounts.find({ where: uniqueIds.map((userId) => ({ userId })) }),
    ]);
    for (const id of uniqueIds) {
      const profile = profiles.find((p) => p.userId === id);
      const account = accounts.find((a) => a.userId === id);
      nameMap.set(id, profile?.nickname || account?.username || fallback);
    }
    return nameMap;
  }

  /** 充值单实体 -> 管理员视图（完整，含审核人姓名与内部备注）。 */
  private toRechargeView(
    order: RechargeOrderEntity,
    reviewerName?: string | null,
  ): RechargeOrderView {
    return {
      id: order.id,
      orderNo: order.orderNo ?? order.id,
      userId: order.userId,
      amountCents: Number(order.amountCents),
      channel: order.channel,
      status: order.status as RechargeStatus,
      userNote: order.userNote ?? null,
      reviewedBy: order.reviewedBy ?? null,
      reviewedByName: order.reviewedBy ? (reviewerName ?? null) : null,
      reviewNote: order.reviewNote ?? null,
      adminNote: order.adminNote ?? null,
      reviewedAt: order.reviewedAt ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /** 充值单实体 -> 用户视图（精简，不暴露审核人/内部备注）。 */
  private toMyRechargeView(order: RechargeOrderEntity): MyRechargeOrderView {
    return {
      id: order.id,
      orderNo: order.orderNo ?? order.id,
      userId: order.userId,
      amountCents: Number(order.amountCents),
      channel: order.channel,
      status: order.status as RechargeStatus,
      userNote: order.userNote ?? null,
      reviewNote: order.reviewNote ?? null,
      reviewedAt: order.reviewedAt ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /** 流水实体 -> 对外视图（金额转 number）。 */
  private toTxnView(txn: BalanceTransactionEntity): BalanceTxnView {
    return {
      id: txn.id,
      txnNo: txn.txnNo ?? txn.id,
      userId: txn.userId,
      type: txn.type as BalanceTxnType,
      amountCents: Number(txn.amountCents),
      balanceAfterCents: Number(txn.balanceAfterCents),
      refType: txn.refType ?? null,
      refId: txn.refId ?? null,
      note: txn.note ?? null,
      createdAt: txn.createdAt,
    };
  }

  /** 给一批充值单补审核人姓名并转成管理员视图。 */
  private async toRechargeViews(
    orders: RechargeOrderEntity[],
  ): Promise<RechargeOrderView[]> {
    const reviewerIds = orders
      .map((o) => o.reviewedBy)
      .filter((v): v is string => Boolean(v));
    const reviewerMap = await this.resolveDisplayNames(reviewerIds);
    return orders.map((o) =>
      this.toRechargeView(o, o.reviewedBy ? reviewerMap.get(o.reviewedBy) : null),
    );
  }

  /**
   * 查询用户余额。如果用户还没有余额记录，自动初始化一条 0 余额。
   * 注意：这里不锁行，只是读；真正扣款/加钱时才在事务里锁行。
   */
  async getBalance(userId: string): Promise<{ balanceCents: number; balanceYuan: string }> {
    let row = await this.balances.findOne({ where: { userId } });
    if (!row) {
      row = this.balances.create({ userId, balanceCents: '0', version: 0 });
      row = await this.balances.save(row);
    }
    const cents = Number(row.balanceCents);
    return { balanceCents: cents, balanceYuan: centsToYuan(cents) };
  }

  // ===== 支付密码（类微信/支付宝：6 位数字，与登录密码独立）=====

  /** 校验支付密码格式：必须是 6 位纯数字。 */
  private assertPaymentPasswordFormat(paymentPassword: string): void {
    if (!/^\d{6}$/.test(paymentPassword)) {
      throw new BadRequestException('支付密码必须是 6 位数字');
    }
  }

  /** 查询用户是否已设置支付密码（不返回哈希本身）。 */
  async hasPaymentPassword(userId: string): Promise<{ set: boolean }> {
    const profile = await this.profiles.findOne({
      where: { userId },
      select: { paymentPasswordHash: true },
    });
    return { set: Boolean(profile?.paymentPasswordHash) };
  }

  /** 设置支付密码（首次设置）。若已设置过，必须走 change 接口并验证旧密码。 */
  async setupPaymentPassword(userId: string, paymentPassword: string): Promise<void> {
    this.assertPaymentPasswordFormat(paymentPassword);
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('用户资料不存在');
    if (profile.paymentPasswordHash) {
      throw new ConflictException('已设置过支付密码，请走修改流程');
    }
    profile.paymentPasswordHash = await bcrypt.hash(paymentPassword, BCRYPT_ROUNDS);
    await this.profiles.save(profile);
  }

  /** 修改支付密码：需提供旧密码验证。 */
  async changePaymentPassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.assertPaymentPasswordFormat(newPassword);
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile?.paymentPasswordHash) {
      throw new BadRequestException('尚未设置支付密码');
    }
    const ok = await bcrypt.compare(oldPassword, profile.paymentPasswordHash);
    if (!ok) throw new BadRequestException('原支付密码错误');
    profile.paymentPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.profiles.save(profile);
  }

  /**
   * 校验支付密码。涉及余额变动的接口（支付账单、转账）在扣钱前调用。
   * 未设置支付密码的用户会被引导先去设置。
   */
  async assertPaymentPassword(userId: string, paymentPassword: string): Promise<void> {
    if (!paymentPassword) {
      throw new BadRequestException('请输入支付密码');
    }
    const profile = await this.profiles.findOne({
      where: { userId },
      select: { paymentPasswordHash: true },
    });
    if (!profile?.paymentPasswordHash) {
      throw new BadRequestException('尚未设置支付密码，请先在钱包页设置');
    }
    const ok = await bcrypt.compare(paymentPassword, profile.paymentPasswordHash);
    if (!ok) throw new BadRequestException('支付密码错误');
  }

  /** 申请线下充值。状态为 pending，等待管理员审核。 */
  async requestRecharge(userId: string, req: RechargeRequest): Promise<MyRechargeOrderView> {
    assertPositiveCents(req.amountCents, '充值');
    assertSingleLimit(req.amountCents, '充值');
    const order = this.recharges.create({
      id: await this.idGenerator.nextId(),
      orderNo: this.paymentNo.nextRechargeOrderNo(),
      userId,
      amountCents: String(req.amountCents),
      channel: req.channel,
      status: 'pending',
      userNote: req.userNote?.trim() || null,
      reviewedBy: null,
      reviewNote: null,
      adminNote: null,
      reviewedAt: null,
    });
    const saved = await this.recharges.save(order);
    return this.toMyRechargeView(saved);
  }

  /** 月度账单：按月汇总收支 */
  async monthlySummary(userId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    const rows = await this.dataSource.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
              SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END) AS income_cents,
              SUM(CASE WHEN amount_cents < 0 THEN -amount_cents ELSE 0 END) AS expense_cents,
              COUNT(*) AS cnt
       FROM balance_transactions
       WHERE user_id = ? AND YEAR(created_at) = ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month DESC`,
      [userId, y],
    );
    return (rows as any[]).map((r) => ({
      month: r.month,
      incomeYuan: (Number(r.income_cents) / 100).toFixed(2),
      expenseYuan: (Number(r.expense_cents) / 100).toFixed(2),
      count: Number(r.cnt),
    }));
  }

  async listMyRecharges(userId: string): Promise<MyRechargeOrderView[]> {
    const orders = await this.recharges.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    // 用户端视图不包含审核人、内部备注
    return orders.map((o) => this.toMyRechargeView(o));
  }

  async listMyTransactions(userId: string): Promise<BalanceTxnView[]> {
    const txns = await this.txns.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return txns.map((t) => this.toTxnView(t));
  }

  // ===== 管理员端 =====

  /** 管理员分页查询充值单（可按状态、用户ID筛选）。 */
  async adminListRecharges(options: {
    page?: number;
    pageSize?: number;
    status?: 'pending' | 'approved' | 'rejected';
    userId?: string;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const where: Record<string, unknown> = {};
    if (options.status) where.status = options.status;
    if (options.userId?.trim()) where.userId = options.userId.trim();
    const [entities, total] = await this.recharges.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const items = await this.toRechargeViews(entities);
    return { items, total, page, pageSize };
  }

  /**
   * 管理员审核通过充值申请。
   *
   * 事务流程：
   * 1. 锁定充值单，校验状态必须是 pending（防止重复审核）
   * 2. 锁定用户余额记录
   * 3. 余额 += 充值金额
   * 4. 写一条 recharge 类型流水
   * 5. 更新充值单状态为 approved，记录审核人/时间
   *
   * 整个过程在一个数据库事务里，任何一步失败都会回滚，不会出现「审核通过了但余额没加」的情况。
   */
  async approveRecharge(
    adminId: string,
    rechargeId: string,
    reviewNote?: string | null,
    adminNote?: string | null,
  ): Promise<RechargeOrderView> {
    const saved = await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const order = await manager.findOne(RechargeOrderEntity, {
        where: { id: rechargeId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('充值单不存在');
      if (order.status !== 'pending') {
        throw new ConflictException(`充值单已${order.status === 'approved' ? '审核通过' : '驳回'}`);
      }

      // 纵深防御：申请时已经校验过金额，但审核时再复验一次——
      // 防止数据库被手动改过、或历史脏数据里 amountCents 异常，
      // 避免管理员一点审核就给用户加上一笔巨额余额。
      const amount = Number(order.amountCents);
      assertPositiveCents(amount, '充值到账');
      assertSingleLimit(amount, '充值到账');

      // 加余额（不存在则创建）
      let balance = await manager.findOne(UserBalanceEntity, {
        where: { userId: order.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!balance) {
        balance = manager.create(UserBalanceEntity, {
          userId: order.userId,
          balanceCents: '0',
          version: 0,
        });
      }
      const after = Number(balance.balanceCents) + amount;
      balance.balanceCents = String(after);
      balance.version += 1;
      await manager.save(balance);

      // 写流水
      await manager.save(
        manager.create(BalanceTransactionEntity, {
          id: await this.idGenerator.nextId(),
          txnNo: this.paymentNo.nextTxnNo('recharge'),
          userId: order.userId,
          type: 'recharge',
          amountCents: String(amount),
          balanceAfterCents: String(after),
          refType: 'recharge',
          refId: order.orderNo ?? order.id,
          note: `充值到账（${order.channel}）`,
        }),
      );

      order.status = 'approved';
      order.reviewedBy = adminId;
      order.reviewNote = reviewNote?.trim() || null;
      order.adminNote = adminNote?.trim() || null;
      order.reviewedAt = new Date();
      return manager.save(order);
    });

    const reviewerNames = await this.resolveDisplayNames([adminId]);
    return this.toRechargeView(saved, reviewerNames.get(adminId));
  }

  async rejectRecharge(
    adminId: string,
    rechargeId: string,
    reviewNote?: string | null,
    adminNote?: string | null,
  ): Promise<RechargeOrderView> {
    // 纵深防御：即使绕过 DTO 校验直接调用，驳回也必须有原因。
    const note = reviewNote?.trim();
    if (!note) {
      throw new BadRequestException('驳回时必须填写驳回原因');
    }
    // 加行锁，防止两个管理员同时点「驳回」时互相覆盖审核人/备注。
    const order = await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const locked = await manager.findOne(RechargeOrderEntity, {
        where: { id: rechargeId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('充值单不存在');
      if (locked.status !== 'pending') {
        throw new ConflictException('该充值单已处理');
      }
      locked.status = 'rejected';
      locked.reviewedBy = adminId;
      locked.reviewNote = note;
      locked.adminNote = adminNote?.trim() || null;
      locked.reviewedAt = new Date();
      return manager.save(locked);
    });
    const reviewerNames = await this.resolveDisplayNames([adminId]);
    return this.toRechargeView(order, reviewerNames.get(adminId));
  }

  // ===== 业务扣款（供 bills 等模块调用）=====

  /**
   * 从用户余额扣款（供账单支付等业务调用）。
   *
   * 这是钱包系统最核心的方法：
   * - 事务 + 悲观行锁，保证并发情况下不会超扣
   * - 余额不足直接抛 BadRequestException，事务回滚
   * - 扣款成功后写一条 consume 类型流水（带符号负金额）
   *
   * @param params.userId 用户ID
   * @param params.amountCents 扣款金额（正整数分）
   * @param params.refType 关联业务类型（bill / recharge 等）
   * @param params.refId 关联业务单号
   * @param params.note 流水说明
   * @param params.manager 可选。若外部已开启事务，传入 EntityManager 复用同一连接，
   *   使「扣余额 + 写流水 + 改业务单状态」在同一事务里原子提交；不传则自行开事务。
   */
  async consume(params: {
    userId: string;
    amountCents: number;
    refType: string;
    refId: string;
    note?: string | null;
    manager?: EntityManager;
  }): Promise<BalanceTransactionEntity> {
    assertPositiveCents(params.amountCents, '扣款');
    const run = async (manager: EntityManager) => {
      const balance = await manager.findOne(UserBalanceEntity, {
        where: { userId: params.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const current = balance ? Number(balance.balanceCents) : 0;
      if (current < params.amountCents) {
        throw new BadRequestException(
          `余额不足，当前 ¥${centsToYuan(current)}，需 ¥${centsToYuan(params.amountCents)}`,
        );
      }
      const after = current - params.amountCents;
      if (balance) {
        balance.balanceCents = String(after);
        balance.version += 1;
        await manager.save(balance);
      } else {
        // 走到这里说明余额记录不存在但又不满足 current < amount——即 current=0 >= amount，
        // 但 amount 是正数（assertPositiveCents 已保证），数学上不可能。
        // 直接抛错，绝不静默创建一条负余额记录，否则会污染对账。
        throw new BadRequestException(
          `用户余额记录不存在，无法扣款（userId=${params.userId}）`,
        );
      }
      const txn = manager.create(BalanceTransactionEntity, {
        id: await this.idGenerator.nextId(),
        txnNo: this.paymentNo.nextTxnNo('consume'),
        userId: params.userId,
        type: 'consume',
        amountCents: String(-params.amountCents),
        balanceAfterCents: String(after),
        refType: params.refType,
        refId: params.refId,
        note: params.note ?? null,
      });
      return manager.save(txn);
    };
    if (params.manager) return run(params.manager);
    return this.dataSource.transaction('READ COMMITTED', run);
  }

  // ===== 用户间转账 =====

  /**
   * 用户间转账（类似微信转账）。
   *
   * 流程：
   * 1. 按对方邮箱查出收款方 userId（用户输入的是邮箱，不是内部 ID）
   * 2. 校验：不能给自己转、金额必须正、单笔上限 10 万
   * 3. 事务里：
   *    - 锁定转出方余额，校验余额充足，扣钱
   *    - 锁定转入方余额，加钱（不存在则创建）
   *    - 写两条流水：转出方 transfer_out（负金额）、转入方 transfer_in（正金额）
   * 4. 流水说明里用对方昵称，不显示 userId（像微信/支付宝那样）
   *
   * 注意：转账不改变系统总余额，只是钱从 A 口袋到 B 口袋。
   */
  async transfer(
    fromUserId: string,
    toAccount: string,
    amountCents: number,
    note?: string | null,
    paymentPassword?: string,
  ) {
    // 按对方邮箱查出收款方；金额校验走统一入口（见文件顶部 MAX_TXN_CENTS）
    assertPositiveCents(amountCents, '转账');
    assertSingleLimit(amountCents, '转账');

    // 风控：单笔/日累计
    const singleMax = (await this.risk.getNum('transfer_single_max_yuan', 10000)) * 100;
    if (amountCents > singleMax) throw new BadRequestException(`单笔转账不能超过 ${(singleMax / 100).toFixed(0)} 元`);
    const dailyMax = (await this.risk.getNum('transfer_daily_max_yuan', 50000)) * 100;
    const todayOut = await this.risk.todayOutflow(fromUserId, ['transfer_out']);
    if (todayOut + amountCents > dailyMax) throw new BadRequestException(`今日转账累计已达上限（${(dailyMax / 100).toFixed(0)} 元）`);
    // 转账涉及余额变动，必须先验证支付密码（类微信/支付宝）
    await this.assertPaymentPassword(fromUserId, paymentPassword ?? '');
    const target = await this.profiles.findOne({
      where: { email: toAccount.toLowerCase() },
    });
    if (!target) throw new BadRequestException('收款账号不存在');
    const toUserId = target.userId;
    if (fromUserId === toUserId) {
      throw new BadRequestException('不能给自己转账');
    }
    const fromProfile = await this.profiles.findOne({ where: { userId: fromUserId } });

    // 展示名：优先昵称，否则邮箱前缀
    const toDisplayName = target.nickname || target.email.split('@')[0];
    const fromDisplayName = fromProfile?.nickname || fromProfile?.email.split('@')[0] || fromUserId;

    // 转账业务单号（两条流水共享，作为对外关联单号，独立于雪花ID）
    const transferNo = this.paymentNo.nextTransferNo();
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // 按 userId 字典序排序锁，防止 A→B 和 B→A 并发时死锁
      const [firstLockId, secondLockId] = [fromUserId, toUserId].sort();

      // 先锁第一个用户的余额，再锁第二个
      const bal1 = await manager.findOne(UserBalanceEntity, {
        where: { userId: firstLockId },
        lock: { mode: 'pessimistic_write' },
      });
      const bal2 = await manager.findOne(UserBalanceEntity, {
        where: { userId: secondLockId },
        lock: { mode: 'pessimistic_write' },
      });

      // 根据 fromUserId 判断哪个是转出方余额记录
      const fromBal = fromUserId === firstLockId ? bal1 : bal2;
      const toBalRaw = toUserId === firstLockId ? bal1 : bal2;

      const fromCurrent = fromBal ? Number(fromBal.balanceCents) : 0;
      if (fromCurrent < amountCents) {
        throw new BadRequestException(
          `余额不足，当前 ¥${centsToYuan(fromCurrent)}，需 ¥${centsToYuan(amountCents)}`,
        );
      }
      const fromAfter = fromCurrent - amountCents;
      if (fromBal) {
        fromBal.balanceCents = String(fromAfter);
        fromBal.version += 1;
        await manager.save(fromBal);
      }

      // 转入方余额（不存在则创建）
      let toBal = toBalRaw;
      if (!toBal) {
        toBal = manager.create(UserBalanceEntity, {
          userId: toUserId,
          balanceCents: '0',
          version: 0,
        });
      }
      const toBefore = Number(toBal.balanceCents);
      const toAfter = toBefore + amountCents;
      toBal.balanceCents = String(toAfter);
      toBal.version += 1;
      await manager.save(toBal);

      const userNote = note?.trim();

      // A 出款流水：显示对方昵称
      await manager.save(
        manager.create(BalanceTransactionEntity, {
          id: await this.idGenerator.nextId(),
          txnNo: this.paymentNo.nextTxnNo('transfer_out'),
          userId: fromUserId,
          type: 'transfer_out',
          amountCents: String(-amountCents),
          balanceAfterCents: String(fromAfter),
          refType: 'transfer',
          refId: transferNo,
          note: `转账给 ${toDisplayName}${userNote ? '：' + userNote : ''}`,
        }),
      );
      // B 入款流水：显示对方昵称
      await manager.save(
        manager.create(BalanceTransactionEntity, {
          id: await this.idGenerator.nextId(),
          txnNo: this.paymentNo.nextTxnNo('transfer_in'),
          userId: toUserId,
          type: 'transfer_in',
          amountCents: String(amountCents),
          balanceAfterCents: String(toAfter),
          refType: 'transfer',
          refId: transferNo,
          note: `来自 ${fromDisplayName} 的转账${userNote ? '：' + userNote : ''}`,
        }),
      );

      return {
        transferId: transferNo,
        transferNo,
        amountCents,
        fromUserId,
        toUserId,
        toAccount: target.email,
        toNickname: target.nickname,
        fromNickname: fromProfile?.nickname ?? null,
        fromBalanceAfterCents: fromAfter,
        toBalanceAfterCents: toAfter,
      };
    });
  }

  // ===== 退款 / 管理员调整 =====

  /**
   * 退款：把钱加回用户余额（用于账单支付后退款等场景）。
   *
   * 与 consume 方向相反：consume 是扣钱，refund 是加钱。
   * 同样走事务 + 行锁，写一条 refund 类型流水（正金额）。
   *
   * @param params.manager 可选。外部事务传入 EntityManager 复用连接。
   */
  async refund(params: {
    userId: string;
    amountCents: number;
    refType: string;
    refId: string;
    note?: string | null;
    manager?: EntityManager;
  }): Promise<BalanceTransactionEntity> {
    assertPositiveCents(params.amountCents, '退款');
    // 纵深防御：即使调用方漏传上限，单笔退款也不能超过 10 万元，
    // 防止上游 bug 或被攻击后凭空给用户加巨额余额。
    assertSingleLimit(params.amountCents, '退款');
    const run = async (manager: EntityManager) => {
      let balance = await manager.findOne(UserBalanceEntity, {
        where: { userId: params.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!balance) {
        balance = manager.create(UserBalanceEntity, {
          userId: params.userId,
          balanceCents: '0',
          version: 0,
        });
      }
      const after = Number(balance.balanceCents) + params.amountCents;
      balance.balanceCents = String(after);
      balance.version += 1;
      await manager.save(balance);

      return manager.save(
        manager.create(BalanceTransactionEntity, {
          id: await this.idGenerator.nextId(),
          txnNo: this.paymentNo.nextTxnNo('refund'),
          userId: params.userId,
          type: 'refund',
          amountCents: String(params.amountCents),
          balanceAfterCents: String(after),
          refType: params.refType,
          refId: params.refId,
          note: params.note ?? null,
        }),
      );
    };
    if (params.manager) return run(params.manager);
    return this.dataSource.transaction('READ COMMITTED', run);
  }

  /**
   * 管理员手工调整用户余额（客服补偿、系统错误修正等场景）。
   *
   * - amountCents 为正 = 给用户加钱
   * - amountCents 为负 = 扣用户余额（调整后不能为负）
   * - 写一条 adjust 类型流水，备注里记录操作人
   * - 单笔上限 10 万元
   *
   * 注意：这是管理员特权操作，必须由 controller 层校验 admin 角色。
   */
  async adminAdjust(params: {
    adminId: string;
    targetUserId: string;
    amountCents: number;
    note?: string | null;
  }): Promise<BalanceTxnView> {
    if (!Number.isInteger(params.amountCents) || params.amountCents === 0) {
      throw new BadRequestException('调整金额必须为非零整数（分）');
    }
    assertSingleLimit(Math.abs(params.amountCents), '调整');
    const target = await this.profiles.findOne({ where: { userId: params.targetUserId } });
    if (!target) throw new NotFoundException('目标用户不存在');

    const txn = await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      let balance = await manager.findOne(UserBalanceEntity, {
        where: { userId: params.targetUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!balance) {
        balance = manager.create(UserBalanceEntity, {
          userId: params.targetUserId,
          balanceCents: '0',
          version: 0,
        });
      }
      const current = Number(balance.balanceCents);
      const after = current + params.amountCents;
      if (after < 0) {
        throw new BadRequestException(
          `调整后余额为负，当前 ¥${centsToYuan(current)}`,
        );
      }
      balance.balanceCents = String(after);
      balance.version += 1;
      await manager.save(balance);

      return manager.save(
        manager.create(BalanceTransactionEntity, {
          id: await this.idGenerator.nextId(),
          txnNo: this.paymentNo.nextTxnNo('adjust'),
          userId: params.targetUserId,
          type: 'adjust',
          amountCents: String(params.amountCents),
          balanceAfterCents: String(after),
          refType: 'admin_adjust',
          refId: params.adminId,
          note: params.note?.trim()
            ? `管理员调整：${params.note.trim()}`
            : '管理员调整',
        }),
      );
    });
    return this.toTxnView(txn);
  }

  /**
   * 对账修复（单边操作，这是和 adminAdjust 的关键区别）。
   *
   * 恒等式：余额表余额 == 流水 amount 加总；diff = 余额表 - 流水加总。
   * 普通「余额调整」(adminAdjust) 同时改余额和流水，diff 不变，无法修复对账；
   * 对账修复必须只动一边：
   *  - mode='balance'（以流水为准，推荐）：流水是真实资金轨迹，直接把余额表修正为
   *    流水加总，不产生新流水；
   *  - mode='ledger'（以余额为准）：确认余额表正确、只是漏记了流水时，补一笔
   *    amount=diff 的 adjust 流水，余额保持不变。
   * 金额一律由服务端按当前账实重新计算，不接受前端传入的金额。
   */
  async adminReconcileFix(params: {
    adminId: string;
    targetUserId: string;
    mode: 'balance' | 'ledger';
    note?: string | null;
  }): Promise<{
    noop: boolean;
    mode: 'balance' | 'ledger';
    balanceCents: number;
    txnSumCents: number;
    diffCents: number;
    beforeBalanceCents: number;
    changedCents: number;
    txnId: string | null;
  }> {
    const target = await this.profiles.findOne({ where: { userId: params.targetUserId } });
    if (!target) throw new NotFoundException('目标用户不存在');

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // 锁定该用户余额行，同时锁定其流水，防止修复期间有新交易写入
      let balance = await manager.findOne(UserBalanceEntity, {
        where: { userId: params.targetUserId },
        lock: { mode: 'pessimistic_write' },
      });
      const sumRows = await manager.query(
        `SELECT COALESCE(SUM(amount_cents), 0) AS s
         FROM balance_transactions WHERE user_id = ? FOR UPDATE`,
        [params.targetUserId],
      );
      const txnSumCents = Number(sumRows[0]?.s ?? 0);
      const beforeBalanceCents = balance ? Number(balance.balanceCents) : 0;
      const diffCents = beforeBalanceCents - txnSumCents;

      if (diffCents === 0) {
        return {
          noop: true,
          mode: params.mode,
          balanceCents: beforeBalanceCents,
          txnSumCents,
          diffCents: 0,
          beforeBalanceCents,
          changedCents: 0,
          txnId: null,
        };
      }

      if (params.mode === 'balance') {
        // 以流水为准：只修正余额表，不写流水
        if (balance) {
          balance.balanceCents = String(txnSumCents);
          balance.version += 1;
        } else {
          balance = manager.create(UserBalanceEntity, {
            userId: params.targetUserId,
            balanceCents: String(txnSumCents),
            version: 0,
          });
        }
        await manager.save(balance);
        return {
          noop: false,
          mode: 'balance',
          balanceCents: txnSumCents,
          txnSumCents,
          diffCents: 0,
          beforeBalanceCents,
          changedCents: txnSumCents - beforeBalanceCents,
          txnId: null,
        };
      }

      // 以余额为准：只补一笔流水，余额保持不变
      if (!balance) {
        balance = manager.create(UserBalanceEntity, {
          userId: params.targetUserId,
          balanceCents: '0',
          version: 0,
        });
        await manager.save(balance);
      }
      const txn = await manager.save(
        manager.create(BalanceTransactionEntity, {
          id: await this.idGenerator.nextId(),
          txnNo: this.paymentNo.nextTxnNo('adjust'),
          userId: params.targetUserId,
          type: 'adjust',
          amountCents: String(diffCents),
          balanceAfterCents: String(beforeBalanceCents),
          refType: 'reconcile_fix',
          refId: params.adminId,
          note: params.note?.trim()
            ? `对账补流水：${params.note.trim()}`
            : '对账补流水：以余额为准补录',
        }),
      );
      return {
        noop: false,
        mode: 'ledger',
        balanceCents: beforeBalanceCents,
        txnSumCents: txnSumCents + diffCents,
        diffCents: 0,
        beforeBalanceCents,
        changedCents: diffCents,
        txnId: txn.id,
      };
    });
  }

  /**
   * 逐用户对账排查：找出每个用户的「余额表余额」vs「流水加总」差异。
   * 差异不为 0 的用户就是问题所在，直接定位到具体用户。
   */
  async adminReconcileByUser() {
    // 所有用户余额
    const balances = await this.balances.find();
    // 所有用户流水按 user_id 分组求和
    const rows = await this.txns
      .createQueryBuilder('t')
      .select('t.user_id', 'userId')
      .addSelect('SUM(t.amount_cents)', 'sumCents')
      .addSelect('COUNT(*)', 'txnCount')
      .groupBy('t.user_id')
      .getRawMany<{ userId: string; sumCents: string; txnCount: string }>();

    const txnMap = new Map(rows.map((r) => [r.userId, r]));
    const profiles = await this.profiles.find();
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    // 合并所有出现过的用户（余额表 + 流水表）
    const allUserIds = new Set<string>([
      ...balances.map((b) => b.userId),
      ...rows.map((r) => r.userId),
    ]);

    const results = [...allUserIds].map((userId) => {
      const balRow = balances.find((b) => b.userId === userId);
      const txnRow = txnMap.get(userId);
      const balanceCents = balRow ? Number(balRow.balanceCents) : 0;
      const txnSumCents = txnRow ? Number(txnRow.sumCents) : 0;
      const diff = balanceCents - txnSumCents;
      const profile = profileMap.get(userId);
      return {
        userId,
        email: profile?.email ?? null,
        nickname: profile?.nickname ?? null,
        balanceCents,
        balanceYuan: centsToYuan(balanceCents),
        txnSumCents,
        txnSumYuan: centsToYuan(txnSumCents),
        txnCount: txnRow ? Number(txnRow.txnCount) : 0,
        diffCents: diff,
        diffYuan: centsToYuan(diff),
        balanced: diff === 0,
      };
    });

    // 差异不为 0 的排前面
    results.sort((a, b) => Math.abs(b.diffCents) - Math.abs(a.diffCents));
    return results;
  }

  /**
   * 按天汇总流水，找出从哪天开始数据不一致。
   * 用于定位是哪段时间的操作导致了不平。
   */
  async adminReconcileDaily(days: number = 30) {
    const rows = await this.txns
      .createQueryBuilder('t')
      // 用 DATE_FORMAT 强制返回 'YYYY-MM-DD' 字符串：
      // mysql2 会把 DATE() 结果解析成 Date 对象，直接当字符串用会导致
      // localeCompare 报错，且 Date 对象做 Map key 会让同一天的行聚合分裂。
      .select("DATE_FORMAT(t.created_at, '%Y-%m-%d')", 'date')
      .addSelect('t.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(t.amount_cents)', 'sumCents')
      .where('t.created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)', { days })
      .groupBy("DATE_FORMAT(t.created_at, '%Y-%m-%d'), t.type")
      .orderBy("DATE_FORMAT(t.created_at, '%Y-%m-%d')", 'DESC')
      .getRawMany<{
        date: string;
        type: string;
        count: string;
        sumCents: string;
      }>();

    // 按日期聚合。汇总数可能很大，全程字符串 + BigInt 运算，不转 Number。
    const byDate = new Map<
      string,
      { date: string; totalCents: string; byType: Record<string, string>; count: number }
    >();
    for (const r of rows) {
      if (!byDate.has(r.date)) {
        byDate.set(r.date, { date: r.date, totalCents: '0', byType: {}, count: 0 });
      }
      const day = byDate.get(r.date)!;
      day.totalCents = (BigInt(day.totalCents) + BigInt(r.sumCents)).toString();
      day.byType[r.type] = r.sumCents;
      day.count += Number(r.count);
    }
    return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  }

  // ===== 管理员：全局流水 / 对账 =====

  /** 管理员查所有流水（分页 + 过滤）。 */
  async adminListTransactions(options: {
    page?: number;
    pageSize?: number;
    userId?: string;
    type?: string;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, options.pageSize ?? 20));
    const where: Record<string, unknown> = {};
    if (options.userId) where.userId = options.userId;
    if (options.type) where.type = options.type;
    const [items, total] = await this.txns.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items: items.map((t) => this.toTxnView(t)), total, page, pageSize };
  }

  /** 管理员查所有用户余额。 */
  async adminListBalances() {
    const rows = await this.balances.find({ order: { balanceCents: 'DESC' } });
    // 联表取昵称/邮箱
    const profiles = await this.profiles.find();
    const map = new Map(profiles.map((p) => [p.userId, p]));
    return rows.map((r) => {
      const p = map.get(r.userId);
      return {
        userId: r.userId,
        email: p?.email ?? null,
        nickname: p?.nickname ?? null,
        balanceCents: Number(r.balanceCents),
        balanceYuan: centsToYuan(Number(r.balanceCents)),
        version: r.version,
      };
    });
  }

  /**
   * 对账：按日期范围汇总。
   * 口径：
   *  - totalBalance = 所有用户余额加总
   *  - rechargeSum / consumeSum / transferOutSum / transferInSum / refundSum / adjustSum = 各类型流水金额合计（带符号）
   *  - 平衡校验：totalBalance ≈ 所有流水 amountCents 加总（recharge + consume(-) + refund + transferOut(-) + transferIn + adjust）
   */
  /**
   * 钱包对账：校验「用户总余额」是否等于「流水累计」。
   *
   * 理论上：所有用户当前余额 = 所有流水 amount 的代数和。
   * 如果不等（diff ≠ 0），说明有 bug 或手动改库没写流水，需要排查。
   *
   * 返回：
   * - totalBalanceYuan：所有用户余额加总（当前时点口径）
   * - ledgerSumYuan：所有流水 amount 加总（全量历史口径）
   * - diffYuan：两者差异（应为 0）
   * - periodSummary：按日期范围筛选的流水分类汇总
   * - allTime：全量历史的各类型流水汇总
   */
  async adminReconcile(startDate?: string, endDate?: string) {
    // 周期内分类汇总：SQL 端 SUM，结果是字符串，不转 Number。
    const qb = this.txns.createQueryBuilder('t');
    if (startDate) qb.andWhere('t.created_at >= :start', { start: startDate });
    if (endDate) qb.andWhere('t.created_at <= :end', { end: endDate + ' 23:59:59' });
    const rows = await qb
      .select('t.type', 'type')
      .addSelect('SUM(t.amount_cents)', 'sum')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.type')
      .getRawMany<{ type: string; sum: string; count: string }>();

    const periodSummary: Record<string, { sumCents: string; count: number }> = {};
    for (const r of rows) {
      periodSummary[r.type] = { sumCents: r.sum, count: Number(r.count) };
    }

    // 用户总余额：直接在数据库里 SUM，避免全表余额拉进内存，
    // 也避免 JS Number 累加超过 2^53 后精度丢失。
    const [totalRow, countRow] = await Promise.all([
      this.dataSource
        .createQueryBuilder()
        .select('COALESCE(SUM(balance_cents), 0)', 'sum')
        .from('user_balances', 'ub')
        .getRawOne<{ sum: string }>(),
      this.dataSource
        .createQueryBuilder()
        .select('COUNT(*)', 'c')
        .from('user_balances', 'ub')
        .getRawOne<{ c: string }>(),
    ]);
    const totalBalanceCents = BigInt(totalRow?.sum ?? '0');

    // 全量流水按类型加总（SQL SUM 返回字符串），用 BigInt 汇总
    const sumByType = async (type: string) => {
      const r = await this.txns
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount_cents), 0)', 'sum')
        .where('t.type = :type', { type })
        .getRawOne<{ sum: string }>();
      const cents = r?.sum ?? '0';
      return { cents, big: BigInt(cents) };
    };

    const [recharge, consume, transferOut, transferIn, refund, adjust, withdrawOut, withdrawRefund, redPacketOut, redPacketIn, redPacketRefund] =
      await Promise.all([
        sumByType('recharge'),
        sumByType('consume'),
        sumByType('transfer_out'),
        sumByType('transfer_in'),
        sumByType('refund'),
        sumByType('adjust'),
        sumByType('withdraw_out'),
        sumByType('withdraw_refund'),
        sumByType('red_packet_out'),
        sumByType('red_packet_in'),
        sumByType('red_packet_refund'),
      ]);
    // 红包三类净额恒为 0（出款负 + 领取正 + 过期退回正），纳入求和不影响平衡，
    // 但能保证账本全类型覆盖，未来新增红包玩法也不会遗漏。
    const ledgerSum =
      recharge.big + consume.big + transferOut.big + transferIn.big + refund.big + adjust.big
      + withdrawOut.big + withdrawRefund.big
      + redPacketOut.big + redPacketIn.big + redPacketRefund.big;
    const diff = totalBalanceCents - ledgerSum;

    return {
      range: { startDate: startDate ?? null, endDate: endDate ?? null },
      totalBalanceCents: totalBalanceCents.toString(),
      totalBalanceYuan: centsToYuan(totalBalanceCents.toString()),
      ledgerSumCents: ledgerSum.toString(),
      ledgerSumYuan: centsToYuan(ledgerSum.toString()),
      diffCents: diff.toString(),
      diffYuan: centsToYuan(diff.toString()),
      balanced: diff === 0n,
      periodSummary,
      allTime: {
        rechargeSumCents: recharge.cents,
        consumeSumCents: consume.cents,
        transferOutSumCents: transferOut.cents,
        transferInSumCents: transferIn.cents,
        refundSumCents: refund.cents,
        adjustSumCents: adjust.cents,
        withdrawOutSumCents: withdrawOut.cents,
        withdrawRefundSumCents: withdrawRefund.cents,
        redPacketOutSumCents: redPacketOut.cents,
        redPacketInSumCents: redPacketIn.cents,
        redPacketRefundSumCents: redPacketRefund.cents,
      },
      userCount: Number(countRow?.c ?? 0),
    };
  }
}
