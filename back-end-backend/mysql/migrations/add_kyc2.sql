ALTER TABLE users ADD COLUMN verify_status TINYINT DEFAULT 0 COMMENT 'KYC status' AFTER real_name;
ALTER TABLE users ADD COLUMN verified_at DATETIME NULL AFTER verify_status;
ALTER TABLE users ADD COLUMN verify_reject_reason VARCHAR(255) NULL AFTER verified_at;
