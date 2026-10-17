import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { BalanceTransactionEntity } from '../../../mysql/entities/balance-transaction.entity.js';
import { UserBalanceEntity } from '../../../mysql/entities/user-balance.entity.js';
import { PaymentNoGenerator } from '../common/payment-no.generator.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RiskService } from './risk.service.js';

@Injectable()
export class RedPacketService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paymentNo: PaymentNoGenerator,
    private readonly notifications: NotificationsService,
    private readonly risk: RiskService,
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

    // 校验支付密码
    const profile = await this.dataSource.query(
      `SELECT payment_password_hash FROM users WHERE user_id = ?`,
      [senderId],
    );
    const ph = (profile as any[])[0];
    if (!ph?.payment_password_hash) throw new BadRequestException('请先设置支付密码');
    const ok = await bcrypt.compare(body.paymentPassword, ph.payment_password_hash);
    if (!ok) throw new BadRequestException('支付密码错误');

    const packetId = this.paymentNo.nextTxnNo('red_packet_out');
    const expiredAt = new Date(Date.now() + 24 * 3600 * 1000);

    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const bal = await manager.findOne(UserBalanceEntity, { where: { userId: senderId } });
      const current = bal ? Number(bal.balanceCents) : 0;
      if (current < amountCents) throw new BadRequestException('余额不足');

      bal!.balanceCents = String(current - amountCents);
      bal!.version += 1;
      await manager.save(bal);

      await manager.save(BalanceTransactionEntity, {
        id: packetId + '-t',
        txnNo: packetId,
        userId: senderId,
        type: 'red_packet_out' as any,
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
    const packet = (await this.dataSource.query(
      `SELECT * FROM red_packets WHERE id = ? AND status = 'open'`,
      [packetId],
    )) as any[];
    const p = packet[0];
    if (!p) throw new BadRequestException('红包不存在或已过期');
    if (p.sender_id === receiverId) throw new BadRequestException('不能领自己发的红包');
    if (new Date() > p.expired_at) throw new BadRequestException('红包已过期');

    // 是否已领
    const received = await this.dataSource.query(
      `SELECT id FROM red_packet_receivers WHERE packet_id = ? AND receiver_id = ?`,
      [packetId, receiverId],
    );
    if ((received as any[]).length) throw new BadRequestException('你已领取过该红包');

    const amount = Number(p.total_cents);

    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await manager.query(
        `INSERT INTO red_packet_receivers (packet_id, receiver_id, amount_cents) VALUES (?, ?, ?)`,
        [packetId, receiverId, amount],
      );

      const bal = await manager.findOne(UserBalanceEntity, { where: { userId: receiverId } });
      const current = bal ? Number(bal.balanceCents) : 0;
      bal!.balanceCents = String(current + amount);
      bal!.version += 1;
      await manager.save(bal);

      const txnNo = this.paymentNo.nextTxnNo('red_packet_in');
      await manager.save(BalanceTransactionEntity, {
        id: txnNo,
        txnNo,
        userId: receiverId,
        type: 'red_packet_in' as any,
        amountCents: String(amount),
        balanceAfterCents: String(current + amount),
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
      userId: p.sender_id,
      type: 'red_packet',
      title: '红包已被领取',
      content: `你的 ¥${(amount / 100).toFixed(2)} 红包已被对方领取。`,
      bizType: 'red_packet',
      bizId: packetId,
    });

    return { amountYuan: (amount / 100).toFixed(2) };
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
