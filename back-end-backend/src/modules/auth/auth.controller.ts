import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import type { AuthSession } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { OAuthExchangeDto } from './dto/oauth-exchange.dto.js';
import { OAuthService } from './oauth.service.js';
import { RegistrationService } from './registration.service.js';
import type { OAuthProvider } from '../../../mysql/entities/index.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { REFRESH_TOKEN_TTL_SECONDS } from '../../../config/auth.constants.js';
import { LoggingService } from '../logging/logging.service.js';
import type { LogLevel } from '../../../mysql/entities/log.entity.js';
import { SendRegistrationCodeDto } from './dto/send-registration-code.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { SetPasswordDto } from './dto/set-password.dto.js';

const OAUTH_PROVIDERS = ['gitee', 'github'] as const;
const REFRESH_COOKIE = 'refresh_token';

function isOAuthProvider(provider: string): provider is OAuthProvider {
  return OAUTH_PROVIDERS.some((candidate) => candidate === provider);
}

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  const entry = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}

function authenticatedUserId(user: unknown): string {
  if (
    !user ||
    typeof user !== 'object' ||
    !('sub' in user) ||
    typeof user.sub !== 'string' ||
    !/^[1-9]\d{0,18}$/.test(user.sub)
  ) {
    throw new BadRequestException('当前登录账号信息无效');
  }
  return user.sub;
}

@ApiTags('auth')
@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly authService: AuthService,
    private readonly oauthService: OAuthService,
    private readonly registrationService: RegistrationService,
    private readonly loggingService: LoggingService,
  ) {}

  @Post('auth/register/email-code')
  async sendRegistrationCode(
    @Body() dto: SendRegistrationCodeDto,
    @Req() request: Request,
  ) {
    this.assertAllowedOrigin(request);
    const retryAfterSeconds = await this.registrationService.sendCode(
      dto.email,
    );
    return {
      message: '如果邮箱可用于注册，验证码已发送',
      retryAfterSeconds,
    };
  }

  @Post('auth/register')
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    this.assertAllowedOrigin(request);
    const session = await this.registrationService.register(dto, request.ip);
    await this.audit(
      request,
      'info',
      'registration_succeeded',
      session.data.user.id,
    );
    this.setRefreshCookie(response, session.refreshToken);
    return response.status(201).json(this.publicSession(session));
  }

  @Post(['auth/login', 'login'])
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    let session: AuthSession;
    try {
      session = await this.authService.login(
        loginDto.username,
        loginDto.password,
        request.ip,
      );
    } catch (error: unknown) {
      await this.audit(request, 'warn', 'password_login_failed');
      throw error;
    }
    await this.audit(
      request,
      'info',
      'password_login_succeeded',
      session.data.user.id,
    );
    this.setRefreshCookie(response, session.refreshToken);
    return response.json(this.publicSession(session));
  }

  @Post('auth/refresh')
  async refresh(@Req() request: Request, @Res() response: Response) {
    this.assertAllowedOrigin(request);
    const refreshToken = readCookie(request, REFRESH_COOKIE);
    if (!refreshToken) {
      throw new UnauthorizedException('刷新令牌不存在或已过期');
    }
    const session = await this.authService.refreshSession(refreshToken);
    this.setRefreshCookie(response, session.refreshToken);
    return response.json(this.publicSession(session));
  }

  @Post('auth/logout')
  async logout(@Req() request: Request, @Res() response: Response) {
    this.assertAllowedOrigin(request);
    await this.authService.revokeRefreshToken(
      readCookie(request, REFRESH_COOKIE),
    );
    await this.audit(request, 'info', 'logout');
    this.clearRefreshCookie(response);
    return response.status(204).send();
  }

  @Get('auth/password')
  @UseGuards(AuthGuard)
  async getPasswordStatus(
    @Req() request: Request & { user?: unknown },
  ) {
    const userId = authenticatedUserId(request.user);
    return this.authService.getLocalAccountStatus(userId);
  }

  @Post('auth/password')
  @UseGuards(AuthGuard)
  async setPassword(
    @Body() dto: SetPasswordDto,
    @Req() request: Request & { user?: unknown },
  ) {
    const userId = authenticatedUserId(request.user);
    const username = await this.authService.setLocalPassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
      dto.username,
    );
    await this.audit(request, 'info', 'local_password_updated', userId);
    return {
      message: '本地账号和密码设置成功',
      username,
      hasLocalPassword: true,
      requiresUsernameSetup: false,
    };
  }

  @Get('auth/oauth/providers')
  getOAuthProviders() {
    return { providers: this.oauthService.getEnabledProviders() };
  }

  @Get('auth/oauth/:provider')
  async startOAuth(
    @Param('provider') providerName: string,
    @Res() response: Response,
  ) {
    if (!isOAuthProvider(providerName)) {
      throw new BadRequestException('不支持的第三方登录方式');
    }
    const provider = providerName;
    const callbackUrl = this.oauthService.getCallbackUrl(provider);
    const callbackPath = new URL(callbackUrl).pathname;
    const { state, url } =
      await this.oauthService.createAuthorization(provider);
    response.cookie(`oauth_state_${provider}`, state, {
      httpOnly: true,
      secure: callbackUrl.startsWith('https://'),
      sameSite: 'lax',
      path: callbackPath,
      maxAge: 10 * 60 * 1000,
    });
    return response.redirect(url);
  }

  @Post('auth/oauth/:provider/link')
  @UseGuards(AuthGuard)
  async startOAuthLink(
    @Param('provider') providerName: string,
    @Req() request: Request & { user?: unknown },
    @Res() response: Response,
  ) {
    if (!isOAuthProvider(providerName)) {
      throw new BadRequestException('不支持的第三方登录方式');
    }
    const userId = authenticatedUserId(request.user);
    const provider = providerName;
    const callbackUrl = this.oauthService.getCallbackUrl(provider);
    const callbackPath = new URL(callbackUrl).pathname;
    const { state, url } = await this.oauthService.createAuthorization(
      provider,
      userId,
    );
    response.cookie(`oauth_state_${provider}`, state, {
      httpOnly: true,
      secure: callbackUrl.startsWith('https://'),
      sameSite: 'lax',
      path: callbackPath,
      maxAge: 10 * 60 * 1000,
    });
    return response.json({ authorizationUrl: url });
  }

  @Get('auth/oauth-links')
  @UseGuards(AuthGuard)
  getOAuthLinks(@Req() request: Request & { user?: unknown }) {
    return this.oauthService.getLinkedProviders(
      authenticatedUserId(request.user),
    );
  }

  @Get('admin/logs')
  @UseGuards(AuthGuard)
  getAuditLogs(
    @Req() request: Request & { user?: unknown },
    @Query('page') pageValue?: string,
    @Query('limit') limitValue?: string,
    @Query('level') levelValue?: string,
  ) {
    const user = request.user;
    if (
      !user ||
      typeof user !== 'object' ||
      !('role' in user) ||
      user.role !== 'admin'
    ) {
      throw new ForbiddenException('需要管理员权限');
    }
    const page = this.parsePageValue(pageValue, 1, 1_000_000);
    const limit = this.parsePageValue(limitValue, 50, 100);
    let level: LogLevel | undefined;
    if (levelValue !== undefined) {
      if (!['info', 'warn', 'error'].includes(levelValue)) {
        throw new BadRequestException('日志级别无效');
      }
      level = levelValue as LogLevel;
    }
    return this.loggingService.findPage(page, limit, level);
  }

  @Get('auth/oauth/:provider/callback')
  async finishOAuth(
    @Param('provider') providerName: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const frontendCallback = new URL(
      '/auth/callback',
      this.oauthService.getFrontendUrl(),
    );
    if (!isOAuthProvider(providerName)) {
      frontendCallback.searchParams.set('error', 'unsupported_provider');
      return response.redirect(frontendCallback.toString());
    }
    const provider = providerName;
    const cookieName = `oauth_state_${provider}`;
    const callbackUrl = this.oauthService.getCallbackUrl(provider);
    const callbackPath = new URL(callbackUrl).pathname;
    response.clearCookie(cookieName, {
      httpOnly: true,
      secure: callbackUrl.startsWith('https://'),
      sameSite: 'lax',
      path: callbackPath,
    });

    const expectedState = readCookie(request, cookieName);
    const receivedState = typeof state === 'string' ? state : '';
    const expected = Buffer.from(expectedState ?? '');
    const received = Buffer.from(receivedState);
    if (
      !expectedState ||
      !receivedState ||
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      frontendCallback.searchParams.set('error', 'invalid_state');
      return response.redirect(frontendCallback.toString());
    }
    if (typeof providerError === 'string' && providerError) {
      frontendCallback.searchParams.set('error', 'access_denied');
      return response.redirect(frontendCallback.toString());
    }
    if (typeof code !== 'string' || !code || code.length > 2048) {
      frontendCallback.searchParams.set('error', 'missing_code');
      return response.redirect(frontendCallback.toString());
    }

    try {
      const result = await this.oauthService.completeAuthorization(
        provider,
        code,
        receivedState,
      );
      if (result.type === 'login') {
        frontendCallback.searchParams.set('code', result.code);
        await this.audit(
          request,
          'info',
          `oauth_login_succeeded:${provider}`,
        );
      } else {
        frontendCallback.searchParams.set('linked', result.provider);
        await this.audit(
          request,
          'info',
          `oauth_link_succeeded:${provider}`,
        );
      }
      return response.redirect(frontendCallback.toString());
    } catch (error: unknown) {
      this.logger.error(
        `第三方授权回调失败（${provider}）[${error instanceof Error ? error.name : 'UnknownError'}]`,
      );
      await this.audit(request, 'warn', `oauth_callback_failed:${provider}`);
      frontendCallback.searchParams.set(
        'error',
        error instanceof ConflictException ? 'account_link_failed' : 'oauth_failed',
      );
      return response.redirect(frontendCallback.toString());
    }
  }

  @Post('auth/oauth/exchange')
  async exchangeOAuthCode(
    @Body() exchangeDto: OAuthExchangeDto,
    @Res() response: Response,
  ) {
    const session = await this.oauthService.exchangeLoginCode(exchangeDto.code);
    this.setRefreshCookie(response, session.refreshToken);
    return response.json(this.publicSession(session));
  }

  private publicSession(session: AuthSession) {
    return {
      code: session.code,
      message: session.message,
      data: session.data,
    };
  }

  private async audit(
    request: Request,
    level: LogLevel,
    message: string,
    userId?: string,
  ): Promise<void> {
    await this.loggingService.audit({
      level,
      message,
      userId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  private parsePageValue(
    value: string | undefined,
    fallback: number,
    maximum: number,
  ): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
      throw new BadRequestException('分页参数无效');
    }
    return parsed;
  }

  private setRefreshCookie(response: Response, token: string): void {
    const production =
      this.config.getOrThrow<string>('app.nodeEnv') === 'production';
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: production,
      sameSite: production ? 'none' : 'lax',
      path: '/',
      maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    const production =
      this.config.getOrThrow<string>('app.nodeEnv') === 'production';
    response.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: production,
      sameSite: production ? 'none' : 'lax',
      path: '/',
    });
  }

  private assertAllowedOrigin(request: Request): void {
    const origin = request.headers.origin;
    if (
      !origin ||
      !this.config.getOrThrow<string[]>('app.corsOrigins').includes(origin)
    ) {
      throw new ForbiddenException('请求来源无效');
    }
  }
}
