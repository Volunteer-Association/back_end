import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_ENTITIES } from './entities/index.js';
import { OAuthRepository } from './repositories/oauth.repository.js';
import { UsersRepository } from './repositories/users.repository.js';
import { RefreshTokenRepository } from './repositories/refresh-token.repository.js';
import { LogsRepository } from './repositories/logs.repository.js';
import { ConfigService } from '@nestjs/config';
import {
  SNOWFLAKE_ID_GENERATOR,
  SnowflakeIdGenerator,
} from './snowflake-id.js';

@Module({
  imports: [TypeOrmModule.forFeature([...DATABASE_ENTITIES])],
  providers: [
    OAuthRepository,
    UsersRepository,
    RefreshTokenRepository,
    LogsRepository,
    {
      provide: SNOWFLAKE_ID_GENERATOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new SnowflakeIdGenerator(
          config.getOrThrow<number>('app.snowflake.workerId'),
        ),
    },
  ],
  exports: [
    TypeOrmModule,
    OAuthRepository,
    UsersRepository,
    RefreshTokenRepository,
    LogsRepository,
    SNOWFLAKE_ID_GENERATOR,
  ],
})
export class MysqlModule {}
