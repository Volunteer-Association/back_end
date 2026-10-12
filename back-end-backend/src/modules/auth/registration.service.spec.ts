import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import {
  EmailVerificationEntity,
  RoleEntity,
  UserEntity,
  UserProfileEntity,
} from '../../../mysql/entities/index.js';
import { SnowflakeIdGenerator } from '../../../mysql/snowflake-id.js';
import { AuthService } from './auth.service.js';
import { RegistrationMailerService } from './registration-mailer.service.js';
import { RegistrationService } from './registration.service.js';

const SECRET = 'test-jwt-secret-that-is-long-enough-for-hmac';
const CODE = '123456';

function makeVerification() {
  return {
    id: 1,
    email: 'person@example.com',
    codeHash: createHmac('sha256', SECRET)
      .update(`registration:person@example.com:${CODE}`)
      .digest('hex'),
    expiresAt: new Date(Date.now() + 60_000),
    lastSentAt: new Date(),
    attempts: 0,
    createdAt: new Date(),
  } as EmailVerificationEntity;
}

describe('RegistrationService', () => {
  let service: RegistrationService;
  let verification: EmailVerificationEntity;
  const queryBuilder = {
    where: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn(),
  };
  const verificationRepository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn((value: Partial<EmailVerificationEntity>) => value),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const profileRepository = {
    exists: jest.fn(),
    create: jest.fn((value: Partial<UserProfileEntity>) => value),
    save: jest.fn(),
  };
  const userRepository = {
    exists: jest.fn(),
    create: jest.fn((value: Partial<UserEntity>) => value),
    save: jest.fn((value: Partial<UserEntity>) => value),
  };
  const roleRepository = {
    findOneBy: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === EmailVerificationEntity) return verificationRepository;
      if (entity === UserProfileEntity) return profileRepository;
      if (entity === UserEntity) return userRepository;
      if (entity === RoleEntity) return roleRepository;
      throw new Error('Unexpected entity');
    }),
  };
  const dataSource = {
    transaction: jest.fn(
      async <T>(callback: (transactionManager: typeof manager) => Promise<T>) =>
        callback(manager),
    ),
    getRepository: jest.fn(() => verificationRepository),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'app.jwt.secret') return SECRET;
      if (key === 'app.email.verificationCooldown') return 60;
      if (key === 'app.email.expires') return 300_000;
      throw new Error(`Unexpected config key: ${key}`);
    }),
  };
  const snowflakeIds = { nextId: jest.fn() };
  const authService = { createSession: jest.fn() };
  const mailer = {
    ensureConfigured: jest.fn(),
    sendVerificationCode: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    verification = makeVerification();
    queryBuilder.where.mockReturnThis();
    queryBuilder.setLock.mockReturnThis();
    queryBuilder.getOne.mockResolvedValue(verification);
    verificationRepository.createQueryBuilder.mockReturnValue(queryBuilder);
    verificationRepository.save.mockImplementation(async (value) => value);
    verificationRepository.delete.mockResolvedValue({ affected: 1 });
    profileRepository.exists.mockResolvedValue(false);
    profileRepository.save.mockImplementation(async (value) => value);
    userRepository.exists.mockResolvedValue(false);
    userRepository.save.mockImplementation(async (value) => value);
    roleRepository.findOneBy.mockResolvedValue({ id: 1, key: 'user' });
    snowflakeIds.nextId.mockResolvedValue('1234567890123456789');
    authService.createSession.mockResolvedValue({ data: { accessToken: 'token' } });

    service = new RegistrationService(
      dataSource as never,
      config as unknown as ConfigService,
      snowflakeIds as unknown as SnowflakeIdGenerator,
      authService as unknown as AuthService,
      mailer as unknown as RegistrationMailerService,
    );
  });

  it('records an incorrect code attempt without rolling it back', async () => {
    await expect(
      service.register({
        username: 'person',
        email: 'person@example.com',
        password: 'correct-horse-battery',
        emailCode: '654321',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(verification.attempts).toBe(1);
    expect(verificationRepository.save).toHaveBeenCalledWith(verification);
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('stores only a keyed digest before sending the verification code', async () => {
    queryBuilder.getOne.mockResolvedValue(null);

    const retryAfterSeconds = await service.sendCode(' Person@Example.com ');

    expect(retryAfterSeconds).toBe(60);
    expect(mailer.ensureConfigured).toHaveBeenCalledTimes(1);
    const savedChallenge = verificationRepository.create.mock.calls[0]?.[0] as {
      email: string;
      codeHash: string;
      expiresAt: Date;
      attempts: number;
    };
    expect(savedChallenge.email).toBe('person@example.com');
    expect(savedChallenge.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(savedChallenge).not.toHaveProperty('code');
    expect(savedChallenge.attempts).toBe(0);
    const sentCode = mailer.sendVerificationCode.mock.calls[0]?.[1] as string;
    expect(savedChallenge.codeHash).toBe(
      createHmac('sha256', SECRET)
        .update(`registration:person@example.com:${sentCode}`)
        .digest('hex'),
    );
    expect(mailer.sendVerificationCode).toHaveBeenCalledWith(
      'person@example.com',
      sentCode,
      300_000,
    );
  });

  it('creates the account, profile, and default role in one transaction', async () => {
    const session = await service.register({
      username: 'person',
      email: 'PERSON@example.com',
      password: 'correct-horse-battery',
      emailCode: CODE,
    });

    expect(session).toEqual({ data: { accessToken: 'token' } });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '1234567890123456789',
        username: 'person',
        status: 'active',
        roles: [{ id: 1, key: 'user' }],
      }),
    );
    const createdUser = userRepository.create.mock.results[0]?.value as {
      password: string;
    };
    expect(createdUser.password).not.toBe('correct-horse-battery');
    expect(profileRepository.create).toHaveBeenCalledWith({
      userId: '1234567890123456789',
      email: 'person@example.com',
    });
    expect(verificationRepository.delete).toHaveBeenCalledWith({ id: 1 });
    expect(authService.createSession).toHaveBeenCalledTimes(1);
  });
});
