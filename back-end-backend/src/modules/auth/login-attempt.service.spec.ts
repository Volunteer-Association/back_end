import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { LoginAttemptService } from './login-attempt.service.js';

describe('LoginAttemptService', () => {
  const dataSource = {
    query: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn(() => 'test-jwt-secret'),
  };
  let service: LoginAttemptService;

  beforeEach(() => {
    jest.clearAllMocks();
    dataSource.query.mockResolvedValue([]);
    service = new LoginAttemptService(
      dataSource as unknown as DataSource,
      config as unknown as ConfigService,
    );
  });

  it('checks only keyed account/IP buckets and returns the longest cooldown', async () => {
    dataSource.query.mockResolvedValueOnce([{ retry_after_seconds: 27 }]);

    await expect(
      service.getRetryAfterSeconds('Sample_User', '203.0.113.10'),
    ).resolves.toBe(27);

    const [query, parameters] = dataSource.query.mock.calls[0] as [
      string,
      string[],
    ];
    expect(query).toContain('locked_until > UTC_TIMESTAMP()');
    expect(parameters).toHaveLength(2);
    expect(parameters).not.toContain('Sample_User');
    expect(parameters).not.toContain('203.0.113.10');
  });

  it('records hashed IP and account/IP failures with separate thresholds', async () => {
    await service.recordFailure('sample_user', '203.0.113.10');

    expect(dataSource.query).toHaveBeenCalledTimes(3);
    expect(dataSource.query.mock.calls[0]?.[0]).toContain('DELETE FROM auth_login_attempts');
    const ipParameters = dataSource.query.mock.calls[1]?.[1] as unknown[];
    const accountParameters = dataSource.query.mock.calls[2]?.[1] as unknown[];
    expect(ipParameters[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(ipParameters[1]).toBe(30);
    expect(accountParameters[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(accountParameters[1]).toBe(5);
    expect(ipParameters[0]).not.toBe(accountParameters[0]);
    expect(dataSource.query.mock.calls[1]?.[0]).toContain('INTERVAL 15 MINUTE');
  });
});
