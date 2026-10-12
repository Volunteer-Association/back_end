import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Token not found');
    }
    
    try {
      const payload: unknown = await this.jwtService.verifyAsync(token);
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('tokenType' in payload) ||
        payload.tokenType !== 'access' ||
        !('sub' in payload) ||
        typeof payload.sub !== 'string' ||
        !/^[1-9]\d{0,18}$/.test(payload.sub)
      ) {
        throw new UnauthorizedException('Invalid access token');
      }

      Object.assign(request, { user: payload });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token, extra] = request.headers.authorization?.split(' ') ?? [];
    return type?.toLowerCase() === 'bearer' && token && !extra
      ? token
      : undefined;
  }
}
