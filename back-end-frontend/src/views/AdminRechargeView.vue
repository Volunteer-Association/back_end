<template>
  <section class="recharge-admin-page">
    <div class="page-heading">
      <div>
        <h1>充值审核</h1>
        <p>核对用户线下转账后批准到账，余额自动入账。</p>
      </div>
      <el-radio-group v-model="statusFilter" @change="reload">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="pending">待审核</el-radio-button>
        <el-radio-button value="approved">已到账</el-radio-button>
        <el-radio-button value="rejected">已驳回</el-radio-button>
      </el-radio-group>
    </div>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="orders" stripe>
        <el-table-column prop="id" label="单号" width="180" />
        <el-table-column prop="userId" label="用户" width="140" />
        <el-table-column label="金额" width="120">
          <template #default="{ row }">
            <strong>¥{{ (row.amountCents / 100).toFixed(2) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="100">
          <template #default="{ row }">{{ channelLabel(row.channel) }}</template>
        </el-table-column>
        <el-table-column prop="userNote" label="用户备注" min-width="160">
          <template #default="{ row }">{{ row.userNote || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="tagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="申请时间" width="170" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button text type="success" @click="approve(row)">批准到账</el-button>
              <el-button text type="danger" @click="reject(row)">驳回</el-button>
            </template>
            <span v-else style="color: #97a0af">—</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  adminApproveRecharge,
  adminListRecharges,
  adminRejectRecharge,
  type RechargeOrder,
} from '@/api/modules/payments'

const loading = ref(false)
const orders = ref<RechargeOrder[]>([])
const statusFilter = ref<'' | 'pending' | 'approved' | 'rejected'>('pending')

function channelLabel(c: string) {
  return { alipay: '支付宝', wechat: '微信', bank: '银行' }[c as 'alipay' | 'wechat' | 'bank']
}

function statusLabel(s: string) {
  return { pending: '待审核', approved: '已到账', rejected: '已驳回' }[
    s as 'pending' | 'approved' | 'rejected'
  ]
}

function tagType(s: string) {
  return { pending: 'warning', approved: 'success', rejected: 'danger' }[
    s as 'pending' | 'approved' | 'rejected'
  ] as never
}

async function reload() {
  loading.value = true
  try {
    orders.value = await adminListRecharges(
      statusFilter.value || undefined,
    )
  } finally {
    loading.value = false
  }
}

async function approve(order: RechargeOrder) {
  try {
    await ElMessageBox.confirm(
      `确认该笔 ¥${(order.amountCents / 100).toFixed(2)} 已到账？批准后用户余额会增加。`,
      '批准充值',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await adminApproveRecharge(order.id)
    ElMessage.success('已到账')
    await reload()
  } catch (e: unknown) {
    ElMessage.error(
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        '操作失败',
    )
  }
}

async function reject(order: RechargeOrder) {
  try {
    await ElMessageBox.prompt('驳回原因（可选）', '驳回充值', {
      inputType: 'text',
      inputPlaceholder: '如：未查到转账记录',
    })
  } catch {
    return
  }
  try {
    // ElMessageBox.prompt 返回 [value]，简化处理：不传原因
    await adminRejectRecharge(order.id)
    ElMessage.success('已驳回')
    await reload()
  } catch (e: unknown) {
    ElMessage.error(
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        '操作失败',
    )
  }
}

onMounted(() => void reload())
</script>

<style scoped>
.recharge-admin-page {
  display: grid;
  gap: 20px;
}

.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h1 {
  color: #17233d;
  font-size: 24px;
}

.page-heading p {
  margin-top: 4px;
  color: #8590a3;
  font-size: 14px;
}
</style>
