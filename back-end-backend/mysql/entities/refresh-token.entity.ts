import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity.js';

@Entity({ name: 'refresh_tokens' })
@Index('uq_refresh_tokens_token_hash', ['tokenHash'], { unique: true })
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn({ comment: '表id' })
  id: number;

  @Column({
    name: 'token_hash',
    type: 'char',
    length: 64,
    comment: 'Refresh Token哈希',
  })
  tokenHash: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: UserEntity;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
  })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'datetime', comment: '过期时间' })
  expiresAt: Date;
}
