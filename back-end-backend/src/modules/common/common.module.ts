import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKeyEntity } from '../../../mysql/entities/index.js';
import { IdempotencyService } from './idempotency.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKeyEntity])],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class CommonModule {}
