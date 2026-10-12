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

export type OAuthProvider = 'gitee' | 'github';

@Entity({ name: 'oauth_identities' })
@Index(['provider', 'providerUserId'], { unique: true })
export class OAuthIdentityEntity {
  @PrimaryGeneratedColumn({ comment: '表id' })
  id: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: UserEntity;

  @Column({ type: 'enum', enum: ['gitee', 'github'], comment: '第三方平台' })
  provider: OAuthProvider;

  @Column({
    name: 'provider_user_id',
    type: 'varchar',
    length: 100,
    comment: '第三方平台用户id',
  })
  providerUserId: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
  })
  createdAt: Date;
}
