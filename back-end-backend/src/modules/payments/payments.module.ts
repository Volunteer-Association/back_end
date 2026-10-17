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
  BankCardEntity,
  WithdrawalEntity,
} from '../../../mysql/entities/index.js';
import { PaymentsController } from './payments.controller.js';
import { AdminPaymentsController } from './admin-payments.controller.js';
import { AdminWalletController } from './admin-wallet.controller.js';
import { PaymentsService } from './payments.service.js';
import { WithdrawController } from './withdraw.controller.js';
import { AdminWithdrawController } from './admin-withdraw.controller.js';
import { AdminRiskController } from './admin-risk.controller.js';
import { WithdrawService } from './withdraw.service.js';
import { RedPacketController } from './red-packet.controller.js';
import { RedPacketService } from './red-packet.service.js';
import { RedPacketScheduler } from './red-packet.scheduler.js';
import { RiskService } from './risk.service.js';
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
      BankCardEntity,
      WithdrawalEntity,
    ]),
  ],
  controllers: [PaymentsController, AdminPaymentsController, AdminWalletController, WithdrawController, AdminWithdrawController, RedPacketController, AdminRiskController],
  providers: [PaymentsService, AuthGuard, WithdrawService, RedPacketService, RedPacketScheduler, RiskService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
