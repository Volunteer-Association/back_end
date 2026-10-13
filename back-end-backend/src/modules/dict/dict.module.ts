import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MysqlModule } from '../../../mysql/mysql.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { DictItemEntity } from '../../../mysql/entities/index.js';
import { DictController } from './dict.controller.js';
import { DictService } from './dict.service.js';

@Module({
  imports: [
    MysqlModule,
    AuthModule,
    UsersModule,
    TypeOrmModule.forFeature([DictItemEntity]),
  ],
  controllers: [DictController],
  providers: [DictService, AuthGuard],
  exports: [DictService],
})
export class DictModule {}
