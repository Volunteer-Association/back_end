-- 登录限流只保存由 JWT_SECRET 派生的 HMAC 桶标识，不存储原始账号或 IP。
CREATE TABLE IF NOT EXISTS `auth_login_attempts` (
  `bucket_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '登录限流桶的 HMAC-SHA256',
  `failure_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前时间窗口内失败次数',
  `window_started_at` DATETIME NOT NULL COMMENT '计数窗口开始时间（UTC）',
  `locked_until` DATETIME NULL COMMENT '限流解除时间（UTC）',
  `last_attempt_at` DATETIME NOT NULL COMMENT '最后一次失败时间（UTC）',
  PRIMARY KEY (`bucket_hash`),
  KEY `idx_auth_login_attempts_last_attempt_at` (`last_attempt_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录失败限流计数表';
