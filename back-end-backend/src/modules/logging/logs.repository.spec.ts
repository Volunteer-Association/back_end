import { jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import { LogEntity } from '../../../mysql/entities/index.js';
import { LogsRepository } from '../../../mysql/repositories/logs.repository.js';

describe('LogsRepository.findPage', () => {
  const queryBuilder = {
    leftJoinAndSelect: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    andWhere: jest.fn(),
    getManyAndCount: jest.fn(),
  };
  const repository = {
    createQueryBuilder: jest.fn(),
  };
  let logsRepository: LogsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.leftJoinAndSelect.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.skip.mockReturnValue(queryBuilder);
    queryBuilder.take.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    repository.createQueryBuilder.mockReturnValue(queryBuilder);
    logsRepository = new LogsRepository(
      repository as unknown as Repository<LogEntity>,
    );
  });

  it('returns level and message first and timestamp last', async () => {
    const createdAt = new Date('2026-10-13T00:00:00.000Z');
    queryBuilder.getManyAndCount.mockResolvedValue([
      [
        {
          level: 'error',
          message: 'HTTP POST /resource returned 500',
          category: 'http',
          id: 10,
          user: { userId: '123', username: 'sample' },
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          createdAt,
        },
      ],
      1,
    ]);

    const result = await logsRepository.findPage(1, 50);

    expect(result.items[0]).toEqual({
      level: 'error',
      message: 'HTTP POST /resource returned 500',
      category: 'http',
      id: 10,
      user: { id: '123', username: 'sample' },
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      createdAt,
    });
    expect(Object.keys(result.items[0] ?? {}).at(0)).toBe('level');
    expect(Object.keys(result.items[0] ?? {}).at(1)).toBe('message');
    expect(Object.keys(result.items[0] ?? {}).at(-1)).toBe('createdAt');
  });

  it('applies category and level filters before paginating results', async () => {
    queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

    await logsRepository.findPage(3, 20, 'error', 'http');

    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'log.level = :level',
      { level: 'error' },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      'log.category = :category',
      { category: 'http' },
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(40);
    expect(queryBuilder.take).toHaveBeenCalledWith(20);
  });
});
