import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BillEntity,
  PaymentEntity,
  type PaymentChannel,
} from '../../../mysql/entities/index.js';
import {
  SNOWFLAKE_ID_GENERATOR,
  SnowflakeIdGenerator,
} from '../../../mysql/snowflake-id.js';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(BillEntity)
    private readonly bills: Repository<BillEntity>,
    @InjectRepository(PaymentEntity)
    private readonly payments: Repository<PaymentEntity>,
    @Inject(SNOWFLAKE_ID_GENERATOR)
    private readonly idGenerator: SnowflakeIdGenerator,
  ) {}

  /** 为支出账单创建支付单；已支付的账单不允许重复支付。 */
  async create(userId: string, billId: string, channel: PaymentChannel) {
    const bill = await this.bills.findOne({ where: { id: billId, userId } });
    if (!bill) throw new NotFoundException('账单不存在');
    if (bill.type !== 'expense') {
      throw new BadRequestException('收入账单无需支付');
    }
    if (bill.paidAt) {
      throw new BadRequestException('该账单已支付');
    }

    // 同一账单存在未完成支付单时复用，避免重复扣款。
    const pending = await this.payments.findOne({
      where: { billId, userId, status: 'pending' },
    });
    if (pending) return pending;

    const payment = this.payments.create({
      id: await this.idGenerator.nextId(),
      userId,
      billId,
      channel,
      amount: bill.amount,
      status: 'pending',
      transactionId: null,
      paidAt: null,
    });
    return this.payments.save(payment);
  }

  /** 查询支付单状态，仅返回所属用户的记录。 */
  async findOne(userId: string, paymentId: string) {
    const payment = await this.payments.findOne({
      where: { id: paymentId, userId },
    });
    if (!payment) throw new NotFoundException('支付单不存在');
    return payment;
  }

  /**
   * 沙箱模式：模拟第三方支付成功回调。
   * 真实环境由支付宝/微信异步通知触发；此处供前端演示与联调。
   */
  async simulatePaid(userId: string, paymentId: string) {
    const payment = await this.payments.findOne({
      where: { id: paymentId, userId },
    });
    if (!payment) throw new NotFoundException('支付单不存在');
    if (payment.status === 'paid') return payment;

    payment.status = 'paid';
    payment.transactionId = `SIM_${payment.channel}_${Date.now()}`;
    payment.paidAt = new Date();
    const saved = await this.payments.save(payment);

    // 关联账单标记为已支付。
    await this.bills.update(
      { id: payment.billId, userId },
      { paidAt: saved.paidAt },
    );
    return saved;
  }
}
