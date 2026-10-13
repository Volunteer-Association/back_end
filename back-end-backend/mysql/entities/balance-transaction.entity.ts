import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type BalanceTxnType =
  | 'recharge'   // 充值入账
  | 'consume'    // 消费扣款（如支付账单）
  | 'refund'     // 退款
  | 'adjust';    // 管理员手工调整

@Entity({ name: 'balance_transactions' })
@Index('idx_txn_user_created', ['userId', 'createdAt'])
export class BalanceTransactionEntity {
  @PrimaryColumn({ type: 'varchar', length: 30 })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 30 })
  userId: string;

  @Column({
    type: 'enum',
    enum: ['recharge', 'consume', 'refund', 'adjust'],
  })
  type: BalanceTxnType;

  @Column({
    name: 'amount_cents',
    type: 'bigint',
    comment: '变动金额（带符号，分）',
  })
  amountCents: string;

  @Column({
    name: 'balance_after_cents',
    type: 'bigint',
    comment: '变动后余额，分',
  })
  balanceAfterCents: string;

  @Column({
    name: 'ref_type',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '关联业务类型：bill / recharge / manual',
  })
  refType: string | null;

  @Column({
    name: 'ref_id',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  refId: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
