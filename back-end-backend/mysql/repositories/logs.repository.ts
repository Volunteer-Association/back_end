import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogEntity, type LogLevel } from '../entities/index.js';

export interface CreateLogInput {
  level: LogLevel;
  message: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class LogsRepository {
  constructor(
    @InjectRepository(LogEntity)
    private readonly repository: Repository<LogEntity>,
  ) {}

  async create(input: CreateLogInput): Promise<void> {
    await this.repository.insert({
      level: input.level,
      message: input.message.slice(0, 2000),
      user: input.userId ? { userId: input.userId } : null,
      ipAddress: input.ipAddress?.slice(0, 45) ?? null,
      userAgent: input.userAgent?.slice(0, 1000) ?? null,
    });
  }

  async findPage(page: number, limit: number, level?: LogLevel) {
    const query = this.repository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (level) query.andWhere('log.level = :level', { level });
    const [logs, total] = await query.getManyAndCount();

    return {
      items: logs.map((log) => ({
        id: log.id,
        level: log.level,
        message: log.message,
        user: log.user
          ? { id: log.user.userId, username: log.user.username }
          : null,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
      })),
      page,
      limit,
      total,
    };
  }
}
