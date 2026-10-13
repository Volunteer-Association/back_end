CREATE TABLE IF NOT EXISTS `bills` (
  `id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '雪花算法账单ID',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '账单所属用户ID',
  `type` ENUM('income', 'expense') NOT NULL COMMENT '账单类型',
  `category` VARCHAR(40) NOT NULL COMMENT '收支分类',
  `amount` DECIMAL(12, 2) NOT NULL COMMENT '金额',
  `transaction_date` DATE NOT NULL COMMENT '交易日期',
  `note` VARCHAR(500) NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_bills_user_date` (`user_id`, `transaction_date`),
  KEY `idx_bills_user_type_category` (`user_id`, `type`, `category`),
  CONSTRAINT `fk_bills_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='个人收支账单';
