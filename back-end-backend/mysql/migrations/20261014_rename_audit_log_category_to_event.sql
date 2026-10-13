-- Keep compatibility with databases upgraded using the earlier audit/http category migration.
ALTER TABLE `logs`
  MODIFY COLUMN `category` ENUM('audit', 'event', 'http') NOT NULL DEFAULT 'audit'
    COMMENT '日志类型';

UPDATE `logs`
SET `category` = 'event'
WHERE `category` = 'audit';

ALTER TABLE `logs`
  MODIFY COLUMN `category` ENUM('event', 'http') NOT NULL DEFAULT 'event'
    COMMENT '日志类型';
