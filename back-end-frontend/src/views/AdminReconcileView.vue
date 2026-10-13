<template>
  <section class="reconcile-page">
    <PageHeader
      title="钱包对账"
      description="全局余额、流水汇总与平衡校验；仅管理员可见。"
    />

    <el-card shadow="never" class="filter-card">
      <el-form inline>
        <el-form-item label="开始日期">
          <el-date-picker v-model="startDate" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker v-model="endDate" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-button type="primary" :loading="loading" @click="load">查询对账</el-button>
      </el-form>
    </el-card>

    <el-row v-if="report" :gutter="16">
      <el-col :span="8">
        <el-card shadow="never" class="stat-card">
          <div class="stat-label">用户总余额</div>
          <div class="stat-value">¥{{ report.totalBalanceYuan }}</div>
          <div class="stat-sub">{{ report.userCount }} 个用户</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never" class="stat-card">
          <div class="stat-label">流水累计（借贷轧差）</div>
          <div class="stat-value">¥{{ report.ledgerSumYuan }}</div>
          <div class="stat-sub">所有流水 amount 之和</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never" class="stat-card">
          <div class="stat-label">平衡差异</div>
          <div class="stat-value" :class="report.balanced ? 'ok' : 'bad'">
            ¥{{ report.diffYuan }}
          </div>
          <el-tag :type="report.balanced ? 'success' : 'danger'" size="small">
            {{ report.balanced ? '账实相符' : '不平' }}
          </el-tag>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="report" shadow="never">
      <template #header>
        <strong>全量流水分类汇总</strong>
      </template>
      <el-table :data="allTimeRows" stripe>
        <el-table-column prop="label" label="类型" />
        <el-table-column label="金额（元）">
          <template #default="{ row }">
            <span :class="row.cents >= 0 ? 'amount-income' : 'amount-expense'">
              {{ row.cents >= 0 ? '+' : '−' }}¥{{ (Math.abs(row.cents) / 100).toFixed(2) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <strong>全局流水明细</strong>
      </template>
      <el-form inline style="margin-bottom: 12px">
        <el-form-item label="用户ID">
          <el-input v-model="filterUserId" placeholder="按 userId 过滤" clearable />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filterType" placeholder="全部" clearable style="width: 140px">
            <el-option label="充值" value="recharge" />
            <el-option label="消费" value="consume" />
            <el-option label="转出" value="transfer_out" />
            <el-option label="转入" value="transfer_in" />
            <el-option label="退款" value="refund" />
            <el-option label="调整" value="adjust" />
          </el-select>
        </el-form-item>
        <el-button type="primary" @click="loadTxns">查询</el-button>
      </el-form>

      <el-table :data="txns" stripe v-loading="txnLoading">
        <el-table-column prop="id" label="流水号" width="160">
          <template #default="{ row }">
            <code class="mono">{{ row.id }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="userId" label="用户" width="140" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag size="small">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="变动" width="120">
          <template #default="{ row }">
            <strong :class="row.amountCents >= 0 ? 'amount-income' : 'amount-expense'">
              {{ row.amountCents >= 0 ? '+' : '−' }}¥{{ (Math.abs(row.amountCents) / 100).toFixed(2) }}
            </strong>
          </template>
        </el-table-column>
        <el-table-column label="余额" width="110">
          <template #default="{ row }">¥{{ (row.balanceAfterCents / 100).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="note" label="说明" min-width="200">
          <template #default="{ row }">{{ row.note || '—' }}</template>
        </el-table-column>
        <el-table-column label="关联单号" width="160">
          <template #default="{ row }">
            <code v-if="row.refId" class="mono">{{ row.refId }}</code>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="160" />
      </el-table>

      <el-pagination
        style="margin-top: 12px; justify-content: flex-end"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @current-change="loadTxns"
        @size-change="loadTxns"
      />
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import {
  adminReconcile,
  adminWalletTransactions,
  type BalanceTxn,
  type ReconcileReport,
} from '@/api/modules/payments'

const startDate = ref('')
const endDate = ref('')
const loading = ref(false)
const report = ref<ReconcileReport | null>(null)

const txns = ref<BalanceTxn[]>([])
const txnLoading = ref(false)
const filterUserId = ref('')
const filterType = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const allTimeRows = computed(() => {
  if (!report.value) return []
  const a = report.value.allTime
  return [
    { label: '充值', cents: a.rechargeSumCents },
    { label: '消费', cents: a.consumeSumCents },
    { label: '转出', cents: a.transferOutSumCents },
    { label: '转入', cents: a.transferInSumCents },
    { label: '退款', cents: a.refundSumCents },
    { label: '调整', cents: a.adjustSumCents },
  ]
})

function typeLabel(t: string) {
  return {
    recharge: '充值',
    consume: '消费',
    transfer_out: '转出',
    transfer_in: '转入',
    refund: '退款',
    adjust: '调整',
  }[t as never] ?? t
}

async function load() {
  loading.value = true
  try {
    report.value = await adminReconcile(startDate.value || undefined, endDate.value || undefined)
  } catch (e: unknown) {
    ElMessage.error(
      (e as { message?: string })?.message || '对账失败，请稍后重试',
    )
  } finally {
    loading.value = false
  }
}

async function loadTxns() {
  txnLoading.value = true
  try {
    const r = await adminWalletTransactions({
      page: page.value,
      pageSize: pageSize.value,
      userId: filterUserId.value || undefined,
      type: filterType.value || undefined,
    })
    txns.value = r.items
    total.value = r.total
  } catch (e: unknown) {
    ElMessage.error(
      (e as { message?: string })?.message || '查询失败，请稍后重试',
    )
  } finally {
    txnLoading.value = false
  }
}

onMounted(() => {
  void load()
  void loadTxns()
})
</script>

<style scoped>
.reconcile-page {
  display: grid;
  gap: 16px;
}

.stat-card :deep(.el-card__body) {
  text-align: center;
}

.stat-label {
  color: #7a8598;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 26px;
  font-weight: 600;
  margin-bottom: 8px;
}

.stat-value.ok { color: #22a06b; }
.stat-value.bad { color: #e05b5b; }

.stat-sub {
  color: #7a8598;
  font-size: 12px;
}

.amount-income { color: #22a06b; }
.amount-expense { color: #e05b5b; }

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #475669;
  background: #f4f7fb;
  padding: 1px 6px;
  border-radius: 4px;
}

.muted {
  color: #c0c6d0;
}
</style>
