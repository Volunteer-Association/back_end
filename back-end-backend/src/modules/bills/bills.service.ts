import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  BalanceTransactionEntity,
  BillEntity,
} from '../../../mysql/entities/index.js';
import type { BillType } from '../../../mysql/entities/bill.entity.js';
import {
  SNOWFLAKE_ID_GENERATOR,
  SnowflakeIdGenerator,
} from '../../../mysql/snowflake-id.js';
import { DictService } from '../dict/dict.service.js';
import { PaymentNoGenerator } from '../common/payment-no.generator.js';
import { PaymentsService, yuanToCents } from '../payments/payments.service.js';
import type {
  BillFilters,
  BillQueryDto,
  CreateBillDto,
  UpdateBillDto,
} from './dto/bill.dto.js';

export interface BillSummary {
  income: string;
  expense: string;
  balance: string;
}

function toCents(amount: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) throw new Error('数据库返回了无效的账单金额');
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -cents : cents;
}

function formatCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

@Injectable()
export class BillsService {
  constructor(
    @InjectRepository(BillEntity)
    private readonly bills: Repository<BillEntity>,
    @Inject(SNOWFLAKE_ID_GENERATOR)
    private readonly idGenerator: SnowflakeIdGenerator,
    private readonly dict: DictService,
    private readonly payments: PaymentsService,
    private readonly paymentNo: PaymentNoGenerator,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findPage(userId: string, query: BillQueryDto) {
    this.validateDateRange(query.from, query.to);

    const [items, total] = await this.filteredQuery(userId, query)
      .orderBy('bill.transactionDate', 'DESC')
      .addOrderBy('bill.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return { items, page: query.page, limit: query.limit, total };
  }

  async getSummary(
    userId: string,
    filters: BillFilters,
  ): Promise<BillSummary> {
    this.validateDateRange(filters.from, filters.to);
    const result = await this.filteredQuery(userId, filters)
      .select(
        "COALESCE(SUM(CASE WHEN bill.type = 'income' THEN bill.amount ELSE 0 END), 0)",
        'income',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN bill.type = 'expense' THEN bill.amount ELSE 0 END), 0)",
        'expense',
      )
      .getRawOne<{ income: string; expense: string }>();

    const income = result?.income ?? '0.00';
    const expense = result?.expense ?? '0.00';
    const incomeCents = toCents(income);
    const expenseCents = toCents(expense);
    return {
      income: formatCents(incomeCents),
      expense: formatCents(expenseCents),
      balance: formatCents(incomeCents - expenseCents),
    };
  }

  async create(userId: string, input: CreateBillDto): Promise<BillEntity> {
    await this.validateCategory(input.type, input.category);
    this.validateAmount(input.amount);
    return this.bills.save(
      this.bills.create({
        id: await this.idGenerator.nextId(),
        billNo: this.paymentNo.nextBillNo(),
        userId,
        type: input.type,
        category: input.category,
        amount: input.amount,
        transactionDate: input.transactionDate,
        note: input.note?.trim() || null,
        paidAt: null,
      }),
    );
  }

  async update(
    userId: string,
    id: string,
    input: UpdateBillDto,
  ): Promise<BillEntity> {
    const bill = await this.bills.findOne({ where: { id, userId } });
    if (!bill) throw new NotFoundException('账单不存在');

    // 已支付或已退款的账单，金额和收支类型一旦确定就不可修改——
    // 否则用户可以在支付后篡改 amount 再发起退款，把退款金额放大到远超实付金额。
    if (bill.paidAt) {
      if (input.amount !== undefined && input.amount !== bill.amount) {
        throw new BadRequestException('已支付账单不可修改金额，请先退款');
      }
      if (input.type !== undefined && input.type !== bill.type) {
        throw new BadRequestException('已支付账单不可修改收支类型，请先退款');
      }
    }

    const type = input.type ?? bill.type;
    const category = input.category ?? bill.category;
    await this.validateCategory(type, category);
    if (input.amount !== undefined) this.validateAmount(input.amount);

    Object.assign(bill, input);
    bill.type = type;
    bill.category = category;
    if (input.note !== undefined) bill.note = input.note?.trim() || null;
    return this.bills.save(bill);
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const bill = await this.bills.findOne({ where: { id, userId } });
    if (!bill) throw new NotFoundException('账单不存在');
    // 已支付/已退款账单都必须先退款再删除：否则会在流水表里留下一条 consume 扣款，
    // 但账单和对应退款都不存在，导致「余额 = 流水加总」对账不平。
    if (bill.paidAt) {
      throw new BadRequestException('已支付账单请先退款，再删除');
    }
    const result = await this.bills.delete({ id, userId });
    if (!result.affected) throw new NotFoundException('账单不存在');
    return { success: true };
  }

  /**
   * 用账户余额支付支出账单。
   *
   * 流程（全部在一个数据库事务里，悲观行锁）：
   * 1. 锁定账单行，校验属于当前用户、是支出类型、待支付（未支付且未退款）
   * 2. 调用 PaymentsService.consume() 扣钱（复用同一事务 manager）
   * 3. 更新账单 paidAt 为当前时间
   *
   * 锁的意义：并发重复点击「支付」时，第二个事务会在 SELECT ... FOR UPDATE
   * 上阻塞，等第一个提交后读到 paidAt 已写入，直接抛「已支付」，不会重复扣款。
   */
  async payWithBalance(userId: string, billId: string): Promise<BillEntity> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const bill = await manager.findOne(BillEntity, {
        where: { id: billId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!bill) throw new NotFoundException('账单不存在');
      if (bill.type !== 'expense') throw new BadRequestException('收入账单无需支付');
      if (bill.refundedAt) throw new ConflictException('该账单已退款，如需支付请重新记一笔');
      if (bill.paidAt) throw new ConflictException('该账单已支付，请勿重复操作');

      const amountCents = yuanToCents(bill.amount);
      await this.payments.consume({
        userId,
        amountCents,
        refType: 'bill',
        refId: bill.billNo ?? bill.id,
        note: `支付账单：${bill.category}`,
        manager,
      });

      bill.paidAt = new Date();
      return manager.save(bill);
    });
  }

  /**
   * 账单退款：把已支付账单的金额退回用户余额。
   *
   * 【安全要点】退款金额不取自 bill.amount，而是取自支付时写入的那条 consume 流水。
   * 即使 bill.amount 被篡改为更大的值，退款也只退实际扣款金额。
   *
   * 状态机：已支付 → 已退款（终态）。退款后账单保留支付时间与退款时间，
   * 不再回退为「待支付」——真实交易里退款是终态，需要再付就重新记一笔。
   *
   * 流程（全部在一个数据库事务里，悲观行锁）：
   * 1. 锁定账单行，校验属于当前用户、已支付且未退款
   * 2. 在流水表里找到最近一条未被退款对应的 consume 流水
   * 3. 以该 consume 流水的实际扣款金额为准退款
   * 4. 写入 refundedAt（终态）
   */
  async refundBill(userId: string, billId: string): Promise<BillEntity> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const bill = await manager.findOne(BillEntity, {
        where: { id: billId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!bill) throw new NotFoundException('账单不存在');
      if (!bill.paidAt) throw new BadRequestException('该账单未支付，无需退款');
      if (bill.refundedAt) throw new ConflictException('该账单已退款，请勿重复操作');

      const refId = bill.billNo ?? bill.id;

      // 找到最近一笔 consume 流水：它代表用户实际为这张账单付了多少钱。
      // 不能用 bill.amount——那个字段可能已被改过。
      const consumeTxn = await manager.findOne(BalanceTransactionEntity, {
        where: { userId, refType: 'bill', refId, type: 'consume' },
        order: { createdAt: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!consumeTxn) {
        throw new ConflictException(
          '未找到该账单的扣款流水，无法自动退款，请联系管理员处理',
        );
      }
      const paidCents = Math.abs(Number(consumeTxn.amountCents));
      if (paidCents <= 0) {
        throw new ConflictException('原扣款流水金额异常，无法自动退款，请联系管理员处理');
      }

      // 兜底：再查一次是否已有同 refId 的 refund 流水（与最新 consume 配对）。
      const refundedTxn = await manager.findOne(BalanceTransactionEntity, {
        where: { userId, refType: 'bill', refId, type: 'refund' },
        order: { createdAt: 'DESC' },
      });
      if (refundedTxn && refundedTxn.createdAt >= consumeTxn.createdAt) {
        throw new ConflictException('该账单已退款，请勿重复操作');
      }

      await this.payments.refund({
        userId,
        amountCents: paidCents,
        refType: 'bill',
        refId,
        note: `退款：${bill.category}`,
        manager,
      });

      bill.refundedAt = new Date();
      return manager.save(bill);
    });
  }

  private filteredQuery(
    userId: string,
    filters: BillFilters,
  ): SelectQueryBuilder<BillEntity> {
    const query = this.bills
      .createQueryBuilder('bill')
      .where('bill.userId = :userId', { userId });
    if (filters.type) {
      query.andWhere('bill.type = :type', { type: filters.type });
    }
    if (filters.category) {
      query.andWhere('bill.category = :category', {
        category: filters.category,
      });
    }
    if (filters.from) {
      query.andWhere('bill.transactionDate >= :from', {
        from: filters.from,
      });
    }
    if (filters.to) {
      query.andWhere('bill.transactionDate <= :to', { to: filters.to });
    }
    return query;
  }

  private validateDateRange(from?: string, to?: string): void {
    if (from && to && from > to) {
      throw new BadRequestException('开始日期不能晚于结束日期');
    }
  }

  /** 分类是否合法由数据字典决定，不再硬编码。 */
  private async validateCategory(
    type: BillType,
    category: string,
  ): Promise<void> {
    const allowed = await this.dict.isCategoryAllowed(type, category);
    if (!allowed) {
      throw new BadRequestException('所选分类不存在或未启用');
    }
  }

  private validateAmount(amount: string): void {
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      throw new BadRequestException('金额必须大于 0');
    }
  }
}
