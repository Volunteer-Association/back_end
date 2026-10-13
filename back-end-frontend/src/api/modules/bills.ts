import { request } from '../client'

export type BillType = 'income' | 'expense'
export type PaymentChannel = 'alipay' | 'wechat'
export type PaymentStatus = 'pending' | 'paid' | 'failed'

export interface Bill {
  id: string
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

export interface Payment {
  id: string
  userId: string
  billId: string
  channel: PaymentChannel
  amount: string
  status: PaymentStatus
  transactionId: string | null
  paidAt: string | null
  createdAt: string
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

/** 为支出账单发起支付。 */
export function createPayment(billId: string, channel: PaymentChannel) {
  return request.post<Payment>(
    `/bills/${encodeURIComponent(billId)}/payments`,
    { channel },
  )
}

/** 查询支付单状态。 */
export function getPayment(billId: string, paymentId: string) {
  return request.get<Payment>(
    `/bills/${encodeURIComponent(billId)}/payments/${encodeURIComponent(paymentId)}`,
  )
}

/** 沙箱模拟支付成功。 */
export function simulatePayment(billId: string, paymentId: string) {
  return request.post<Payment>(
    `/bills/${encodeURIComponent(billId)}/payments/${encodeURIComponent(paymentId)}/simulate`,
  )
}
