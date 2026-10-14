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
