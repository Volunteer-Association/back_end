import type { BillType } from '../../../mysql/entities/bill.entity.js';

export const BILL_CATEGORIES: Record<BillType, readonly string[]> = {
  income: ['工资', '奖金', '投资', '其他收入'],
  expense: ['餐饮', '购物', '交通', '住房', '娱乐', '医疗', '教育', '其他支出'],
};
