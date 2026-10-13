-- Add explicit log categories so admin filters query a database field.
ALTER TABLE `logs`
  ADD COLUMN `category` ENUM('audit', 'http') NOT NULL DEFAULT 'audit'
    COMMENT '日志类型' AFTER `level`,
  ADD KEY `idx_logs_category` (`category`);

-- Existing request logs are identifiable by the message format emitted by the HTTP middleware.
UPDATE `logs`
SET `category` = 'http'
WHERE `message` LIKE 'HTTP %';
