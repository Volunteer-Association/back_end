import { Injectable } from '@nestjs/common';
import {
  AuthenticationUser,
  EditableUserProfile,
  UserProfile,
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
    operator: string,
  ): Promise<void> {
    return this.usersRepository.setLocalCredentials(
      userId,
      username,
      passwordHash,
      operator,
    );
  }

  findProfile(userId: string): Promise<UserProfile | null> {
    return this.usersRepository.findProfile(userId);
  }

  updateProfile(
    userId: string,
    operator: string,
    changes: EditableUserProfile,
  ): Promise<UserProfile | null> {
    return this.usersRepository.updateProfile(userId, operator, changes);
  }
}
