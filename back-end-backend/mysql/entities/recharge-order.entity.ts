import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type RechargeChannel = 'alipay' | 'wechat' | 'bank';
export type RechargeStatus = 'pending' | 'approved' | 'rejected';

@Entity({ name: 'recharge_orders' })
@Index('idx_recharge_user_status', ['userId', 'status'])
@Index('idx_recharge_status', ['status', 'createdAt'])
export class RechargeOrderEntity {
  @PrimaryColumn({ type: 'varchar', length: 30 })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 30 })
  userId: string;

  @Column({
    name: 'amount_cents',
    type: 'bigint',
    comment: '充值金额，单位分',
  })
  amountCents: string;

  @Column({
    type: 'enum',
    enum: ['alipay', 'wechat', 'bank'],
    comment: '用户选择的转账渠道（线下）',
  })
  channel: RechargeChannel;

  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  status: RechargeStatus;

  @Column({
    name: 'user_note',
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: '用户备注，如转账时间、付款人',
  })
  userNote: string | null;

  @Column({
    name: 'reviewed_by',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  reviewedBy: string | null;

  @Column({
    name: 'review_note',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  reviewNote: string | null;

  @Column({ name: 'reviewed_at', type: 'datetime', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
