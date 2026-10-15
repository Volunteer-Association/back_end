import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { UserEntity } from './user.entity.js';

@Entity({ name: 'users' })
@Index('uq_users_user_id', ['userId'], { unique: true })
@Index('uq_users_email', ['email'], { unique: true })
export class UserProfileEntity {
  @PrimaryGeneratedColumn({ comment: '表id' })
  id: number;

  @Column({
    name: 'user_id',
    type: 'varchar',
    length: 30,
    comment: '关联pms_user.user_id',
  })
  userId: string;

  @Column({ type: 'varchar', length: 100, comment: '用户邮箱' })
  email: string;

  @Column({
    type: 'varchar',
    length: 60,
    nullable: true,
    comment: '用户昵称',
  })
  nickname: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '用户头像地址',
  })
  avatar: string | null;

  @Column({
    type: 'varchar',
    length: 11,
    nullable: true,
    comment: '手机号',
  })
  mobile: string | null;

  @Column({
    name: 'payment_password_hash',
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: '支付密码哈希（bcrypt）。为空表示尚未设置支付密码；'
      + '支付/转账等涉及余额变动的操作必须校验。支付密码与登录密码独立。',
  })
  paymentPasswordHash: string | null;

  @Column({
    type: 'tinyint',
    nullable: true,
    default: 2,
    comment: '用户性别：0女、1男、2保密',
  })
  sex: number | null;

  @Column({
    name: 'id_type',
    type: 'tinyint',
    nullable: true,
    comment: '证件类型：1身份证、2护照、3港澳通行证、4台胞证、9其他',
  })
  idType: number | null;

  @Column({
    name: 'id_number',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '证件号码',
  })
  idNumber: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '联系地址',
  })
  address: string | null;

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

  @OneToOne(() => UserEntity, (account) => account.profile, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'userId',
    foreignKeyConstraintName: 'fk_users_account',
  })
  account: Relation<UserEntity>;

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
