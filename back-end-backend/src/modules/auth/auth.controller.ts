import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Patch,
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import type { AuditLogCategory } from '../../../mysql/repositories/logs.repository.js';
import { SendRegistrationCodeDto } from './dto/send-registration-code.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { SetPasswordDto } from './dto/set-password.dto.js';
import { UpdateProfileDto } from '../users/dto/update-profile.dto.js';
import { UsersService } from '../users/users.service.js';
import { UpdateSessionSettingsDto } from './dto/update-session-settings.dto.js';
import { normalizeHttpOrigin } from '../../../config/config.js';

const OAUTH_PROVIDERS = ['gitee', 'github'] as const;
const REFRESH_COOKIE = 'refresh_token';
const SESSION_RESPONSE_EXAMPLE = {
  code: 200,
  message: '登录成功',
  data: {
    accessToken: 'eyJhbGciOi...',
    user: {
      id: '1234567890123456789',
      username: 'sample_user',
      email: 'user@example.com',
      nickname: '小明',
      avatar: 'https://example.com/avatar.png',
      role: 'user',
    },
  },
};

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

@ApiTags('认证与用户')
@Controller()
/** 对外提供注册、登录、OAuth、用户资料和管理员审计日志 HTTP 接口。 */
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly authService: AuthService,
    private readonly oauthService: OAuthService,
    private readonly registrationService: RegistrationService,
    private readonly loggingService: LoggingService,
    private readonly usersService: UsersService,
  ) {}

  @Post('auth/register/email-code')
  @ApiOperation({
    summary: '发送注册邮箱验证码',
    description: '向邮箱发送 6 位注册验证码；响应不泄露邮箱是否已注册。',
  })
  @ApiBody({ type: SendRegistrationCodeDto })
  @ApiResponse({
    status: 200,
    description: '验证码发送请求已受理。',
    schema: {
      example: {
        message: '如果邮箱可用于注册，验证码已发送',
        retryAfterSeconds: 60,
      },
    },
  })
  @ApiResponse({ status: 400, description: '邮箱格式无效或请求来源不受信任。' })
  @ApiResponse({ status: 429, description: '请求过于频繁。' })
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
  @ApiOperation({
    summary: '注册本地账号',
    description:
      '提交账号、邮箱、密码和邮箱验证码；注册成功后返回 Access Token，并通过 HttpOnly Cookie 设置 Refresh Token。',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: '注册成功并创建登录会话。',
    schema: { example: SESSION_RESPONSE_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: '请求字段校验失败或请求来源不受信任。' })
  @ApiResponse({ status: 409, description: '验证码无效、过期，或账号/邮箱已使用。' })
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
  @ApiOperation({
    summary: '本地账号登录',
    description:
      '使用本地登录账号和密码登录；返回短期 Access Token，Refresh Token 通过 HttpOnly Cookie 设置。',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: '登录成功。',
    schema: { example: SESSION_RESPONSE_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: '账号或密码不正确，或账号不可用。' })
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
  @ApiOperation({
    summary: '刷新登录凭证',
    description:
      '读取 HttpOnly Cookie 中的一次性 Refresh Token 并轮换凭证；调用时浏览器需允许携带 Cookie。',
  })
  @ApiResponse({
    status: 200,
    description: '刷新成功；响应中包含新的 Access Token，Cookie 中的 Refresh Token 已轮换。',
    schema: { example: SESSION_RESPONSE_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Refresh Token 缺失、过期或已撤销。' })
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
  @ApiOperation({
    summary: '退出当前会话',
    description: '撤销 Cookie 中的 Refresh Token 并清除该 Cookie。',
  })
  @ApiResponse({ status: 204, description: '退出成功，无响应正文。' })
  @ApiResponse({ status: 403, description: '请求来源不在 CORS 白名单。' })
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: '查询本地账号密码状态',
    description: '用于判断当前账号是否需要设置本地账号名或本地密码。',
  })
  @ApiResponse({
    status: 200,
    description: '当前账号的本地登录设置状态。',
    schema: {
      example: {
        username: 'my_account',
        hasLocalPassword: false,
        requiresUsernameSetup: false,
      },
    },
  })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  async getPasswordStatus(
    @Req() request: Request & { user?: unknown },
  ) {
    const userId = authenticatedUserId(request.user);
    return this.authService.getLocalAccountStatus(userId);
  }

  @Post('auth/password')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '设置或修改本地账号密码',
    description:
      '首次设置 OAuth 用户本地凭据时需提交 username；已有密码的账号必须提交 currentPassword。新密码以 bcrypt 哈希存储。',
  })
  @ApiBody({ type: SetPasswordDto })
  @ApiResponse({
    status: 200,
    description: '本地凭据设置成功。',
    schema: {
      example: {
        message: '本地账号和密码设置成功',
        username: 'my_account',
        hasLocalPassword: true,
        requiresUsernameSetup: false,
      },
    },
  })
  @ApiResponse({ status: 400, description: '账号格式无效、当前账号仍为系统生成名但未提交新账号，或请求字段无效。' })
  @ApiResponse({ status: 401, description: 'Access Token 无效或当前密码校验失败。' })
  @ApiResponse({ status: 409, description: '指定的本地账号名已被使用。' })
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

  @Get('auth/profile')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '获取当前用户资料',
    description: '使用 Access Token 查询当前登录用户在 users 详情表中的资料。',
  })
  @ApiResponse({
    status: 200,
    description: '用户详情；邮箱和头像为只读字段。',
    schema: {
      example: {
        email: 'user@example.com',
        nickname: '小明',
        avatar: 'https://example.com/avatar.png',
        mobile: '13800138000',
        sex: 2,
      },
    },
  })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  @ApiResponse({ status: 404, description: '用户详情不存在。' })
  async getProfile(@Req() request: Request & { user?: unknown }) {
    const profile = await this.usersService.findProfile(
      authenticatedUserId(request.user),
    );
    if (!profile) throw new NotFoundException('用户资料不存在');
    return profile;
  }

  @Patch('auth/profile')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '修改当前用户资料',
    description:
      '只修改请求中提供的用户资料字段；操作人及操作人 ID 由服务端依据登录会话写入。邮箱不能在此接口修改。',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: 200,
    description: '修改后的用户资料。',
    schema: {
      example: {
        email: 'user@example.com',
        nickname: '小明',
        avatar: 'https://example.com/avatar.png',
        mobile: '13800138000',
        sex: 2,
      },
    },
  })
  @ApiResponse({ status: 400, description: '未提交可修改字段或字段值无效。' })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  @ApiResponse({ status: 404, description: '用户详情不存在。' })
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @Req() request: Request & { user?: unknown },
  ) {
    if (
      dto.nickname === undefined &&
      dto.mobile === undefined &&
      dto.sex === undefined
    ) {
      throw new BadRequestException('请至少提交一项要修改的资料');
    }
    const userId = authenticatedUserId(request.user);
    const credentials = await this.usersService.findLocalCredentials(userId);
    if (!credentials) throw new NotFoundException('当前账号不存在');
    const profile = await this.usersService.updateProfile(
      userId,
      credentials.username,
      dto,
    );
    if (!profile) throw new NotFoundException('用户资料不存在');
    await this.audit(request, 'info', 'profile_updated', userId);
    return profile;
  }

  @Get('auth/session-settings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前账号的多设备登录设置' })
  @ApiResponse({
    status: 200,
    description: '当前账号的会话设置。',
    schema: { example: { allowMultiLogin: false } },
  })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  @ApiResponse({ status: 404, description: '当前账号不存在。' })
  async getSessionSettings(
    @Req() request: Request & { user?: unknown },
  ) {
    const settings = await this.usersService.findSessionSettings(
      authenticatedUserId(request.user),
    );
    if (!settings) throw new NotFoundException('当前账号不存在');
    return settings;
  }

  @Patch('auth/session-settings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '修改当前账号的多设备登录设置',
    description:
      '关闭多设备登录后，下次登录会撤销其他设备的会话；已有会话在此之前保持有效。',
  })
  @ApiBody({ type: UpdateSessionSettingsDto })
  @ApiResponse({
    status: 200,
    description: '更新后的会话设置。',
    schema: { example: { allowMultiLogin: true } },
  })
  @ApiResponse({ status: 400, description: '多设备登录设置格式无效。' })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  @ApiResponse({ status: 404, description: '当前账号不存在。' })
  async updateSessionSettings(
    @Body() dto: UpdateSessionSettingsDto,
    @Req() request: Request & { user?: unknown },
  ) {
    const userId = authenticatedUserId(request.user);
    const credentials = await this.usersService.findLocalCredentials(userId);
    if (!credentials) throw new NotFoundException('当前账号不存在');
    const settings = await this.usersService.updateSessionSettings(
      userId,
      credentials.username,
      dto,
    );
    if (!settings) throw new NotFoundException('当前账号不存在');
    await this.audit(request, 'info', 'session_settings_updated', userId);
    return settings;
  }

  @Get('auth/oauth/providers')
  @ApiOperation({
    summary: '获取已配置的第三方登录方式',
    description: '只返回同时配置了 Client ID 和 Client Secret 的提供方。',
  })
  @ApiResponse({
    status: 200,
    description: '已启用的 OAuth 提供方。',
    schema: { example: { providers: ['gitee', 'github'] } },
  })
  getOAuthProviders() {
    return { providers: this.oauthService.getEnabledProviders() };
  }

  @Get('auth/oauth/:provider')
  @ApiOperation({
    summary: '发起第三方登录',
    description:
      '设置短期 HttpOnly state Cookie，并重定向到指定第三方授权页面。provider 仅支持 gitee 或 github。',
  })
  @ApiParam({
    name: 'provider',
    description: '第三方平台标识。',
    enum: ['gitee', 'github'],
    example: 'gitee',
  })
  @ApiResponse({ status: 302, description: '重定向到第三方授权页面。' })
  @ApiResponse({ status: 400, description: '不支持的第三方平台或平台未配置。' })
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: '获取第三方账号绑定授权地址',
    description: '为当前登录用户创建一次性绑定流程，并返回第三方授权地址。',
  })
  @ApiParam({
    name: 'provider',
    description: '待绑定的第三方平台。',
    enum: ['gitee', 'github'],
    example: 'gitee',
  })
  @ApiResponse({
    status: 200,
    description: '第三方授权地址。',
    schema: {
      example: {
        authorizationUrl: 'https://gitee.com/oauth/authorize?...',
      },
    },
  })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: '查询当前账号已绑定的第三方平台',
    description: '返回绑定到当前登录用户的第三方平台标识数组。',
  })
  @ApiResponse({
    status: 200,
    description: '已绑定的平台列表。',
    schema: { example: ['gitee'] },
  })
  @ApiResponse({ status: 401, description: '缺少或提供了无效的 Access Token。' })
  getOAuthLinks(@Req() request: Request & { user?: unknown }) {
    return this.oauthService.getLinkedProviders(
      authenticatedUserId(request.user),
    );
  }

  @Get('admin/logs')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '分页查询审计日志',
    description: '管理员专用；默认第 1 页、每页 50 条，limit 最大 100。',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: '页码，从 1 开始。',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '每页记录数，1-100。',
    example: 50,
  })
  @ApiQuery({
    name: 'level',
    required: false,
    description: '按日志级别过滤。',
    enum: ['info', 'warn', 'error'],
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: '按日志类型过滤：HTTP 请求日志或其他审计事件。',
    enum: ['http', 'audit'],
  })
  @ApiResponse({
    status: 200,
    description: '日志分页数据。',
    schema: {
      example: {
        items: [
          {
            level: 'info',
            category: 'audit',
            message: 'password_login_succeeded',
            id: 1,
            user: { id: '1234567890123456789', username: 'sample' },
            ipAddress: '127.0.0.1',
            userAgent: 'Mozilla/5.0',
            createdAt: '2026-10-13T00:00:00.000Z',
          },
        ],
        page: 1,
        limit: 50,
        total: 1,
      },
    },
  })
  @ApiResponse({ status: 401, description: '未登录或 Access Token 无效。' })
  @ApiResponse({ status: 400, description: '分页参数或日志级别无效。' })
  @ApiResponse({ status: 403, description: '当前账号不是管理员。' })
  getAuditLogs(
    @Req() request: Request & { user?: unknown },
    @Query('page') pageValue?: string,
    @Query('limit') limitValue?: string,
    @Query('level') levelValue?: string,
    @Query('category') categoryValue?: string,
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
    let category: AuditLogCategory | undefined;
    if (categoryValue !== undefined) {
      if (!['http', 'audit'].includes(categoryValue)) {
        throw new BadRequestException('日志类型无效');
      }
      category = categoryValue as AuditLogCategory;
    }
    return this.loggingService.findPage(page, limit, level, category);
  }

  @Get('auth/oauth/:provider/callback')
  @ApiOperation({
    summary: '处理第三方 OAuth 回调',
    description:
      '仅供 OAuth 提供方重定向使用；校验 state 后完成登录或绑定，再重定向回前端，不直接返回 JSON。',
  })
  @ApiParam({
    name: 'provider',
    description: 'OAuth 提供方。',
    enum: ['gitee', 'github'],
    example: 'gitee',
  })
  @ApiQuery({
    name: 'code',
    required: false,
    description: '第三方授权码，由授权平台回传。',
  })
  @ApiQuery({
    name: 'state',
    required: false,
    description: '发起授权时生成的防 CSRF 一次性状态值。',
  })
  @ApiQuery({
    name: 'error',
    required: false,
    description: '第三方平台返回的授权失败代码。',
  })
  @ApiResponse({ status: 302, description: '重定向到前端 OAuth 回调页并附带结果状态。' })
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
  @ApiOperation({
    summary: '兑换 OAuth 一次性登录码',
    description:
      '使用 OAuth 回调提供的一次性 code 获取本地 Access Token，并通过 HttpOnly Cookie 设置 Refresh Token。',
  })
  @ApiBody({ type: OAuthExchangeDto })
  @ApiResponse({
    status: 200,
    description: '兑换成功并建立本地登录会话。',
    schema: { example: SESSION_RESPONSE_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: '登录兑换码无效、已使用或已过期。' })
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
    let normalizedOrigin: string;
    try {
      if (!origin) throw new Error('Missing origin');
      normalizedOrigin = normalizeHttpOrigin(origin);
    } catch {
      throw new ForbiddenException('请求来源无效，请检查 CORS_ORIGINS 配置');
    }
    if (
      !this.config
        .getOrThrow<string[]>('app.corsOrigins')
        .includes(normalizedOrigin)
    ) {
      throw new ForbiddenException(
        '请求来源不在允许列表中，请将前端 Origin 添加到 CORS_ORIGINS',
      );
    }
  }
}
