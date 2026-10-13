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
export class BillEntity {
  @PrimaryColumn({
    type: 'varchar',
    length: 30,
    comment: '雪花算法账单ID',
  })
  id: string;

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
