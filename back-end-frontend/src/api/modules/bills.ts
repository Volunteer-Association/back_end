import { request } from '../client'

export type BillType = 'income' | 'expense'

export interface Bill {
  id: string
  /** 对外账单业务单号（BILL 前缀） */
  billNo: string | null
  userId: string
  type: BillType
  category: string
  amount: string
  transactionDate: string
  note: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BillFilters {
  type?: BillType
  category?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

export interface BillPage {
  items: Bill[]
  page: number
  limit: number
  total: number
}

export interface BillSummary {
  income: string
  expense: string
  balance: string
}

export interface BillInput {
  type: BillType
  category: string
  amount: string
  transactionDate: string
  note: string | null
}

export function getBills(filters: BillFilters) {
  return request.get<BillPage>('/bills', { params: filters })
}

export function getBillSummary(filters: BillFilters) {
  return request.get<BillSummary>('/bills/summary', { params: filters })
}

export function createBill(input: BillInput) {
  return request.post<Bill>('/bills', input)
}

export function updateBill(id: string, input: Partial<BillInput>) {
  return request.patch<Bill>(`/bills/${encodeURIComponent(id)}`, input)
}

export function deleteBill(id: string) {
  return request.delete<{ success: true }>(`/bills/${encodeURIComponent(id)}`)
}

/** 用账户余额支付支出账单。 */
export function payBill(id: string) {
  return request.post<Bill>(`/bills/${encodeURIComponent(id)}/pay`)
}

/** 退款：把已支付账单的金额退回余额。 */
export function refundBill(id: string) {
  return request.post<Bill>(`/bills/${encodeURIComponent(id)}/refund`)
}
