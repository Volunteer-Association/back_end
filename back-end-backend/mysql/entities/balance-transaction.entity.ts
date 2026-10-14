import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * 余额流水表：记录每一次余额变动。
 *
 * 这是钱包系统的「账本」，所有收支都要写一条流水，
 * 保证「用户余额 = 所有流水 amount 的代数和」。
 *
 * 流水类型：
 * - recharge：充值入账（管理员审核通过充值申请）
 * - consume：消费扣款（如支付账单）
 * - refund：退款（账单退款等）
 * - transfer_out：转账出款（转给其他用户）
 * - transfer_in：转账收款（收到其他用户转账）
 * - adjust：管理员手工调整
 *
 * amountCents 带符号：正数 = 加钱，负数 = 扣钱。
 * balanceAfterCents 是变动后的余额快照，方便追溯。
 */
export type BalanceTxnType =
  | 'recharge'      // 充值入账
  | 'consume'       // 消费扣款（如支付账单）
  | 'refund'        // 退款
  | 'transfer_out'  // 转账出款
  | 'transfer_in'   // 转账收款
  | 'adjust';       // 管理员手工调整

@Entity({ name: 'balance_transactions' })
@Index('idx_txn_user_created', ['userId', 'createdAt'])
@Index('idx_txn_no_unique', ['txnNo'], { unique: true })
export class BalanceTransactionEntity {
  @PrimaryColumn({ type: 'varchar', length: 30 })
  id: string;

  @Column({
    name: 'txn_no',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '对外支付流水号（28位业务编号，独立于内部主键）',
  })
  txnNo: string | null;

  @Column({ name: 'user_id', type: 'varchar', length: 30 })
  userId: string;

  @Column({
    type: 'enum',
    enum: ['recharge', 'consume', 'refund', 'transfer_out', 'transfer_in', 'adjust'],
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
