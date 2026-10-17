<template>
  <section class="reconcile-page">
    <PageHeader
      title="钱包对账"
      description="全局余额、流水汇总与平衡校验；仅管理员可见。"
    >
      <template #actions>
        <el-button type="primary" @click="adjustVisible = true">余额调整</el-button>
      </template>
    </PageHeader>

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
            <span :class="isNeg(row.cents) ? 'amount-expense' : 'amount-income'">
              {{ isNeg(row.cents) ? '−' : '+' }}¥{{ formatCentsAbs(row.cents) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 逐用户对账排查 -->
    <el-card shadow="never">
      <template #header>
        <div class="card-header-row">
          <strong>逐用户对账排查</strong>
          <el-tag v-if="unbalancedUsers.length === 0" type="success" size="small">全部平衡</el-tag>
          <el-tag v-else type="danger" size="small">{{ unbalancedUsers.length }} 个用户不平衡</el-tag>
        </div>
      </template>
      <el-table :data="userRows" stripe max-height="400">
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">
            <div>{{ row.nickname || row.email || row.userId }}</div>
            <div class="muted mono">{{ row.userId }}</div>
          </template>
        </el-table-column>
        <el-table-column label="余额表" width="120">
          <template #default="{ row }">¥{{ row.balanceYuan }}</template>
        </el-table-column>
        <el-table-column label="流水加总" width="120">
          <template #default="{ row }">¥{{ row.txnSumYuan }}</template>
        </el-table-column>
        <el-table-column label="流水笔数" width="90">
          <template #default="{ row }">{{ row.txnCount }}</template>
        </el-table-column>
        <el-table-column label="差异" width="120">
          <template #default="{ row }">
            <span :class="row.balanced ? 'muted' : 'amount-expense'">
              {{ row.diffYuan === '0.00' ? '—' : (row.diffCents >= 0 ? '+' : '') + '¥' + row.diffYuan }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.balanced" type="success" size="small">平衡</el-tag>
            <el-tag v-else type="danger" size="small">异常</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="!row.balanced"
              size="small"
              type="warning"
              @click="openFix(row)"
            >
              修复
            </el-button>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 按天流水趋势 -->
    <el-card shadow="never">
      <template #header>
        <strong>最近 30 天流水趋势</strong>
      </template>
      <el-table :data="dailyRows" stripe max-height="300">
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column label="当日净变动" width="130">
          <template #default="{ row }">
            <span :class="isNeg(row.totalCents) ? 'amount-expense' : 'amount-income'">
              {{ isNeg(row.totalCents) ? '−' : '+' }}¥{{ formatCentsAbs(row.totalCents) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="笔数" width="80">
          <template #default="{ row }">{{ row.count }}</template>
        </el-table-column>
        <el-table-column label="分类明细" min-width="300">
          <template #default="{ row }">
            <span v-for="(v, k) in row.byType" :key="k" class="daily-type">
              {{ typeLabel(k) }} {{ isNeg(v) ? '−' : '+' }}¥{{ formatCentsAbs(v) }}
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
            <el-option v-for="t in txnTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-button type="primary" @click="loadTxns">查询</el-button>
      </el-form>

      <el-table :data="txns" stripe v-loading="txnLoading">
        <el-table-column label="流水号" width="260">
          <template #default="{ row }">
            <code class="mono">{{ row.txnNo || row.id }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="userId" label="用户" width="160" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag size="small">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="变动" width="120">
          <template #default="{ row }">
            <strong :class="isNeg(row.amountCents) ? 'amount-expense' : 'amount-income'">
              {{ isNeg(row.amountCents) ? '−' : '+' }}¥{{ formatCentsAbs(row.amountCents) }}
            </strong>
          </template>
        </el-table-column>
        <el-table-column label="余额" width="110">
          <template #default="{ row }">¥{{ formatCents(row.balanceAfterCents) }}</template>
        </el-table-column>
        <el-table-column prop="note" label="说明" min-width="200">
          <template #default="{ row }">{{ row.note || '—' }}</template>
        </el-table-column>
        <el-table-column label="关联单号" width="220">
          <template #default="{ row }">
            <code v-if="row.refType === 'admin_adjust'" class="muted">管理员调整</code>
            <code v-else-if="row.refId" class="mono">{{ row.refId }}</code>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
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

    <el-dialog
      v-model="adjustVisible"
      title="余额调整"
      width="min(480px, calc(100vw - 32px))"
      destroy-on-close
    >
      <el-alert
        type="warning"
        :closable="false"
        title="管理员手工调整"
        description="正金额=给用户加钱，负金额=扣用户余额。调整会写 adjust 流水，可在流水明细中追溯。"
        show-icon
      />
      <el-form :model="adjustForm" label-position="top" style="margin-top: 12px">
        <el-form-item label="目标用户 ID" required>
          <el-input v-model.trim="adjustForm.targetUserId" placeholder="u_xxx" />
        </el-form-item>
        <el-form-item label="金额（元，正=加/负=扣）" required>
          <el-input v-model="adjustForm.amountYuan" placeholder="如 50 或 -20">
            <template #prepend>¥</template>
          </el-input>
        </el-form-item>
        <el-form-item label="调整原因">
          <el-input v-model="adjustForm.note" type="textarea" :rows="2" placeholder="如：客服补偿、系统错误修正" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" :loading="adjusting" @click="submitAdjust">确认调整</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
/**
 * 钱包对账页面（仅管理员可见）。
 *
 * 功能：
 * - 三张统计卡：用户总余额、流水累计、平衡差异（应为 0）
 * - 全量流水分类汇总（充值/消费/转出/转入/退款/调整）
 * - 全局流水明细（支持按用户、类型过滤 + 分页）
 * - 余额调整对话框（管理员手工加/减用户余额）
 *
 * 对账原理：用户总余额应该等于所有流水金额的代数和，
 * 如果差异不为 0，说明有数据不一致需要排查。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import { formatDateTime } from '@/utils/utils'
import {
  adminAdjust,
  adminReconcile,
  adminReconcileByUser,
  adminReconcileDaily,
  adminWalletTransactions,
  getPaymentsOptions,
  type BalanceTxn,
  type DailyReconcileRow,
  type DictOption,
  type ReconcileReport,
  type UserReconcileRow,
} from '@/api/modules/payments'

const txnTypes = ref<DictOption[]>([])

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

const userRows = ref<UserReconcileRow[]>([])
const dailyRows = ref<DailyReconcileRow[]>([])
const unbalancedUsers = computed(() => userRows.value.filter((r) => !r.balanced))

const adjustVisible = ref(false)
const adjusting = ref(false)
const adjustForm = reactive({ targetUserId: '', amountYuan: '', note: '' })

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
    { label: '提现', cents: (a as any).withdrawOutSumCents ?? 0 },
    { label: '提现退回', cents: (a as any).withdrawRefundSumCents ?? 0 },
  ]
})

function typeLabel(t: string) {
  return txnTypes.value.find((x) => x.value === t)?.label ?? t
}

/**
 * 分 → 元字符串，字符串切分实现，任意位数安全。
 * 汇总金额可能超过 JS Number 安全整数（2^53-1），禁止 Number(cents)/100。
 */
function formatCents(cents: string | number): string {
  const raw = String(cents).trim()
  const neg = raw.startsWith('-')
  const digits = neg ? raw.slice(1) : raw
  if (!digits) return '0.00'
  const norm = digits.replace(/^0+(?=\d)/, '') || '0'
  const intPart = norm.length <= 2 ? '0' : norm.slice(0, -2)
  return `${neg ? '-' : ''}${intPart}.${norm.slice(-2).padStart(2, '0')}`
}

function formatCentsAbs(cents: string | number): string {
  return formatCents(String(cents).replace(/^-/, ''))
}

function isNeg(cents: string | number): boolean {
  return String(cents).trim().startsWith('-')
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

onMounted(async () => {
  try {
    const opts = await getPaymentsOptions()
    txnTypes.value = opts.txnTypes || []
  } catch { /* ignore */ }
  void load()
  void loadTxns()
  void loadUserReconcile()
  void loadDaily()
})

async function loadUserReconcile() {
  try {
    userRows.value = await adminReconcileByUser()
  } catch {
    /* 静默失败 */
  }
}

async function loadDaily() {
  try {
    dailyRows.value = await adminReconcileDaily(30)
  } catch {
    /* 静默失败 */
  }
}

/**
 * 一键修复：打开调整对话框，自动填入用户 ID 和抹平差异所需的金额。
 * 差异 diff = 余额表 - 流水加总
 * 需要调整的金额 = -diff（让余额表向流水加总对齐）
 */
function openFix(row: UserReconcileRow) {
  const fixCents = -row.diffCents
  // 如果是扣钱且余额不足，提前提示
  if (fixCents < 0 && row.balanceCents + fixCents < 0) {
    ElMessage.warning(
      `当前余额 ¥${row.balanceYuan}，需要扣 ¥${(Math.abs(fixCents) / 100).toFixed(2)}，扣后余额为负，无法直接修复。建议先给用户充值，或手动核对流水。`
    )
    return
  }
  adjustForm.targetUserId = row.userId
  adjustForm.amountYuan = (fixCents / 100).toFixed(2)
  adjustForm.note = `对账修复：用户 ${row.nickname || row.email || row.userId} 差异 ¥${row.diffYuan}`
  adjustVisible.value = true
}

async function submitAdjust() {
  if (!adjustForm.targetUserId.trim()) {
    ElMessage.error('请输入目标用户 ID')
    return
  }
  const cents = Math.round(Number(adjustForm.amountYuan) * 100)
  if (!Number.isFinite(cents) || cents === 0) {
    ElMessage.error('请输入非零金额')
    return
  }
  adjusting.value = true
  try {
    await adminAdjust({
      targetUserId: adjustForm.targetUserId.trim(),
      amountCents: cents,
      note: adjustForm.note || undefined,
    })
    ElMessage.success('调整完成')
    adjustVisible.value = false
    adjustForm.targetUserId = ''
    adjustForm.amountYuan = ''
    adjustForm.note = ''
    // 刷新所有对账视图
    await Promise.all([load(), loadTxns(), loadUserReconcile(), loadDaily()])
  } catch (e: unknown) {
    ElMessage.error((e as { message?: string })?.message || '调整失败')
  } finally {
    adjusting.value = false
  }
}
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

.card-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.daily-type {
  display: inline-block;
  margin-right: 12px;
  font-size: 13px;
  color: #475669;
}
</style>
