import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RedPacketService } from './red-packet.service.js';

/**
 * 过期红包定时扫描器。
 *
 * 红包在 24 小时内未被领取，需要把未领金额退回发送方。该动作由本调度器周期性触发，
 * 不依赖外部 cron 组件，沿用项目既有的 OnModuleInit + setInterval 模式。
 *
 * 多实例安全：退款逻辑在数据库事务内用 SELECT ... FOR UPDATE 锁定红包行并复查状态，
 * 即使多个实例同时扫描，同一个红包也只会退款一次。
 */
@Injectable()
export class RedPacketScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedPacketScheduler.name);
  /** 扫描间隔：每 60 秒一次。 */
  private static readonly SCAN_INTERVAL_MS = 60_000;
  /** 启动后首次扫描延迟，等待数据库连接与应用就绪。 */
  private static readonly INITIAL_DELAY_MS = 30_000;

  private interval: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  /** 上一轮扫描未结束时跳过本轮，避免任务堆积。 */
  private running = false;

  constructor(private readonly redPacketService: RedPacketService) {}

  onModuleInit(): void {
    this.initialTimer = setTimeout(() => {
      void this.tick();
      this.interval = setInterval(() => void this.tick(), RedPacketScheduler.SCAN_INTERVAL_MS);
    }, RedPacketScheduler.INITIAL_DELAY_MS);
  }

  onModuleDestroy(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.interval) clearInterval(this.interval);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.redPacketService.refundExpiredPackets();
    } catch (error) {
      // 数据库暂不可用等错误不应让进程退出，下一轮会重新尝试。
      this.logger.error(
        `过期红包扫描失败：${(error as Error)?.message ?? String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
