import { jest } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { RefreshTokenRepository } from '../../../mysql/repositories/refresh-token.repository.js';

describe('RefreshTokenRepository.create', () => {
  const userQueryBuilder = {
    where: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn(),
  };
  const tokenDeleteQueryBuilder = {
    delete: jest.fn(),
    where: jest.fn(),
    execute: jest.fn(),
  };
  const users = {
    createQueryBuilder: jest.fn(),
    update: jest.fn(),
  };
  const tokens = {
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  let repository: RefreshTokenRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    userQueryBuilder.where.mockReturnValue(userQueryBuilder);
    userQueryBuilder.setLock.mockReturnValue(userQueryBuilder);
    tokenDeleteQueryBuilder.delete.mockReturnValue(tokenDeleteQueryBuilder);
    tokenDeleteQueryBuilder.where.mockReturnValue(tokenDeleteQueryBuilder);
    tokenDeleteQueryBuilder.execute.mockResolvedValue({ affected: 1 });
    users.createQueryBuilder.mockReturnValue(userQueryBuilder);
    users.update.mockResolvedValue({ affected: 1 });
    tokens.delete.mockResolvedValue({ affected: 0 });
    tokens.createQueryBuilder.mockReturnValue(tokenDeleteQueryBuilder);
    tokens.create.mockImplementation((value) => value);
    tokens.save.mockResolvedValue(undefined);
    manager.getRepository.mockImplementation((entity) =>
      entity.name === 'UserEntity' ? users : tokens,
    );
    dataSource.transaction.mockImplementation(async (operation) =>
      operation(manager),
    );
    repository = new RefreshTokenRepository(dataSource as unknown as DataSource);
  });

  it('increments the version and removes prior sessions when multi-login is off', async () => {
    userQueryBuilder.getOne.mockResolvedValue({
      status: 'active',
      isAllowMulti: 0,
      sessionVersion: 4,
    });

    await expect(repository.create('new-refresh-token', 'user-1')).resolves.toBe(
      5,
    );

    expect(users.update).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { sessionVersion: 5 },
    );
    expect(tokenDeleteQueryBuilder.execute).toHaveBeenCalled();
    expect(tokens.save).toHaveBeenCalled();
  });

  it('preserves existing sessions when multi-login is enabled', async () => {
    userQueryBuilder.getOne.mockResolvedValue({
      status: 'active',
      isAllowMulti: 1,
      sessionVersion: 4,
    });

    await expect(repository.create('new-refresh-token', 'user-1')).resolves.toBe(
      4,
    );

    expect(users.update).not.toHaveBeenCalled();
    expect(tokens.createQueryBuilder).not.toHaveBeenCalled();
    expect(tokens.save).toHaveBeenCalled();
  });

  it('does not issue a session for an inactive account', async () => {
    userQueryBuilder.getOne.mockResolvedValue({
      status: 'inactive',
      isAllowMulti: 0,
      sessionVersion: 4,
    });

    await expect(repository.create('new-refresh-token', 'user-1')).resolves.toBe(
      null,
    );

    expect(tokens.save).not.toHaveBeenCalled();
  });

  it('does not issue a session from credentials read before a password change', async () => {
    userQueryBuilder.getOne.mockResolvedValue({
      status: 'active',
      isAllowMulti: 0,
      sessionVersion: 5,
    });

    await expect(
      repository.create('new-refresh-token', 'user-1', 4),
    ).resolves.toBeNull();

    expect(users.update).not.toHaveBeenCalled();
    expect(tokens.save).not.toHaveBeenCalled();
  });
});
