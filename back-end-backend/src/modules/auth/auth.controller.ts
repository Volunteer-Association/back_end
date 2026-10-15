import {
  Body,
  Controller,
  HttpException,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Get,
  Patch,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import type { AuthSession } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { SendRegistrationCodeDto } from './dto/send-registration-code.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { SetPasswordDto } from './dto/set-password.dto.js';
import { UpdateSessionSettingsDto } from './dto/update-session-settings.dto.js';
import { RegistrationService } from './registration.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { LoginAttemptService } from './login-attempt.service.js';
import { AuthResponseHelper } from './auth-response.helper.js';
import { authenticatedUserId, readCookie } from '../../common/http.util.js';
import { REFRESH_COOKIE } from '../../../config/auth.constants.js';

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

@ApiTags('认证与用户')
@Controller()
/** 本地账号注册、登录、Token 刷新/注销、密码与会话设置接口。 */
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly registrationService: RegistrationService,
    private readonly usersService: UsersService,
    private readonly loginAttempts: LoginAttemptService,
    private readonly helper: AuthResponseHelper,
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
    this.helper.assertAllowedOrigin(request);
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
    this.helper.assertAllowedOrigin(request);
    const session = await this.registrationService.register(dto, request.ip);
    await this.helper.audit(
      request,
      'info',
      'registration_succeeded',
      session.data.user.id,
    );
    this.helper.setRefreshCookie(response, session.refreshToken);
    return response.status(201).json(this.helper.publicSession(session));
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
  @ApiResponse({ status: 429, description: '登录失败次数过多，请稍后重试。' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const retryAfter = await this.loginAttempts.getRetryAfterSeconds(
      loginDto.username,
      request.ip || 'unknown',
    );
    if (retryAfter > 0) {
      response.setHeader('Retry-After', String(retryAfter));
      await this.helper.audit(request, 'warn', 'password_login_rate_limited');
      throw new HttpException('登录尝试过于频繁，请稍后重试', 429);
    }

    let session: AuthSession;
    try {
      session = await this.authService.login(
        loginDto.username,
        loginDto.password,
        request.ip,
      );
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        await this.loginAttempts.recordFailure(
          loginDto.username,
          request.ip || 'unknown',
        );
      }
      await this.helper.audit(request, 'warn', 'password_login_failed');
      throw error;
    }
    await this.helper.audit(
      request,
      'info',
      'password_login_succeeded',
      session.data.user.id,
    );
    this.helper.setRefreshCookie(response, session.refreshToken);
    return response.json(this.helper.publicSession(session));
  }

  @Get('auth/role-options')
  @ApiOperation({ summary: '系统所有角色枚举（按 sortOrder 排序，供前端角色切换下拉用）' })
  @UseGuards(AuthGuard)
  roleOptions() {
    // 角色列表硬编码在后端，后续加部门/新角色只改这里，前端不写死
    return {
      roles: [
        { value: 'user', label: '普通用户', description: '个人账单、钱包、通知', sortOrder: 1 },
        { value: 'admin', label: '业务管理员', description: '充值审核、对账、字典、日志', sortOrder: 2 },
        { value: 'super_admin', label: '超级管理员', description: '用户与角色管理，不参与日常业务', sortOrder: 3 },
      ],
    };
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
    this.helper.assertAllowedOrigin(request);
    const refreshToken = readCookie(request, REFRESH_COOKIE);
    if (!refreshToken) {
      throw new UnauthorizedException('刷新令牌不存在或已过期');
    }
    const session = await this.authService.refreshSession(refreshToken);
    this.helper.setRefreshCookie(response, session.refreshToken);
    return response.json(this.helper.publicSession(session));
  }

  @Post('auth/logout')
  @ApiOperation({
    summary: '退出当前会话',
    description: '撤销 Cookie 中的 Refresh Token 并清除该 Cookie。',
  })
  @ApiResponse({ status: 204, description: '退出成功，无响应正文。' })
  @ApiResponse({ status: 403, description: '请求来源不在 CORS 白名单。' })
  async logout(@Req() request: Request, @Res() response: Response) {
    this.helper.assertAllowedOrigin(request);
    await this.authService.revokeRefreshToken(
      readCookie(request, REFRESH_COOKIE),
    );
    await this.helper.audit(request, 'info', 'logout');
    this.helper.clearRefreshCookie(response);
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
    @Res() response: Response,
  ) {
    const userId = authenticatedUserId(request.user);
    const username = await this.authService.setLocalPassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
      dto.username,
    );
    await this.helper.audit(request, 'info', 'local_password_updated', userId);
    this.helper.clearRefreshCookie(response);
    return response.json({
      message: '本地账号和密码设置成功',
      username,
      hasLocalPassword: true,
      requiresUsernameSetup: false,
    });
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
    await this.helper.audit(request, 'info', 'session_settings_updated', userId);
    return settings;
  }
}
