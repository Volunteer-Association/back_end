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
    status: 'active',
  } as UserEntity;

  const usersService = {
    findByUsernameForAuthentication: jest.fn(),
    updateLastLogin: jest.fn(),
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
    jwtService.signAsync.mockResolvedValue('signed-token');
    refreshTokens.create.mockResolvedValue(undefined);
    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      refreshTokens as unknown as RefreshTokenRepository,
    );
  });

  it('verifies the database password and issues short and long-lived tokens', async () => {
    const response = await service.login('sample', 'correct-password');

    expect(response.data.accessToken).toBe('signed-token');
    expect(response.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(refreshTokens.create).toHaveBeenCalledWith(
      response.refreshToken,
      '1234567890123456789',
    );
    expect(response.data.user).toEqual({
      id: '1234567890123456789',
      username: 'sample',
      email: 'sample@example.com',
      nickname: 'Sample',
      avatar: null,
      role: 'user',
    });
    expect(usersService.updateLastLogin).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '1234567890123456789' }),
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      {
        sub: '1234567890123456789',
        username: 'sample',
        role: 'user',
        tokenType: 'access',
      },
      { expiresIn: 900 },
    );
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
});
