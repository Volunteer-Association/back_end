<template>
  <section>
    <el-card shadow="never">
      <template #header>
        <div>
          <h1>风控规则</h1>
          <p>调整交易限额和安全策略，保存后立即生效。</p>
        </div>
      </template>
      <el-table :data="list" stripe v-loading="loading">
        <el-table-column label="配置项" prop="config_key" width="280">
          <template #default="{ row }">
            <code>{{ row.config_key }}</code>
          </template>
        </el-table-column>
        <el-table-column label="说明" prop="description" />
        <el-table-column label="当前值" width="160">
          <template #default="{ row }">
            <el-input v-model="row.config_value" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="save(row)">保存</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listRiskConfig, updateRiskConfig } from '@/api/modules/payments'

const loading = ref(false)
const list = ref<any[]>([])

async function load() {
  loading.value = true
  try {
    list.value = await listRiskConfig()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function save(row: any) {
  try {
    await updateRiskConfig(row.config_key, row.config_value)
    ElMessage.success('已保存')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
}

onMounted(load)
</script>
