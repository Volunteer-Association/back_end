import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MysqlModule } from '../../../mysql/mysql.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { LoggingModule } from '../logging/logging.module.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import {
  BalanceTransactionEntity,
  RechargeOrderEntity,
  UserBalanceEntity,
} from '../../../mysql/entities/index.js';
import { PaymentsController } from './payments.controller.js';
import { AdminPaymentsController } from './admin-payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [
    MysqlModule,
    AuthModule,
    UsersModule,
    LoggingModule,
    TypeOrmModule.forFeature([
      UserBalanceEntity,
      RechargeOrderEntity,
      BalanceTransactionEntity,
    ]),
  ],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService, AuthGuard],
  exports: [PaymentsService],
})
export class PaymentsModule {}
