import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKeyEntity } from '../../../mysql/entities/index.js';
import { IdempotencyService } from './idempotency.service.js';
import { PaymentNoGenerator } from './payment-no.generator.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKeyEntity])],
  providers: [IdempotencyService, PaymentNoGenerator, SchedulerService],
  exports: [IdempotencyService, PaymentNoGenerator, SchedulerService],
})
export class CommonModule {}
