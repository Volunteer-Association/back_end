<template>
  <section>
    <PageHeader title="提现审核" description="审核用户提现申请，确认打款后标记完成。拒绝会自动退回余额。" />
    <el-card shadow="never" style="margin-top: 16px">
      <el-table :data="list" v-loading="loading">
        <el-table-column prop="username" label="用户" width="140" />
        <el-table-column prop="bankName" label="银行" width="140" />
        <el-table-column label="卡号" width="200">
          <template #default="{ row }">{{ row.cardNo }}</template>
        </el-table-column>
        <el-table-column prop="cardHolder" label="持卡人" width="100" />
        <el-table-column label="金额" width="100">
          <template #default="{ row }">¥{{ row.amountYuan }}</template>
        </el-table-column>
        <el-table-column label="手续费" width="90">
          <template #default="{ row }">¥{{ row.feeYuan }}</template>
        </el-table-column>
        <el-table-column label="实际到账" width="100">
          <template #default="{ row }">¥{{ row.actualYuan }}</template>
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
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import { adminWithdrawPending, adminWithdrawApprove, adminWithdrawReject } from '@/api/modules/payments'

const list = ref<any[]>([])
const loading = ref(false)

function formatTime(t: string) {
  return t ? new Date(t).toLocaleString('zh-CN') : '-'
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
  try {
    await adminWithdrawApprove(row.id)
    ElMessage.success('已标记打款')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  }
}

async function reject(row: any) {
  try {
    const { value } = await ElMessageBox.prompt('拒绝原因（将退回用户余额）', '拒绝提现', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    await adminWithdrawReject(row.id, value)
    ElMessage.success('已拒绝并退回余额')
    await load()
  } catch { /* 取消 */ }
}

onMounted(load)
</script>
