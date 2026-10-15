import { request } from '../client'

export type NotificationType =
  | 'recharge_approved'
  | 'recharge_rejected'
  | 'transfer_received'
  | 'transfer_sent'
  | 'balance_adjusted'
  | 'bill_paid'
  | 'bill_refunded'
  | 'system'

export interface Notification {
  id: string
  userId: string
  type: NotificationType | string
  title: string
  content: string
  bizType: string | null
  bizId: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

export interface NotificationPage {
  items: Notification[]
  total: number
  page: number
  pageSize: number
}

export function listNotifications(params: {
  page?: number
  pageSize?: number
  unread?: boolean
}) {
  return request.get<NotificationPage>('/notifications', {
    params: {
      page: params.page,
      pageSize: params.pageSize,
      unread: params.unread ? 'true' : undefined,
    },
  })
}

export function getUnreadCount() {
  return request.get<{ count: number }>('/notifications/unread-count')
}

export function markNotificationRead(id: string) {
  return request.post<Notification>(`/notifications/${encodeURIComponent(id)}/read`)
}

export function markAllNotificationsRead() {
  return request.post<{ updated: number }>('/notifications/read-all')
}

/** 删除单条通知。 */
export function deleteNotification(id: string) {
  return request.delete<{ success: true }>(`/notifications/${encodeURIComponent(id)}`)
}

/** 清空所有已读通知（未读保留）。 */
export function clearReadNotifications() {
  return request.delete<{ deleted: number }>('/notifications/read')
}

/** 通知类型枚举（后端下发）。 */
export function getNotificationTypes() {
  return request.get<{ types: { value: string; label: string }[] }>(
    '/notifications/options',
  )
}
