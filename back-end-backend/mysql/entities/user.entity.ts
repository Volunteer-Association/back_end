import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { RoleEntity } from './role.entity.js';
import { UserProfileEntity } from './user-profile.entity.js';

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'inactive' | 'banned';

export function mapEnabledStatus(enabled: unknown): UserStatus {
  if (enabled === 'active' || enabled === 'inactive' || enabled === 'banned') {
    return enabled;
  }
  const normalized =
    enabled === 0 || enabled === '0'
      ? 0
      : enabled === 1 || enabled === '1'
        ? 1
        : enabled === 2 || enabled === '2'
          ? 2
          : -1;
  return normalized === 0
    ? 'active'
    : normalized === 1
      ? 'inactive'
      : 'banned';
}

const statusTransformer: ValueTransformer = {
  to: (status: UserStatus) =>
    status === 'active' ? 0 : status === 'inactive' ? 1 : 2,
  from: mapEnabledStatus,
};

@Entity({ name: 'pms_user' })
@Index('uq_pms_user_user_id', ['userId'], { unique: true })
@Index('uq_pms_user_login_name', ['username'], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true, comment: '表id' })
  id: number;

  @Column({
    name: 'user_id',
    type: 'varchar',
    length: 30,
    comment: '雪花算法用户id',
  })
  userId: string;

  @Column({
    name: 'login_name',
    type: 'varchar',
    length: 60,
    comment: '登录账号',
  })
  username: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
    comment: '密码哈希',
  })
  password: string | null;

  @Column({
    name: 'enable',
    type: 'tinyint',
    default: 0,
    transformer: statusTransformer,
    comment: '账号状态：0正常、1锁定、2停用',
  })
  status: UserStatus;

  @Column({
    name: 'is_allow_multi',
    type: 'tinyint',
    nullable: true,
    default: 0,
    comment: '是否允许多处同时登录：0不允许、1允许',
  })
  isAllowMulti: number | null;

  @Column({
    name: 'session_version',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '会话版本，用于立即撤销旧 Access Token',
  })
  sessionVersion: number;

  @Column({
    name: 'last_login_ip',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '最后登录IP',
  })
  lastLoginIp: string | null;

  @Column({
    name: 'last_login_time',
    type: 'datetime',
    nullable: true,
    comment: '最后登录时间',
  })
  lastLoginAt: Date | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: '系统',
    comment: '创建人',
  })
  creater: string;

  @Column({
    name: 'creater_id',
    type: 'varchar',
    length: 50,
    default: 'system',
    comment: '创建人ID',
  })
  createrId: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    default: '系统',
    comment: '最后操作人',
  })
  operator: string | null;

  @Column({
    name: 'operator_id',
    type: 'varchar',
    length: 50,
    nullable: true,
    default: 'system',
    comment: '最后操作人ID',
  })
  operatorId: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
    comment: '更新时间',
  })
  updatedAt: Date;

  @OneToOne(() => UserProfileEntity, (profile) => profile.account)
  profile: Relation<UserProfileEntity> | null;

  @ManyToMany(() => RoleEntity)
  @JoinTable({
    name: 'user_roles',
    joinColumn: {
      name: 'user_id',
      referencedColumnName: 'userId',
      foreignKeyConstraintName: 'fk_user_roles_user',
    },
    inverseJoinColumn: {
      name: 'role_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_user_roles_role',
    },
  })
  roles: RoleEntity[];

  get email(): string {
    return this.profile?.email ?? '';
  }

  get nickname(): string | null {
    return this.profile?.nickname ?? null;
  }

  get avatar(): string | null {
    return this.profile?.avatar ?? null;
  }

  get role(): UserRole {
    return this.roles?.some((role) => role.key === 'admin') ? 'admin' : 'user';
  }
}
