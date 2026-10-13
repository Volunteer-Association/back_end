import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PaymentChannel = 'alipay' | 'wechat';
export type PaymentStatus = 'pending' | 'paid' | 'failed';

@Entity({ name: 'payment_orders' })
@Index('idx_payment_user_status', ['userId', 'status'])
@Index('idx_payment_bill', ['billId'])
export class PaymentEntity {
  @PrimaryColumn({
    type: 'varchar',
    length: 30,
    comment: '雪花算法支付单ID',
  })
  id: string;

  @Column({
    name: 'user_id',
    type: 'varchar',
    length: 30,
    comment: '支付用户ID',
  })
  userId: string;

  @Column({
    name: 'bill_id',
    type: 'varchar',
    length: 30,
    comment: '关联账单ID',
  })
  billId: string;

  @Column({
    type: 'enum',
    enum: ['alipay', 'wechat'],
    comment: '支付渠道',
  })
  channel: PaymentChannel;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '支付金额',
  })
  amount: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'paid', 'failed'],
    default: 'pending',
    comment: '支付状态',
  })
  status: PaymentStatus;

  @Column({
    name: 'transaction_id',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '第三方交易号',
  })
  transactionId: string | null;

  @Column({
    name: 'paid_at',
    type: 'datetime',
    nullable: true,
    comment: '支付完成时间',
  })
  paidAt: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
    comment: '更新时间',
  })
  updatedAt: Date;
}
