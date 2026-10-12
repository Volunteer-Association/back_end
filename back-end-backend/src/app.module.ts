/*
 * @Author: chenguihui
 * @Date: 2023-07-04 01:20:37
 * @LastEditors: chenguihui
 * @LastEditTime: 2023-07-07 12:12:28
 * @Description: 头部注释
 * @filePath: Do not edit
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  appConfig,
  getEnvironmentFilePaths,
  validateEnvironment,
} from '../config/config.js';
import { MysqlConnection } from '../mysql/connect.js';
import { MysqlModule } from '../mysql/mysql.module.js';
import { DemoModule } from './demo/demo.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { SystemModule } from './modules/system/system.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvironmentFilePaths(),
      load: [appConfig],
      validate: validateEnvironment,
    }),
    MysqlConnection,
    MysqlModule,
    DemoModule,
    UsersModule,
    AuthModule,
    SystemModule,
  ],
})
export class AppModule {}
