import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MysqlModule } from '../../../mysql/mysql.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { DictModule } from '../dict/dict.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { LoggingModule } from '../logging/logging.module.js';
import { CommonModule } from '../common/common.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { BillEntity } from '../../../mysql/entities/index.js';
import { BillsController } from './bills.controller.js';
import { BillsService } from './bills.service.js';

@Module({
  imports: [
    MysqlModule,
    AuthModule,
    UsersModule,
    DictModule,
    PaymentsModule,
    LoggingModule,
    CommonModule,
    NotificationsModule,
    TypeOrmModule.forFeature([BillEntity]),
  ],
  controllers: [BillsController],
  providers: [BillsService, AuthGuard],
})
export class BillsModule {}
