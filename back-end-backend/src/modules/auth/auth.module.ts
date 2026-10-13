import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { MysqlModule } from '../../../mysql/mysql.module.js';
import { AuthController } from './auth.controller.js';
import { OAuthController } from './oauth.controller.js';
import { ProfileController } from './profile.controller.js';
import { AdminLogsController } from './admin-logs.controller.js';
import { AuthResponseHelper } from './auth-response.helper.js';
import { AuthService } from './auth.service.js';
import { OAuthService } from './oauth.service.js';
import { RegistrationService } from './registration.service.js';
import { RegistrationMailerService } from './registration-mailer.service.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../../config/auth.constants.js';
import { LoggingModule } from '../logging/logging.module.js';
import { LoginAttemptService } from './login-attempt.service.js';

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
  controllers: [
    AuthController,
    OAuthController,
    ProfileController,
    AdminLogsController,
  ],
  providers: [
    AuthService,
    OAuthService,
    RegistrationService,
    RegistrationMailerService,
    LoginAttemptService,
    AuthResponseHelper,
    AuthGuard,
  ],
  exports: [AuthService, AuthGuard, JwtModule],
})
export class AuthModule {}
