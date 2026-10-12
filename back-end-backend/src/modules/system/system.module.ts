import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { SystemController } from './system.controller.js';
import { SystemService } from './system.service.js';
import { AuthGuard } from '../../guards/auth.guard.js';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [SystemController],
  providers: [SystemService, AuthGuard],
})
export class SystemModule {}
