import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
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
import { OAuthService } from './oauth.service.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from '../../guards/auth.guard.js';
import { AuthResponseHelper } from './auth-response.helper.js';
import type { OAuthProvider } from '../../../mysql/entities/index.js';
import {
  authenticatedUserId,
  readCookie,
} from '../../common/http.util.js';
import { OAuthExchangeDto } from './dto/oauth-exchange.dto.js';

const OAUTH_PROVIDERS = ['gitee', 'github'] as const;

function isOAuthProvider(provider: string): provider is OAuthProvider {
  return OAUTH_PROVIDERS.some((candidate) => candidate === provider);
}

@ApiTags('认证与用户')
@Controller()
/** Gitee/GitHub OAuth 登录、账号绑定与一次性登录码兑换接口。 */
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauthService: OAuthService,
    private readonly authService: AuthService,
    private readonly helper: AuthResponseHelper,
  ) {}

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
    const authorizationUrl = await this.createOAuthAuthorization(
      providerName,
      response,
    );
    return response.redirect(authorizationUrl);
  }

  @Post('auth/oauth/:provider/start')
  @ApiOperation({
    summary: '点击后校验并发起第三方登录',
    description:
      '仅在用户点击第三方登录时检查服务端配置；可用时设置短期 state Cookie 并返回授权地址。',
  })
  @ApiParam({
    name: 'provider',
    description: '第三方平台标识。',
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
  @ApiResponse({
    status: 503,
    description: '该平台尚未配置第三方登录凭据。',
  })
  async startOAuthLogin(
    @Param('provider') providerName: string,
    @Res() response: Response,
  ) {
    if (!isOAuthProvider(providerName)) {
      throw new BadRequestException('不支持的第三方登录方式');
    }
    const authorizationUrl = await this.createOAuthAuthorization(
      providerName,
      response,
    );
    return response.json({ authorizationUrl });
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
    const authorizationUrl = await this.createOAuthAuthorization(
      providerName,
      response,
      userId,
    );
    return response.json({ authorizationUrl });
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
        await this.helper.audit(
          request,
          'info',
          `oauth_login_succeeded:${provider}`,
        );
      } else {
        frontendCallback.searchParams.set('linked', result.provider);
        await this.helper.audit(
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
      await this.helper.audit(request, 'warn', `oauth_callback_failed:${provider}`);
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
    schema: {
      example: {
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
      },
    },
  })
  @ApiResponse({ status: 401, description: '登录兑换码无效、已使用或已过期。' })
  async exchangeOAuthCode(
    @Body() exchangeDto: OAuthExchangeDto,
    @Res() response: Response,
  ) {
    const session = await this.oauthService.exchangeLoginCode(exchangeDto.code);
    this.helper.setRefreshCookie(response, session.refreshToken);
    return response.json(this.helper.publicSession(session));
  }

  /** 共用登录与绑定授权初始化，确保 state Cookie 与数据库记录使用同一状态值。 */
  private async createOAuthAuthorization(
    provider: OAuthProvider,
    response: Response,
    userId: string | null = null,
  ): Promise<string> {
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
    return url;
  }
}
