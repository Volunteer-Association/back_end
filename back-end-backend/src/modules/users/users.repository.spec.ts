import { jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import {
  RefreshTokenEntity,
  UserEntity,
  UserProfileEntity,
} from '../../../mysql/entities/index.js';
import { UsersRepository } from '../../../mysql/repositories/users.repository.js';

describe('UsersRepository.setLocalCredentials', () => {
  const userQueryBuilder = {
    where: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn(),
  };
  const tokenQueryBuilder = {
    delete: jest.fn(),
    where: jest.fn(),
    execute: jest.fn(),
  };
  const users = {
    createQueryBuilder: jest.fn(),
    update: jest.fn(),
  };
  const tokens = {
    createQueryBuilder: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn(),
  };
  const transaction = jest.fn();
  const accountRepository = {
    manager: { transaction },
  };
  const profileRepository = {};
  let repository: UsersRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    userQueryBuilder.where.mockReturnValue(userQueryBuilder);
    userQueryBuilder.setLock.mockReturnValue(userQueryBuilder);
    userQueryBuilder.getOne.mockResolvedValue({
      userId: 'user-1',
      sessionVersion: 4,
    });
    tokenQueryBuilder.delete.mockReturnValue(tokenQueryBuilder);
    tokenQueryBuilder.where.mockReturnValue(tokenQueryBuilder);
    tokenQueryBuilder.execute.mockResolvedValue({ affected: 1 });
    users.createQueryBuilder.mockReturnValue(userQueryBuilder);
    users.update.mockResolvedValue({ affected: 1 });
    tokens.createQueryBuilder.mockReturnValue(tokenQueryBuilder);
    manager.getRepository.mockImplementation((entity) =>
      entity === UserEntity ? users : tokens,
    );
    transaction.mockImplementation(async (operation) => operation(manager));
    repository = new UsersRepository(
      accountRepository as unknown as Repository<UserEntity>,
      profileRepository as Repository<UserProfileEntity>,
    );
  });

  it('changes the password and invalidates access and refresh sessions atomically', async () => {
    await repository.setLocalCredentials(
      'user-1',
      'new-name',
      'bcrypt-hash',
      'new-name',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(users.update).toHaveBeenCalledWith(
      { userId: 'user-1' },
      expect.objectContaining({
        username: 'new-name',
        password: 'bcrypt-hash',
        sessionVersion: 5,
      }),
    );
    expect(manager.getRepository).toHaveBeenCalledWith(RefreshTokenEntity);
    expect(tokenQueryBuilder.where).toHaveBeenCalledWith(
      'user_id = :userId',
      { userId: 'user-1' },
    );
    expect(tokenQueryBuilder.execute).toHaveBeenCalledTimes(1);
  });
});
