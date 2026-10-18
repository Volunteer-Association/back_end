-- ============================================================
-- 一次性运维脚本：回滚旧版“对账修复”按钮错误产生的流水
--
-- 背景：旧版“修复”调用的是普通“余额调整”（双边记账），余额与流水同时
--       变动，差异 diff = 余额 - 流水加总 恒定不变，导致“修复后仍显示异常”，
--       还误扣了用户余额、生成一笔错误的 -¥1.00 调整流水。
--       本脚本删除这些错误流水，并把余额表按流水加总做单边修正（不写流水）。
--
-- 受影响单据（来自页面截图，均为 -¥1.00、备注“管理员调整：对账修复：…”）：
--   369871363457941504 chenguihui : 5026101800382366393400000442
--   369872164607754240 牧尘       : 5026101800382650393400000588
--   369874207749701632 业务员     : 5026101800382826493400000617
--
-- 安全：
--   1. 仅删除满足“type=adjust 且 amount=-100 且备注前缀为对账修复”的流水，
--      条件不符不会误删；
--   2. 逐用户事务 + 行锁，同时删除对应的错误通知；
--   3. 删除后按“流水加总”单边修正余额，保证余额 == 流水（账实平衡）；
--   4. 末尾给出每个受影响用户的差异验证（diff_cents 应为 0）。
-- 幂等：已删除的流水不会再匹配，重复执行安全。
--
-- 执行（项目根目录，PowerShell）：
--   Get-Content -Raw .\back-end-backend\mysql\migrations\undo_bad_reconcile_repair.sql `
--     | docker exec -i back-end-mysql mysql -uroot -p<密码> back_end
-- 若还有其他同类错误流水，把其 txn_no 追加到下面的临时表即可。
-- ============================================================

-- 待回滚的错误流水（txn_no）
DROP TEMPORARY TABLE IF EXISTS tmp_bad_repair;
CREATE TEMPORARY TABLE tmp_bad_repair (
  txn_no VARCHAR(32) PRIMARY KEY
) ENGINE=Memory;
INSERT INTO tmp_bad_repair (txn_no) VALUES
  ('5026101800382366393400000442'),
  ('5026101800382650393400000588'),
  ('5026101800382826493400000617');

-- 记录受影响用户（删除前先固化，删除后无法再从流水反查）
DROP TEMPORARY TABLE IF EXISTS tmp_affected_users;
CREATE TEMPORARY TABLE tmp_affected_users (
  user_id VARCHAR(30) PRIMARY KEY
) ENGINE=Memory;
INSERT INTO tmp_affected_users (user_id)
  SELECT DISTINCT t.user_id
  FROM balance_transactions t
  JOIN tmp_bad_repair b ON t.txn_no = b.txn_no
  WHERE t.type = 'adjust'
    AND t.amount_cents = -100
    AND t.note LIKE '管理员调整：对账修复：%';

DROP PROCEDURE IF EXISTS pr_undo_bad_repair;
DELIMITER //
CREATE PROCEDURE pr_undo_bad_repair()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE v_uid VARCHAR(30);
  DECLARE v_bal DECIMAL(18,0);
  DECLARE v_sum DECIMAL(18,0);
  DECLARE cur CURSOR FOR SELECT user_id FROM tmp_affected_users;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur;
  each_user: LOOP
    FETCH cur INTO v_uid;
    IF done THEN LEAVE each_user; END IF;

    START TRANSACTION;
      -- 锁定该用户余额行
      SELECT balance_cents INTO v_bal
        FROM user_balances WHERE user_id = v_uid FOR UPDATE;

      -- 删除这些错误流水对应的“余额扣减”通知（biz_id 为流水主键 id）
      DELETE n
      FROM notifications n
      JOIN balance_transactions t
        ON n.biz_id = t.id AND n.biz_type = 'admin_adjust'
      JOIN tmp_bad_repair b ON t.txn_no = b.txn_no
      WHERE t.user_id = v_uid AND n.user_id = v_uid;

      -- 删除错误的“对账修复”流水（多重条件，防误删）
      DELETE t
      FROM balance_transactions t
      JOIN tmp_bad_repair b ON t.txn_no = b.txn_no
      WHERE t.user_id = v_uid
        AND t.type = 'adjust'
        AND t.amount_cents = -100
        AND t.note LIKE '管理员调整：对账修复：%';

      -- 删除后按流水加总单边修正余额（不写流水，等价于“以流水为准”修复）
      SELECT COALESCE(SUM(amount_cents), 0) INTO v_sum
        FROM balance_transactions WHERE user_id = v_uid;

      UPDATE user_balances
        SET balance_cents = v_sum,
            version = version + 1,
            updated_at = NOW()
        WHERE user_id = v_uid;
    COMMIT;
  END LOOP;
  CLOSE cur;
END //
DELIMITER ;

CALL pr_undo_bad_repair();
DROP PROCEDURE IF EXISTS pr_undo_bad_repair;

-- 验证：受影响用户的 余额 - 流水加总 应为 0
SELECT u.user_id,
       b.balance_cents,
       COALESCE(s.txn_sum, 0) AS txn_sum_cents,
       COALESCE(b.balance_cents, 0) - COALESCE(s.txn_sum, 0) AS diff_cents
FROM tmp_affected_users u
LEFT JOIN user_balances b ON b.user_id = u.user_id
LEFT JOIN (
  SELECT user_id, SUM(amount_cents) AS txn_sum
  FROM balance_transactions GROUP BY user_id
) s ON s.user_id = u.user_id;

DROP TEMPORARY TABLE IF EXISTS tmp_bad_repair;
DROP TEMPORARY TABLE IF EXISTS tmp_affected_users;
