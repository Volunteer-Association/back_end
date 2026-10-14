<template>
  <section class="notifications-page">
    <PageHeader
      title="消息通知"
      description="充值到账、驳回等业务消息通知。"
    >
      <template #actions>
        <el-button :disabled="unreadCount === 0" @click="onMarkAll">
          全部已读
        </el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <el-radio-group v-model="unreadOnly" style="margin-bottom: 12px" @change="onFilterChange">
        <el-radio-button :value="false">全部</el-radio-button>
        <el-radio-button :value="true">未读</el-radio-button>
      </el-radio-group>

      <el-table
        v-loading="loading"
        :data="items"
        stripe
        @row-click="onRowClick"
      >
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isRead ? 'info' : 'danger'" size="small">
              {{ row.isRead ? '已读' : '未读' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="130">
          <template #default="{ row }">{{ typeLabel(row.type) }}</template>
        </el-table-column>
        <el-table-column label="标题" min-width="140">
          <template #default="{ row }">
            <span :class="{ 'title-unread': !row.isRead }">{{ row.title }}</span>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="260">
          <template #default="{ row }">{{ row.content }}</template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="!row.isRead"
              text
              type="primary"
              @click.stop="onMarkOne(row)"
            >
              标为已读
            </el-button>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        style="margin-top: 12px; justify-content: flex-end"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="load"
        @size-change="load"
      />
    </el-card>
  </section>
</template>

<script setup lang="ts">
/**
 * 通知中心：完整消息列表，支持全部/未读筛选、分页、标记已读。
 */
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from '@/api/modules/notifications'
import { useNotificationsStore } from '@/stores/notifications'
import { formatDateTime } from '@/utils/utils'

const store = useNotificationsStore()
const loading = ref(false)
const items = ref<Notification[]>([])
const unreadOnly = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const unreadCount = ref(0)

function typeLabel(t: string) {
  return (
    {
      recharge_approved: '充值到账',
      recharge_rejected: '充值驳回',
      transfer_received: '转账到账',
      transfer_sent: '转账转出',
      balance_adjusted: '余额调整',
      bill_paid: '账单支付',
      bill_refunded: '账单退款',
      system: '系统通知',
    } as Record<string, string>
  )[t] || t
}

async function load() {
  loading.value = true
  try {
    const [list] = await Promise.all([
      listNotifications({
        page: page.value,
        pageSize: pageSize.value,
        unread: unreadOnly.value,
      }),
      store.refreshUnread(),
    ])
    items.value = list.items
    total.value = list.total
    unreadCount.value = store.unreadCount
  } catch (e: unknown) {
    ElMessage.error((e as { message?: string })?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function onFilterChange() {
  page.value = 1
  void load()
}

async function onRowClick(row: Notification) {
  if (!row.isRead) await onMarkOne(row)
}

async function onMarkOne(row: Notification) {
  try {
    await markNotificationRead(row.id)
    row.isRead = true
    row.readAt = new Date().toISOString()
    await store.refreshUnread()
    unreadCount.value = store.unreadCount
  } catch (e: unknown) {
    ElMessage.error((e as { message?: string })?.message || '操作失败')
  }
}

async function onMarkAll() {
  try {
    await markAllNotificationsRead()
    ElMessage.success('已全部标记为已读')
    await store.refreshUnread()
    await load()
  } catch (e: unknown) {
    ElMessage.error((e as { message?: string })?.message || '操作失败')
  }
}

onMounted(() => void load())
</script>

<style scoped>
.notifications-page {
  display: grid;
  gap: 20px;
}

.title-unread {
  font-weight: 600;
  color: #17233d;
}

.muted {
  color: #c0c6d0;
}
</style>
