import { Module } from '@nestjs/common';
import { MysqlModule } from '../../../mysql/mysql.module.js';
import { LoggingService } from './logging.service.js';

@Module({
  imports: [MysqlModule],
  providers: [LoggingService],
  exports: [LoggingService],
})
export class LoggingModule {}
