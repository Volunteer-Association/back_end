import { Module } from '@nestjs/common';
import { DemoService } from './demo.service.js';
import { DemoController } from './demo.controller.js';
import { AuthModule } from '../modules/auth/auth.module.js';

@Module({
  controllers: [DemoController],
  providers: [DemoService],
  imports: [AuthModule],
})
export class DemoModule {}
