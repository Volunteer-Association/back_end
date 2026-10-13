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
}
