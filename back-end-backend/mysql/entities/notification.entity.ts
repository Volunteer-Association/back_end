import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** 通知类型，随业务扩展。 */
export type NotificationType =
  | 'recharge_approved'
  | 'recharge_rejected'
  | 'transfer_received'
  | 'transfer_sent'
  | 'balance_adjusted'
  | 'bill_paid'
  | 'bill_refunded'
  | 'system';

/**
 * 用户站内信通知。
 * 由后端业务事件（如充值审核结果）写入，用户在顶部铃铛/通知中心查看。
 */
@Entity({ name: 'notifications' })
@Index('idx_notifications_user_created', ['userId', 'createdAt'])
@Index('idx_notifications_user_read', ['userId', 'isRead'])
export class NotificationEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true, comment: '表id' })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 30, comment: '接收用户ID' })
  userId: string;

  @Column({ type: 'varchar', length: 32, comment: '通知类型' })
  type: NotificationType | string;

  @Column({ type: 'varchar', length: 100, comment: '通知标题' })
  title: string;

  @Column({ type: 'varchar', length: 500, comment: '通知正文' })
  content: string;

  @Column({ name: 'biz_type', type: 'varchar', length: 32, nullable: true, comment: '关联业务类型' })
  bizType: string | null;

  @Column({ name: 'biz_id', type: 'varchar', length: 30, nullable: true, comment: '关联业务单号' })
  bizId: string | null;

  @Column({ name: 'is_read', type: 'boolean', default: false, comment: '是否已读' })
  isRead: boolean;

  @Column({ name: 'read_at', type: 'datetime', nullable: true, comment: '阅读时间' })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
