<template>
  <section>
    <PageHeader title="实名审核" description="审核用户的实名认证申请，通过后用户才能使用转账、提现等功能。" />
    <el-card shadow="never" style="margin-top: 16px">
      <el-table :data="list" v-loading="loading">
        <el-table-column prop="username" label="用户名" width="180" />
        <el-table-column prop="real_name" label="真实姓名" width="120" />
        <el-table-column prop="id_type_label" label="证件类型" width="120" />
        <el-table-column label="证件号码">
          <template #default="{ row }">{{ mask(row.id_number) }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="提交时间" width="200">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" type="success" @click="approve(row)">通过</el-button>
            <el-button size="small" type="danger" @click="reject(row)">拒绝</el-button>
          </template>
        </el-table-column>
        <el-table-column v-if="!list.length" />
      </el-table>
      <el-empty v-if="!loading && !list.length" description="暂无待审核申请" />
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import { adminKycPending, adminKycApprove, adminKycReject } from '@/api/modules/auth'

const list = ref<any[]>([])
const loading = ref(false)

function mask(v: string) {
  if (!v) return ''
  return v.length <= 8 ? v : v.slice(0, 4) + '****' + v.slice(-4)
}
function formatTime(t: string) {
  return t ? new Date(t).toLocaleString('zh-CN') : '-'
}

async function load() {
  loading.value = true
  try {
    list.value = await adminKycPending()
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function approve(row: any) {
  try {
    await adminKycApprove(row.user_id)
    ElMessage.success('已通过')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

async function reject(row: any) {
  try {
    const { value } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝实名', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPlaceholder: '信息有误，请重新提交',
    })
    await adminKycReject(row.user_id, value)
    ElMessage.success('已拒绝')
    await load()
  } catch { /* 取消 */ }
}

onMounted(load)
</script>
