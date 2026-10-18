-- ============================================================
-- 历史库升级脚本：对齐 bank_cards 表与 BankCardEntity
-- 适用对象：已用旧版 init.sql 建库的环境（列名为 holder_name / branch，
--           且缺少 is_default / status / updated_at）。
-- 全新部署无需执行本脚本——init.sql 已包含正确结构。
-- 本脚本为一次性升级脚本，请勿在已升级的库上重复执行。
-- ============================================================

ALTER TABLE `bank_cards`
  CHANGE COLUMN `holder_name` `card_holder` VARCHAR(50) NOT NULL COMMENT '持卡人姓名（须与实名认证一致）',
  CHANGE COLUMN `branch` `branch_name` VARCHAR(100) NULL COMMENT '支行名称',
  MODIFY COLUMN `bank_name` VARCHAR(50) NOT NULL COMMENT '开户行名称',
  MODIFY COLUMN `card_no` VARCHAR(30) NOT NULL COMMENT '银行卡号',
  ADD COLUMN `is_default` TINYINT NOT NULL DEFAULT 0 COMMENT '是否默认卡：0否、1是' AFTER `branch_name`,
  ADD COLUMN `status` TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1正常、0已解绑（软删除）' AFTER `is_default`,
  ADD COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;

-- 旧索引 idx_user 与实体声明的 idx_bank_user 等价，保留即可，不影响查询；
-- 如需严格对齐命名，可手动执行：
-- ALTER TABLE `bank_cards` DROP INDEX `idx_user`, ADD INDEX `idx_bank_user` (`user_id`);
