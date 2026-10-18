import { request } from '../client'

export type RechargeChannel = 'alipay' | 'wechat' | 'bank'
export type RechargeStatus = 'pending' | 'approved' | 'rejected'
export type BalanceTxnType =
  | 'recharge'
  | 'consume'
  | 'refund'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjust'
  | 'withdraw_out'
  | 'withdraw_refund'
  | 'withdraw_fee'
  | 'red_packet_out'
  | 'red_packet_in'
  | 'red_packet_refund'

export interface BalanceInfo {
  balanceCents: number
  balanceYuan: string
}

/**
 * 充值单（用户端，精简视图）。
 * 出于安全考虑，后端不返回审核人ID/姓名、管理员内部备注，
 * 用户只能看到自己的审核结果说明与审核时间。
 */
export interface RechargeOrder {
  id: string
  /** 对外充值业务单号（CZ 前缀） */
  orderNo: string
  userId: string
  amountCents: number
  channel: RechargeChannel
  status: RechargeStatus
  userNote: string | null
  /** 审核结果说明（驳回原因），用户可见 */
  reviewNote: string | null
  /** 审核时间 */
  reviewedAt: string | null
  createdAt: string
}

/**
 * 充值单（管理员端，完整视图）。
 * 包含审核人、审核结果、内部备注等管理信息，仅管理员接口返回。
 */
export interface AdminRechargeOrder {
  id: string
  /** 对外充值业务单号（CZ 前缀） */
  orderNo: string
  userId: string
  amountCents: number
  channel: RechargeChannel
  status: RechargeStatus
  userNote: string | null
  reviewedBy: string | null
  /** 审核人昵称（join 用户资料得到） */
  reviewedByName: string | null
  /** 审核结果说明（驳回原因），用户可见 */
  reviewNote: string | null
  /** 管理员内部备注，仅管理员可见 */
  adminNote: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BalanceTxn {
  id: string
  /** 对外支付流水号（28 位业务编号） */
  txnNo: string
  userId: string
  type: BalanceTxnType
  amountCents: number
  balanceAfterCents: number
  refType: string | null
  refId: string | null
  note: string | null
  createdAt: string
}

export function getBalance() {
  return request.get<BalanceInfo>('/payments/balance')
}

export function requestRecharge(input: {
  amountCents: number
  channel: RechargeChannel
  userNote?: string | null
  /** 幂等键（前端生成 UUID），防重复提交产生重复充值单 */
  requestId: string
}) {
  return request.post<RechargeOrder>('/payments/recharge', input)
}

export function listMyRecharges() {
  return request.get<RechargeOrder[]>('/payments/recharges')
}

export function listMyTxns() {
  return request.get<BalanceTxn[]>('/payments/transactions')
}

export function transfer(input: {
  toAccount: string
  amountCents: number
  requestId: string
  note?: string | null
  paymentPassword: string
}) {
  return request.post<{
    transferId: string
    transferNo: string
    amountCents: number
    fromUserId: string
    toUserId: string
    toAccount: string
    toNickname: string | null
    fromNickname: string | null
    fromBalanceAfterCents: number
    toBalanceAfterCents: number
  }>('/payments/transfer', input)
}

// ===== 支付密码 =====

export function getPaymentPasswordStatus() {
  return request.get<{ set: boolean }>('/payments/payment-password/status')
}

export interface DictOption {
  value: string
  label: string
  description?: string
}

export function getPaymentsOptions() {
  return request.get<{
    rechargeStatuses: DictOption[]
    rechargeChannels: DictOption[]
    txnTypes: DictOption[]
    /** 提现手续费费率：0.10% = 0.001，前端按此实时预估，最终以后端入账为准 */
    withdrawFeeRate: number
    /** 提现手续费最低收费（分），默认 1 分（¥0.01） */
    withdrawFeeMinCents: number
    riskLimits: {
      transferSingleMaxYuan: number
      transferDailyMaxYuan: number
      withdrawSingleMinYuan: number
      withdrawSingleMaxYuan: number
      redpacketSingleMaxYuan: number
    }
  }>('/payments/options')
}

/** 提现手续费最低收费（分），与后端 WITHDRAW_FEE_MIN_CENTS 保持一致：¥0.01。 */
export const WITHDRAW_FEE_MIN_CENTS = 1

/**
 * 按提现金额实时计算手续费与到账金额（与后端 calcWithdrawFee 同口径）。
 * 手续费 = max(申请金额 × 费率 四舍五入到分, 最低 1 分)。
 */
export function calcWithdrawPreview(
  amountYuan: string | number,
  feeRate: number,
  minFeeCents: number = WITHDRAW_FEE_MIN_CENTS,
): { amountCents: number; feeCents: number; actualCents: number; valid: boolean } {
  const n = Number(amountYuan)
  if (!Number.isFinite(n) || n <= 0) {
    return { amountCents: 0, feeCents: 0, actualCents: 0, valid: false }
  }
  const amountCents = Math.round(n * 100)
  const feeCents = Math.max(minFeeCents, Math.round(amountCents * feeRate))
  return {
    amountCents,
    feeCents,
    actualCents: Math.max(amountCents - feeCents, 0),
    valid: amountCents > 0,
  }
}

/** 分转元（两位小数，用于实时预估展示）。 */
export function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function setupPaymentPassword(paymentPassword: string) {
  return request.post<{ success: true }>('/payments/payment-password/setup', {
    paymentPassword,
  })
}

export function changePaymentPassword(oldPassword: string, newPassword: string) {
  return request.post<{ success: true }>('/payments/payment-password/change', {
    oldPassword,
    newPassword,
  })
}

// ===== 管理员 =====
export function adminListRecharges(params?: {
  page?: number
  pageSize?: number
  status?: RechargeStatus
  userId?: string
}) {
  return request.get<{
    items: AdminRechargeOrder[]
    total: number
    page: number
    pageSize: number
  }>('/admin/recharges', {
    params: {
      page: params?.page,
      pageSize: params?.pageSize,
      status: params?.status,
      userId: params?.userId || undefined,
    },
  })
}

export function adminApproveRecharge(
  id: string,
  reviewNote?: string,
  adminNote?: string,
) {
  return request.post<AdminRechargeOrder>(
    `/admin/recharges/${encodeURIComponent(id)}/approve`,
    { reviewNote: reviewNote || null, adminNote: adminNote || null },
  )
}

export function adminRejectRecharge(
  id: string,
  reviewNote: string,
  adminNote?: string,
) {
  return request.post<AdminRechargeOrder>(
    `/admin/recharges/${encodeURIComponent(id)}/reject`,
    { reviewNote, adminNote: adminNote || null },
  )
}

// ===== 管理员：钱包对账 =====

export interface AdminBalanceRow {
  userId: string
  email: string | null
  nickname: string | null
  balanceCents: number
  balanceYuan: string
  version: number
}

export interface ReconcileReport {
  range: { startDate: string | null; endDate: string | null }
  /** 汇总数可能超过 JS 安全整数，统一用字符串传输，前端不得再 Number() 累加 */
  totalBalanceCents: string
  totalBalanceYuan: string
  ledgerSumCents: string
  ledgerSumYuan: string
  diffCents: string
  diffYuan: string
  balanced: boolean
  periodSummary: Record<string, { sumCents: string; count: number }>
  allTime: {
    rechargeSumCents: string
    consumeSumCents: string
    transferOutSumCents: string
    transferInSumCents: string
    refundSumCents: string
    adjustSumCents: string
    withdrawOutSumCents: string
    withdrawRefundSumCents: string
    withdrawFeeSumCents: string
    redPacketOutSumCents: string
    redPacketInSumCents: string
    redPacketRefundSumCents: string
  }
  userCount: number
}

export function adminWalletTransactions(params: {
  page?: number
  pageSize?: number
  userId?: string
  type?: string
}) {
  return request.get<{
    items: BalanceTxn[]
    total: number
    page: number
    pageSize: number
  }>('/admin/wallet/transactions', { params })
}

export function adminWalletBalances() {
  return request.get<AdminBalanceRow[]>('/admin/wallet/balances')
}

export function adminReconcile(startDate?: string, endDate?: string) {
  return request.get<ReconcileReport>('/admin/wallet/reconcile', {
    params: { startDate, endDate },
  })
}

export interface UserReconcileRow {
  userId: string
  email: string | null
  nickname: string | null
  /** 平台内部账户（如手续费收入账户），不是真实用户。 */
  isSystem?: boolean
  balanceCents: number
  balanceYuan: string
  txnSumCents: number
  txnSumYuan: string
  txnCount: number
  diffCents: number
  diffYuan: string
  balanced: boolean
}

export interface DailyReconcileRow {
  date: string
  /** 当日净变动（分），字符串，避免大汇总数精度丢失 */
  totalCents: string
  count: number
  byType: Record<string, string>
}

export function adminReconcileByUser() {
  return request.get<UserReconcileRow[]>('/admin/wallet/reconcile/by-user')
}

export function adminReconcileDaily(days = 30) {
  return request.get<DailyReconcileRow[]>('/admin/wallet/reconcile/daily', {
    params: { days },
  })
}

export function adminAdjust(input: {
  targetUserId: string
  amountCents: number
  note?: string
}) {
  return request.post<BalanceTxn>('/admin/wallet/adjust', input)
}

/** 对账修复结果（单边操作，区别于普通余额调整）。 */
export interface ReconcileFixResult {
  noop: boolean
  mode: 'balance' | 'ledger'
  balanceCents: number
  txnSumCents: number
  diffCents: number
  beforeBalanceCents: number
  changedCents: number
  txnId: string | null
  message?: string
}

/**
 * 逐用户对账修复。
 * balance=以流水为准，只修正余额（不产生新流水，推荐）；
 * ledger=以余额为准，只补一笔差额流水（余额不变）。
 */
export function adminReconcileFix(input: {
  targetUserId: string
  mode?: 'balance' | 'ledger'
  note?: string
}) {
  return request.post<ReconcileFixResult>('/admin/wallet/reconcile-fix', input)
}

// ===== 银行卡与提现 =====

export interface BankCard {
  id: number
  bankName: string
  cardNo: string
  cardHolder: string
  branchName: string | null
  isDefault: boolean
}

/** 提现单状态：0待审核 1已打款 2已拒绝退回 3超时自动取消退回。 */
export type WithdrawalStatus = 0 | 1 | 2 | 3

export interface MyWithdrawal {
  id: string
  amountYuan: string
  feeYuan: string
  actualYuan: string
  status: WithdrawalStatus
  bankName: string
  cardNo: string
  rejectReason: string | null
  createdAt: string
}

/** 提现状态展示元数据（标签 + 标签颜色）。键为 status 数字，未知状态回退到 info。 */
export const WITHDRAWAL_STATUS_META: Record<number, { label: string; tagType: 'warning' | 'success' | 'danger' | 'info' }> = {
  0: { label: '待审核', tagType: 'warning' },
  1: { label: '已打款', tagType: 'success' },
  2: { label: '已拒绝并退回', tagType: 'danger' },
  3: { label: '超时自动取消', tagType: 'info' },
}

export function listBankCards() {
  return request.get<BankCard[]>('/wallet/cards')
}
export function addBankCard(data: { bankName: string; cardNo: string; cardHolder: string; branchName?: string }) {
  return request.post('/wallet/cards', data)
}
export function removeBankCard(id: number) {
  return request.delete(`/wallet/cards/${id}`)
}
export function requestWithdraw(data: { bankCardId: number; amountYuan: string; paymentPassword: string }) {
  return request.post('/wallet/withdraw', data)
}
export function listMyWithdrawals() {
  return request.get<MyWithdrawal[]>('/wallet/withdrawals')
}

/** 平台提现手续费收入（按日）。 */
export interface WithdrawFeeDailyRow {
  date: string
  /** 当日手续费（分），字符串，避免大汇总数精度丢失。 */
  cents: string
  count: number
}

/** 平台提现手续费收入统计。 */
export interface WithdrawFeeStats {
  days: number
  totalCents: string
  totalCount: number
  todayCents: string
  todayCount: number
  monthCents: string
  monthCount: number
  daily: WithdrawFeeDailyRow[]
}

// 管理员
export function adminWithdrawPending() {
  return request.get<any[]>('/admin/withdraw/pending')
}
export function adminWithdrawFeeStats(days = 30) {
  return request.get<WithdrawFeeStats>('/admin/withdraw/fee-stats', { params: { days } })
}
export function adminWithdrawApprove(id: string) {
  return request.post(`/admin/withdraw/${id}/approve`)
}
export function adminWithdrawReject(id: string, reason?: string) {
  return request.post(`/admin/withdraw/${id}/reject`, { reason })
}

// ===== 红包 =====

export function sendRedPacket(data: { toEmail: string; amountYuan: string; greeting?: string; paymentPassword: string }) {
  return request.post('/red-packet/send', data)
}
export function receiveRedPacket(id: string) {
  return request.post<{ amountYuan: string }>(`/red-packet/receive/${id}`)
}
export function myReceivedPackets() {
  return request.get<any[]>('/red-packet/my-received')
}
export function myPendingPackets() {
  return request.get<any[]>('/red-packet/my-pending')
}
export function monthlySummary() {
  return request.get<{ month: string; incomeYuan: string; expenseYuan: string; count: number }[]>('/payments/monthly-summary')
}

// ===== 风控配置（管理员） =====
export function listRiskConfig() {
  return request.get<{ config_key: string; config_value: string; description: string }[]>('/admin/risk-config')
}
export function updateRiskConfig(configKey: string, configValue: string) {
  return request.put('/admin/risk-config', { configKey, configValue })
}
export function mySentPackets() {
  return request.get<any[]>('/red-packet/my-sent')
}
