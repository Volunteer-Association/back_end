import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { hash } from 'bcryptjs';
import {
  RefreshTokenEntity,
  RoleEntity,
  UserEntity,
  UserProfileEntity,
} from '../../../mysql/entities/index.js';
import {
  SNOWFLAKE_ID_GENERATOR,
  SnowflakeIdGenerator,
} from '../../../mysql/snowflake-id.js';
import { BCRYPT_ROUNDS } from '../auth/password-policy.js';

/** 角色白名单：超级管理员只能从这三个角色里选，避免乱挂角色。 */
const ALLOWED_ROLE_KEYS = ['user', 'admin', 'super_admin'] as const;
export type AllowedRoleKey = (typeof ALLOWED_ROLE_KEYS)[number];

/** 校验传入的角色 key 均在白名单内，防止前端构造非法角色。 */
function assertAllowedRoleKeys(keys: string[]): asserts keys is AllowedRoleKey[] {
  const invalid = keys.filter((k) => !ALLOWED_ROLE_KEYS.includes(k as AllowedRoleKey));
  if (invalid.length) {
    throw new BadRequestException(`非法角色 key: ${invalid.join(', ')}`);
  }
}

/** 可被管理员设置的账号状态。 */
export type AdminSetStatus = 'active' | 'inactive' | 'banned';

export interface CreateAdminUserInput {
  username: string;
  password: string;
  email: string;
  nickname?: string | null;
  status?: AdminSetStatus;
  roleKeys?: AllowedRoleKey[];
}

export interface AdminUserListItem {
  userId: string;
  username: string;
  email: string;
  nickname: string | null;
  status: UserEntity['status'];
  roleKeys: string[];
  role: UserEntity['role'];
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  createdAt: Date;
}

function isDuplicateKey(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driver = (error as { driverError?: { code?: string } }).driverError;
  return driver?.code === 'ER_DUP_ENTRY';
}

@Injectable()
/**
 * 用户管理服务（仅超级管理员使用）。
 *
 * 职责边界：
 * - 只能由 super_admin 调用（controller 层校验）
 * - 不做日常业务（充值审核等由 admin 角色处理）
 * - 不允许对自己做状态变更或角色变更，防止误操作把自己锁出去
 */
export class AdminUsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly profiles: Repository<UserProfileEntity>,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    private readonly dataSource: DataSource,
    @Inject(SNOWFLAKE_ID_GENERATOR)
    private readonly snowflake: SnowflakeIdGenerator,
  ) {}

  /** 下拉选项：状态和角色枚举由后端统一定义，前端不写死。 */
  async options() {
    const all = await this.roles.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
    return {
      statuses: [
        { value: 'active', label: '正常', description: '账号可正常登录和使用' },
        { value: 'inactive', label: '停用', description: '暂时锁定，用户无法登录，可恢复' },
        { value: 'banned', label: '封禁', description: '永久封禁，需要超管手动解除' },
      ],
      roles: all.map((r) => ({ value: r.key, label: r.name, description: r.description || '' })),
    };
  }

  /** 分页查询用户，可按关键字（用户名/邮箱）、状态、角色过滤。 */
  async list(options: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: AdminSetStatus;
    role?: AllowedRoleKey;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const qb = this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (options.keyword) {
      const kw = `%${options.keyword.trim()}%`;
      qb.andWhere('user.username LIKE :kw OR profile.email LIKE :kw', { kw });
    }
    if (options.status) {
      qb.andWhere('user.status = :st', { st: options.status });
    }
    if (options.role) {
      qb.andWhere('role.key = :rk', { rk: options.role });
    }

    const [rows, total] = await qb.getManyAndCount();
    const items: AdminUserListItem[] = rows.map((u) => this.toListItem(u));
    return { items, total, page, pageSize };
  }

  /** 将带 profile/roles 关联的用户实体映射为管理列表项。 */
  private toListItem(u: UserEntity): AdminUserListItem {
    return {
      userId: u.userId,
      username: u.username,
      email: u.profile?.email ?? '',
      nickname: u.profile?.nickname ?? null,
      status: u.status,
      roleKeys: (u.roles ?? []).map((r) => r.key),
      role: u.role,
      lastLoginAt: u.lastLoginAt,
      lastLoginIp: u.lastLoginIp,
      createdAt: u.createdAt,
    };
  }

  /** 用户详情。 */
  async detail(userId: string): Promise<AdminUserListItem> {
    const u = await this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.userId = :userId', { userId })
      .getOne();
    if (!u) throw new NotFoundException('用户不存在');
    return this.toListItem(u);
  }

  /** 创建用户（管理员代注册），默认授予 user 角色。 */
  async create(
    input: CreateAdminUserInput,
    operatorId: string,
  ): Promise<AdminUserListItem> {
    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      throw new BadRequestException('用户名需为 3-30 位字母/数字/下划线');
    }
    if (input.password.length < 8 || input.password.length > 72) {
      throw new BadRequestException('密码长度需在 8-72 位之间');
    }
    const roleKeys = (input.roleKeys ?? ['user']).filter((k) => typeof k === 'string' && k.length > 0);
    assertAllowedRoleKeys(roleKeys);
    const roleEntities = await this.roles.findBy(
      roleKeys.length ? roleKeys.map((key) => ({ key })) : { key: 'user' },
    );
    if (!roleEntities.length) throw new BadRequestException('角色配置缺失');

    const userId = await this.snowflake.nextId();
    try {
      await this.dataSource.transaction(async (manager) => {
        const savedUser = manager.getRepository(UserEntity).create({
          userId,
          username,
          password: await hash(input.password, BCRYPT_ROUNDS),
          status: input.status ?? 'active',
          creater: '超级管理员',
          createrId: operatorId,
          operator: '超级管理员',
          operatorId: operatorId,
          roles: roleEntities,
        });
        await manager.getRepository(UserEntity).save(savedUser);
        const savedProfile = manager.getRepository(UserProfileEntity).create({
          userId,
          email,
          nickname: input.nickname?.trim() || username,
          creater: '超级管理员',
          createrId: operatorId,
          operator: '超级管理员',
          operatorId: operatorId,
        });
        await manager.getRepository(UserProfileEntity).save(savedProfile);
      });
    } catch (e) {
      if (isDuplicateKey(e)) {
        throw new ConflictException('用户名或邮箱已被占用');
      }
      throw e;
    }
    return this.detail(userId);
  }

  /** 修改账号状态（active/inactive/banned）。不允许操作自己。 */
  async setStatus(
    targetUserId: string,
    status: AdminSetStatus,
    operatorId: string,
  ): Promise<AdminUserListItem> {
    if (targetUserId === operatorId) {
      throw new BadRequestException('不能修改自己的账号状态');
    }
    const user = await this.users.findOne({ where: { userId: targetUserId } });
    if (!user) throw new NotFoundException('用户不存在');
    user.status = status;
    user.operator = '超级管理员';
    user.operatorId = operatorId;
    await this.users.save(user);
    return this.detail(targetUserId);
  }

  /**
   * 全量替换用户角色。不允许操作自己。
   * 至少保留一个角色（不能把自己/别人变成无角色的黑户）。
   */
  async assignRoles(
    targetUserId: string,
    roleKeys: AllowedRoleKey[],
    operatorId: string,
  ): Promise<AdminUserListItem> {
    if (targetUserId === operatorId) {
      throw new BadRequestException('不能修改自己的角色，避免误操作丢失权限');
    }
    const cleanKeys = (roleKeys ?? []).filter((k) => typeof k === 'string' && k.length > 0);
    if (!cleanKeys.length) {
      throw new BadRequestException('至少要分配一个角色');
    }
    assertAllowedRoleKeys(cleanKeys);
    const target = await this.users.findOne({
      where: { userId: targetUserId },
      relations: { roles: true },
    });
    if (!target) throw new NotFoundException('用户不存在');
    const newRoles = await this.roles.findBy(cleanKeys.map((key) => ({ key })));
    if (newRoles.length !== cleanKeys.length) {
      throw new BadRequestException('指定的角色不存在');
    }
    target.roles = newRoles;
    target.operator = '超级管理员';
    target.operatorId = operatorId;
    await this.users.save(target);
    // 角色变了，把该用户的会话版本 +1，强制重新登录
    await this.users.update({ userId: targetUserId }, {
      sessionVersion: () => 'session_version + 1',
    });
    await this.dataSource
      .getRepository(RefreshTokenEntity)
      .createQueryBuilder()
      .delete()
      .where('user_id = :userId', { userId: targetUserId })
      .execute();
    return this.detail(targetUserId);
  }

  /** 管理员重置用户密码。重置后强制下线。 */
  async resetPassword(
    targetUserId: string,
    newPassword: string,
    operatorId: string,
  ): Promise<{ success: true }> {
    if (newPassword.length < 8 || newPassword.length > 72) {
      throw new BadRequestException('密码长度需在 8-72 位之间');
    }
    const target = await this.users.findOne({ where: { userId: targetUserId } });
    if (!target) throw new NotFoundException('用户不存在');
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(UserEntity).update(
        { userId: targetUserId },
        {
          password: await hash(newPassword, BCRYPT_ROUNDS),
          operator: '超级管理员',
          operatorId: operatorId,
          sessionVersion: target.sessionVersion + 1,
        },
      );
      await manager
        .getRepository(RefreshTokenEntity)
        .createQueryBuilder()
        .delete()
        .where('user_id = :userId', { userId: targetUserId })
        .execute();
    });
    return { success: true };
  }

  async listAllRoles() {
    const rows = await this.roles.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      sortOrder: r.sortOrder,
    }));
  }

  async createRole(key: string, name: string, description?: string, sortOrder?: number) {
    if (!key || !name) throw new BadRequestException('角色 key 和名称不能为空');
    if (!/^[a-z0-9_]+$/.test(key)) throw new BadRequestException('角色 key 只能用小写字母、数字、下划线');
    const exists = await this.roles.findOne({ where: { key } });
    if (exists) throw new ConflictException('角色 key 已存在');
    // 未显式指定排序时追加到列表末尾（取当前最大排序值 + 10）
    let order = typeof sortOrder === 'number' && Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : null;
    if (order === null) {
      const max = await this.roles
        .createQueryBuilder('r')
        .select('MAX(r.sort_order)', 'max')
        .getRawOne<{ max: number | null }>();
      order = (max?.max ?? 0) + 10;
    }
    const r = this.roles.create({ key, name, description: description ?? '', sortOrder: order });
    await this.roles.save(r);
    return { success: true };
  }

  async deleteRole(key: string) {
    if (['user', 'admin', 'super_admin'].includes(key)) {
      throw new BadRequestException('内置角色不能删除');
    }
    await this.roles.delete({ key });
    return { success: true };
  }

  async updateRole(key: string, body: { name?: string; description?: string; sortOrder?: number }) {
    const r = await this.roles.findOne({ where: { key } });
    if (!r) throw new NotFoundException('角色不存在');
    if (body.name) r.name = body.name;
    if (body.description !== undefined) r.description = body.description;
    if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) {
      r.sortOrder = Math.trunc(body.sortOrder);
    }
    await this.roles.save(r);
    return { success: true };
  }

  /**
   * 批量重排角色顺序（前端上移/下移后提交完整的有序 key 列表）。
   * 校验传入集合必须与数据库现有角色完全一致，避免漏排/多排导致顺序错乱。
   * 重新按 10、20、30… 编号，为后续插入留出中间空档。
   */
  async reorderRoles(keys: string[]) {
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new BadRequestException('排序数据不能为空');
    }
    const all = await this.roles.find();
    if (all.length !== keys.length || new Set(keys).size !== keys.length) {
      throw new BadRequestException('角色数量不匹配，排序失败');
    }
    const existingKeys = new Set(all.map((r) => r.key));
    if (keys.some((k) => !existingKeys.has(k))) {
      throw new BadRequestException('包含不存在的角色，排序失败');
    }
    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < keys.length; i++) {
        await manager.update(RoleEntity, { key: keys[i] }, { sortOrder: (i + 1) * 10 });
      }
    });
    return { success: true };
  }
}
