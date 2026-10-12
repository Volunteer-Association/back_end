import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jest } from '@jest/globals';
import type { Request } from 'express';
import { AuthGuard } from './auth.guard.js';

describe('AuthGuard', () => {
  const request = {
    headers: { authorization: 'Bearer access-token' },
  } as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const jwtService = {
    verifyAsync: jest.fn(),
  };
  let guard: AuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    (request as Request & { user?: unknown }).user = undefined;
    guard = new AuthGuard(jwtService as unknown as JwtService);
  });

  it('accepts and attaches a correctly typed access token', async () => {
    const payload = {
      sub: '1234567890123456789',
      username: 'sample',
      role: 'user',
      tokenType: 'access',
    };
    jwtService.verifyAsync.mockResolvedValue(payload);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('access-token');
    expect((request as Request & { user?: unknown }).user).toEqual(payload);
  });

  it('rejects refresh credentials as business access tokens', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 7,
      tokenType: 'refresh',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects unsafe numeric subjects instead of accepting rounded user IDs', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 9007199254740992,
      tokenType: 'access',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects requests without a bearer token', async () => {
    const noTokenContext = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(noTokenContext)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects expired or invalid signatures', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('expired'));

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
