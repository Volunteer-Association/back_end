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

  findLocalCredentials(
    userId: string,
  ): Promise<{ username: string; password: string | null } | null> {
    return this.usersRepository.findLocalCredentials(userId);
  }

  setLocalCredentials(
    userId: string,
    username: string,
    passwordHash: string,
  ): Promise<void> {
    return this.usersRepository.setLocalCredentials(
      userId,
      username,
      passwordHash,
    );
  }
}
