ALTER TABLE users ADD COLUMN real_name VARCHAR(50) NULL COMMENT '实名认证真实姓名' AFTER address;
ALTER TABLE users ADD COLUMN verify_status TINYINT DEFAULT 0 COMMENT '实名审核状态' AFTER real_name;
ALTER TABLE users ADD COLUMN verified_at DATETIME NULL AFTER verify_status;
ALTER TABLE users ADD COLUMN verify_reject_reason VARCHAR(255) NULL AFTER verified_at;
