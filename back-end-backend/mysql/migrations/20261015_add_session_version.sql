-- Run once on existing databases to support single-login session invalidation.
ALTER TABLE `pms_user`
  ADD COLUMN `session_version` INT UNSIGNED NOT NULL DEFAULT 0
  COMMENT '会话版本，用于立即撤销旧 Access Token';

-- Pre-upgrade tokens have no session version; require one fresh login.
DELETE FROM `refresh_tokens`;
