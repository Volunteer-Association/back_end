import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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

  /** 查询余额，没有则初始化一条 0 余额记录。 */
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
   * 批准充值：在事务里加余额、写流水。
   * 重复审核会被 version/状态检查拦住。
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
   * 从用户余额扣款。事务 + 行锁保证不超扣。
   * 余额不足时抛 BadRequestException。
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
   * 转账：fromUser → toUser（按对方邮箱账号查 userId）。
   * 事务里：A 扣钱、B 加钱、各写一条流水（refType=transfer，refId=转账单号）。
   * 流水 note 使用对方昵称而非 userId，类似微信/支付宝。
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
