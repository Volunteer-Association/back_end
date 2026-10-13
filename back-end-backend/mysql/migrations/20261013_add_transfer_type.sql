ALTER TABLE balance_transactions
  MODIFY COLUMN type ENUM('recharge','consume','refund','transfer_out','transfer_in','adjust') NOT NULL;
