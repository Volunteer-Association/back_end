-- ============================================================
-- 一次性运维脚本：补提某笔提现按旧规则（最低1元）多收的手续费
--
-- 背景：旧提现手续费 = max(申请金额 × 0.10%, 1元)，已修正为
--       手续费 = 申请金额 × 0.10%（无最低手续费，四舍五入到分）。
--       本脚本对已按旧规则打款、确实多收手续费的提现单退还差额。
--
-- 特性：
--   1. 幂等：用固定流水号 FR+提现单号，重复执行不会重复退款；
--   2. 安全：仅当提现单“已打款(status=1)”且“旧手续费 > 新手续费”才退款；
--   3. 对账一致：同时给 user_balances 加余额、写一笔 type=adjust 的
--      balance_transactions（与官方“管理员余额调整”同口径），并给用户发通知；
--   4. 全程事务 + 行锁，失败回滚。
--
-- 如需补退其他单据，只需修改下面的 @wd_id 后重新执行。
-- 执行方式（在项目根目录）：
--   docker exec -i back-end-mysql mysql -uroot -p<password> back_end < 本文件
-- ============================================================

-- 目标提现单号（截图这笔：申请 ¥10.53，旧手续费 ¥1.00，应为 ¥0.01，退 ¥0.99）
SET @wd_id := 'TX2610180010040000036710';

DROP PROCEDURE IF EXISTS pr_refund_withdraw_fee;
DELIMITER //
CREATE PROCEDURE pr_refund_withdraw_fee()
BEGIN
  DECLARE v_uid VARCHAR(30);
  DECLARE v_amt BIGINT DEFAULT 0;
  DECLARE v_old_fee BIGINT DEFAULT 0;
  DECLARE v_status INT DEFAULT -1;
  DECLARE v_correct_fee BIGINT;
  DECLARE v_refund BIGINT;
  DECLARE v_bal DECIMAL(18,0);
  DECLARE v_after DECIMAL(18,0);
  DECLARE v_txn_id VARCHAR(32);
  DECLARE v_note VARCHAR(255);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SELECT user_id, amount_cents, fee_cents, status
    INTO v_uid, v_amt, v_old_fee, v_status
    FROM withdrawals WHERE id = @wd_id LIMIT 1;

  IF v_uid IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '提现单不存在，请核对单号';
  END IF;

  SET v_correct_fee = ROUND(v_amt * 0.001);   -- 新规则：0.10%，四舍五入到分
  SET v_refund = v_old_fee - v_correct_fee;   -- 多收差额

  IF v_status <> 1 OR v_refund <= 0 THEN
    SELECT '无需退款（状态非已打款，或不存在多收差额）' AS result,
           v_status AS status,
           v_old_fee AS old_fee_cents,
           v_correct_fee AS correct_fee_cents,
           v_refund AS refund_cents;
  ELSE
    SET v_txn_id = CONCAT('FR', @wd_id);      -- 固定流水号，保证幂等
    IF EXISTS (SELECT 1 FROM balance_transactions WHERE id = v_txn_id) THEN
      SELECT '该单据已补退过，本次跳过（幂等）' AS result, v_txn_id AS txn_id;
    ELSE
      START TRANSACTION;
        SELECT balance_cents INTO v_bal
          FROM user_balances WHERE user_id = v_uid FOR UPDATE;
        IF v_bal IS NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '用户余额账户不存在，停止自动补退';
        END IF;

        SET v_after = v_bal + v_refund;
        UPDATE user_balances
          SET balance_cents = v_after,
              version = version + 1,
              updated_at = NOW()
          WHERE user_id = v_uid;

        SET v_note = CONCAT(
          '提现手续费补退：单号 ', @wd_id,
          '，原手续费 ¥', FORMAT(v_old_fee / 100, 2),
          '，按0.10%应为 ¥', FORMAT(v_correct_fee / 100, 2),
          '，退还差额 ¥', FORMAT(v_refund / 100, 2));

        INSERT INTO balance_transactions
          (id, txn_no, user_id, type, amount_cents, balance_after_cents,
           ref_type, ref_id, note, created_at)
        VALUES
          (v_txn_id, v_txn_id, v_uid, 'adjust', v_refund, v_after,
           'withdraw', @wd_id, v_note, NOW());

        INSERT INTO notifications
          (user_id, type, title, content, is_read, biz_type, biz_id, created_at)
        VALUES
          (v_uid, 'balance_adjusted', '手续费补退通知',
           CONCAT('您的提现单 ', @wd_id, ' 按新费率 0.10% 核算后多收手续费 ¥',
                  FORMAT(v_refund / 100, 2), '，已退回至账户余额。'),
           0, 'admin_adjust', v_txn_id, NOW());
      COMMIT;

      SELECT '补退成功' AS result,
             v_uid AS user_id,
             @wd_id AS withdrawal_id,
             v_old_fee AS old_fee_cents,
             v_correct_fee AS correct_fee_cents,
             v_refund AS refund_cents,
             FORMAT(v_refund / 100, 2) AS refund_yuan,
             v_after AS balance_after_cents;
    END IF;
  END IF;
END //
DELIMITER ;

CALL pr_refund_withdraw_fee();
DROP PROCEDURE IF EXISTS pr_refund_withdraw_fee;
