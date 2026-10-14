import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKeyEntity } from '../../../mysql/entities/index.js';
import { IdempotencyService } from './idempotency.service.js';
import { PaymentNoGenerator } from './payment-no.generator.js';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKeyEntity])],
  providers: [IdempotencyService, PaymentNoGenerator],
  exports: [IdempotencyService, PaymentNoGenerator],
})
export class CommonModule {}
