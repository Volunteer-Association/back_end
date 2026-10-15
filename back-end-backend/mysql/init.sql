-- ============================================================
-- 企业精神管理平台 - 数据库初始化脚本
-- MySQL 8.0+，字符集 utf8mb4，排序规则 utf8mb4_0900_ai_ci
-- 全新部署直接执行本文件即可
-- 本文件与 back-end-backend/mysql/entities 下的 TypeORM 实体一一对应
-- 应用启动时 synchronize=false，表结构以本脚本为准
-- ============================================================

-- ============== 1. 用户认证账号表 ==============
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

-- ============== 2. 用户详细信息表 ==============
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

-- ============== 3. 角色表 ==============
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

-- ============== 4. 用户角色关联表 ==============
CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '雪花算法用户id',
  `role_id` INT NOT NULL COMMENT '角色ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_roles` (`user_id`, `role_id`),
  KEY `idx_user_roles_role_id` (`role_id`),
  CONSTRAINT `fk_user_roles_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户角色关联表';

-- ============== 5. 注册邮箱验证码表 ==============
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

-- ============== 6. Refresh Token 表 ==============
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '雪花算法用户id',
  `token_hash` CHAR(64) NOT NULL COMMENT 'Refresh Token哈希',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refresh_tokens_token_hash` (`token_hash`),
  KEY `idx_refresh_tokens_user` (`user_id`),
  CONSTRAINT `fk_refresh_tokens_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Refresh Token表';

-- ============== 7. OAuth 第三方账号关联表 ==============
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

-- ============== 8. OAuth 登录交换码表 ==============
CREATE TABLE IF NOT EXISTS `oauth_login_codes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `code_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '登录交换码哈希',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '雪花算法用户id',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_oauth_login_codes_code_hash` (`code_hash`),
  KEY `idx_oauth_login_codes_user_id` (`user_id`),
  CONSTRAINT `fk_oauth_login_codes_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OAuth登录交换码表';

-- ============== 9. OAuth 状态表（防CSRF） ==============
CREATE TABLE IF NOT EXISTS `oauth_states` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `state_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'OAuth state哈希',
  `provider` ENUM('gitee', 'github') NOT NULL COMMENT '第三方平台',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '雪花算法用户id',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_oauth_states_state_hash` (`state_hash`),
  KEY `idx_oauth_states_user_id` (`user_id`),
  CONSTRAINT `fk_oauth_states_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OAuth状态表';

-- ============== 10. 登录失败限流表 ==============
-- 字段与 src/modules/auth/login-attempt.service.ts 原生 SQL 保持一致：
-- bucket_hash 为 HMAC-SHA256(账号/IP) 摘要，failure_count 在 15 分钟窗口内累计，
-- locked_until 记录临时锁定截止时间，last_attempt_at 用于清理超过 1 天的旧记录。
CREATE TABLE IF NOT EXISTS `auth_login_attempts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `bucket_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '限流桶HMAC-SHA256摘要',
  `failure_count` INT NOT NULL DEFAULT 0 COMMENT '当前窗口内连续失败次数',
  `window_started_at` DATETIME NOT NULL COMMENT '当前失败窗口开始时间（UTC）',
  `locked_until` DATETIME NULL COMMENT '锁定截止时间（UTC）',
  `last_attempt_at` DATETIME NOT NULL COMMENT '最近一次失败尝试时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_login_attempts_bucket` (`bucket_hash`),
  KEY `idx_login_attempts_last_attempt` (`last_attempt_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='登录失败限流计数表';

-- ============== 11. 审计日志表 ==============
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

-- ============== 12. 个人收支账单表 ==============
CREATE TABLE IF NOT EXISTS `bills` (
  `id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '内部主键（雪花ID）',
  `bill_no` VARCHAR(32) NULL COMMENT '对外账单业务单号（BILL 前缀，独立于内部主键）',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '账单所属用户ID',
  `type` ENUM('income', 'expense') NOT NULL COMMENT '账单类型',
  `category` VARCHAR(40) NOT NULL COMMENT '收支分类',
  `amount` DECIMAL(12, 2) NOT NULL COMMENT '金额',
  `transaction_date` DATE NOT NULL COMMENT '交易日期',
  `note` VARCHAR(500) NULL COMMENT '备注',
  `paid_at` DATETIME NULL COMMENT '支付完成时间；为空表示尚未支付',
  `refunded_at` DATETIME NULL COMMENT '退款完成时间；为空表示未退款。与 paid_at 组合出三态：待支付/已支付/已退款(终态)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_bills_bill_no_unique` (`bill_no`),
  KEY `idx_bills_user_date` (`user_id`, `transaction_date`),
  KEY `idx_bills_user_type_category` (`user_id`, `type`, `category`),
  CONSTRAINT `fk_bills_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='个人收支账单';

-- ============== 13. 用户余额表 ==============
CREATE TABLE IF NOT EXISTS `user_balances` (
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '用户ID（与 pms_user.user_id 一致）',
  `balance_cents` BIGINT NOT NULL DEFAULT 0 COMMENT '账户余额，单位分',
  `version` INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号，防并发扣款超卖',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户余额表';

-- ============== 14. 充值申请表 ==============
CREATE TABLE IF NOT EXISTS `recharge_orders` (
  `id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '内部主键（雪花ID）',
  `order_no` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '对外充值业务单号（CZ 前缀，独立于内部主键）',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '用户ID',
  `amount_cents` BIGINT NOT NULL COMMENT '充值金额，单位分',
  `channel` ENUM('alipay', 'wechat', 'bank') NOT NULL COMMENT '用户选择的转账渠道（线下）',
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  `user_note` VARCHAR(200) NULL COMMENT '用户备注，如转账时间、付款人',
  `reviewed_by` VARCHAR(30) NULL COMMENT '审核人',
  `review_note` VARCHAR(200) NULL COMMENT '审核结果说明（驳回原因），用户可见',
  `admin_note` VARCHAR(200) NULL COMMENT '管理员内部备注，仅管理员可见，不对用户展示',
  `reviewed_at` DATETIME NULL COMMENT '审核时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_recharge_order_no_unique` (`order_no`),
  KEY `idx_recharge_user_status` (`user_id`, `status`),
  KEY `idx_recharge_status` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='充值申请表';

-- ============== 15. 余额流水表 ==============
CREATE TABLE IF NOT EXISTS `balance_transactions` (
  `id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '内部主键（雪花ID）',
  `txn_no` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '对外支付流水号（28位业务编号，独立于内部主键）',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '用户ID',
  `type` ENUM('recharge', 'consume', 'refund', 'transfer_out', 'transfer_in', 'adjust') NOT NULL COMMENT '流水类型',
  `amount_cents` BIGINT NOT NULL COMMENT '变动金额，带符号，单位分',
  `balance_after_cents` BIGINT NOT NULL COMMENT '变动后余额，单位分',
  `ref_type` VARCHAR(32) NULL COMMENT '关联业务类型：bill / recharge / transfer / admin_adjust',
  `ref_id` VARCHAR(30) NULL COMMENT '关联业务单号',
  `note` VARCHAR(200) NULL COMMENT '流水说明',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_txn_no_unique` (`txn_no`),
  KEY `idx_txn_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='余额流水表';

-- ============== 16. 数据字典表 ==============
CREATE TABLE IF NOT EXISTS `dict_items` (
  `id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '雪花算法字典项ID',
  `dict_type` VARCHAR(64) NOT NULL COMMENT '字典类型，如 bill_category',
  `dict_key` VARCHAR(64) NOT NULL COMMENT '字典项英文键，如 salary / food；同一 dict_type 下唯一',
  `item_value` VARCHAR(64) NOT NULL COMMENT '字典项显示值',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序，小在前',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dict_type_key` (`dict_type`, `dict_key`),
  KEY `idx_dict_type_key` (`dict_type`, `dict_key`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='数据字典表';

-- ============== 17. 幂等性记录表 ==============
CREATE TABLE IF NOT EXISTS `idempotency_keys` (
  `idem_key` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '幂等键（前端 UUID）',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '用户ID',
  `action` VARCHAR(32) NOT NULL COMMENT '操作类型（transfer/refund/adjust）',
  `response_json` MEDIUMTEXT NOT NULL COMMENT '第一次的响应缓存',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idem_key`),
  KEY `idx_idem_user` (`user_id`, `action`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='幂等性记录表';

-- ============== 18. 站内信通知表 ==============
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '接收用户ID',
  `type` VARCHAR(32) NOT NULL COMMENT '通知类型，如 recharge_approved/recharge_rejected',
  `title` VARCHAR(100) NOT NULL COMMENT '通知标题',
  `content` VARCHAR(500) NOT NULL COMMENT '通知正文',
  `biz_type` VARCHAR(32) NULL COMMENT '关联业务类型，如 recharge',
  `biz_id` VARCHAR(30) NULL COMMENT '关联业务单号',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已读：0未读、1已读',
  `read_at` DATETIME NULL COMMENT '阅读时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_created` (`user_id`, `created_at`),
  KEY `idx_notifications_user_read` (`user_id`, `is_read`),
  CONSTRAINT `fk_notifications_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='站内信通知表';

-- ============================================================
-- 初始数据
-- ============================================================

-- 默认角色
INSERT IGNORE INTO `roles` (`id`, `role_key`, `name`, `description`) VALUES
(1, 'user', '普通用户', '默认注册用户角色'),
(2, 'admin', '管理员', '系统管理员角色');

-- 账单分类字典数据
INSERT IGNORE INTO `dict_items` (`id`, `dict_type`, `dict_key`, `item_value`, `sort_order`, `enabled`) VALUES
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
