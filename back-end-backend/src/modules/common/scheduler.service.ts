import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * 统一定时任务调度框架。
 *
 * 项目刻意不引入 @nestjs/schedule 等额外依赖，所有需要周期性执行的后台任务
 * （红包过期退款、提现超时自动取消、未来的日终对账等）都通过本服务注册，
 * 由它统一负责：
 * - 首次执行延迟（等待应用与数据库连接就绪）；
 * - 固定间隔调度；
 * - 防重入：上一轮任务还没结束时跳过本轮，避免任务堆积；
 * - 异常隔离：单个任务抛错只记录日志，不影响后续调度和其它任务；
 * - 生命周期：应用关闭时统一清理所有计时器。
 *
 * 用法：在某个 Provider 的 onModuleInit 中调用
 *   this.scheduler.register('任务名', 间隔毫秒, async () => { ... }, { initialDelayMs: ... });
 *
 * 多实例注意：本调度器只负责「按时触发」，不负责跨实例互斥；涉及资金的任务
 * 必须在业务逻辑内通过数据库行锁 + 状态复查保证多实例下只处理一次。
 */
@Injectable()
export class SchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);

  /** 单个已注册任务的运行态。 */
  private static createJob() {
    return {
      running: false,
      initialTimer: null as ReturnType<typeof setTimeout> | null,
      intervalTimer: null as ReturnType<typeof setInterval> | null,
    };
  }

  private readonly jobs = new Map<string, ReturnType<typeof SchedulerService.createJob>>();

  /**
   * 注册一个周期任务。
   *
   * @param name 任务唯一名称，重复注册会抛错（防止误注册两份）。
   * @param intervalMs 执行间隔（毫秒），必须为正整数。
   * @param task 任务函数；可返回 Promise。
   * @param options.initialDelayMs 首次执行延迟，默认取 intervalMs。
   */
  register(
    name: string,
    intervalMs: number,
    task: () => Promise<unknown> | unknown,
    options?: { initialDelayMs?: number },
  ): void {
    if (!name || typeof name !== 'string') throw new Error('定时任务名称不能为空');
    if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
      throw new Error(`定时任务[${name}]的间隔必须为正整数毫秒`);
    }
    if (this.jobs.has(name)) throw new Error(`定时任务已存在: ${name}`);

    const state = SchedulerService.createJob();
    this.jobs.set(name, state);

    const runOnce = async () => {
      // 防重入：上一轮未结束则跳过本轮（间隔到点但任务还在跑）。
      if (state.running) return;
      state.running = true;
      try {
        await task();
      } catch (error) {
        this.logger.error(
          `定时任务[${name}]执行失败: ${(error as Error)?.message ?? String(error)}`,
        );
      } finally {
        state.running = false;
      }
    };

    const initialDelayMs = options?.initialDelayMs ?? intervalMs;
    state.initialTimer = setTimeout(() => {
      void runOnce();
      state.intervalTimer = setInterval(() => void runOnce(), intervalMs);
    }, initialDelayMs);
  }

  /** 当前已注册任务名（便于排查/监控）。 */
  listJobNames(): string[] {
    return [...this.jobs.keys()];
  }

  onModuleDestroy(): void {
    for (const [name, state] of this.jobs) {
      if (state.initialTimer) clearTimeout(state.initialTimer);
      if (state.intervalTimer) clearInterval(state.intervalTimer);
      this.logger.log(`已停止定时任务: ${name}`);
    }
    this.jobs.clear();
  }
}
