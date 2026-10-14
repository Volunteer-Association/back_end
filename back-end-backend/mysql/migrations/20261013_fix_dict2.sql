-- 重建账单分类字典数据
-- dict_type = bill_category_income / bill_category_expense
-- dict_key = 分类key（salary/food）
-- item_value = 显示名（工资/餐饮）

DELETE FROM `dict_items` WHERE `dict_type` LIKE 'bill_category%';

INSERT INTO `dict_items` (`id`, `dict_type`, `dict_key`, `item_value`, `sort_order`, `enabled`) VALUES
-- 收入类
('101', 'bill_category_income', 'salary', '工资', 1, 1),
('102', 'bill_category_income', 'bonus', '奖金', 2, 1),
('103', 'bill_category_income', 'investment', '投资收益', 3, 1),
('104', 'bill_category_income', 'parttime', '兼职收入', 4, 1),
('105', 'bill_category_income', 'other', '其他收入', 99, 1),
-- 支出类
('201', 'bill_category_expense', 'food', '餐饮', 1, 1),
('202', 'bill_category_expense', 'shopping', '购物', 2, 1),
('203', 'bill_category_expense', 'transport', '交通', 3, 1),
('204', 'bill_category_expense', 'entertainment', '娱乐', 4, 1),
('205', 'bill_category_expense', 'housing', '住房', 5, 1),
('206', 'bill_category_expense', 'medical', '医疗', 6, 1),
('207', 'bill_category_expense', 'education', '教育', 7, 1),
('208', 'bill_category_expense', 'communication', '通讯', 8, 1),
('209', 'bill_category_expense', 'other', '其他支出', 99, 1);
