import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BillType = 'income' | 'expense';

@Entity({ name: 'bills' })
@Index('idx_bills_user_date', ['userId', 'transactionDate'])
@Index('idx_bills_user_type_category', ['userId', 'type', 'category'])
@Index('idx_bills_bill_no_unique', ['billNo'], { unique: true })
export class BillEntity {
  @PrimaryColumn({
    type: 'varchar',
    length: 30,
    comment: '内部主键（雪花ID）',
  })
  id: string;

  @Column({
    name: 'bill_no',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '对外账单业务单号（BILL 前缀，独立于内部主键）',
  })
  billNo: string | null;

  @Column({
    name: 'user_id',
    type: 'varchar',
    length: 30,
    comment: '账单所属用户ID',
  })
  userId: string;

  @Column({
    type: 'enum',
    enum: ['income', 'expense'],
    comment: '账单类型',
  })
  type: BillType;

  @Column({
    type: 'varchar',
    length: 40,
    comment: '收支分类',
  })
  category: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '金额',
  })
  amount: string;

  @Column({
    name: 'transaction_date',
    type: 'date',
    comment: '交易日期',
  })
  transactionDate: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '备注',
  })
  note: string | null;

  @Column({
    name: 'paid_at',
    type: 'datetime',
    nullable: true,
    comment: '支付完成时间；为空表示尚未支付',
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
