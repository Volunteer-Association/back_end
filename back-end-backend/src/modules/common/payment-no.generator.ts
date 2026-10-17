import { Injectable } from '@nestjs/common';
import type { BalanceTxnType } from '../../../mysql/entities/index.js';

/**
 * 钱包 / 支付业务单号生成器（独立于用户体系的雪花 ID 生成器）。
 *
 * 设计参考真实支付系统：
 * - 流水号（对外支付流水号）：28 位纯数字，一眼能看出业务类型与发生时间，
 *   并带 2 位 mod97 校验位，便于核对/客服检索/防误录。
 * - 充值单号、转账单号、账单单号：带业务前缀（CZ / TF / BILL）+ 时间 + 序列，
 *   与纯数字流水号明显区分。
 *
 * 内部仍保留 BIGINT 雪花主键（用于关联、外键、排序），这些业务单号只用于对外展示、
 * 对账与检索，并在数据库上加唯一索引兜底。
 */

/** 流水类型码（流水号前 2 位）。 */
const TXN_TYPE_CODES: Record<BalanceTxnType, string> = {
  recharge: '10',
  transfer_out: '20',
  transfer_in: '21',
  consume: '30',
  refund: '40',
  adjust: '50',
  withdraw_out: '60',
  withdraw_refund: '61',
  red_packet_out: '70',
  red_packet_in: '71',
  red_packet_refund: '72',
};

const SEQ_MOD = 1_000_000;

function pad(n: number | string, len: number): string {
  return String(n).padStart(len, '0');
}

/** 本地时间各部分（服务器为 Asia/Shanghai，统一按本地时区入号）。 */
function timeParts(d: Date) {
  const dateTime =
    pad(d.getFullYear() % 100, 2) +
    pad(d.getMonth() + 1, 2) +
    pad(d.getDate(), 2) +
    pad(d.getHours(), 2) +
    pad(d.getMinutes(), 2) +
    pad(d.getSeconds(), 2); // yyMMddHHmmss，共 12 位
  return { dateTime, ms: pad(d.getMilliseconds(), 3) };
}

/** 对一段纯数字串计算 mod97 校验位（00-96），用 BigInt 避免大整数溢出。 */
function mod97(digits: string): string {
  return pad(Number(BigInt(digits) % 97n), 2);
}

/** 生成「前缀 + 12 位时间 + 6 位序列 + 4 位随机」的业务单号（前缀 + 22 位）。 */
function bizNo(
  prefix: string,
  dateTime: string,
  seq: number,
  rand: number,
): string {
  return `${prefix}${dateTime}${pad(seq, 6)}${pad(rand, 4)}`;
}

@Injectable()
export class PaymentNoGenerator {
  /** 进程内严格递增序列（0..999999 循环），配合毫秒时间保证同毫秒不重复。 */
  private seq = 0;
  /** 节点码（000-999），多实例部署时区分进程，启动时固定。 */
  private readonly node = pad((process.pid * 31 + Math.floor(Math.random() * 1000)) % 1000, 3);

  private nextSeq(): number {
    this.seq = (this.seq + 1) % SEQ_MOD;
    return this.seq;
  }

  /**
   * 生成 28 位支付流水号：
   * 类型码(2) + yyMMdd(6) + HHmmss(6) + 毫秒(3) + 节点(3) + 序列(6) + 校验(2)
   */
  nextTxnNo(type: BalanceTxnType): string {
    const { dateTime, ms } = timeParts(new Date());
    const body =
      TXN_TYPE_CODES[type] + dateTime + ms + this.node + pad(this.nextSeq(), 6);
    return body + mod97(body);
  }

  /** 生成充值业务单号：CZ + 12 位时间 + 6 位序列 + 4 位随机，共 24 位。 */
  nextRechargeOrderNo(): string {
    const { dateTime } = timeParts(new Date());
    return bizNo('CZ', dateTime, this.nextSeq(), Math.floor(Math.random() * 10000));
  }

  /** 生成转账业务单号：TF + 12 位时间 + 6 位序列 + 4 位随机，共 24 位。 */
  nextTransferNo(): string {
    const { dateTime } = timeParts(new Date());
    return bizNo('TF', dateTime, this.nextSeq(), Math.floor(Math.random() * 10000));
  }

  /** 生成账单业务单号：BILL + 12 位时间 + 6 位序列 + 4 位随机，共 26 位。 */
  nextBillNo(): string {
    const { dateTime } = timeParts(new Date());
    return bizNo('BILL', dateTime, this.nextSeq(), Math.floor(Math.random() * 10000));
  }

  /** 生成提现实业务单号：TX + 12 位时间 + 6 位序列 + 4 位随机，共 24 位。 */
  nextWithdrawNo(): string {
    const { dateTime } = timeParts(new Date());
    return bizNo('TX', dateTime, this.nextSeq(), Math.floor(Math.random() * 10000));
  }
}
