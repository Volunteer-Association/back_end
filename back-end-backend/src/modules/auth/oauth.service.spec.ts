import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { OAuthRepository } from '../../../mysql/repositories/oauth.repository.js';
import { AuthService } from './auth.service.js';
import { OAuthService } from './oauth.service.js';

describe('OAuthService', () => {
  const providerConfig = {
    gitee: {
      clientId: 'gitee-client-id',
      clientSecret: 'gitee-client-secret',
      callbackUrl: 'http://localhost:3000/auth/oauth/gitee/callback',
    },
    github: {
      clientId: 'github-client-id',
      clientSecret: 'github-client-secret',
      callbackUrl: 'http://localhost:3000/auth/oauth/github/callback',
    },
  };
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'app.oauth.frontendUrl') return 'http://localhost:5173';
      return providerConfig[key.split('.').pop() as keyof typeof providerConfig];
    }),
  };
  const oauthRepository = {
    findOrCreateUser: jest.fn(),
    linkIdentity: jest.fn(),
    getLinkedProviders: jest.fn(),
    createState: jest.fn(),
    consumeState: jest.fn(),
    createLoginCode: jest.fn(),
    consumeLoginCode: jest.fn(),
  };
  const authService = {
    createSession: jest.fn(),
  };
  let service: OAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService.createSession.mockResolvedValue({
      code: 200,
      message: '登录成功',
      data: {
        accessToken: 'access-token',
        user: {
          id: '1234567890123456789',
          username: 'sample',
          email: 'sample@example.com',
          nickname: null,
          avatar: null,
          role: 'user',
        },
      },
      refreshToken: 'refresh-token',
    });
    service = new OAuthService(
      configService as unknown as ConfigService,
      oauthRepository as unknown as OAuthRepository,
      authService as unknown as AuthService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the client secret out of the browser authorization URL', () => {
    const url = new URL(
      service.createAuthorizationUrl('gitee', 'random-state'),
    );

    expect(url.origin).toBe('https://gitee.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('gitee-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      providerConfig.gitee.callbackUrl,
    );
    expect(url.searchParams.get('state')).toBe('random-state');
    expect(url.searchParams.has('client_secret')).toBe(false);
  });

  it('exchanges the Gitee code on the backend and persists the provider identity', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      provider: 'gitee',
      userId: null,
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'provider-access-token' })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 123,
            login: 'gitee-user',
            name: 'Gitee User',
            email: 'gitee@example.com',
            avatar_url: 'https://example.com/avatar.png',
          }),
        ),
      );
    oauthRepository.findOrCreateUser.mockResolvedValue({
      userId: '1234567890123456789',
      status: 'active',
    });
    oauthRepository.createLoginCode.mockResolvedValue('one-time-login-code');

    await expect(
      service.completeAuthorization(
        'gitee',
        'authorization-code',
        'valid-state',
      ),
    ).resolves.toEqual({ type: 'login', code: 'one-time-login-code' });

    const tokenRequestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(tokenRequestUrl.origin).toBe('https://gitee.com');
    expect(tokenRequestUrl.pathname).toBe('/oauth/token');
    expect(tokenRequestUrl.searchParams.get('grant_type')).toBe(
      'authorization_code',
    );
    expect(tokenRequestUrl.searchParams.get('code')).toBe('authorization-code');
    expect(tokenRequestUrl.searchParams.get('client_id')).toBe('gitee-client-id');
    expect(tokenRequestUrl.searchParams.get('client_secret')).toBe(
      'gitee-client-secret',
    );
    expect(tokenRequestUrl.searchParams.get('redirect_uri')).toBe(
      providerConfig.gitee.callbackUrl,
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
    expect(oauthRepository.findOrCreateUser).toHaveBeenCalledWith(
      'gitee',
      expect.objectContaining({
        id: '123',
        username: 'gitee-user',
        email: 'gitee@example.com',
      }),
    );
    expect(oauthRepository.createLoginCode).toHaveBeenCalledWith(
      '1234567890123456789',
    );
    expect(authService.createSession).not.toHaveBeenCalled();
    expect(oauthRepository.consumeState).toHaveBeenCalledWith(
      'valid-state',
      'gitee',
    );
  });

  it('logs a safe Gitee token-exchange reason when the provider rejects credentials', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      provider: 'gitee',
      userId: null,
    });
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'redirect_uri does not match',
        }),
      ),
    );

    await expect(
      service.completeAuthorization(
        'gitee',
        'sensitive-authorization-code',
        'valid-state',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'provider=gitee stage=token_exchange code=invalid_grant',
      ),
    );
    const loggedWarning = String(warning.mock.calls[0]?.[0]);
    expect(loggedWarning).toContain('redirect_uri does not match');
    expect(loggedWarning).not.toContain('sensitive-authorization-code');
    expect(loggedWarning).not.toContain('gitee-client-secret');
  });

  it('handles GitHub login independently and links its verified profile', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      provider: 'github',
      userId: null,
    });
    oauthRepository.findOrCreateUser.mockResolvedValue({
      userId: '2234567890123456789',
      status: 'active',
    });
    oauthRepository.createLoginCode.mockResolvedValue('github-login-code');
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'github-access-token' })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 456,
            login: 'github-user',
            name: 'GitHub User',
            avatar_url: 'https://example.com/github-avatar.png',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              email: 'github@example.com',
              primary: true,
              verified: true,
            },
          ]),
        ),
      );

    await expect(
      service.completeAuthorization(
        'github',
        'github-authorization-code',
        'github-state',
      ),
    ).resolves.toEqual({ type: 'login', code: 'github-login-code' });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://github.com/login/oauth/access_token',
    );
    expect(oauthRepository.findOrCreateUser).toHaveBeenCalledWith(
      'github',
      expect.objectContaining({
        id: '456',
        username: 'github-user',
        email: 'github@example.com',
      }),
    );
    expect(authService.createSession).not.toHaveBeenCalled();
  });

  it('exchanges the single-use OAuth code for the standard two-token session', async () => {
    const user = {
      userId: '1234567890123456789',
      status: 'active',
      username: 'sample',
    };
    oauthRepository.consumeLoginCode.mockResolvedValue(user);

    await expect(
      service.exchangeLoginCode('a'.repeat(43)),
    ).resolves.toMatchObject({
      data: { accessToken: 'access-token' },
      refreshToken: 'refresh-token',
    });
    expect(authService.createSession).toHaveBeenCalledWith(user);
  });

  it('links the authorized identity to the signed-in local account', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      provider: 'gitee',
      userId: '1234567890123456789',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'provider-access-token' })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 123,
            login: 'gitee-user',
            name: 'Gitee User',
            email: 'gitee@example.com',
          }),
        ),
      );

    await expect(
      service.completeAuthorization('gitee', 'authorization-code', 'state'),
    ).resolves.toEqual({ type: 'linked', provider: 'gitee' });
    expect(oauthRepository.linkIdentity).toHaveBeenCalledWith(
      '1234567890123456789',
      'gitee',
      expect.objectContaining({ id: '123' }),
    );
    expect(oauthRepository.findOrCreateUser).not.toHaveBeenCalled();
    expect(oauthRepository.createLoginCode).not.toHaveBeenCalled();
    expect(authService.createSession).not.toHaveBeenCalled();
  });

  it('creates an independent persisted OAuth state for each configured provider', async () => {
    const authorization = await service.createAuthorization(
      'github',
      '1234567890123456789',
    );
    const url = new URL(authorization.url);

    expect(service.getEnabledProviders()).toEqual(['gitee', 'github']);
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('client_id')).toBe('github-client-id');
    expect(oauthRepository.createState).toHaveBeenCalledWith(
      authorization.state,
      'github',
      '1234567890123456789',
    );
    expect(url.searchParams.get('state')).toBe(authorization.state);
  });

  it('rejects absent or expired OAuth state before contacting a provider', async () => {
    oauthRepository.consumeState.mockResolvedValue(null);
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(
      service.completeAuthorization('github', 'authorization-code', 'bad-state'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid exchange codes without querying the database', async () => {
    await expect(service.exchangeLoginCode('short')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(oauthRepository.consumeLoginCode).not.toHaveBeenCalled();
  });
});
