import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jest } from '@jest/globals';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from '../../../mysql/entities/index.js';
import { RefreshTokenRepository } from '../../../mysql/repositories/refresh-token.repository.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let passwordHash: string;
  const user = {
    userId: '1234567890123456789',
    username: 'sample',
    email: 'sample@example.com',
    nickname: 'Sample',
    avatar: null,
    role: 'user',
    roles: [],
    status: 'active',
    sessionVersion: 0,
  } as UserEntity;

  const usersService = {
    findByUsernameForAuthentication: jest.fn(),
    updateLastLogin: jest.fn(),
    findLocalCredentials: jest.fn(),
    setLocalCredentials: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn(),
  };
  const refreshTokens = {
    create: jest.fn(),
    rotate: jest.fn(),
    revoke: jest.fn(),
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('correct-password', 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.findByUsernameForAuthentication.mockResolvedValue({
      ...user,
      password: passwordHash,
    });
    usersService.updateLastLogin.mockResolvedValue(undefined);
    usersService.findLocalCredentials.mockResolvedValue({
      username: 'sample',
      password: null,
    });
    usersService.setLocalCredentials.mockResolvedValue(undefined);
    jwtService.signAsync.mockResolvedValue('signed-token');
    refreshTokens.create.mockResolvedValue(1);
    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      refreshTokens as unknown as RefreshTokenRepository,
    );
  });

  it('verifies the database password and issues short and long-lived tokens', async () => {
    const response = await service.login(
      'sample',
      'correct-password',
      '203.0.113.10',
    );

    expect(response.data.accessToken).toBe('signed-token');
    expect(response.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(refreshTokens.create).toHaveBeenCalledWith(
      response.refreshToken,
      '1234567890123456789',
      0,
    );
    expect(response.data.user).toEqual({
      id: '1234567890123456789',
      username: 'sample',
      email: 'sample@example.com',
      nickname: 'Sample',
      avatar: null,
      role: 'user',
      roles: [],
      createdAt: null,
    });
    expect(usersService.updateLastLogin).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '1234567890123456789' }),
      '203.0.113.10',
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      {
        sub: '1234567890123456789',
        tokenType: 'access',
        sessionVersion: 1,
      },
      { expiresIn: 900 },
    );
  });

  it('rejects session creation if the account became inactive', async () => {
    refreshTokens.create.mockResolvedValue(null);

    await expect(
      service.createSession(user),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rotates valid refresh tokens and rejects expired sessions', async () => {
    refreshTokens.rotate.mockResolvedValue(user);

    const session = await service.refreshSession('r'.repeat(43));

    expect(session.data.accessToken).toBe('signed-token');
    expect(session.refreshToken).not.toBe('r'.repeat(43));
    expect(refreshTokens.rotate).toHaveBeenCalledWith(
      'r'.repeat(43),
      session.refreshToken,
    );

    refreshTokens.rotate.mockResolvedValue(null);
    await expect(
      service.refreshSession('r'.repeat(43)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes a refresh token when its user is no longer active', async () => {
    refreshTokens.rotate.mockResolvedValue({
      ...user,
      status: 'banned',
    });

    await expect(
      service.refreshSession('r'.repeat(43)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshTokens.revoke).toHaveBeenCalledWith(
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password without signing a token', async () => {
    await expect(service.login('sample', 'wrong-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(jwtService.signAsync).not.toHaveBeenCalled();
    expect(usersService.updateLastLogin).not.toHaveBeenCalled();
  });

  it('rejects unknown users with the same authentication error', async () => {
    usersService.findByUsernameForAuthentication.mockResolvedValue(null);

    await expect(
      service.login('unknown', 'correct-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('sets a local password for an OAuth-only account', async () => {
    usersService.findLocalCredentials.mockResolvedValue({
      username: 'gitee_abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      password: null,
    });
    await service.setLocalPassword(
      '1234567890123456789',
      undefined,
      'new-local-password',
      'my-own-account',
    );

    expect(usersService.setLocalCredentials).toHaveBeenCalledWith(
      '1234567890123456789',
      'my-own-account',
      expect.any(String),
      'my-own-account',
    );
    const savedHash = usersService.setLocalCredentials.mock.calls[0]?.[2] as string;
    expect(savedHash).not.toBe('new-local-password');
    await expect(
      bcrypt.compare('new-local-password', savedHash),
    ).resolves.toBe(true);
    usersService.findLocalCredentials.mockResolvedValue({
      username: 'my-own-account',
      password: savedHash,
    });
    await expect(
      service.getLocalAccountStatus('1234567890123456789'),
    ).resolves.toEqual({
      username: 'my-own-account',
      hasLocalPassword: true,
      requiresUsernameSetup: false,
    });
  });

  it('requires a chosen local username for generated OAuth accounts', async () => {
    usersService.findLocalCredentials.mockResolvedValue({
      username: 'gitee_abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      password: null,
    });

    await expect(
      service.setLocalPassword(
        '1234567890123456789',
        undefined,
        'new-local-password',
      ),
    ).rejects.toThrow('请先设置自己的本地登录账号');
    expect(usersService.setLocalCredentials).not.toHaveBeenCalled();
  });

  it('requires the current local password before changing it', async () => {
    usersService.findLocalCredentials.mockResolvedValue({
      username: 'sample',
      password: passwordHash,
    });

    await expect(
      service.setLocalPassword(
        '1234567890123456789',
        'wrong-password',
        'new-local-password',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(usersService.setLocalCredentials).not.toHaveBeenCalled();
  });
});
