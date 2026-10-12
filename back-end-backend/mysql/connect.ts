import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_ENTITIES } from './entities/index.js';

export const MysqlConnection = TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'mysql' as const,
    host: config.getOrThrow<string>('app.database.host'),
    port: config.getOrThrow<number>('app.database.port'),
    username: config.getOrThrow<string>('app.database.username'),
    password: config.getOrThrow<string>('app.database.password'),
    database: config.getOrThrow<string>('app.database.name'),
    timezone: config.getOrThrow<string>('app.database.timezone'),
    entities: [...DATABASE_ENTITIES],
    // 数据库结构通过显式 SQL 变更维护，避免启动时自动改写已有表。
    synchronize: false,
    retryDelay: 500,
    retryAttempts: 10,
  }),
});
