import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jest } from '@jest/globals';
import type { Request } from 'express';
import { UsersService } from '../modules/users/users.service.js';
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
  const usersService = {
    findAuthenticationState: jest.fn(),
  };
  let guard: AuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    (request as Request & { user?: unknown }).user = undefined;
    usersService.findAuthenticationState.mockResolvedValue({
      status: 'active',
      sessionVersion: 3,
    });
    guard = new AuthGuard(
      jwtService as unknown as JwtService,
      usersService as unknown as UsersService,
    );
  });

  it('accepts and attaches a correctly typed access token', async () => {
    const payload = {
      sub: '1234567890123456789',
      username: 'sample',
      role: 'user',
      tokenType: 'access',
      sessionVersion: 3,
    };
    jwtService.verifyAsync.mockResolvedValue(payload);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('access-token');
    expect((request as Request & { user?: unknown }).user).toEqual(payload);
  });

  it('rejects tokens invalidated by a newer single-device login', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: '1234567890123456789',
      tokenType: 'access',
      sessionVersion: 2,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each(['inactive', 'banned'])(
    'rejects tokens for an account with status %s',
    async (status) => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: '1234567890123456789',
        tokenType: 'access',
        sessionVersion: 3,
      });
      usersService.findAuthenticationState.mockResolvedValue({
        status,
        sessionVersion: 3,
      });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('rejects refresh credentials as business access tokens', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 7,
      tokenType: 'refresh',
      sessionVersion: 3,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects unsafe numeric subjects instead of accepting rounded user IDs', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 9007199254740992,
      tokenType: 'access',
      sessionVersion: 3,
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
