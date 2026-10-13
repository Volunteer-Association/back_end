-- 增加明确的日志分类字段，供管理员列表直接按数据库字段筛选。
ALTER TABLE `logs`
  ADD COLUMN `category` ENUM('audit', 'http') NOT NULL DEFAULT 'audit'
    COMMENT '日志类型' AFTER `level`,
  ADD KEY `idx_logs_category` (`category`);

-- 将已有 HTTP 中间件格式的请求记录回填为 http 分类，其余记录归为 event。
UPDATE `logs`
SET `category` = 'http'
WHERE `message` LIKE 'HTTP %';
