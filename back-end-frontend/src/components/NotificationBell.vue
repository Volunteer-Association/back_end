<template>
  <el-popover
    :width="380"
    placement="bottom-end"
    trigger="click"
    popper-class="notification-popover"
    @show="onShow"
  >
    <template #reference>
      <el-badge :value="store.unreadCount" :max="99" :hidden="store.unreadCount === 0" class="bell-badge">
        <el-icon class="bell-icon" :size="20"><Bell /></el-icon>
      </el-badge>
    </template>

    <div class="notify-panel">
      <div class="notify-header">
        <span class="notify-title">消息通知</span>
        <el-button
          text
          size="small"
          :disabled="store.unreadCount === 0"
          @click="onMarkAll"
        >
          全部已读
        </el-button>
      </div>

      <div v-loading="loading" class="notify-list">
        <div
          v-for="n in store.recent"
          :key="n.id"
          class="notify-item"
          :class="{ unread: !n.isRead }"
          @click="onClickItem(n)"
        >
          <span class="notify-dot" />
          <div class="notify-body">
            <div class="notify-item-title">{{ n.title }}</div>
            <div class="notify-item-content">{{ n.content }}</div>
            <div class="notify-time">{{ formatDateTime(n.createdAt) }}</div>
          </div>
        </div>
        <div v-if="!loading && store.recent.length === 0" class="notify-empty">
          暂无消息
        </div>
      </div>

      <div class="notify-footer" @click="goAll">查看全部消息</div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
/**
 * 顶部消息铃铛：
 * - 挂载即拉取未读数，并每 60 秒轮询
 * - 点击展开最近 5 条，单条点击即标记已读，可一键全部已读
 */
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useNotificationsStore } from '@/stores/notifications'
import type { Notification } from '@/api/modules/notifications'
import { formatDateTime } from '@/utils/utils'

const router = useRouter()
const store = useNotificationsStore()
const loading = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

async function onShow() {
  loading.value = true
  try {
    await Promise.all([store.refreshRecent(), store.refreshUnread()])
  } finally {
    loading.value = false
  }
}

async function onClickItem(n: Notification) {
  if (!n.isRead) {
    await store.markRead(n.id)
  }
}

async function onMarkAll() {
  try {
    await store.markAllRead()
    ElMessage.success('已全部标记为已读')
  } catch (e: unknown) {
    ElMessage.error((e as { message?: string })?.message || '操作失败')
  }
}

function goAll() {
  void router.push('/notifications')
}

onMounted(() => {
  void store.refreshUnread()
  void store.refreshRecent()
  timer = setInterval(() => void store.refreshUnread(), 60_000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.bell-badge {
  display: inline-flex;
  align-items: center;
  margin-right: 14px;
}

.bell-icon {
  color: #596579;
  cursor: pointer;
}

.notify-panel {
  margin: -12px;
}

.notify-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #eef1f6;
}

.notify-title {
  font-weight: 600;
  color: #17233d;
}

.notify-list {
  max-height: 360px;
  overflow-y: auto;
}

.notify-item {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f4f6fa;
}

.notify-item:hover {
  background: #f7f9fc;
}

.notify-dot {
  margin-top: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
  flex-shrink: 0;
}

.notify-item.unread .notify-dot {
  background: #f56c6c;
}

.notify-item.unread .notify-item-title {
  font-weight: 600;
  color: #17233d;
}

.notify-body {
  min-width: 0;
}

.notify-item-title {
  font-size: 14px;
  color: #475669;
}

.notify-item-content {
  margin-top: 2px;
  font-size: 13px;
  color: #7a8598;
  line-height: 1.5;
  word-break: break-all;
}

.notify-time {
  margin-top: 4px;
  font-size: 12px;
  color: #b0b7c3;
}

.notify-empty {
  padding: 36px 0;
  text-align: center;
  color: #b0b7c3;
  font-size: 13px;
}

.notify-footer {
  padding: 10px;
  text-align: center;
  font-size: 13px;
  color: #409eff;
  cursor: pointer;
  border-top: 1px solid #eef1f6;
}

.notify-footer:hover {
  background: #f4f8ff;
}
</style>
