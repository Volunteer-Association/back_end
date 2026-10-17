import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { BankCardEntity } from '../../../mysql/entities/bank-card.entity.js';
import { WithdrawalEntity } from '../../../mysql/entities/withdrawal.entity.js';
import { BalanceTransactionEntity } from '../../../mysql/entities/balance-transaction.entity.js';
import { UserBalanceEntity } from '../../../mysql/entities/user-balance.entity.js';
import { PaymentNoGenerator } from '../common/payment-no.generator.js';
import { RiskService } from './risk.service.js';

/** 提现费率：每笔收 0.1%，最低 1 元（100 分） */
const WITHDRAW_FEE_RATE = 0.001;
const WITHDRAW_FEE_MIN = 100;
const WITHDRAW_MIN = 100;       // 1 元
const WITHDRAW_MAX = 5_000_000; // 5 万

@Injectable()
export class WithdrawService {
  constructor(
    @InjectRepository(BankCardEntity)
    private readonly cards: Repository<BankCardEntity>,
    @InjectRepository(WithdrawalEntity)
    private readonly withdrawals: Repository<WithdrawalEntity>,
    private readonly dataSource: DataSource,
    private readonly paymentNo: PaymentNoGenerator,
    private readonly risk: RiskService,
  ) {}

  // ===== 用户端 =====

  async listCards(userId: string) {
    const rows = await this.cards.find({
      where: { userId, status: 1 },
      order: { isDefault: 'DESC', id: 'DESC' },
    });
    return rows.map((c) => ({
      id: c.id,
      bankName: c.bankName,
      cardNo: this.maskCard(c.cardNo),
      cardHolder: c.cardHolder,
      branchName: c.branchName,
      isDefault: c.isDefault === 1,
    }));
  }

  async addCard(userId: string, body: {
    bankName: string; cardNo: string; cardHolder: string; branchName?: string;
  }) {
    // 必须已实名
    const kyc = await this.dataSource.query(
      `SELECT verify_status, real_name FROM users WHERE user_id = ?`,
      [userId],
    );
    const k = (kyc as any[])[0];
    if (!k || k.verify_status !== 2) throw new BadRequestException('请先完成实名认证');
    if (k.real_name !== body.cardHolder) throw new BadRequestException('持卡人姓名必须与实名认证一致');

    const exists = await this.cards.findOne({
      where: { userId, cardNo: body.cardNo.replace(/\s/g, '') },
    });
    if (exists) throw new BadRequestException('该银行卡已绑定');

    const card = this.cards.create({
      userId,
      bankName: body.bankName,
      cardNo: body.cardNo.replace(/\s/g, ''),
      cardHolder: body.cardHolder,
      branchName: body.branchName ?? null,
      isDefault: 0,
      status: 1,
    });
    const saved = await this.cards.save(card);
    return { id: saved.id };
  }

  async removeCard(userId: string, cardId: number) {
    const card = await this.cards.findOne({ where: { id: cardId, userId } });
    if (!card) throw new NotFoundException('银行卡不存在');
    card.status = 0;
    await this.cards.save(card);
  }

  /** 发起提现：扣余额，写 withdraw 流水，生成待审核单 */
  async requestWithdraw(userId: string, body: {
    bankCardId: number; amountYuan: string; paymentPassword: string;
  }) {
    const amountCents = Math.round(Number(body.amountYuan) * 100);
    if (!amountCents || amountCents < WITHDRAW_MIN) throw new BadRequestException('提现金额不能小于 1 元');
    if (amountCents > WITHDRAW_MAX) throw new BadRequestException('单笔提现不能超过 5 万元');

    // 风控：日累计提现上限
    const dailyMaxCents = (await this.risk.getNum('withdraw_daily_max_yuan', 200000)) * 100;
    const todayOut = await this.risk.todayOutflow(userId, ['withdraw_out']);
    if (todayOut + amountCents > dailyMaxCents) {
      throw new BadRequestException(`今日提现累计已达上限（${(dailyMaxCents / 100).toFixed(0)} 元）`);
    }

    const card = await this.cards.findOne({
      where: { id: body.bankCardId, userId, status: 1 },
    });
    if (!card) throw new NotFoundException('银行卡不存在');

    // 校验支付密码
    const profile = await this.dataSource.query(
      `SELECT payment_password_hash FROM users WHERE user_id = ?`,
      [userId],
    );
    const ph = (profile as any[])[0];
    if (!ph?.payment_password_hash) throw new BadRequestException('请先设置支付密码');
    const ok = await bcrypt.compare(body.paymentPassword, ph.payment_password_hash);
    if (!ok) throw new BadRequestException('支付密码错误');

    const fee = Math.max(Math.round(amountCents * WITHDRAW_FEE_RATE), WITHDRAW_FEE_MIN);
    const actual = amountCents - fee;

    const orderId = this.paymentNo.nextWithdrawNo();
    const txnNo = this.paymentNo.nextTxnNo('withdraw_out');

    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // 检查余额
      const bal = await manager.findOne(UserBalanceEntity, { where: { userId } });
      const current = bal ? Number(bal.balanceCents) : 0;
      if (current < amountCents) throw new BadRequestException('余额不足');

      // 扣余额
      bal!.balanceCents = String(current - amountCents);
      bal!.version += 1;
      await manager.save(bal);

      // 写流水
      await manager.save(BalanceTransactionEntity, {
        id: txnNo,
        txnNo: txnNo,
        userId,
        type: 'withdraw_out',
        amountCents: String(-amountCents),
        balanceAfterCents: String(current - amountCents),
        refType: 'withdraw',
        refId: orderId,
        note: `提现到 ${card.bankName} ${card.cardNo.slice(-4)}`,
      });

      // 写提现单
      await manager.save(WithdrawalEntity, {
        id: orderId,
        userId,
        bankCardId: String(card.id),
        amountCents: String(amountCents),
        feeCents: String(fee),
        actualAmountCents: String(actual),
        status: 0,
      });
    });

    return { orderId, feeYuan: (fee / 100).toFixed(2), actualYuan: (actual / 100).toFixed(2) };
  }

  async listMyWithdrawals(userId: string) {
    const rows = await this.withdrawals.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const cards = await this.cards.find({ where: { userId } });
    return rows.map((w) => {
      const c = cards.find((x) => String(x.id) === String(w.bankCardId));
      return {
        id: w.id,
        amountYuan: (Number(w.amountCents) / 100).toFixed(2),
        feeYuan: (Number(w.feeCents) / 100).toFixed(2),
        actualYuan: (Number(w.actualAmountCents) / 100).toFixed(2),
        status: w.status,
        bankName: c?.bankName ?? '',
        cardNo: c ? this.maskCard(c.cardNo) : '',
        rejectReason: w.rejectReason,
        createdAt: w.createdAt,
      };
    });
  }

  // ===== 管理员端 =====

  async adminPending() {
    const rows = await this.withdrawals.find({
      where: { status: 0 },
      order: { createdAt: 'ASC' },
    });
    const cards = await this.cards.find();
    const users = await this.dataSource.query(
      `SELECT user_id, login_name FROM pms_user`,
    );
    return rows.map((w) => {
      const c = cards.find((x) => String(x.id) === String(w.bankCardId));
      const u = (users as any[]).find((x) => x.user_id === w.userId);
      return {
        id: w.id,
        userId: w.userId,
        username: u?.login_name ?? '',
        amountYuan: (Number(w.amountCents) / 100).toFixed(2),
        feeYuan: (Number(w.feeCents) / 100).toFixed(2),
        actualYuan: (Number(w.actualAmountCents) / 100).toFixed(2),
        bankName: c?.bankName ?? '',
        cardNo: c?.cardNo ?? '',
        cardHolder: c?.cardHolder ?? '',
        branchName: c?.branchName ?? '',
        createdAt: w.createdAt,
      };
    });
  }

  async adminApprove(orderId: string, operator: string) {
    const w = await this.withdrawals.findOne({ where: { id: orderId, status: 0 } });
    if (!w) throw new NotFoundException('提现单不存在或已处理');
    w.status = 1;
    w.operator = operator;
    w.approvedAt = new Date();
    await this.withdrawals.save(w);
  }

  async adminReject(orderId: string, operator: string, reason?: string) {
    const w = await this.withdrawals.findOne({ where: { id: orderId, status: 0 } });
    if (!w) throw new NotFoundException('提现单不存在或已处理');
    // 拒绝要退回余额
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      w.status = 2;
      w.rejectReason = reason ?? '提现失败';
      w.operator = operator;
      await manager.save(WithdrawalEntity, w);

      const bal = await manager.findOne(UserBalanceEntity, { where: { userId: w.userId } });
      const current = bal ? Number(bal.balanceCents) : 0;
      bal!.balanceCents = String(current + Number(w.amountCents));
      bal!.version += 1;
      await manager.save(bal);

      const refTxnNo = this.paymentNo.nextTxnNo('withdraw_refund');
      await manager.save(BalanceTransactionEntity, {
        id: refTxnNo,
        txnNo: refTxnNo,
        userId: w.userId,
        type: 'withdraw_refund',
        amountCents: String(w.amountCents),
        balanceAfterCents: String(current + Number(w.amountCents)),
        refType: 'withdraw',
        refId: orderId,
        note: `提现被退回：${w.rejectReason ?? ''}`,
      });
    });
  }

  private maskCard(no: string) {
    if (no.length <= 8) return no;
    return no.slice(0, 4) + ' **** **** ' + no.slice(-4);
  }
}
