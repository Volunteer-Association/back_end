import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'email_verifications' })
@Index('uq_email_verifications_email', ['email'], { unique: true })
@Index('idx_email_verifications_expires_at', ['expiresAt'])
export class EmailVerificationEntity {
  @PrimaryGeneratedColumn({ comment: '表id' })
  id: number;

  @Column({ type: 'varchar', length: 100, comment: '待验证邮箱' })
  email: string;

  @Column({
    name: 'code_hash',
    type: 'char',
    length: 64,
    comment: '验证码HMAC摘要',
  })
  codeHash: string;

  @Column({ name: 'expires_at', type: 'datetime', comment: '过期时间' })
  expiresAt: Date;

  @Column({
    name: 'last_sent_at',
    type: 'datetime',
    comment: '最近发送时间',
  })
  lastSentAt: Date;

  @Column({ type: 'tinyint', unsigned: true, default: 0, comment: '已尝试次数' })
  attempts: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
  })
  createdAt: Date;
}
