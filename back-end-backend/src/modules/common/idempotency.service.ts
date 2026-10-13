import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { IdempotencyKeyEntity } from '../../../mysql/entities/index.js';

/**
 * 幂等性服务：基于唯一请求键去重，类似微信/支付宝的 out_trade_no 机制。
 *
 * 解决的问题：
 * - 用户双击按钮 → 两个请求同时到后端 → 之前会重复扣款
 * - 网络超时前端显示失败，用户重试 → 之前会重复扣款
 * - 并发请求同时到达 → 之前靠行锁串行但业务还是执行两次
 *
 * 原理：
 * 1. 前端每次发起写操作时生成一个 UUID（幂等键）
 * 2. 后端先查这个键是否处理过：
 *    - 处理过 → 直接返回第一次的响应，不执行业务
 *    - 没处理过 → 执行业务，成功后把响应存到幂等表
 * 3. 并发冲突时靠数据库主键唯一约束兜底，后到的请求读回第一次的结果
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKeyEntity)
    private readonly repo: Repository<IdempotencyKeyEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 执行一个幂等操作。
   * - 如果 key 已存在，直接返回缓存的响应
   * - 否则执行 handler，成功后缓存响应
   * - handler 内部应该用 manager 走事务
   */
  async execute<T>(options: {
    key: string;
    userId: string;
    action: string;
    handler: () => Promise<T>;
  }): Promise<{ result: T; reused: boolean }> {
    // 先查缓存
    const existing = await this.repo.findOne({
      where: { idemKey: options.key },
    });
    if (existing) {
      return {
        result: JSON.parse(existing.responseJson) as T,
        reused: true,
      };
    }

    // 执行业务逻辑
    const result = await options.handler();

    // 写入幂等记录（主键冲突说明并发重复请求，吞掉错误并返回已有结果）
    try {
      await this.repo.save(
        this.repo.create({
          idemKey: options.key,
          userId: options.userId,
          action: options.action,
          responseJson: JSON.stringify(result),
        }),
      );
    } catch {
      // 并发冲突：重新读一次，返回第一次的结果
      const retry = await this.repo.findOne({
        where: { idemKey: options.key },
      });
      if (retry) {
        return {
          result: JSON.parse(retry.responseJson) as T,
          reused: true,
        };
      }
      throw new Error('幂等记录写入失败');
    }

    return { result, reused: false };
  }
}
