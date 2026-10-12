import { jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import { UserEntity, UserProfileEntity } from '../../../mysql/entities/index.js';
import { UsersRepository } from '../../../mysql/repositories/users.repository.js';

describe('UsersRepository session settings', () => {
  const accountRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const profileRepository = {};
  let repository: UsersRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new UsersRepository(
      accountRepository as unknown as Repository<UserEntity>,
      profileRepository as Repository<UserProfileEntity>,
    );
  });

  it.each([
    [{ isAllowMulti: 1 }, { allowMultiLogin: true }],
    [{ isAllowMulti: 0 }, { allowMultiLogin: false }],
    [{ isAllowMulti: null }, { allowMultiLogin: false }],
  ])('maps database session settings %o to %o', async (user, expected) => {
    accountRepository.findOne.mockResolvedValue(user);

    await expect(repository.findSessionSettings('123')).resolves.toEqual(
      expected,
    );
  });

  it('persists the setting with the current user as audit operator', async () => {
    accountRepository.update.mockResolvedValue({ affected: 1 });
    accountRepository.findOne.mockResolvedValue({ isAllowMulti: 1 });

    await expect(
      repository.updateSessionSettings('123', 'sample', {
        allowMultiLogin: true,
      }),
    ).resolves.toEqual({ allowMultiLogin: true });

    expect(accountRepository.update).toHaveBeenCalledWith(
      { userId: '123' },
      {
        isAllowMulti: 1,
        operator: 'sample',
        operatorId: '123',
      },
    );
  });
});
