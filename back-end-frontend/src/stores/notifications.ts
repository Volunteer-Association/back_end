import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from '@/api/modules/notifications'

/**
 * 站内信通知 store：
 * 顶部铃铛与通知中心共享未读数；任何页面标记已读后调用 refreshUnread() 同步红点。
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const unreadCount = ref(0)
  const recent = ref<Notification[]>([])
  const loaded = ref(false)

  async function refreshUnread() {
    try {
      const r = await getUnreadCount()
      unreadCount.value = r.count
    } catch {
      // 未登录或网络异常时静默，不影响主界面
    }
  }

  async function refreshRecent() {
    const page = await listNotifications({ page: 1, pageSize: 5 })
    recent.value = page.items
    loaded.value = true
  }

  async function markRead(id: string) {
    const item = recent.value.find((n) => n.id === id)
    if (item && !item.isRead) {
      item.isRead = true
      item.readAt = new Date().toISOString()
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
    try {
      await markNotificationRead(id)
    } catch {
      // 失败时以下次拉取为准
      await refreshRecent()
      await refreshUnread()
    }
  }

  async function markAllRead() {
    await markAllNotificationsRead()
    recent.value.forEach((n) => {
      n.isRead = true
      n.readAt = new Date().toISOString()
    })
    unreadCount.value = 0
  }

  return {
    unreadCount,
    recent,
    loaded,
    refreshUnread,
    refreshRecent,
    markRead,
    markAllRead,
  }
})
