import { Injectable } from '@nestjs/common';
import {
  AuthenticationUser,
  AuthenticationState,
  EditableUserProfile,
  SessionSettings,
  UserProfile,
  UsersRepository,
} from '../../../mysql/repositories/users.repository.js';

@Injectable()
/** 作为用户账号及详情数据仓储的业务访问层。 */
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findByUsernameForAuthentication(
    username: string,
  ): Promise<AuthenticationUser | null> {
    return this.usersRepository.findByUsernameForAuthentication(username);
  }

  findAuthenticationState(
    userId: string,
  ): Promise<AuthenticationState | null> {
    return this.usersRepository.findAuthenticationState(userId);
  }

  findSessionSettings(userId: string): Promise<SessionSettings | null> {
    return this.usersRepository.findSessionSettings(userId);
  }

  updateSessionSettings(
    userId: string,
    operator: string,
    settings: SessionSettings,
  ): Promise<SessionSettings | null> {
    return this.usersRepository.updateSessionSettings(
      userId,
      operator,
      settings,
    );
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
