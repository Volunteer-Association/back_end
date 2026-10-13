import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  BillEntity,
} from '../../../mysql/entities/index.js';
import type { BillType } from '../../../mysql/entities/bill.entity.js';
import {
  SNOWFLAKE_ID_GENERATOR,
  SnowflakeIdGenerator,
} from '../../../mysql/snowflake-id.js';
import { DictService } from '../dict/dict.service.js';
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
    const result = await this.bills.delete({ id, userId });
    if (!result.affected) throw new NotFoundException('账单不存在');
    return { success: true };
  }

  /** 用账户余额支付支出账单。余额不足由 PaymentsService 抛错。 */
  async payWithBalance(userId: string, billId: string): Promise<BillEntity> {
    const bill = await this.bills.findOne({ where: { id: billId, userId } });
    if (!bill) throw new NotFoundException('账单不存在');
    if (bill.type !== 'expense') throw new BadRequestException('收入账单无需支付');
    if (bill.paidAt) throw new BadRequestException('该账单已支付');

    const amountCents = yuanToCents(bill.amount);
    await this.payments.consume({
      userId,
      amountCents,
      refType: 'bill',
      refId: bill.id,
      note: `支付账单：${bill.category}`,
    });

    bill.paidAt = new Date();
    return this.bills.save(bill);
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
