<template>
  <section>
    <el-card shadow="never">
      <template #header>
        <div>
          <h1>角色管理</h1>
          <p>新增、删除、排序角色。内置 user/admin/super_admin 不可删除。</p>
        </div>
      </template>
      <el-table :data="list" stripe v-loading="loading">
        <el-table-column label="角色 Key" prop="key" width="200">
          <template #default="{ row }"><code>{{ row.key }}</code></template>
        </el-table-column>
        <el-table-column label="名称" prop="name" width="160" />
        <el-table-column label="说明" prop="description" />
        <el-table-column label="排序" width="120" align="center">
          <template #default="{ $index }">
            <el-button
              size="small"
              link
              :disabled="saving || $index === 0"
              @click="move($index, -1)"
            >上移</el-button>
            <el-button
              size="small"
              link
              :disabled="saving || $index === list.length - 1"
              @click="move($index, 1)"
            >下移</el-button>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="edit(row)">编辑</el-button>
            <el-button v-if="!builtinKeys.includes(row.key)" type="danger" size="small" @click="del(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-divider />
      <el-form inline>
        <el-form-item label="Key"><el-input v-model="form.key" placeholder="如 finance" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" placeholder="如 财务" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" placeholder="选填" /></el-form-item>
        <el-button type="primary" :loading="saving" @click="save">新增角色</el-button>
      </el-form>
    </el-card>

    <el-dialog v-model="editVisible" title="编辑角色" width="420px">
      <el-form label-width="80px">
        <el-form-item label="Key"><code>{{ editForm.key }}</code></el-form-item>
        <el-form-item label="名称"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="editForm.description" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listAllRoles, createRole, deleteRole, updateRole, reorderRoles } from '@/api/modules/admin-users'

const builtinKeys = ['user', 'admin', 'super_admin']
const loading = ref(false)
const saving = ref(false)
const list = ref<any[]>([])
const form = reactive({ key: '', name: '', description: '' })
const editVisible = ref(false)
const editForm = reactive({ key: '', name: '', description: '' })

async function load() {
  loading.value = true
  try {
    list.value = await listAllRoles()
  } finally {
    loading.value = false
  }
}

/**
 * 上移 / 下移：交换相邻两行并提交完整的有序 key 列表到后端。
 * 先乐观更新本地顺序，接口失败时重新拉取以回滚。
 */
async function move(index: number, dir: -1 | 1) {
  const target = index + dir
  if (target < 0 || target >= list.value.length) return
  const keys = list.value.map((r) => r.key)
  ;[keys[index], keys[target]] = [keys[target], keys[index]]
  const items = [...list.value]
  ;[items[index], items[target]] = [items[target], items[index]]
  list.value = items
  saving.value = true
  try {
    await reorderRoles(keys)
    ElMessage.success('排序已更新')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '排序失败')
    await load()
  } finally {
    saving.value = false
  }
}

async function save() {
  if (!form.key || !form.name) return ElMessage.warning('Key 和名称必填')
  saving.value = true
  try {
    await createRole({ ...form })
    ElMessage.success('已创建')
    form.key = ''; form.name = ''; form.description = ''
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '创建失败')
  } finally {
    saving.value = false
  }
}

async function del(row: any) {
  try {
    await ElMessageBox.confirm(`确认删除角色 ${row.name}？`, '提示', { type: 'warning' })
    await deleteRole(row.key)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

function edit(row: any) {
  editForm.key = row.key
  editForm.name = row.name
  editForm.description = row.description || ''
  editVisible.value = true
}

async function saveEdit() {
  saving.value = true
  try {
    await updateRole(editForm.key, { name: editForm.name, description: editForm.description })
    ElMessage.success('已保存')
    editVisible.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
