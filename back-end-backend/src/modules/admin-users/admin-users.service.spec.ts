import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import {
  RoleEntity,
  UserEntity,
  UserProfileEntity,
} from '../../../mysql/entities/index.js';
import { AdminUsersService } from './admin-users.service.js';

/**
 * 回归测试：角色管理中新增的自定义角色必须能分配给用户。
 *
 * 历史缺陷：服务里曾写死 user/admin/super_admin 白名单，导致角色管理页
 * 新建的角色（如 finance）在分配时被后端以「非法角色 key」拒绝。
 * 角色合法性应以数据库 roles 表为准，而不是写死的枚举。
 */
describe('AdminUsersService - 自定义角色分配', () => {
  // detail() 通过 QueryBuilder 回读用户，这里返回一个带自定义角色的结果。
  const detailUser = {
    userId: 'user-2',
    username: 'someone',
    profile: { email: 's@example.com', nickname: 'Some' },
    roles: [{ key: 'finance' }],
    role: 'user',
    status: 'active',
    lastLoginAt: null,
    lastLoginIp: null,
    createdAt: new Date(),
  };

  const detailQb: any = {};
  detailQb.leftJoinAndSelect = jest.fn(() => detailQb);
  detailQb.where = jest.fn(() => detailQb);
  detailQb.getOne = jest.fn(async () => detailUser);

  const users = {
    findOne: jest.fn(),
    save: jest.fn(async (u: unknown) => u),
    update: jest.fn(async () => ({})),
    createQueryBuilder: jest.fn(() => detailQb),
  };

  const roles = {
    findBy: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  // assignRoles 删除刷新令牌的 QueryBuilder 链。
  const refreshQb: any = {};
  refreshQb.delete = jest.fn(() => refreshQb);
  refreshQb.where = jest.fn(() => refreshQb);
  refreshQb.execute = jest.fn(async () => ({}));

  const manager = {
    getRepository: jest.fn(() => ({
      create: (x: unknown) => x,
      save: async (x: unknown) => x,
    })),
  };
  const dataSource = {
    transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    getRepository: jest.fn(() => ({ createQueryBuilder: () => refreshQb })),
  };

  const snowflake = { nextId: jest.fn(async () => 'user-2') };

  const service = new AdminUsersService(
    users as unknown as Repository<UserEntity>,
    {} as Repository<UserProfileEntity>,
    roles as unknown as Repository<RoleEntity>,
    dataSource as never,
    snowflake as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    users.findOne.mockResolvedValue({
      userId: 'user-2',
      roles: [{ key: 'user' }],
    });
  });

  it('允许分配角色管理中新增、且数据库里存在的自定义角色（如 finance）', async () => {
    roles.findBy.mockResolvedValue([{ key: 'finance' }]);

    await service.assignRoles('user-2', ['finance'], 'admin-1');

    expect(roles.findBy).toHaveBeenCalledWith([{ key: 'finance' }]);
    expect(users.save).toHaveBeenCalledTimes(1);
    const saved = users.save.mock.calls[0][0] as { roles: { key: string }[] };
    expect(saved.roles).toEqual([{ key: 'finance' }]);
  });

  it('拒绝分配数据库中不存在的角色', async () => {
    roles.findBy.mockResolvedValue([]); // 一个都查不到 → 数量不匹配

    await expect(
      service.assignRoles('user-2', ['ghost'], 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('角色数组为空时拒绝，且不查询角色表', async () => {
    await expect(
      service.assignRoles('user-2', [], 'admin-1'),
    ).rejects.toThrow('至少要分配一个角色');
    expect(roles.findBy).not.toHaveBeenCalled();
  });

  it('不允许修改自己的角色', async () => {
    await expect(
      service.assignRoles('admin-1', ['finance'], 'admin-1'),
    ).rejects.toThrow('不能修改自己的角色');
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it('创建用户时可直接授予自定义角色', async () => {
    roles.findBy.mockResolvedValue([{ key: 'finance' }]);

    const result = await service.create(
      {
        username: 'finance01',
        password: 'password123',
        email: 'F@example.com',
        roleKeys: ['finance'],
      },
      'admin-1',
    );

    // 走到 detail 回读即说明自定义角色通过了校验、事务已提交。
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ userId: 'user-2' });
  });
});
