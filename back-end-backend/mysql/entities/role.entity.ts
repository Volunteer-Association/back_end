import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity.js';

@Entity({ name: 'roles' })
@Index('uq_roles_role_key', ['key'], { unique: true })
export class RoleEntity {
  @PrimaryGeneratedColumn({ comment: '表id' })
  id: number;

  @Column({
    name: 'role_key',
    type: 'varchar',
    length: 50,
    comment: '角色标识',
  })
  key: string;

  @Column({ type: 'varchar', length: 100, comment: '角色名称' })
  name: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '角色说明',
  })
  description: string | null;

  @Column({
    name: 'sort_order',
    type: 'int',
    default: 0,
    comment: '排序值，越小越靠前；角色管理中可调整',
  })
  sortOrder: number;

  @ManyToMany(() => UserEntity, (user) => user.roles)
  users: UserEntity[];

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
}
