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
  return request.get<{ rechargeStatuses: DictOption[]; rechargeChannels: DictOption[] }>(
    '/payments/options',
  )
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
