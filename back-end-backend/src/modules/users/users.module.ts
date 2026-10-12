import { Module } from '@nestjs/common';
import { MysqlModule } from '../../../mysql/mysql.module.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [MysqlModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
