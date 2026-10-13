import { request } from '../client'

export type RechargeChannel = 'alipay' | 'wechat' | 'bank'
export type RechargeStatus = 'pending' | 'approved' | 'rejected'
export type BalanceTxnType = 'recharge' | 'consume' | 'refund' | 'adjust'

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
