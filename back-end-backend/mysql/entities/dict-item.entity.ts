import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'dict_items' })
@Index('idx_dict_type_key', ['dictType', 'dictKey', 'sortOrder'])
export class DictItemEntity {
  @PrimaryColumn({
    type: 'varchar',
    length: 30,
    comment: '雪花算法字典项ID',
  })
  id: string;

  @Column({
    name: 'dict_type',
    type: 'varchar',
    length: 64,
    comment: '字典类型，如 bill_category',
  })
  dictType: string;

  @Column({
    name: 'dict_key',
    type: 'varchar',
    length: 64,
    comment: '字典分组键，如 income / expense；可空',
  })
  dictKey: string;

  @Column({
    name: 'item_value',
    type: 'varchar',
    length: 64,
    comment: '字典项显示值',
  })
  itemValue: string;

  @Column({
    name: 'sort_order',
    type: 'int',
    default: 0,
    comment: '排序，小在前',
  })
  sortOrder: number;

  @Column({
    type: 'boolean',
    default: true,
    comment: '是否启用',
  })
  enabled: boolean;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
  })
  updatedAt: Date;
}
