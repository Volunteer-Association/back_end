import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 用户内部账户余额。
 * 金额以「分」为单位用 BIGINT 存储，避免浮点误差；前端展示时除以 100。
 */
@Entity({ name: 'user_balances' })
export class UserBalanceEntity {
  @PrimaryColumn({
    name: 'user_id',
    type: 'varchar',
    length: 30,
    comment: '用户ID（与 user.id 一致）',
  })
  userId: string;

  @Column({
    name: 'balance_cents',
    type: 'bigint',
    default: 0,
    comment: '账户余额，单位分',
  })
  balanceCents: string; // TypeORM 把 bigint 映射为 string，由调用方转 BigInt

  @Column({
    type: 'int',
    default: 0,
    comment: '乐观锁版本号，防并发扣款超卖',
  })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
