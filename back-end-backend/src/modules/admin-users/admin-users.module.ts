import { Module } from '@nestjs/common';
import { MysqlModule } from '../../../mysql/mysql.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';

@Module({
  imports: [MysqlModule, AuthModule, UsersModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, AuthGuard],
})
export class AdminUsersModule {}
