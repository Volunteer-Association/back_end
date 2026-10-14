import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DictItemEntity } from '../../../mysql/entities/index.js';
import {
  SNOWFLAKE_ID_GENERATOR,
  SnowflakeIdGenerator,
} from '../../../mysql/snowflake-id.js';

export interface DictItemInput {
  dictType: string;
  dictKey: string;
  itemValue: string;
  sortOrder?: number;
  enabled?: boolean;
}

/**
 * 字典类型注册表：全项目字典类型的唯一登记入口。
 *
 * 为什么要有注册表：dictType 是技术字符串（如 bill_category_expense），
 * 之前让管理员在表单里自由输入，结果填错类型、脏数据混进账单下拉。
 * 现在前端所有类型下拉都从这里取；新增业务字典时加一行，
 * 不再需要在前后端各自写魔法字符串。
 */
export interface DictTypeOption {
  /** 对应 dict_items.dict_type，技术字符串 */
  value: string;
  /** 界面展示名 */
  label: string;
  /** 该类型下 dictKey 的填写说明（给管理员表单用） */
  keyHint: string;
}

export const DICT_TYPE_OPTIONS: DictTypeOption[] = [
  {
    value: 'bill_category_income',
    label: '账单·收入分类',
    keyHint: '英文标识，如 salary；同一类型内保持唯一',
  },
  {
    value: 'bill_category_expense',
    label: '账单·支出分类',
    keyHint: '英文标识，如 food；同一类型内保持唯一',
  },
];

@Injectable()
export class DictService {
  constructor(
    @InjectRepository(DictItemEntity)
    private readonly repo: Repository<DictItemEntity>,
    @Inject(SNOWFLAKE_ID_GENERATOR)
    private readonly idGenerator: SnowflakeIdGenerator,
  ) {}

  /** 业务侧查询：只返回启用项，按 sortOrder 升序。 */
  async listEnabled(dictType: string): Promise<DictItemEntity[]> {
    return this.repo.find({
      where: { dictType, enabled: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  /** 管理员查询全部，可按类型过滤。 */
  async listAll(dictType?: string): Promise<DictItemEntity[]> {
    return this.repo.find({
      where: dictType ? { dictType } : {},
      order: { dictType: 'ASC', dictKey: 'ASC', sortOrder: 'ASC' },
    });
  }

  /** 返回字典类型注册表，供前端类型下拉使用。 */
  listTypes(): DictTypeOption[] {
    return DICT_TYPE_OPTIONS;
  }

  async create(input: DictItemInput): Promise<DictItemEntity> {
    if (!input.dictType?.trim() || !input.itemValue?.trim()) {
      throw new BadRequestException('字典类型和显示值不能为空');
    }
    const exists = await this.repo.findOne({
      where: {
        dictType: input.dictType.trim(),
        dictKey: input.dictKey.trim(),
        itemValue: input.itemValue.trim(),
      },
    });
    if (exists) throw new BadRequestException('相同的字典项已存在');

    const item = this.repo.create({
      id: await this.idGenerator.nextId(),
      dictType: input.dictType.trim(),
      dictKey: input.dictKey.trim(),
      itemValue: input.itemValue.trim(),
      sortOrder: input.sortOrder ?? 0,
      enabled: input.enabled ?? true,
    });
    return this.repo.save(item);
  }

  async update(id: string, input: Partial<DictItemInput>): Promise<DictItemEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('字典项不存在');
    if (input.dictType !== undefined) item.dictType = input.dictType.trim();
    if (input.dictKey !== undefined) item.dictKey = input.dictKey.trim();
    if (input.itemValue !== undefined) item.itemValue = input.itemValue.trim();
    if (input.sortOrder !== undefined) item.sortOrder = input.sortOrder;
    if (input.enabled !== undefined) item.enabled = input.enabled;
    return this.repo.save(item);
  }

  async remove(id: string): Promise<{ success: true }> {
    const result = await this.repo.delete({ id });
    if (!result.affected) throw new NotFoundException('字典项不存在');
    return { success: true };
  }

  /**
   * 账单服务专用：判断某类型下某分类是否在启用字典中。
   *
   * 字典约定：收入/支出各是一个字典类型
   *   dict_type  = bill_category_income / bill_category_expense
   *   dict_key   = 分类英文键（salary / food ...）
   *   item_value = 中文显示名（工资 / 餐饮 ...），即账单表 bills.category 存的值。
   * 因此校验时按 dict_type + item_value 匹配。
   */
  async isCategoryAllowed(
    type: 'income' | 'expense',
    category: string,
  ): Promise<boolean> {
    const count = await this.repo.count({
      where: {
        dictType: `bill_category_${type}`,
        itemValue: category,
        enabled: true,
      },
    });
    return count > 0;
  }
}
