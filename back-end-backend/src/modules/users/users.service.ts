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

  async updateLastLogin(user: AuthenticationUser): Promise<void> {
    await this.usersRepository.updateLastLogin(user.userId);
  }
}
