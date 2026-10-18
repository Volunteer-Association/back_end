<template>
  <section>
    <PageHeader title="提现审核" description="审核用户提现申请，确认打款后标记完成。拒绝会自动退回余额。" />

    <!-- 平台手续费收入统计 -->
    <el-card shadow="never" style="margin-top: 16px" v-loading="statsLoading">
      <template #header>
        <div class="card-header">
          <strong>平台手续费收入</strong>
          <el-radio-group v-model="statsDays" size="small" @change="loadStats">
            <el-radio-button :label="7">近 7 天</el-radio-button>
            <el-radio-button :label="30">近 30 天</el-radio-button>
            <el-radio-button :label="90">近 90 天</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-row :gutter="16">
        <el-col :span="6">
          <el-statistic title="累计手续费收入" :value="yuanNum(stats.totalCents)" :precision="2" prefix="¥" />
          <div class="muted stat-sub">共 {{ stats.totalCount }} 笔</div>
        </el-col>
        <el-col :span="6">
          <el-statistic title="今日收入" :value="yuanNum(stats.todayCents)" :precision="2" prefix="¥" />
          <div class="muted stat-sub">今日 {{ stats.todayCount }} 笔</div>
        </el-col>
        <el-col :span="6">
          <el-statistic title="本月收入" :value="yuanNum(stats.monthCents)" :precision="2" prefix="¥" />
          <div class="muted stat-sub">本月 {{ stats.monthCount }} 笔</div>
        </el-col>
        <el-col :span="6">
          <el-statistic :title="`${stats.days} 天区间收入`" :value="yuanNum(periodCents)" :precision="2" prefix="¥" />
          <div class="muted stat-sub">区间 {{ periodCount }} 笔</div>
        </el-col>
      </el-row>

      <!-- 近 N 天柱状趋势 -->
      <div class="bar-wrap">
        <div v-for="row in dailyForChart" :key="row.date" class="bar-item" :title="`${row.date} ¥${yuan(row.cents)} / ${row.count} 笔`">
          <div class="bar-track">
            <div class="bar-fill" :style="{ height: barHeight(row.cents) + '%' }" />
          </div>
          <div class="bar-label">{{ row.date.slice(5) }}</div>
        </div>
      </div>

      <el-collapse class="detail-collapse">
        <el-collapse-item title="查看按日明细" name="daily">
          <el-table :data="dailyTable" size="small" max-height="280" stripe>
            <el-table-column prop="date" label="日期" width="160" />
            <el-table-column label="手续费收入" width="160">
              <template #default="{ row }">
                <span class="amount-income">¥{{ yuan(row.cents) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="count" label="笔数" width="100" />
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <!-- 待审核提现 -->
    <el-card shadow="never" style="margin-top: 16px">
      <template #header><strong>待打款提现</strong></template>
      <el-alert type="info" :closable="false" class="fee-alert">
        <template #title>
          提现手续费按 <strong>0.10%</strong>（无最低手续费，四舍五入到分）实时计算；
          打款成功后，手续费计入<strong>平台手续费收入账户</strong>，实际到账金额才打款至用户银行卡。
        </template>
      </el-alert>
      <el-table :data="list" v-loading="loading">
        <el-table-column prop="username" label="用户" width="140" />
        <el-table-column prop="bankName" label="银行" width="140" />
        <el-table-column label="卡号" width="200">
          <template #default="{ row }">{{ row.cardNo }}</template>
        </el-table-column>
        <el-table-column prop="cardHolder" label="持卡人" width="100" />
        <el-table-column label="申请金额" width="100">
          <template #default="{ row }">¥{{ row.amountYuan }}</template>
        </el-table-column>
        <el-table-column label="手续费（平台收入）" width="150">
          <template #default="{ row }">
            <el-tag size="small" type="warning" effect="plain">¥{{ row.feeYuan }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="实际打款" width="110">
          <template #default="{ row }">
            <span class="amount-expense">¥{{ row.actualYuan }}</span>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" type="success" @click="approve(row)">确认打款</el-button>
            <el-button size="small" type="danger" @click="reject(row)">拒绝</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !list.length" description="暂无待审核提现" />
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import {
  adminWithdrawPending,
  adminWithdrawApprove,
  adminWithdrawReject,
  adminWithdrawFeeStats,
  type WithdrawFeeStats,
} from '@/api/modules/payments'

const list = ref<any[]>([])
const loading = ref(false)

const statsDays = ref(30)
const statsLoading = ref(false)
const stats = ref<WithdrawFeeStats>({
  days: 30,
  totalCents: '0',
  totalCount: 0,
  todayCents: '0',
  todayCount: 0,
  monthCents: '0',
  monthCount: 0,
  daily: [],
})

/** 分（字符串/数字均可）→ 元，两位小数。手续费金额量级小，Number 安全。 */
function yuan(cents: string | number) {
  return (Number(cents) / 100).toFixed(2)
}

/** 分 → 元数值，用于 el-statistic（其内部按 precision 自行格式化）。 */
function yuanNum(cents: string | number) {
  return Number(cents) / 100
}

function formatTime(t: string) {
  return t ? new Date(t).toLocaleString('zh-CN') : '-'
}

// 区间内（近 N 天）收入与笔数（用于统计卡片）
const periodCents = computed(() =>
  stats.value.daily.reduce((acc, r) => acc + Number(r.cents), 0),
)
const periodCount = computed(() =>
  stats.value.daily.reduce((acc, r) => acc + r.count, 0),
)

// 柱状图：数据点过多时只展示最近的若干天
const dailyForChart = computed(() => stats.value.daily.slice(-30))
const maxDaily = computed(() =>
  Math.max(1, ...dailyForChart.value.map((r) => Number(r.cents))),
)
function barHeight(cents: string) {
  const v = Number(cents)
  if (v <= 0) return 2
  return Math.max(6, Math.round((v / maxDaily.value) * 100))
}

// 明细表：最新在前
const dailyTable = computed(() =>
  [...stats.value.daily].sort((a, b) => b.date.localeCompare(a.date)),
)

async function loadStats() {
  statsLoading.value = true
  try {
    stats.value = await adminWithdrawFeeStats(statsDays.value)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '手续费统计加载失败')
  } finally {
    statsLoading.value = false
  }
}

async function load() {
  loading.value = true
  try {
    list.value = await adminWithdrawPending()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function approve(row: any) {
  const msg =
    `用户：${row.username}\n` +
    `申请金额：¥${row.amountYuan}\n` +
    `手续费（计入平台手续费收入账户）：¥${row.feeYuan}\n` +
    `实际打款到银行卡：¥${row.actualYuan}\n\n` +
    `确认已完成线下打款后再点确定，手续费将同步入账（仅可操作一次）。`
  try {
    await ElMessageBox.confirm(msg, '确认打款', {
      confirmButtonText: '已打款，确认',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await adminWithdrawApprove(row.id)
    ElMessage.success('已标记打款，手续费已计入平台收入')
    await Promise.all([load(), loadStats()])
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  }
}

async function reject(row: any) {
  try {
    const { value } = await ElMessageBox.prompt('拒绝原因（将退回用户余额，且不收取手续费）', '拒绝提现', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    await adminWithdrawReject(row.id, value)
    ElMessage.success('已拒绝并退回余额')
    await load()
  } catch { /* 取消 */ }
}

onMounted(() => {
  load()
  loadStats()
})
</script>

<style scoped>
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.stat-sub {
  margin-top: 4px;
  font-size: 12px;
}
.fee-alert {
  margin-bottom: 12px;
}
.muted {
  color: #909399;
}
.amount-income {
  color: #67c23a;
  font-weight: 600;
}
.amount-expense {
  color: #f56c6c;
  font-weight: 600;
}
.bar-wrap {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 120px;
  margin: 18px 0 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.bar-item {
  flex: 1 0 12px;
  min-width: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
}
.bar-track {
  width: 100%;
  height: 100px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.bar-fill {
  width: 70%;
  min-height: 2px;
  background: linear-gradient(180deg, #e6a23c 0%, #f3d19e 100%);
  border-radius: 2px 2px 0 0;
}
.bar-label {
  margin-top: 4px;
  font-size: 10px;
  color: #909399;
  transform: rotate(-45deg);
  white-space: nowrap;
  transform-origin: center;
}
.detail-collapse {
  margin-top: 8px;
}
</style>
