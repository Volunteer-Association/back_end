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

export type LogLevel = 'info' | 'warn' | 'error';
export type LogCategory = 'event' | 'http';

@Entity({ name: 'logs' })
@Index('idx_logs_created_at', ['createdAt'])
@Index('idx_logs_level', ['level'])
@Index('idx_logs_category', ['category'])
export class LogEntity {
  @PrimaryGeneratedColumn({ comment: '表id' })
  id: number;

  @Column({
    type: 'enum',
    enum: ['info', 'warn', 'error'],
    default: 'info',
    comment: '日志级别',
  })
  level: LogLevel;

  @Column({
    type: 'enum',
    enum: ['event', 'http'],
    default: 'event',
    comment: '日志类型',
  })
  category: LogCategory;

  @Column({ type: 'text', comment: '日志内容' })
  message: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: UserEntity | null;

  @Column({
    name: 'ip_address',
    type: 'varchar',
    length: 45,
    nullable: true,
    comment: '请求来源IP',
  })
  ipAddress: string | null;

  @Column({
    name: 'user_agent',
    type: 'text',
    nullable: true,
    comment: '请求客户端标识',
  })
  userAgent: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
  })
  createdAt: Date;
}
