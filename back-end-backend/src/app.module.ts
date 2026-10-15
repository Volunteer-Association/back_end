/** 应用根模块：装配运行配置、数据库连接及各业务模块。 */
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
import { BillsModule } from './modules/bills/bills.module.js';
import { DictModule } from './modules/dict/dict.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { AdminUsersModule } from './modules/admin-users/admin-users.module.js';

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
    BillsModule,
    DictModule,
    PaymentsModule,
    NotificationsModule,
    AdminUsersModule,
  ],
})
export class AppModule {}
