import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LogEntity,
  type LogCategory,
  type LogLevel,
} from '../entities/index.js';

export interface CreateLogInput {
  level: LogLevel;
  message: string;
  category?: LogCategory;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export type AuditLogCategory = LogCategory;

export interface AuditLogItem {
  level: LogLevel;
  message: string;
  category: LogCategory;
  id: string;
  user: { id: string; username: string } | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

@Injectable()
/** 写入系统日志，并按分类、等级和时间倒序查询分页结果。 */
export class LogsRepository {
  constructor(
    @InjectRepository(LogEntity)
    private readonly repository: Repository<LogEntity>,
  ) {}

  async create(input: CreateLogInput): Promise<void> {
    await this.repository.insert({
      level: input.level,
      category: input.category ?? 'event',
      message: input.message.slice(0, 2000),
      user: input.userId ? { userId: input.userId } : null,
      ipAddress: input.ipAddress?.slice(0, 45) ?? null,
      userAgent: input.userAgent?.slice(0, 1000) ?? null,
    });
  }

  async findPage(
    page: number,
    limit: number,
    level?: LogLevel,
    category?: AuditLogCategory,
  ) {
    // 分类和等级均由数据库过滤，再执行分页，避免只筛选当前页造成结果不完整。
    const query = this.repository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (level) query.andWhere('log.level = :level', { level });
    if (category) query.andWhere('log.category = :category', { category });
    const [logs, total] = await query.getManyAndCount();

    return {
      items: logs.map(
        (log): AuditLogItem => ({
          level: log.level,
          message: log.message,
          category: log.category,
          id: log.id,
          user: log.user
            ? { id: log.user.userId, username: log.user.username }
            : null,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          createdAt: log.createdAt,
        }),
      ),
      page,
      limit,
      total,
    };
  }
}
