-- 数据字典：新建 dict_items 表并初始化账单分类。
-- 执行前请备份数据库。

CREATE TABLE IF NOT EXISTS `dict_items` (
  `id` VARCHAR(30) NOT NULL COMMENT '雪花算法字典项ID',
  `dict_type` VARCHAR(64) NOT NULL COMMENT '字典类型，如 bill_category',
  `dict_key` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '分组键，如 income / expense',
  `item_value` VARCHAR(64) NOT NULL COMMENT '显示值',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序，小在前',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dict_type_key` (`dict_type`, `dict_key`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据字典项';

-- 初始化账单分类（dict_type=bill_category；dict_key=income/expense）。
-- 注意：id 为占位值，实际由雪花算法生成；此处用确定性字符串便于重复执行时不冲突。
INSERT INTO `dict_items` (`id`, `dict_type`, `dict_key`, `item_value`, `sort_order`, `enabled`) VALUES
  ('INIT_INCOME_01', 'bill_category', 'income',  '工资',       10, 1),
  ('INIT_INCOME_02', 'bill_category', 'income',  '奖金',       20, 1),
  ('INIT_INCOME_03', 'bill_category', 'income',  '投资',       30, 1),
  ('INIT_INCOME_04', 'bill_category', 'income',  '其他收入',   99, 1),
  ('INIT_EXPENSE_01','bill_category', 'expense', '餐饮',       10, 1),
  ('INIT_EXPENSE_02','bill_category', 'expense', '购物',       20, 1),
  ('INIT_EXPENSE_03','bill_category', 'expense', '交通',       30, 1),
  ('INIT_EXPENSE_04','bill_category', 'expense', '住房',       40, 1),
  ('INIT_EXPENSE_05','bill_category', 'expense', '娱乐',       50, 1),
  ('INIT_EXPENSE_06','bill_category', 'expense', '医疗',       60, 1),
  ('INIT_EXPENSE_07','bill_category', 'expense', '教育',       70, 1),
  ('INIT_EXPENSE_08','bill_category', 'expense', '其他支出',   99, 1)
ON DUPLICATE KEY UPDATE `item_value` = VALUES(`item_value`);
