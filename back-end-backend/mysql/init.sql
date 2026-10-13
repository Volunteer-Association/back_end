-- MySQL 8.0+ 全新数据库结构。已有数据库请使用 migrations 中与当前版本匹配的迁移。
-- 本文件只维护一套完整初始化结构，不依赖其他重复的建表 SQL。

CREATE TABLE IF NOT EXISTS `pms_user` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '雪花算法用户id',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户认证账号表';

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '关联pms_user.user_id',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户详细信息表';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='注册邮箱验证码';

CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '角色表id',
  `role_key` VARCHAR(50) NOT NULL COMMENT '角色标识',
  `name` VARCHAR(100) NOT NULL COMMENT '角色名称',
  `description` VARCHAR(255) NULL COMMENT '角色说明',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_role_key` (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '雪花算法用户id',
  `role_id` INT NOT NULL COMMENT '角色表id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
  PRIMARY KEY (`user_id`, `role_id`),
  KEY `idx_user_roles_role_id` (`role_id`),
  CONSTRAINT `fk_user_roles_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户角色关联表';

INSERT INTO `roles` (`role_key`, `name`, `description`)
VALUES
  ('user', '普通用户', '默认普通用户角色'),
  ('admin', '管理员', '系统管理员角色')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`);

CREATE TABLE IF NOT EXISTS `oauth_identities` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '表id',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '雪花算法用户id',
  `provider` ENUM('gitee', 'github') NOT NULL COMMENT '第三方平台',
  `provider_user_id` VARCHAR(100) NOT NULL COMMENT '第三方平台用户id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_oauth_provider_user` (`provider`, `provider_user_id`),
  KEY `idx_oauth_identities_user_id` (`user_id`),
  CONSTRAINT `fk_oauth_identities_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='第三方账号关联表';

CREATE TABLE IF NOT EXISTS `oauth_login_codes` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '表id',
  `code_hash` CHAR(64) NOT NULL COMMENT '登录交换码哈希',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '雪花算法用户id',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_oauth_login_codes_code_hash` (`code_hash`),
  KEY `idx_oauth_login_codes_expires_at` (`expires_at`),
  CONSTRAINT `fk_oauth_login_codes_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OAuth登录交换码表';

CREATE TABLE IF NOT EXISTS `oauth_states` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '表id',
  `state_hash` CHAR(64) NOT NULL COMMENT 'OAuth state哈希',
  `provider` ENUM('gitee', 'github') NOT NULL COMMENT '第三方平台',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '雪花算法用户id',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_oauth_states_state_hash` (`state_hash`),
  KEY `idx_oauth_states_expires_at` (`expires_at`),
  CONSTRAINT `fk_oauth_states_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OAuth状态表';

CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '表id',
  `token_hash` CHAR(64) NOT NULL COMMENT 'Refresh Token哈希',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '雪花算法用户id',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refresh_tokens_token_hash` (`token_hash`),
  KEY `idx_refresh_tokens_user_id` (`user_id`),
  KEY `idx_refresh_tokens_expires_at` (`expires_at`),
  CONSTRAINT `fk_refresh_tokens_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Refresh Token表';

CREATE TABLE IF NOT EXISTS `auth_login_attempts` (
  `bucket_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '登录限流桶的HMAC-SHA256',
  `failure_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前时间窗口内失败次数',
  `window_started_at` DATETIME NOT NULL COMMENT '计数窗口开始时间（UTC）',
  `locked_until` DATETIME NULL COMMENT '限流解除时间（UTC）',
  `last_attempt_at` DATETIME NOT NULL COMMENT '最后一次失败时间（UTC）',
  PRIMARY KEY (`bucket_hash`),
  KEY `idx_auth_login_attempts_last_attempt_at` (`last_attempt_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录失败限流计数表';

CREATE TABLE IF NOT EXISTS `files` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '表id',
  `filename` VARCHAR(255) NOT NULL COMMENT '存储文件名',
  `original_name` VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `mime_type` VARCHAR(100) NOT NULL COMMENT '文件MIME类型',
  `size` BIGINT NOT NULL COMMENT '文件大小（字节）',
  `path` VARCHAR(500) NOT NULL COMMENT '文件存储路径',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '雪花算法用户id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  PRIMARY KEY (`id`),
  KEY `idx_files_user_id` (`user_id`),
  CONSTRAINT `fk_files_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件信息表';

CREATE TABLE IF NOT EXISTS `logs` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '表id',
  `level` ENUM('info', 'warn', 'error') NOT NULL DEFAULT 'info' COMMENT '日志级别',
  `category` ENUM('event', 'http') NOT NULL DEFAULT 'event' COMMENT '日志类型',
  `message` TEXT NOT NULL COMMENT '日志内容',
  `user_id` VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '雪花算法用户id',
  `ip_address` VARCHAR(45) NULL COMMENT '请求来源IP',
  `user_agent` TEXT NULL COMMENT '请求客户端标识',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_logs_created_at` (`created_at`),
  KEY `idx_logs_level` (`level`),
  KEY `idx_logs_category` (`category`),
  KEY `idx_logs_user_id` (`user_id`),
  CONSTRAINT `fk_logs_user`
    FOREIGN KEY (`user_id`) REFERENCES `pms_user` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审计日志表';
