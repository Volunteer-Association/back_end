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
  totalBalanceCents: number
  totalBalanceYuan: string
  ledgerSumCents: number
  ledgerSumYuan: string
  diffCents: number
  diffYuan: string
  balanced: boolean
  periodSummary: Record<string, { sumCents: number; count: number }>
  allTime: {
    rechargeSumCents: number
    consumeSumCents: number
    transferOutSumCents: number
    transferInSumCents: number
    refundSumCents: number
    adjustSumCents: number
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
