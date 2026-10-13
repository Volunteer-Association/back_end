import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'idempotency_keys' })
@Index('idx_idem_user', ['userId', 'action', 'createdAt'])
export class IdempotencyKeyEntity {
  @PrimaryColumn({ name: 'idem_key', type: 'varchar', length: 64 })
  idemKey: string;

  @Column({ name: 'user_id', type: 'varchar', length: 30 })
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  action: string;

  @Column({ name: 'response_json', type: 'mediumtext' })
  responseJson: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
