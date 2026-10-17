import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '../common/scheduler.service.js';
import { RedPacketService } from './red-packet.service.js';

/**
 * 过期红包定时扫描任务。
 *
 * 红包 24 小时未被领取时，由本任务周期性触发，把未领金额退回发送方。
 * 触发节奏、防重入、异常隔离与生命周期统一交给 SchedulerService 处理。
 *
 * 多实例安全：退款逻辑在数据库事务内用 SELECT ... FOR UPDATE 锁定红包行并复查状态，
 * 即使多个实例同时扫描，同一个红包也只会退款一次。
 */
@Injectable()
export class RedPacketScheduler implements OnModuleInit {
  /** 扫描间隔：每 60 秒一次。 */
  private static readonly SCAN_INTERVAL_MS = 60_000;
  /** 启动后首次扫描延迟，等待数据库连接与应用就绪。 */
  private static readonly INITIAL_DELAY_MS = 30_000;

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly redPacketService: RedPacketService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(
      'red-packet-expired-refund',
      RedPacketScheduler.SCAN_INTERVAL_MS,
      () => this.redPacketService.refundExpiredPackets(),
      { initialDelayMs: RedPacketScheduler.INITIAL_DELAY_MS },
    );
  }
}
