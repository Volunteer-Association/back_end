-- MySQL 8.0+ 全新数据库结构。已有数据库请使用 migrations 中与当前版本匹配的迁移。
-- 本文件只维护一套完整初始化结构，不依赖其他重复的建表 SQL。

CREATE TABLE IF NOT EXISTS `pms_user` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '雪花算法用户id',
  `login_name` VARCHAR(60) NOT NULL COMMENT '登录账号',
  `password` VARCHAR(255) NULL DEFAULT NULL COMMENT '密码哈希，第三方登录用户为空',
  `enable` TINYINT NOT NULL DEFAULT 0 COMMENT '账号状态：0正常、1锁定、2停用',
  `is_allow_multi` TINYINT NULL DEFAULT 0 COMMENT '是否允许多处同时登录：0不允许、1允许',
  `session_version` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '会话版本，用于立即撤销旧 Access Token',
  `last_login_ip` VARCHAR(50) NULL DEFAULT NULL COMMENT '最后登录IP',
  `last_login_time` DATETIME NULL COMMENT '最后登录时间',
  `creater` VARCHAR(50) NOT NULL DEFAULT '系统' COMMENT '创建人',
  `creater_id` VARCHAR(50) NOT NULL DEFAULT 'system' COMMENT '创建人ID',
  `operator` VARCHAR(50) NULL DEFAULT '系统' COMMENT '最后操作人',
  `operator_id` VARCHAR(50) NULL DEFAULT 'system' COMMENT '最后操作人ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pms_user_user_id` (`user_id`),
  UNIQUE KEY `uq_pms_user_login_name` (`login_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户认证账号表';

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '关联pms_user.user_id',
  `email` VARCHAR(100) NOT NULL COMMENT '用户邮箱',
  `nickname` VARCHAR(60) NULL COMMENT '用户昵称',
  `avatar` VARCHAR(255) NULL COMMENT '用户头像地址',
  `mobile` VARCHAR(11) NULL COMMENT '手机号',
  `sex` TINYINT NULL DEFAULT 2 COMMENT '用户性别：0女、1男、2保密',
  `creater` VARCHAR(50) NOT NULL DEFAULT '系统' COMMENT '创建人',
  `creater_id` VARCHAR(50) NOT NULL DEFAULT 'system' COMMENT '创建人ID',
  `operator` VARCHAR(50) NULL DEFAULT '系统' COMMENT '最后操作人',
  `operator_id` VARCHAR(50) NULL DEFAULT 'system' COMMENT '最后操作人ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_user_id` (`user_id`),
  UNIQUE KEY `uq_users_email` (`email`),
  CONSTRAINT `fk_users_account`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户详细信息表';

CREATE TABLE IF NOT EXISTS `email_verifications` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '表id',
  `email` VARCHAR(100) NOT NULL COMMENT '待验证邮箱',
  `code_hash` CHAR(64) NOT NULL COMMENT '验证码HMAC摘要',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `last_sent_at` DATETIME NOT NULL COMMENT '最近发送时间',
  `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已尝试次数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email_verifications_email` (`email`),
  KEY `idx_email_verifications_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='注册邮箱验证码';

CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '表id',
  `role_key` VARCHAR(50) NOT NULL COMMENT '角色标识',
  `name` VARCHAR(100) NOT NULL COMMENT '角色名称',
  `description` VARCHAR(255) NULL COMMENT '角色说明',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_role_key` (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色表';

CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '雪花算法用户id',
  `role_id` INT NOT NULL COMMENT '角色ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_roles` (`user_id`, `role_id`),
  CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户角色关联表';

CREATE TABLE IF NOT EXISTS `oauth_identities` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '雪花算法用户id',
  `provider` ENUM('gitee', 'github') NOT NULL COMMENT '第三方平台',
  `provider_user_id` VARCHAR(100) NOT NULL COMMENT '第三方平台用户id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_oauth_provider_user` (`provider`, `provider_user_id`),
  KEY `idx_oauth_identities_user_id` (`user_id`),
  CONSTRAINT `fk_oauth_identities_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='第三方账号关联表';

CREATE TABLE IF NOT EXISTS `oauth_login_codes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `code_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '登录交换码哈希',
  `provider` ENUM('gitee', 'github') NOT NULL COMMENT '第三方平台',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '雪花算法用户id',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `used_at` DATETIME NULL COMMENT '使用时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_oauth_login_codes_code_hash` (`code_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OAuth登录交换码表';

CREATE TABLE IF NOT EXISTS `oauth_states` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `state_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'OAuth state哈希',
  `provider` ENUM('gitee', 'github') NOT NULL COMMENT '第三方平台',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '雪花算法用户id',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `used_at` DATETIME NULL COMMENT '使用时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_oauth_states_state_hash` (`state_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OAuth状态表';

CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '雪花算法用户id',
  `token_hash` CHAR(64) NOT NULL COMMENT 'Refresh Token SHA-256摘要',
  `user_agent` VARCHAR(255) NULL COMMENT '设备UA',
  `ip` VARCHAR(45) NULL COMMENT '登录IP',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `revoked_at` DATETIME NULL COMMENT '撤销时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refresh_tokens_token_hash` (`token_hash`),
  KEY `idx_refresh_tokens_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Refresh Token表';

CREATE TABLE IF NOT EXISTS `auth_login_attempts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `email` VARCHAR(100) NOT NULL COMMENT '登录邮箱',
  `bucket_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '登录限流桶的HMAC-SHA256',
  `fail_count` INT NOT NULL DEFAULT 0 COMMENT '连续失败次数',
  `locked_until` DATETIME NULL COMMENT '锁定截止时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_login_attempts_bucket` (`bucket_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='登录失败限流计数表';

CREATE TABLE IF NOT EXISTS `files` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '雪花算法用户id',
  `original_name` VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `stored_path` VARCHAR(255) NOT NULL COMMENT '存储路径',
  `mime_type` VARCHAR(100) NOT NULL COMMENT 'MIME类型',
  `size_bytes` BIGINT NOT NULL COMMENT '文件大小（字节）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_files_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文件信息表';

CREATE TABLE IF NOT EXISTS `logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `level` ENUM('info', 'warn', 'error') NOT NULL DEFAULT 'info' COMMENT '日志级别',
  `category` ENUM('event', 'http') NOT NULL DEFAULT 'event' COMMENT '日志类型',
  `message` TEXT NOT NULL COMMENT '日志内容',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '雪花算法用户id',
  `ip_address` VARCHAR(45) NULL COMMENT '请求来源IP',
  `user_agent` TEXT NULL COMMENT '请求客户端标识',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_logs_created_at` (`created_at`),
  KEY `idx_logs_level` (`level`),
  KEY `idx_logs_category` (`category`),
  KEY `idx_logs_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='审计日志表';

CREATE TABLE IF NOT EXISTS `bills` (
  `id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '雪花算法账单ID',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '账单所属用户ID',
  `type` ENUM('income', 'expense') NOT NULL COMMENT '账单类型',
  `category` VARCHAR(40) NOT NULL COMMENT '收支分类',
  `amount` DECIMAL(12, 2) NOT NULL COMMENT '金额',
  `transaction_date` DATE NOT NULL COMMENT '交易日期',
  `note` VARCHAR(500) NULL COMMENT '备注',
  `paid_at` DATETIME NULL COMMENT '支付时间（已支付账单才有值）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_bills_user_date` (`user_id`, `transaction_date`),
  KEY `idx_bills_user_type_category` (`user_id`, `type`, `category`),
  CONSTRAINT `fk_bills_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='个人收支账单';

-- ===== 钱包支付系统 =====

CREATE TABLE IF NOT EXISTS `user_balances` (
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '用户ID',
  `balance_cents` BIGINT NOT NULL DEFAULT 0 COMMENT '账户余额，单位分',
  `version` INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户余额表';

CREATE TABLE IF NOT EXISTS `recharge_orders` (
  `id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '充值单号',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `amount_cents` BIGINT NOT NULL COMMENT '充值金额，单位分',
  `channel` ENUM('alipay', 'wechat', 'bank') NOT NULL COMMENT '充值渠道',
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  `user_note` VARCHAR(200) NULL COMMENT '用户备注',
  `reviewed_by` VARCHAR(30) NULL COMMENT '审核人',
  `review_note` VARCHAR(200) NULL COMMENT '审核备注',
  `reviewed_at` DATETIME NULL COMMENT '审核时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_recharges_user` (`user_id`),
  KEY `idx_recharges_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='充值申请表';

CREATE TABLE IF NOT EXISTS `balance_transactions` (
  `id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '流水号',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `type` ENUM('recharge', 'consume', 'refund', 'transfer_out', 'transfer_in', 'adjust') NOT NULL,
  `amount_cents` BIGINT NOT NULL COMMENT '变动金额，带符号，单位分',
  `balance_after_cents` BIGINT NOT NULL COMMENT '变动后余额，单位分',
  `ref_type` VARCHAR(32) NULL COMMENT '关联业务类型',
  `ref_id` VARCHAR(30) NULL COMMENT '关联业务单号',
  `note` VARCHAR(200) NULL COMMENT '流水说明',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_txn_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='余额流水表';

-- ===== 数据字典 =====

CREATE TABLE IF NOT EXISTS `dict_items` (
  `id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '雪花算法字典项ID',
  `dict_type` VARCHAR(64) NOT NULL COMMENT '字典类型，如 bill_category',
  `dict_key` VARCHAR(64) NOT NULL COMMENT '字典分组键，如 income / expense',
  `item_value` VARCHAR(64) NOT NULL COMMENT '字典项显示值',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序，小在前',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dict_type_key` (`dict_type`, `dict_key`),
  KEY `idx_dict_type_key` (`dict_type`, `dict_key`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='数据字典表';

-- ===== 幂等性 =====

CREATE TABLE IF NOT EXISTS `idempotency_keys` (
  `idem_key` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '幂等键（前端 UUID）',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `action` VARCHAR(32) NOT NULL COMMENT '操作类型（transfer/refund/adjust）',
  `response_json` MEDIUMTEXT NOT NULL COMMENT '第一次的响应缓存',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idem_key`),
  KEY `idx_idem_user` (`user_id`, `action`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='幂等性记录表';
