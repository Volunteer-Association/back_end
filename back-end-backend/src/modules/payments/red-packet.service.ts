import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BalanceTransactionEntity } from '../../../mysql/entities/balance-transaction.entity.js';
import { UserBalanceEntity } from '../../../mysql/entities/user-balance.entity.js';
import { PaymentNoGenerator } from '../common/payment-no.generator.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RiskService } from './risk.service.js';
import { PaymentPasswordService } from './payment-password.service.js';

/** 红包有效期：24 小时。 */
const RED_PACKET_TTL_MS = 24 * 3600 * 1000;
/** 单次定时扫描最多处理的红包数量，避免一次性占用过多长事务。 */
const EXPIRED_SCAN_BATCH = 100;

/** red_packets 表行（原生 SQL 查询，字段为下划线命名）。 */
interface RedPacketRow {
  id: string;
  sender_id: string;
  total_cents: number | string;
  received_cents: number | string;
  status: string;
  greeting: string | null;
  expired_at: Date;
}

@Injectable()
export class RedPacketService {
  private readonly logger = new Logger(RedPacketService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly paymentNo: PaymentNoGenerator,
    private readonly notifications: NotificationsService,
    private readonly risk: RiskService,
    private readonly paymentPassword: PaymentPasswordService,
  ) {}

  /** 发红包：扣余额，生成红包单 */
  async send(senderId: string, body: {
    toEmail: string; amountYuan: string; greeting?: string; paymentPassword: string;
  }) {
    const amountCents = Math.round(Number(body.amountYuan) * 100);
    if (!amountCents || amountCents < 100) throw new BadRequestException('红包金额不能小于 1 元');
    const singleMax = (await this.risk.getNum('redpacket_single_max_yuan', 2000)) * 100;
    if (amountCents > singleMax) throw new BadRequestException(`单个红包不能超过 ${(singleMax / 100).toFixed(0)} 元`);

    // 查收款人
    const rows = await this.dataSource.query(
      `SELECT user_id FROM users WHERE email = ?`,
      [body.toEmail],
    );
    const toUser = (rows as any[])[0];
    if (!toUser) throw new BadRequestException('收款人邮箱不存在');
    if (toUser.user_id === senderId) throw new BadRequestException('不能给自己发红包');

    // 校验支付密码（含连续错误 5 次锁定，统一走 PaymentPasswordService）
    await this.paymentPassword.verify(senderId, body.paymentPassword);

    const packetId = this.paymentNo.nextTxnNo('red_packet_out');
    const expiredAt = new Date(Date.now() + RED_PACKET_TTL_MS);

    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // 悲观行锁：并发发红包/转账/退款时串行化，避免余额超扣。
      const bal = await manager.findOne(UserBalanceEntity, {
        where: { userId: senderId },
        lock: { mode: 'pessimistic_write' },
      });
      const current = bal ? Number(bal.balanceCents) : 0;
      if (current < amountCents) throw new BadRequestException('余额不足');

      bal!.balanceCents = String(current - amountCents);
      bal!.version += 1;
      await manager.save(bal);

      await manager.save(BalanceTransactionEntity, {
        id: packetId + '-t',
        txnNo: packetId,
        userId: senderId,
        type: 'red_packet_out',
        amountCents: String(-amountCents),
        balanceAfterCents: String(current - amountCents),
        refType: 'red_packet',
        refId: packetId,
        note: `红包发给 ${body.toEmail}`,
      });

      await manager.query(
        `INSERT INTO red_packets (id, sender_id, total_cents, count, type, greeting, status, expired_at)
         VALUES (?, ?, ?, 1, 'normal', ?, 'open', ?)`,
        [packetId, senderId, amountCents, body.greeting || '恭喜发财', expiredAt],
      );
    });

    // 给接收方发通知
    await this.notifications.createSafe({
      userId: toUser.user_id,
      type: 'red_packet',
      title: '你收到一个红包',
      content: `有人给你发了 ¥${(amountCents / 100).toFixed(2)} 红包，点击领取。`,
      bizType: 'red_packet',
      bizId: packetId,
    });

    return { packetId, amountYuan: (amountCents / 100).toFixed(2) };
  }

  /** 领红包 */
  async receive(receiverId: string, packetId: string) {
    let amount = 0;
    let senderId = '';

    // 全部检查与余额变动放在同一事务，并用 FOR UPDATE 锁定红包行：
    // 防止「领取」与「过期退款」并发，或同一用户重复点击导致双花。
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const packets = (await manager.query(
        `SELECT * FROM red_packets WHERE id = ? FOR UPDATE`,
        [packetId],
      )) as RedPacketRow[];
      const p = packets[0];
      if (!p) throw new BadRequestException('红包不存在');
      if (p.sender_id === receiverId) throw new BadRequestException('不能领自己发的红包');
      if (p.status !== 'open') throw new BadRequestException('红包已被领取或已过期');
      if (new Date(p.expired_at).getTime() <= Date.now()) {
        throw new BadRequestException('红包已过期');
      }

      // 是否已领（表上也有 UNIQUE(packet_id, receiver_id) 兜底）
      const received = await manager.query(
        `SELECT id FROM red_packet_receivers WHERE packet_id = ? AND receiver_id = ?`,
        [packetId, receiverId],
      );
      if ((received as any[]).length) throw new BadRequestException('你已领取过该红包');

      amount = Number(p.total_cents);
      senderId = p.sender_id;

      await manager.query(
        `INSERT INTO red_packet_receivers (packet_id, receiver_id, amount_cents) VALUES (?, ?, ?)`,
        [packetId, receiverId, amount],
      );

      // 锁定接收方余额行再加钱（不存在则创建，收款方可能第一次有钱入账）
      let bal = await manager.findOne(UserBalanceEntity, {
        where: { userId: receiverId },
        lock: { mode: 'pessimistic_write' },
      });
      const after = (bal ? Number(bal.balanceCents) : 0) + amount;
      if (!bal) {
        bal = manager.create(UserBalanceEntity, {
          userId: receiverId,
          balanceCents: String(after),
          version: 1,
        });
      } else {
        bal.balanceCents = String(after);
        bal.version += 1;
      }
      await manager.save(bal);

      const txnNo = this.paymentNo.nextTxnNo('red_packet_in');
      await manager.save(BalanceTransactionEntity, {
        id: txnNo,
        txnNo,
        userId: receiverId,
        type: 'red_packet_in',
        amountCents: String(amount),
        balanceAfterCents: String(after),
        refType: 'red_packet',
        refId: packetId,
        note: '收到红包',
      });

      // 标记红包已领完
      await manager.query(
        `UPDATE red_packets SET status = 'done', received_cents = ? WHERE id = ?`,
        [amount, packetId],
      );
    });

    // 给发送方发通知
    await this.notifications.createSafe({
      userId: senderId,
      type: 'red_packet',
      title: '红包已被领取',
      content: `你的 ¥${(amount / 100).toFixed(2)} 红包已被对方领取。`,
      bizType: 'red_packet',
      bizId: packetId,
    });

    return { amountYuan: (amount / 100).toFixed(2) };
  }

  /**
   * 扫描并退回所有「已过期但仍为 open」的红包。
   *
   * 由定时任务周期性调用。每个红包单独事务：
   * 1. FOR UPDATE 锁定红包行，复查 status 仍为 open（多实例/重复执行时只有一个能成功）；
   * 2. 应退金额 = 红包总额 - 已被领取金额（单红包未领时即为全额；
   *    未来群红包部分领取时退未领部分）；
   * 3. 锁定发送方余额行加回退款，写 red_packet_refund 流水；
   * 4. 红包状态置为 expired。
   *
   * 返回本次扫描处理的红包数与退款总额。
   */
  async refundExpiredPackets(): Promise<{ scanned: number; refunded: number; refundCents: number }> {
    const rows = await this.dataSource.query(
      `SELECT id FROM red_packets
       WHERE status = 'open' AND expired_at <= NOW()
       ORDER BY expired_at ASC
       LIMIT ?`,
      [EXPIRED_SCAN_BATCH],
    );
    const ids = (rows as Array<{ id: string }>).map((r) => r.id);

    let refunded = 0;
    let refundCentsTotal = 0;

    for (const packetId of ids) {
      let refundCents = 0;
      let senderId = '';
      try {
        await this.dataSource.transaction('READ COMMITTED', async (manager) => {
          const packets = (await manager.query(
            `SELECT * FROM red_packets WHERE id = ? FOR UPDATE`,
            [packetId],
          )) as RedPacketRow[];
          const p = packets[0];

          // 行锁拿到后再复查：可能已被领取（done）或被其它实例退款（expired）。
          if (!p || p.status !== 'open') return;

          const total = Number(p.total_cents);
          const received = Number(p.received_cents ?? 0);
          refundCents = total - received;
          senderId = p.sender_id;

          if (refundCents > 0) {
            const bal = await manager.findOne(UserBalanceEntity, {
              where: { userId: p.sender_id },
              lock: { mode: 'pessimistic_write' },
            });
            // 发红包时一定存在余额行；不存在属于异常数据，记录并跳过，不误置状态。
            if (!bal) {
              throw new Error(`发送方余额记录不存在，无法退回红包 ${packetId}`);
            }
            const after = Number(bal.balanceCents) + refundCents;
            bal.balanceCents = String(after);
            bal.version += 1;
            await manager.save(bal);

            const txnNo = this.paymentNo.nextTxnNo('red_packet_refund');
            await manager.save(BalanceTransactionEntity, {
              id: txnNo,
              txnNo,
              userId: p.sender_id,
              type: 'red_packet_refund',
              amountCents: String(refundCents),
              balanceAfterCents: String(after),
              refType: 'red_packet',
              refId: packetId,
              note: '红包过期未领，原路退回',
            });
          }

          await manager.query(
            `UPDATE red_packets SET status = 'expired' WHERE id = ?`,
            [packetId],
          );
        });
      } catch (error) {
        // 单个红包退款失败不阻断整批扫描，下个周期会再次捞到（仍是 open）。
        this.logger.error(
          `过期红包退款失败 packetId=${packetId}：${(error as Error)?.message ?? String(error)}`,
        );
        continue;
      }

      if (refundCents > 0) {
        refunded += 1;
        refundCentsTotal += refundCents;
        await this.notifications.createSafe({
          userId: senderId,
          type: 'red_packet',
          title: '红包已过期退回',
          content: `你发出的 ¥${(refundCents / 100).toFixed(2)} 红包超过 24 小时未被领取，已退回你的余额。`,
          bizType: 'red_packet',
          bizId: packetId,
        });
      }
    }

    if (ids.length > 0) {
      this.logger.log(
        `过期红包扫描完成：共 ${ids.length} 个，退款 ${refunded} 个，合计 ¥${(refundCentsTotal / 100).toFixed(2)}`,
      );
    }
    return { scanned: ids.length, refunded, refundCents: refundCentsTotal };
  }

  /** 待领取的红包（发给我但还没领） */
  async myPending(userId: string) {
    const rows = await this.dataSource.query(
      `SELECT p.id, p.total_cents, p.greeting, p.created_at, p.sender_id, u.nickname as sender_name
       FROM red_packets p
       LEFT JOIN users u ON u.user_id = p.sender_id
       WHERE p.status = 'open' AND p.expired_at > NOW() AND p.sender_id != ?
         AND NOT EXISTS (SELECT 1 FROM red_packet_receivers r WHERE r.packet_id = p.id AND r.receiver_id = ?)
       ORDER BY p.created_at DESC`,
      [userId, userId],
    );
    return (rows as any[]).map((r) => ({
      id: r.id,
      amountYuan: (Number(r.total_cents) / 100).toFixed(2),
      greeting: r.greeting,
      from: r.sender_name || r.sender_id,
      createdAt: r.created_at,
    }));
  }

  /** 我收到的红包列表 */
  async myReceived(userId: string) {
    const rows = await this.dataSource.query(
      `SELECT r.id, r.amount_cents, r.received_at, p.sender_id, u.nickname as sender_name
       FROM red_packet_receivers r
       JOIN red_packets p ON p.id = r.packet_id
       LEFT JOIN users u ON u.user_id = p.sender_id
       WHERE r.receiver_id = ? ORDER BY r.received_at DESC`,
      [userId],
    );
    return (rows as any[]).map((r) => ({
      id: r.id,
      amountYuan: (Number(r.amount_cents) / 100).toFixed(2),
      from: r.sender_name || r.sender_id,
      receivedAt: r.received_at,
    }));
  }

  /** 我发的红包列表 */
  async mySent(userId: string) {
    const rows = await this.dataSource.query(
      `SELECT id, total_cents, status, greeting, created_at, expired_at FROM red_packets WHERE sender_id = ? ORDER BY created_at DESC`,
      [userId],
    );
    return (rows as any[]).map((r) => ({
      id: r.id,
      amountYuan: (Number(r.total_cents) / 100).toFixed(2),
      status: r.status,
      greeting: r.greeting,
      createdAt: r.created_at,
    }));
  }
}
