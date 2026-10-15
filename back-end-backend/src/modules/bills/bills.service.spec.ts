import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import { BillEntity } from '../../../mysql/entities/bill.entity.js';
import { BillsService } from './bills.service.js';

describe('BillsService', () => {
  const repository = {
    create: jest.fn((input) => input),
    save: jest.fn(async (bill) => bill),
    findOne: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const idGenerator = { nextId: jest.fn(async () => 'bill-id') };
  // 分类由数据字典决定；默认放行，需要拒绝时在测试里单独 mock。
  const dict = { isCategoryAllowed: jest.fn(async () => true) };
  // PaymentsService 在本 spec 里不会被调用（payWithBalance 路径未覆盖）。
  const payments = {};
  const paymentNo = { nextBillNo: jest.fn(() => 'BILL2610140000000000000001') };
  // DataSource 仅在 payWithBalance / refundBill 路径用到，默认空实现。
  const dataSource = {
    transaction: jest.fn(),
  };
  const service = new BillsService(
    repository as unknown as Repository<BillEntity>,
    idGenerator as never,
    dict as never,
    payments as never,
    paymentNo as never,
    dataSource as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    dict.isCategoryAllowed.mockResolvedValue(true);
  });

  it('creates a bill owned by the authenticated user', async () => {
    const result = await service.create('user-1', {
      type: 'expense',
      category: '餐饮',
      amount: '12.50',
      transactionDate: '2026-10-13',
      note: '午餐',
    });

    expect(result).toMatchObject({
      id: 'bill-id',
      userId: 'user-1',
      type: 'expense',
      amount: '12.50',
      note: '午餐',
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects amounts that are zero or negative', async () => {
    await expect(
      service.create('user-1', {
        type: 'income',
        category: '工资',
        amount: '0.00',
        transactionDate: '2026-10-13',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a category not present in the enabled dictionary', async () => {
    dict.isCategoryAllowed.mockResolvedValue(false);
    await expect(
      service.create('user-1', {
        type: 'income',
        category: '不存在的分类',
        amount: '10.00',
        transactionDate: '2026-10-13',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns an exact balance for large decimal totals', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({
        income: '10000000000.01',
        expense: '0.02',
      })),
    };
    repository.createQueryBuilder.mockReturnValue(query);

    await expect(service.getSummary('user-1', {})).resolves.toEqual({
      income: '10000000000.01',
      expense: '0.02',
      balance: '9999999999.99',
    });
  });

  it('does not update a bill belonging to another user', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.update('user-1', 'bill-id', { note: '修改' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'bill-id', userId: 'user-1' },
    });
  });

  it('rejects changing amount on an already-paid bill', async () => {
    repository.findOne.mockResolvedValue({
      id: 'bill-id',
      userId: 'user-1',
      type: 'expense',
      category: '餐饮',
      amount: '100.00',
      transactionDate: '2026-10-13',
      note: null,
      paidAt: new Date('2026-10-14T10:00:00Z'),
    });

    await expect(
      service.update('user-1', 'bill-id', { amount: '99999.00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects changing type on an already-paid bill', async () => {
    repository.findOne.mockResolvedValue({
      id: 'bill-id',
      userId: 'user-1',
      type: 'expense',
      category: '餐饮',
      amount: '100.00',
      transactionDate: '2026-10-13',
      note: null,
      paidAt: new Date('2026-10-14T10:00:00Z'),
    });

    await expect(
      service.update('user-1', 'bill-id', { type: 'income' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still allows editing note on a paid bill', async () => {
    repository.findOne.mockResolvedValue({
      id: 'bill-id',
      userId: 'user-1',
      type: 'expense',
      category: '餐饮',
      amount: '100.00',
      transactionDate: '2026-10-13',
      note: null,
      paidAt: new Date('2026-10-14T10:00:00Z'),
    });

    await service.update('user-1', 'bill-id', { note: '午饭' });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects deleting an already-paid bill', async () => {
    repository.findOne.mockResolvedValue({
      id: 'bill-id',
      userId: 'user-1',
      type: 'expense',
      amount: '100.00',
      paidAt: new Date('2026-10-14T10:00:00Z'),
    });

    await expect(service.remove('user-1', 'bill-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('allows deleting an unpaid bill', async () => {
    repository.findOne.mockResolvedValue({
      id: 'bill-id',
      userId: 'user-1',
      type: 'expense',
      amount: '100.00',
      paidAt: null,
    });
    repository.delete.mockResolvedValue({ affected: 1 });

    await expect(service.remove('user-1', 'bill-id')).resolves.toEqual({
      success: true,
    });
  });
});
