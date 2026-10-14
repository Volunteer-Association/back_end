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

export interface RechargeOrder {
  id: string
  userId: string
  amountCents: number
  channel: RechargeChannel
  status: RechargeStatus
  userNote: string | null
  reviewedBy: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
}

export interface BalanceTxn {
  id: string
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
}) {
  return request.post<{
    transferId: string
    amountCents: number
    fromUserId: string
    toUserId: string
    toAccount: string
    toNickname: string | null
    fromBalanceAfterCents: number
    toBalanceAfterCents: number
  }>('/payments/transfer', input)
}

// ===== 管理员 =====
export function adminListRecharges(status?: RechargeStatus) {
  return request.get<RechargeOrder[]>('/admin/recharges', {
    params: status ? { status } : {},
  })
}

export function adminApproveRecharge(id: string, reviewNote?: string) {
  return request.post<RechargeOrder>(
    `/admin/recharges/${encodeURIComponent(id)}/approve`,
    { reviewNote },
  )
}

export function adminRejectRecharge(id: string, reviewNote?: string) {
  return request.post<RechargeOrder>(
    `/admin/recharges/${encodeURIComponent(id)}/reject`,
    { reviewNote },
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
