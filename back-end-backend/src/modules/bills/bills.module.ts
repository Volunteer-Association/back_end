import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MysqlModule } from '../../../mysql/mysql.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { DictModule } from '../dict/dict.module.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { BillEntity, PaymentEntity } from '../../../mysql/entities/index.js';
import { BillsController } from './bills.controller.js';
import { BillsService } from './bills.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [
    MysqlModule,
    AuthModule,
    UsersModule,
    DictModule,
    TypeOrmModule.forFeature([BillEntity, PaymentEntity]),
  ],
  controllers: [BillsController, PaymentsController],
  providers: [BillsService, PaymentsService, AuthGuard],
})
export class BillsModule {}
