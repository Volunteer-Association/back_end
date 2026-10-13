-- 兼容先前已增加 audit/http 分类字段的数据库，并统一改为 event/http。
ALTER TABLE `logs`
  MODIFY COLUMN `category` ENUM('audit', 'event', 'http') NOT NULL DEFAULT 'audit'
    COMMENT '日志类型';

UPDATE `logs`
SET `category` = 'event'
WHERE `category` = 'audit';

ALTER TABLE `logs`
  MODIFY COLUMN `category` ENUM('event', 'http') NOT NULL DEFAULT 'event'
    COMMENT '日志类型';
