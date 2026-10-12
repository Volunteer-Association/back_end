import { Injectable } from '@nestjs/common';
import {
  AuthenticationUser,
  UsersRepository,
} from '../../../mysql/repositories/users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findByUsernameForAuthentication(
    username: string,
  ): Promise<AuthenticationUser | null> {
    return this.usersRepository.findByUsernameForAuthentication(username);
  }

  async updateLastLogin(
    user: AuthenticationUser,
    ipAddress?: string,
  ): Promise<void> {
    await this.usersRepository.updateLastLogin(user.userId, ipAddress);
  }

  findPasswordHash(userId: string): Promise<string | null> {
    return this.usersRepository.findPasswordHash(userId);
  }

  setPassword(userId: string, passwordHash: string): Promise<void> {
    return this.usersRepository.setPassword(userId, passwordHash);
  }
}
