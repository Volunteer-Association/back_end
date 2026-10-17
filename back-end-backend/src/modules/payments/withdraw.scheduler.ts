import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '../common/scheduler.service.js';
import { WithdrawService } from './withdraw.service.js';

/**
 * 提现超时自动取消任务。
 *
 * 提现单提交后立即扣款进入待审核，若管理员超过配置时长（默认 48 小时，
 * 见 risk_configs.withdraw_timeout_hours）未处理，本任务自动取消并退回余额。
 *
 * 触发节奏、防重入、异常隔离与生命周期统一交给 SchedulerService；
 * 资金安全由 WithdrawService 内的事务行锁 + 状态复查保证（多实例只取消一次）。
 */
@Injectable()
export class WithdrawScheduler implements OnModuleInit {
  /** 扫描间隔：每 10 分钟一次（超时是小时级，无需高频扫描）。 */
  private static readonly SCAN_INTERVAL_MS = 10 * 60_000;
  /** 启动后首次扫描延迟，等待数据库连接与应用就绪。 */
  private static readonly INITIAL_DELAY_MS = 60_000;

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly withdrawService: WithdrawService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register(
      'withdraw-timeout-cancel',
      WithdrawScheduler.SCAN_INTERVAL_MS,
      () => this.withdrawService.autoCancelExpired(),
      { initialDelayMs: WithdrawScheduler.INITIAL_DELAY_MS },
    );
  }
}
