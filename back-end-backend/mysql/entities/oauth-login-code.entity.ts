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

@Entity({ name: 'oauth_login_codes' })
@Index('uq_oauth_login_codes_code_hash', ['codeHash'], { unique: true })
export class OAuthLoginCodeEntity {
  @PrimaryGeneratedColumn({ comment: '表id' })
  id: number;

  @Column({
    name: 'code_hash',
    type: 'char',
    length: 64,
    comment: '登录交换码哈希',
  })
  codeHash: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: UserEntity;

  @Column({ name: 'expires_at', type: 'datetime', comment: '过期时间' })
  expiresAt: Date;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
  })
  createdAt: Date;
}
