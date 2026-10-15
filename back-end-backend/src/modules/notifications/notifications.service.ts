import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity, type NotificationType } from '../../../mysql/entities/index.js';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType | string;
  title: string;
  content: string;
  bizType?: string | null;
  bizId?: string | null;
}

export interface ListNotificationsOptions {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}

/**
 * 站内信通知服务。
 * 业务模块（如充值审核）通过 create() 写通知；用户通过列表/未读数/已读接口消费。
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repo: Repository<NotificationEntity>,
  ) {}

  /** 写一条站内信（内部业务调用）。 */
  create(data: CreateNotificationInput) {
    const notification = this.repo.create({
      userId: data.userId,
      type: data.type,
      title: data.title.slice(0, 100),
      content: data.content.slice(0, 500),
      bizType: data.bizType ?? null,
      bizId: data.bizId ?? null,
      isRead: false,
      readAt: null,
    });
    return this.repo.save(notification);
  }

  /**
   * 写站内信的容错版本：通知属于主业务（充值/转账/调整）成功后的附属动作，
   * 此时业务事务往往已提交，不能因通知失败而让接口对已成功的业务返回错误。
   * 因此这里吞掉异常，仅记录错误日志，永不抛出。
   */
  async createSafe(data: CreateNotificationInput): Promise<void> {
    try {
      await this.create(data);
    } catch (e) {
      this.logger.error(
        `站内信发送失败（${data.bizType ?? '-'} ${data.bizId ?? '-'}，` +
          `接收用户 ${data.userId}，类型 ${data.type}）：${(e as Error)?.message ?? String(e)}`,
      );
    }
  }

  /** 分页查询某用户的通知。 */
  async list(userId: string, options: ListNotificationsOptions) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const where: { userId: string; isRead?: boolean } = { userId };
    if (options.unreadOnly) where.isRead = false;
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  /** 未读数。 */
  unreadCount(userId: string) {
    return this.repo.count({ where: { userId, isRead: false } });
  }

  /** 标记单条已读（仅能标记本人的通知）。 */
  async markRead(userId: string, id: string) {
    const notification = await this.repo.findOne({ where: { id, userId } });
    if (!notification) throw new NotFoundException('通知不存在');
    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.repo.save(notification);
    }
    return notification;
  }

  /** 一键全部已读，返回受影响条数。 */
  async markAllRead(userId: string) {
    const result = await this.repo
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ isRead: true, readAt: () => 'NOW()' })
      .where('user_id = :userId AND is_read = false', { userId })
      .execute();
    return { updated: result.affected ?? 0 };
  }

  /** 删除单条通知（仅本人；未读通知不允许删除，必须先标为已读）。 */
  async deleteOne(userId: string, id: string) {
    const notification = await this.repo.findOne({ where: { id, userId } });
    if (!notification) throw new NotFoundException('通知不存在');
    if (!notification.isRead) {
      throw new BadRequestException('未读通知不能删除，请先标记为已读');
    }
    await this.repo.remove(notification);
    return { success: true };
  }

  /** 清空所有已读通知，返回删除条数。未读通知保留。 */
  async clearRead(userId: string) {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(NotificationEntity)
      .where('user_id = :userId AND is_read = true', { userId })
      .execute();
    return { deleted: result.affected ?? 0 };
  }
}
