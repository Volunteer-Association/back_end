import { Injectable, Logger } from '@nestjs/common';
import {
  LogsRepository,
  type CreateLogInput,
} from '../../../mysql/repositories/logs.repository.js';

@Injectable()
export class LoggingService {
  private readonly logger = new Logger(LoggingService.name);

  constructor(private readonly logsRepository: LogsRepository) {}

  async audit(input: CreateLogInput): Promise<void> {
    try {
      await this.logsRepository.create(input);
    } catch (error: unknown) {
      this.logger.error(
        `审计日志写入失败 [${error instanceof Error ? error.name : 'UnknownError'}]`,
      );
    }
  }

  async findPage(page: number, limit: number, level?: CreateLogInput['level']) {
    return this.logsRepository.findPage(page, limit, level);
  }
}
