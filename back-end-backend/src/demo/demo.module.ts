import { Module } from '@nestjs/common';
import { DemoService } from './demo.service.js';
import { DemoController } from './demo.controller.js';
import { AuthModule } from '../modules/auth/auth.module.js';
import { UsersModule } from '../modules/users/users.module.js';
import { AuthGuard } from '../guards/auth.guard.js';

@Module({
  controllers: [DemoController],
  providers: [DemoService, AuthGuard],
  imports: [AuthModule, UsersModule],
})
export class DemoModule {}
