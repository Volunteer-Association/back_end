import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'withdrawals' })
@Index('idx_withdraw_user', ['userId'])
@Index('idx_withdraw_status', ['status'])
export class WithdrawalEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 30 })
  userId: string;

  @Column({ name: 'bank_card_id', type: 'varchar', length: 30 })
  bankCardId: string;

  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents: string;

  @Column({ name: 'fee_cents', type: 'bigint', default: 0 })
  feeCents: string;

  @Column({ name: 'actual_amount_cents', type: 'bigint' })
  actualAmountCents: string;

  @Column({ type: 'tinyint', default: 0, comment: '0待审核 1已打款 2已拒绝 3已退回' })
  status: number;

  @Column({ name: 'reject_reason', type: 'varchar', length: 255, nullable: true })
  rejectReason: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  operator: string | null;

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
