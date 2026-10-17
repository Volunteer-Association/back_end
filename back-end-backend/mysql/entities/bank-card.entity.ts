import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'bank_cards' })
@Index('idx_bank_user', ['userId'])
export class BankCardEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'user_id', type: 'varchar', length: 30 })
  userId: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 50 })
  bankName: string;

  @Column({ name: 'card_no', type: 'varchar', length: 30 })
  cardNo: string;

  @Column({ name: 'card_holder', type: 'varchar', length: 50 })
  cardHolder: string;

  @Column({ name: 'branch_name', type: 'varchar', length: 100, nullable: true })
  branchName: string | null;

  @Column({ name: 'is_default', type: 'tinyint', default: 0 })
  isDefault: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
