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
import type { OAuthProvider } from './oauth-identity.entity.js';

@Entity({ name: 'oauth_states' })
@Index('uq_oauth_states_state_hash', ['stateHash'], { unique: true })
export class OAuthStateEntity {
  @PrimaryGeneratedColumn({ comment: '表id' })
  id: number;

  @Column({
    name: 'state_hash',
    type: 'char',
    length: 64,
    comment: 'OAuth state哈希',
  })
  stateHash: string;

  @Column({ type: 'enum', enum: ['gitee', 'github'], comment: '第三方平台' })
  provider: OAuthProvider;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: UserEntity | null;

  @Column({ name: 'expires_at', type: 'datetime', comment: '过期时间' })
  expiresAt: Date;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
  })
  createdAt: Date;
}
