import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthRepository } from '../../../mysql/repositories/oauth.repository.js';
import type { OAuthProfile } from '../../../mysql/repositories/oauth.repository.js';
import type { OAuthProvider } from '../../../mysql/entities/index.js';
import { mapEnabledStatus } from '../../../mysql/entities/user.entity.js';
import { randomBytes } from 'node:crypto';
import { AuthService } from './auth.service.js';

interface ProviderConfiguration {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function fetchJson(
  url: string,
  options: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ServiceUnavailableException('第三方登录服务暂时不可用');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ServiceUnavailableException('第三方登录服务返回了无效响应');
  }
  if (!response.ok) {
    throw new ServiceUnavailableException('第三方登录服务暂时不可用');
  }

  return payload;
}

function requireJsonObject(payload: unknown): JsonObject {
  if (!isJsonObject(payload)) {
    throw new ServiceUnavailableException('第三方登录服务返回了无效响应');
  }
  return payload;
}

@Injectable()
/** 封装第三方授权、资料获取、登录兑换及身份绑定流程。 */
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly oauthRepository: OAuthRepository,
    private readonly authService: AuthService,
  ) {}

  getEnabledProviders(): OAuthProvider[] {
    return (['gitee', 'github'] as const).filter((provider) => {
      const configuration = this.getProviderConfiguration(provider);
      return Boolean(configuration.clientId && configuration.clientSecret);
    });
  }

  getFrontendUrl(): string {
    return this.config.getOrThrow<string>('app.oauth.frontendUrl');
  }

  getCallbackUrl(provider: OAuthProvider): string {
    return this.getProviderConfiguration(provider).callbackUrl;
  }

  async createAuthorization(
    provider: OAuthProvider,
    userId: string | null = null,
  ): Promise<{ state: string; url: string }> {
    // state 同时保存在数据库与短期 Cookie 中，用于校验回调来源和防止重放。
    this.requireProviderConfiguration(provider);
    const state = randomBytes(32).toString('base64url');
    await this.oauthRepository.createState(state, provider, userId);
    return {
      state,
      url: this.createAuthorizationUrl(provider, state),
    };
  }

  getLinkedProviders(userId: string): Promise<OAuthProvider[]> {
    return this.oauthRepository.getLinkedProviders(userId);
  }

  createAuthorizationUrl(provider: OAuthProvider, state: string): string {
    const configuration = this.requireProviderConfiguration(provider);
    const authorizationUrl =
      provider === 'gitee'
        ? new URL('https://gitee.com/oauth/authorize')
        : new URL('https://github.com/login/oauth/authorize');
    if (provider === 'gitee') {
      authorizationUrl.searchParams.set('response_type', 'code');
    }
    authorizationUrl.searchParams.set('client_id', configuration.clientId);
    authorizationUrl.searchParams.set('redirect_uri', configuration.callbackUrl);
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set(
      'scope',
      provider === 'gitee' ? 'user_info' : 'read:user user:email',
    );
    return authorizationUrl.toString();
  }

  async completeAuthorization(
    provider: OAuthProvider,
    authorizationCode: string,
    state: string,
  ): Promise<
    | { type: 'login'; code: string }
    | { type: 'linked'; provider: OAuthProvider }
  > {
    const authorizationState = await this.oauthRepository.consumeState(
      state,
      provider,
    );
    if (!authorizationState) {
      this.logger.warn(
        `OAuth 阶段失败 provider=${provider} stage=state_validation`,
      );
      throw new UnauthorizedException('登录状态无效或已过期');
    }
    const profile = await this.fetchProviderProfile(provider, authorizationCode);
    if (authorizationState.userId !== null) {
      await this.oauthRepository.linkIdentity(
        authorizationState.userId,
        provider,
        profile,
      );
      return { type: 'linked', provider };
    }

    const user = await this.oauthRepository.findOrCreateUser(provider, profile);
    const accountStatus = mapEnabledStatus(user.status);
    if (accountStatus !== 'active') {
      this.logger.warn(
        `OAuth 阶段失败 provider=${provider} stage=local_account_status status=${String(user.status)} normalized=${accountStatus}`,
      );
      throw new UnauthorizedException('该账号当前不可登录');
    }
    return {
      type: 'login',
      code: await this.oauthRepository.createLoginCode(user.userId),
    };
  }

  async exchangeLoginCode(code: string) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(code)) {
      throw new UnauthorizedException('第三方登录凭证无效或已过期');
    }
    const user = await this.oauthRepository.consumeLoginCode(code);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('第三方登录凭证无效或已过期');
    }

    return this.authService.createSession(user);
  }

  private getProviderConfiguration(
    provider: OAuthProvider,
  ): ProviderConfiguration {
    return this.config.getOrThrow<ProviderConfiguration>(
      `app.oauth.${provider}`,
    );
  }

  private requireProviderConfiguration(
    provider: OAuthProvider,
  ): ProviderConfiguration {
    const configuration = this.getProviderConfiguration(provider);
    if (!configuration.clientId || !configuration.clientSecret) {
      throw new ServiceUnavailableException(
        `尚未配置 ${provider} 第三方登录`,
      );
    }
    return configuration;
  }

  private async fetchProviderProfile(
    provider: OAuthProvider,
    code: string,
  ): Promise<OAuthProfile> {
    const configuration = this.requireProviderConfiguration(provider);
    const tokenParameters = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      code,
      redirect_uri: configuration.callbackUrl,
    });
    const tokenRequest =
      provider === 'gitee'
        ? {
            method: 'POST',
            headers: { Accept: 'application/json' },
          }
        : {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: tokenParameters,
          };
    // Gitee's token endpoint expects OAuth parameters on the POST URL.
    const tokenEndpoint =
      provider === 'gitee'
        ? `https://gitee.com/oauth/token?${tokenParameters.toString()}`
        : 'https://github.com/login/oauth/access_token';
    const tokenResponse = requireJsonObject(
      await fetchJson(tokenEndpoint, tokenRequest),
    );
    const accessToken = stringValue(tokenResponse.access_token);
    if (!accessToken) {
      const errorCode = stringValue(tokenResponse.error) ?? 'missing_access_token';
      const errorDescription = stringValue(tokenResponse.error_description)
        ?.replace(/[\r\n]+/g, ' ')
        .slice(0, 160);
      this.logger.warn(
        `OAuth 阶段失败 provider=${provider} stage=token_exchange code=${errorCode}${errorDescription ? ` description=${errorDescription}` : ''}`,
      );
      throw new UnauthorizedException('第三方授权未成功');
    }

    const profileResponse = requireJsonObject(
      provider === 'gitee'
        ? await fetchJson(
            `https://gitee.com/api/v5/user?access_token=${encodeURIComponent(accessToken)}`,
            { headers: { Accept: 'application/json' } },
          )
        : await fetchJson('https://api.github.com/user', {
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${accessToken}`,
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'back-end-application',
            },
          }),
    );
    const id = profileResponse.id;
    const providerId =
      typeof id === 'number' || typeof id === 'string' ? String(id) : '';
    const username = stringValue(profileResponse.login);
    if (!providerId || !username) {
      this.logger.warn(
        `OAuth 阶段失败 provider=${provider} stage=profile_validation hasId=${Boolean(providerId)} hasLogin=${Boolean(username)} fields=${Object.keys(profileResponse).sort().join(',').slice(0, 200)}`,
      );
      throw new UnauthorizedException('无法读取第三方账号信息');
    }

    const email =
      provider === 'github'
        ? await this.fetchVerifiedGitHubEmail(accessToken)
        : stringValue(profileResponse.email);

    return {
      id: providerId,
      username,
      email,
      displayName: stringValue(profileResponse.name),
      avatarUrl: stringValue(profileResponse.avatar_url),
    };
  }

  private async fetchVerifiedGitHubEmail(
    accessToken: string,
  ): Promise<string | null> {
    const response = await fetchJson('https://api.github.com/user/emails', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'back-end-application',
      },
    });
    const emails = Array.isArray(response) ? response : [];
    const primary = emails.find(
      (entry): entry is JsonObject =>
        isJsonObject(entry) &&
        entry.primary === true &&
        entry.verified === true,
    );
    return primary ? stringValue(primary.email) : null;
  }

}
