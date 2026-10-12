<template>
  <section class="logs-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-heading">
          <div>
            <h1>审计日志</h1>
            <p>查看登录和第三方授权事件；请求明细日志输出到后端控制台。</p>
          </div>
          <el-select
            v-model="level"
            clearable
            placeholder="全部级别"
            @change="changeFilter"
          >
            <el-option label="信息" value="info" />
            <el-option label="警告" value="warn" />
            <el-option label="错误" value="error" />
          </el-select>
        </div>
      </template>

      <el-table v-loading="loading" :data="items" stripe>
        <el-table-column prop="createdAt" label="时间" min-width="185">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="级别" width="90">
          <template #default="{ row }">
            <el-tag :type="levelType(row.level)">{{ levelText(row.level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="事件" min-width="230" />
        <el-table-column label="用户" min-width="150">
          <template #default="{ row }">
            {{ row.user?.username || (row.user ? `#${row.user.id}` : '未关联') }}
          </template>
        </el-table-column>
        <el-table-column prop="ipAddress" label="来源 IP" min-width="140" />
        <el-table-column prop="userAgent" label="User-Agent" min-width="240" show-overflow-tooltip />
      </el-table>

      <el-pagination
        v-model:current-page="page"
        class="pagination"
        background
        layout="total, prev, pager, next"
        :page-size="limit"
        :total="total"
        @current-change="loadLogs"
      />
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getAuditLogs, type AuditLog } from '@/api/modules/auth'

const loading = ref(false)
const items = ref<AuditLog[]>([])
const total = ref(0)
const page = ref(1)
const limit = 50
const level = ref<AuditLog['level']>()

function levelText(value: AuditLog['level']) {
  return { info: '信息', warn: '警告', error: '错误' }[value]
}

function levelType(value: AuditLog['level']) {
  return { info: 'info', warn: 'warning', error: 'danger' }[value]
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

async function loadLogs() {
  loading.value = true
  try {
    const result = await getAuditLogs({
      page: page.value,
      limit,
      level: level.value,
    })
    items.value = result.items
    total.value = result.total
  } catch {
    ElMessage.error('加载审计日志失败')
  } finally {
    loading.value = false
  }
}

function changeFilter() {
  page.value = 1
  void loadLogs()
}

onMounted(loadLogs)
</script>

<style scoped>
.logs-page {
  max-width: 1440px;
  margin: 0 auto;
}

.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.page-heading h1 {
  margin: 0;
  color: #17233d;
  font-size: 20px;
}

.page-heading p {
  margin: 8px 0 0;
  color: #7a8598;
}

.pagination {
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
