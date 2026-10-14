import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MysqlModule } from '../../../mysql/mysql.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { NotificationEntity } from '../../../mysql/entities/index.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [
    MysqlModule,
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([NotificationEntity]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, AuthGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
