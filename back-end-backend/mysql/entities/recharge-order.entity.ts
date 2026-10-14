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
@Index('idx_recharge_order_no_unique', ['orderNo'], { unique: true })
export class RechargeOrderEntity {
  @PrimaryColumn({ type: 'varchar', length: 30 })
  id: string;

  @Column({
    name: 'order_no',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '对外充值业务单号（CZ 前缀，独立于内部主键）',
  })
  orderNo: string | null;

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
    comment: '审核结果说明（驳回原因），用户可见',
  })
  reviewNote: string | null;

  @Column({
    name: 'admin_note',
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: '管理员内部备注，仅管理员可见，不对用户展示',
  })
  adminNote: string | null;

  @Column({ name: 'reviewed_at', type: 'datetime', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
