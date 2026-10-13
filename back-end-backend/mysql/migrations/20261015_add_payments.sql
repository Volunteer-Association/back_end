-- 账单支付功能：为 bills 表增加 paid_at 字段，并新建 payment_orders 表。
-- 执行前请备份数据库。

-- 1. bills 表增加支付完成时间
ALTER TABLE `bills`
  ADD COLUMN `paid_at` DATETIME NULL DEFAULT NULL COMMENT '支付完成时间；为空表示尚未支付' AFTER `note`;

-- 2. 新建支付单表
CREATE TABLE IF NOT EXISTS `payment_orders` (
  `id` VARCHAR(30) NOT NULL COMMENT '雪花算法支付单ID',
  `user_id` VARCHAR(30) NOT NULL COMMENT '支付用户ID',
  `bill_id` VARCHAR(30) NOT NULL COMMENT '关联账单ID',
  `channel` ENUM('alipay','wechat') NOT NULL COMMENT '支付渠道',
  `amount` DECIMAL(12,2) NOT NULL COMMENT '支付金额',
  `status` ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending' COMMENT '支付状态',
  `transaction_id` VARCHAR(64) NULL DEFAULT NULL COMMENT '第三方交易号',
  `paid_at` DATETIME NULL DEFAULT NULL COMMENT '支付完成时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_payment_user_status` (`user_id`, `status`),
  KEY `idx_payment_bill` (`bill_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付单记录';
