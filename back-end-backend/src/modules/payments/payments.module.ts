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
  UserEntity,
  UserProfileEntity,
} from '../../../mysql/entities/index.js';
import { PaymentsController } from './payments.controller.js';
import { AdminPaymentsController } from './admin-payments.controller.js';
import { AdminWalletController } from './admin-wallet.controller.js';
import { PaymentsService } from './payments.service.js';
import { CommonModule } from '../common/common.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [
    MysqlModule,
    AuthModule,
    UsersModule,
    LoggingModule,
    CommonModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      UserBalanceEntity,
      RechargeOrderEntity,
      BalanceTransactionEntity,
      UserProfileEntity,
      UserEntity,
    ]),
  ],
  controllers: [PaymentsController, AdminPaymentsController, AdminWalletController],
  providers: [PaymentsService, AuthGuard],
  exports: [PaymentsService],
})
export class PaymentsModule {}
