<template>
  <section class="logs-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-heading">
          <div>
            <h1>审计日志</h1>
            <p>按数据库中的日志类型和等级筛选；支持服务端分页查询。</p>
          </div>
          <div class="filters">
            <el-select
              v-model="category"
              placeholder="全部类型"
              aria-label="按日志类型筛选"
              @change="changeFilter"
            >
              <el-option label="全部类型" value="all" />
              <el-option label="HTTP 请求" value="http" />
              <el-option label="审计事件" value="audit" />
            </el-select>
            <el-select
              v-model="level"
              clearable
              placeholder="全部级别"
              aria-label="按日志级别筛选"
              @change="changeFilter"
            >
              <el-option label="信息" value="info" />
              <el-option label="警告" value="warn" />
              <el-option label="错误" value="error" />
            </el-select>
            <el-button :loading="loading" @click="loadLogs()">
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-table
        class="desktop-log-table"
        v-loading="loading"
        :data="items"
        height="100%"
        stripe
      >
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag :type="row.category === 'http' ? 'primary' : 'success'">
              {{ categoryText(row.category) }}
            </el-tag>
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
        <el-table-column prop="createdAt" label="时间" min-width="185">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>

      <div v-loading="loading" class="mobile-log-list">
        <article v-for="item in items" :key="item.id" class="log-card">
          <div class="log-card-heading">
            <el-tag :type="item.category === 'http' ? 'primary' : 'success'">
              {{ categoryText(item.category) }}
            </el-tag>
            <el-tag :type="levelType(item.level)">{{ levelText(item.level) }}</el-tag>
            <strong>{{ item.message }}</strong>
          </div>
          <dl class="log-details">
            <div>
              <dt>用户</dt>
              <dd>{{ item.user?.username || (item.user ? `#${item.user.id}` : '未关联') }}</dd>
            </div>
            <div>
              <dt>来源 IP</dt>
              <dd>{{ item.ipAddress || '—' }}</dd>
            </div>
            <div>
              <dt>User-Agent</dt>
              <dd>{{ item.userAgent || '—' }}</dd>
            </div>
            <div>
              <dt>时间</dt>
              <dd>{{ formatDate(item.createdAt) }}</dd>
            </div>
          </dl>
        </article>
        <el-empty v-if="!loading && items.length === 0" description="暂无审计日志" />
      </div>

      <el-pagination
        :current-page="page"
        class="pagination"
        background
        layout="total, sizes, prev, pager, next"
        :pager-count="5"
        :page-size="limit"
        :page-sizes="[20, 50, 100]"
        :total="total"
        @current-change="changePage"
        @size-change="changeLimit"
      />
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getAuditLogs,
  type AuditLog,
  type AuditLogCategory,
} from '@/api/modules/auth'

const loading = ref(false)
const items = ref<AuditLog[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const level = ref<AuditLog['level']>()
const category = ref<AuditLogCategory | 'all'>('all')
let latestRequestId = 0

function levelText(value: AuditLog['level']) {
  return { info: '信息', warn: '警告', error: '错误' }[value]
}

function levelType(value: AuditLog['level']) {
  return { info: 'info', warn: 'warning', error: 'danger' }[value]
}

function categoryText(value: AuditLog['category']) {
  return { audit: '审计事件', http: 'HTTP 请求' }[value]
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

async function loadLogs(requestedPage = page.value) {
  const requestId = ++latestRequestId
  page.value = requestedPage
  loading.value = true
  try {
    const result = await getAuditLogs({
      page: requestedPage,
      limit: limit.value,
      level: level.value,
      category: category.value === 'all' ? undefined : category.value,
    })
    if (requestId !== latestRequestId) return

    const lastPage = Math.max(1, Math.ceil(result.total / limit.value))
    if (requestedPage > lastPage) {
      void loadLogs(lastPage)
      return
    }

    items.value = result.items
    total.value = result.total
  } catch {
    if (requestId === latestRequestId) {
      ElMessage.error('加载审计日志失败')
    }
  } finally {
    if (requestId === latestRequestId) {
      loading.value = false
    }
  }
}

function changeFilter() {
  void loadLogs(1)
}

function changePage(value: number) {
  void loadLogs(value)
}

function changeLimit(value: number) {
  limit.value = value
  void loadLogs(1)
}

onMounted(loadLogs)
</script>

<style scoped>
.logs-page {
  max-width: 1440px;
  min-width: 0;
  height: calc(100svh - 124px);
  margin: 0 auto;
}

.logs-page :deep(.el-card) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.logs-page :deep(.el-card__header) {
  flex: none;
}

.logs-page :deep(.el-card__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.filters {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
}

.filters :deep(.el-select) {
  width: 150px;
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
  flex: none;
  justify-content: flex-end;
  min-width: 0;
  margin-top: 12px;
}

.pagination :deep(.el-pagination__sizes) {
  margin-right: 0;
}

.mobile-log-list {
  display: none;
}

@media (max-width: 800px) {
  .logs-page {
    height: calc(100svh - 144px);
  }
}

@media (max-width: 600px) {
  .logs-page {
    height: calc(100svh - 144px);
  }

  .page-heading {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }

  .filters {
    width: 100%;
    flex-wrap: wrap;
  }

  .filters :deep(.el-select) {
    flex: 1 1 130px;
    width: auto;
  }

  .filters :deep(.el-button) {
    flex: 1 0 100%;
  }

  .pagination {
    justify-content: flex-start;
    flex-wrap: wrap;
    row-gap: 10px;
  }

  .pagination :deep(.el-pagination__total) {
    flex: 1 0 100%;
    margin-right: 0;
  }
}

@media (max-width: 480px) {
  .logs-page {
    height: calc(100svh - 134px);
  }
}

@media (max-width: 768px) {
  .desktop-log-table {
    display: none;
  }

  .mobile-log-list {
    display: grid;
    flex: 1;
    min-height: 0;
    gap: 12px;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding-right: 4px;
    scrollbar-gutter: stable;
  }

  .log-card {
    min-width: 0;
    padding: 14px;
    border: 1px solid #e7ebf1;
    border-radius: 8px;
    background: #fff;
  }

  .log-card-heading {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
    margin-bottom: 12px;
  }

  .log-card-heading .el-tag {
    flex: none;
  }

  .log-card-heading strong {
    min-width: 0;
    color: #17233d;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .log-details {
    display: grid;
    gap: 8px;
  }

  .log-details > div {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 8px;
    min-width: 0;
  }

  .log-details dt {
    color: #7a8598;
  }

  .log-details dd {
    min-width: 0;
    color: #344054;
    overflow-wrap: anywhere;
  }
}
</style>
