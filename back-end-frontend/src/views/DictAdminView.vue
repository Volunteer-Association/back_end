<template>
  <section class="dict-page">
    <PageHeader
      title="数据字典管理"
      description="统一维护业务可选项，如账单分类。修改后即时生效，无需发版。"
    >
      <template #actions>
        <el-button type="primary" @click="openCreate">新建字典项</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <div class="filters">
        <el-select
          v-model="filterType"
          placeholder="按字典类型过滤"
          clearable
          style="width: 220px"
          @change="reload"
        >
          <el-option
            v-for="t in types"
            :key="t.value"
            :label="t.label"
            :value="t.value"
          />
        </el-select>
        <el-button :loading="loading" @click="reload">刷新</el-button>
      </div>

      <el-table v-loading="loading" :data="items" stripe>
        <el-table-column label="字典类型" width="180">
          <template #default="{ row }">{{ typeLabel(row.dictType) }}</template>
        </el-table-column>
        <el-table-column prop="dictKey" label="分组键" width="140" />
        <el-table-column prop="itemValue" label="显示值" min-width="160" />
        <el-table-column prop="sortOrder" label="排序" width="80" align="center" />
        <el-table-column label="启用" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button text type="danger" @click="confirmDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? '编辑字典项' : '新建字典项'"
      width="min(480px, calc(100vw - 32px))"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="字典类型" prop="dictType">
          <el-select v-model="form.dictType" placeholder="选择字典类型" style="width: 100%">
            <el-option
              v-for="t in types"
              :key="t.value"
              :label="t.label"
              :value="t.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分组键" prop="dictKey">
          <el-input v-model="form.dictKey" :placeholder="selectedTypeHint" />
        </el-form-item>
        <el-form-item label="显示值" prop="itemValue">
          <el-input v-model="form.itemValue" placeholder="如 餐饮" />
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import {
  createDictItem,
  deleteDictItem,
  getAllDictItems,
  getDictTypes,
  updateDictItem,
  type DictItem,
  type DictTypeOption,
} from '@/api/modules/dict'

const loading = ref(false)
const saving = ref(false)
const items = ref<DictItem[]>([])
const types = ref<DictTypeOption[]>([])
const filterType = ref('')
const dialogVisible = ref(false)
const editing = ref<DictItem | null>(null)
const formRef = ref<FormInstance>()

const form = reactive({
  dictType: 'bill_category_expense',
  dictKey: '',
  itemValue: '',
  sortOrder: 0,
  enabled: true,
})

/** 把 dictType 技术串映射成界面友好名；注册表没有的原样显示，避免静默丢失。 */
function typeLabel(value: string): string {
  return types.value.find((t) => t.value === value)?.label ?? value
}

/** 当前选中类型对分组键的填写说明。 */
const selectedTypeHint = computed(
  () => types.value.find((t) => t.value === form.dictType)?.keyHint ?? '英文标识，同类型内保持唯一',
)

const rules: FormRules = {
  dictType: [{ required: true, message: '请选择字典类型' }],
  dictKey: [{ required: true, message: '请输入分组键' }],
  itemValue: [{ required: true, message: '请输入显示值' }],
}

async function loadTypes() {
  try {
    types.value = await getDictTypes()
  } catch {
    /* 类型列表拉取失败不阻塞主列表 */
  }
}

async function reload() {
  loading.value = true
  try {
    items.value = await getAllDictItems(filterType.value || undefined)
  } catch {
    ElMessage.error('加载字典失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, {
    dictType: 'bill_category_expense',
    dictKey: '',
    itemValue: '',
    sortOrder: 0,
    enabled: true,
  })
  dialogVisible.value = true
}

function openEdit(row: DictItem) {
  editing.value = row
  Object.assign(form, {
    dictType: row.dictType,
    dictKey: row.dictKey,
    itemValue: row.itemValue,
    sortOrder: row.sortOrder,
    enabled: row.enabled,
  })
  dialogVisible.value = true
}

async function save() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await updateDictItem(editing.value.id, { ...form })
      ElMessage.success('字典项已更新')
    } else {
      await createDictItem({ ...form })
      ElMessage.success('字典项已创建')
    }
    dialogVisible.value = false
    await reload()
  } catch (e: unknown) {
    ElMessage.error(
      (e as { message?: string })?.message || '保存失败，请稍后重试',
    )
  } finally {
    saving.value = false
  }
}

async function confirmDelete(row: DictItem) {
  try {
    await ElMessageBox.confirm(
      `确定删除字典项「${row.itemValue}」吗？`,
      '删除确认',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteDictItem(row.id)
    ElMessage.success('已删除')
    await reload()
  } catch {
    ElMessage.error('删除失败')
  }
}

onMounted(() => {
  void loadTypes()
  void reload()
})
</script>

<style scoped>
.dict-page {
  display: grid;
  gap: 20px;
}

.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.filters .el-input {
  max-width: 320px;
}
</style>
