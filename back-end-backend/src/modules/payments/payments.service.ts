import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  BalanceTransactionEntity,
  RechargeOrderEntity,
  UserBalanceEntity,
  UserProfileEntity,
  type RechargeChannel,
} from '../../../mysql/entities/index.js';
import {
  SNOWFLAKE_ID_GENERATOR,
  SnowflakeIdGenerator,
} from '../../../mysql/snowflake-id.js';

export interface RechargeRequest {
  amountCents: number;
  channel: RechargeChannel;
  userNote?: string | null;
}

/** 把 "128.50" 这样的元字符串转成整数分。 */
export function yuanToCents(amountYuan: string): number {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amountYuan.trim());
  if (!match) throw new BadRequestException('金额格式不正确');
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return match[1] === '-' ? -cents : cents;
}

/** 把分转成 "128.50" 元字符串，便于 JSON 传输。 */
export function centsToYuan(cents: number | string): string {
  const n = typeof cents === 'string' ? Number(cents) : cents;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, '0')}`;
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
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(SNOWFLAKE_ID_GENERATOR)
    private readonly idGenerator: SnowflakeIdGenerator,
  ) {}

  // ===== 用户端 =====

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

  /** 申请线下充值。状态为 pending，等待管理员审核。 */
  async requestRecharge(userId: string, req: RechargeRequest) {
    if (!Number.isInteger(req.amountCents) || req.amountCents <= 0) {
      throw new BadRequestException('充值金额必须为正整数（分）');
    }
    if (req.amountCents > 10_000_00) {
      throw new BadRequestException('单笔充值不能超过 10 万元');
    }
    const order = this.recharges.create({
      id: await this.idGenerator.nextId(),
      userId,
      amountCents: String(req.amountCents),
      channel: req.channel,
      status: 'pending',
      userNote: req.userNote?.trim() || null,
      reviewedBy: null,
      reviewNote: null,
      reviewedAt: null,
    });
    return this.recharges.save(order);
  }

  listMyRecharges(userId: string) {
    return this.recharges.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  listMyTransactions(userId: string) {
    return this.txns.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // ===== 管理员端 =====

  adminListRecharges(status?: 'pending' | 'approved' | 'rejected') {
    return this.recharges.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
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
  ) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const order = await manager.findOne(RechargeOrderEntity, {
        where: { id: rechargeId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('充值单不存在');
      if (order.status !== 'pending') {
        throw new ConflictException(`充值单已${order.status === 'approved' ? '审核通过' : '驳回'}`);
      }

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
      const amount = Number(order.amountCents);
      const after = Number(balance.balanceCents) + amount;
      balance.balanceCents = String(after);
      balance.version += 1;
      await manager.save(balance);

      // 写流水
      await manager.save(
        manager.create(BalanceTransactionEntity, {
          id: await this.idGenerator.nextId(),
          userId: order.userId,
          type: 'recharge',
          amountCents: String(amount),
          balanceAfterCents: String(after),
          refType: 'recharge',
          refId: order.id,
          note: `充值到账（${order.channel}）`,
        }),
      );

      order.status = 'approved';
      order.reviewedBy = adminId;
      order.reviewNote = reviewNote?.trim() || null;
      order.reviewedAt = new Date();
      return manager.save(order);
    });
  }

  async rejectRecharge(
    adminId: string,
    rechargeId: string,
    reviewNote?: string | null,
  ) {
    const order = await this.recharges.findOne({ where: { id: rechargeId } });
    if (!order) throw new NotFoundException('充值单不存在');
    if (order.status !== 'pending') {
      throw new ConflictException('该充值单已处理');
    }
    order.status = 'rejected';
    order.reviewedBy = adminId;
    order.reviewNote = reviewNote?.trim() || null;
    order.reviewedAt = new Date();
    return this.recharges.save(order);
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
   */
  async consume(params: {
    userId: string;
    amountCents: number;
    refType: string;
    refId: string;
    note?: string | null;
  }): Promise<BalanceTransactionEntity> {
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      throw new BadRequestException('扣款金额必须为正整数（分）');
    }
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
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
        // 理论上不会发生（余额不足已拦截），兜底创建一条
        await manager.save(
          manager.create(UserBalanceEntity, {
            userId: params.userId,
            balanceCents: String(after),
            version: 1,
          }),
        );
      }
      const txn = manager.create(BalanceTransactionEntity, {
        id: await this.idGenerator.nextId(),
        userId: params.userId,
        type: 'consume',
        amountCents: String(-params.amountCents),
        balanceAfterCents: String(after),
        refType: params.refType,
        refId: params.refId,
        note: params.note ?? null,
      });
      return manager.save(txn);
    });
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
  ) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('转账金额必须为正整数（分）');
    }
    if (amountCents > 10_000_00) {
      throw new BadRequestException('单笔转账不能超过 10 万元');
    }
    // 按邮箱查收款方
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

    const transferId = await this.idGenerator.nextId();
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // 锁 A 余额
      const fromBal = await manager.findOne(UserBalanceEntity, {
        where: { userId: fromUserId },
        lock: { mode: 'pessimistic_write' },
      });
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

      // 锁 B 余额
      let toBal = await manager.findOne(UserBalanceEntity, {
        where: { userId: toUserId },
        lock: { mode: 'pessimistic_write' },
      });
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
          userId: fromUserId,
          type: 'transfer_out',
          amountCents: String(-amountCents),
          balanceAfterCents: String(fromAfter),
          refType: 'transfer',
          refId: String(transferId),
          note: `转账给 ${toDisplayName}${userNote ? '：' + userNote : ''}`,
        }),
      );
      // B 入款流水：显示对方昵称
      await manager.save(
        manager.create(BalanceTransactionEntity, {
          id: await this.idGenerator.nextId(),
          userId: toUserId,
          type: 'transfer_in',
          amountCents: String(amountCents),
          balanceAfterCents: String(toAfter),
          refType: 'transfer',
          refId: String(transferId),
          note: `来自 ${fromDisplayName} 的转账${userNote ? '：' + userNote : ''}`,
        }),
      );

      return {
        transferId: String(transferId),
        amountCents,
        fromUserId,
        toUserId,
        toAccount: target.email,
        toNickname: target.nickname,
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
   */
  async refund(params: {
    userId: string;
    amountCents: number;
    refType: string;
    refId: string;
    note?: string | null;
  }): Promise<BalanceTransactionEntity> {
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      throw new BadRequestException('退款金额必须为正整数（分）');
    }
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
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
          userId: params.userId,
          type: 'refund',
          amountCents: String(params.amountCents),
          balanceAfterCents: String(after),
          refType: params.refType,
          refId: params.refId,
          note: params.note ?? null,
        }),
      );
    });
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
  }): Promise<BalanceTransactionEntity> {
    if (!Number.isInteger(params.amountCents) || params.amountCents === 0) {
      throw new BadRequestException('调整金额必须为非零整数（分）');
    }
    if (Math.abs(params.amountCents) > 10_000_00) {
      throw new BadRequestException('单笔调整不能超过 10 万元');
    }
    const target = await this.profiles.findOne({ where: { userId: params.targetUserId } });
    if (!target) throw new NotFoundException('目标用户不存在');

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
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
      .select('DATE(t.created_at)', 'date')
      .addSelect('t.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(t.amount_cents)', 'sumCents')
      .where('t.created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)', { days })
      .groupBy('DATE(t.created_at), t.type')
      .orderBy('DATE(t.created_at)', 'DESC')
      .getRawMany<{
        date: string;
        type: string;
        count: string;
        sumCents: string;
      }>();

    // 按日期聚合
    const byDate = new Map<string, { date: string; totalCents: number; byType: Record<string, number>; count: number }>();
    for (const r of rows) {
      if (!byDate.has(r.date)) {
        byDate.set(r.date, { date: r.date, totalCents: 0, byType: {}, count: 0 });
      }
      const day = byDate.get(r.date)!;
      const cents = Number(r.sumCents);
      day.totalCents += cents;
      day.byType[r.type] = cents;
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
    return { items, total, page, pageSize };
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
    const qb = this.txns.createQueryBuilder('t');
    if (startDate) qb.andWhere('t.created_at >= :start', { start: startDate });
    if (endDate) qb.andWhere('t.created_at <= :end', { end: endDate + ' 23:59:59' });
    const rows = await qb
      .select('t.type', 'type')
      .addSelect('SUM(t.amount_cents)', 'sum')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.type')
      .getRawMany<{ type: string; sum: string; count: string }>();

    const byType: Record<string, { sumCents: number; count: number }> = {};
    for (const r of rows) {
      byType[r.type] = { sumCents: Number(r.sum), count: Number(r.count) };
    }

    // 所有用户余额加总（不受日期限制，是"当前时点"口径）
    const balRows = await this.balances.find();
    const totalBalance = balRows.reduce((acc, r) => acc + Number(r.balanceCents), 0);

    // 全量流水加总（不受日期限制）
    const sumByType = async (type: string) =>
      this.txns
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount_cents), 0)', 'sum')
        .where('t.type = :type', { type })
        .getRawOne<{ sum: string }>()
        .then((r) => Number(r?.sum ?? 0));

    const [rechargeSum, consumeSum, transferOutSum, transferInSum, refundSum, adjustSum] =
      await Promise.all([
        sumByType('recharge'),
        sumByType('consume'),
        sumByType('transfer_out'),
        sumByType('transfer_in'),
        sumByType('refund'),
        sumByType('adjust'),
      ]);
    const ledgerSum =
      rechargeSum + consumeSum + transferOutSum + transferInSum + refundSum + adjustSum;

    const diff = totalBalance - ledgerSum;
    return {
      range: { startDate: startDate ?? null, endDate: endDate ?? null },
      totalBalanceCents: totalBalance,
      totalBalanceYuan: centsToYuan(totalBalance),
      ledgerSumCents: ledgerSum,
      ledgerSumYuan: centsToYuan(ledgerSum),
      diffCents: diff,
      diffYuan: centsToYuan(diff),
      balanced: diff === 0,
      periodSummary: byType,
      allTime: {
        rechargeSumCents: rechargeSum,
        consumeSumCents: consumeSum,
        transferOutSumCents: transferOutSum,
        transferInSumCents: transferInSum,
        refundSumCents: refundSum,
        adjustSumCents: adjustSum,
      },
      userCount: balRows.length,
    };
  }
}
