import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { MysqlModule } from '../../../mysql/mysql.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OAuthService } from './oauth.service.js';
import { RegistrationService } from './registration.service.js';
import { RegistrationMailerService } from './registration-mailer.service.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../../config/auth.constants.js';
import { LoggingModule } from '../logging/logging.module.js';

@Module({
  imports: [
    UsersModule,
    MysqlModule,
    LoggingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('app.jwt.secret'),
        signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OAuthService,
    RegistrationService,
    RegistrationMailerService,
    AuthGuard,
  ],
  exports: [AuthService, AuthGuard, JwtModule],
})
export class AuthModule {}
