<template>
  <section class="admin-users-page">
    <PageHeader
      title="用户管理"
      description="仅超级管理员可见。管理系统账号、分配角色、重置密码。日常业务请由业务管理员处理。"
    >
      <template #actions>
        <el-button type="primary" @click="openCreate">新建用户</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never" style="margin-bottom: 16px">
      <el-form inline @submit.prevent="onSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            placeholder="用户名 / 邮箱"
            clearable
            style="width: 200px"
            @keyup.enter="onSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width: 140px">
            <el-option
              v-for="s in options.statuses"
              :key="s.value"
              :label="s.label"
              :value="s.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="query.role" placeholder="全部" clearable style="width: 160px">
            <el-option
              v-for="r in options.roles"
              :key="r.value"
              :label="r.label"
              :value="r.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="onSearch">查询</el-button>
          <el-button @click="onResetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="items" stripe>
        <el-table-column label="用户名" width="160">
          <template #default="{ row }">
            <strong>{{ row.username }}</strong>
            <div class="muted mono">ID: {{ row.userId }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="email" label="邮箱" min-width="180" />
        <el-table-column label="昵称" width="140">
          <template #default="{ row }">{{ row.nickname || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="200">
          <template #default="{ row }">
            <div style="display: flex; flex-wrap: wrap; gap: 4px; max-height: 60px; overflow-y: auto">
              <el-tag
                v-for="r in row.roleKeys"
                :key="r"
                :type="roleTag(r)"
                size="small"
              >
                {{ roleLabel(r) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最后登录" width="170">
          <template #default="{ row }">
            {{ row.lastLoginAt ? formatDateTime(row.lastLoginAt) : '从未登录' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="onSetStatus(row)">改状态</el-button>
            <el-button text type="primary" @click="onAssignRoles(row)">分配角色</el-button>
            <el-button text type="warning" @click="onResetPwd(row)">重置密码</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        style="margin-top: 12px; justify-content: flex-end"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="load"
        @size-change="load"
      />
    </el-card>

    <!-- 新建用户弹窗 -->
    <el-dialog v-model="createVisible" title="新建用户" width="min(480px, calc(100vw - 32px))" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="用户名">
          <el-input v-model="createForm.username" placeholder="3-30 位字母/数字/下划线" maxlength="30" />
        </el-form-item>
        <el-form-item label="初始密码">
          <el-input v-model="createForm.password" type="password" show-password placeholder="至少 8 位" maxlength="72" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="createForm.email" placeholder="user@example.com" />
        </el-form-item>
        <el-form-item label="昵称（可选）">
          <el-input v-model="createForm.nickname" maxlength="50" />
        </el-form-item>
        <el-form-item label="初始角色">
          <el-checkbox-group v-model="createForm.roleKeys">
            <el-checkbox v-for="r in options.roles" :key="r.value" :value="r.value">
              {{ r.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 改状态弹窗：下拉选择，选项来自后端 -->
    <el-dialog
      v-model="statusVisible"
      :title="`修改状态 - ${editingStatusUser?.username ?? ''}`"
      width="min(420px, calc(100vw - 32px))"
      destroy-on-close
    >
      <el-alert
        v-if="editingStatusUser?.status === 'banned'"
        type="error"
        :closable="false"
        title="该用户当前已被封禁，重新登录需要先改为正常或停用。"
        style="margin-bottom: 12px"
      />
      <el-form label-position="top">
        <el-form-item label="新状态">
          <el-select v-model="statusForm" style="width: 100%" placeholder="请选择状态">
            <el-option
              v-for="s in options.statuses"
              :key="s.value"
              :label="s.label"
              :value="s.value"
            >
              <div>{{ s.label }}</div>
              <div class="muted">{{ s.description }}</div>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="statusVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingStatus" @click="submitStatus">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分配角色弹窗 -->
    <el-dialog
      v-model="rolesVisible"
      :title="`分配角色 - ${editingUser?.username ?? ''}`"
      width="min(420px, calc(100vw - 32px))"
      destroy-on-close
    >
      <el-alert
        type="warning"
        :closable="false"
        title="修改角色后该用户会被强制下线，需要重新登录。不能修改自己的角色。"
        style="margin-bottom: 12px"
      />
      <div style="max-height: 400px; overflow-y: auto; padding-right: 8px">
        <el-checkbox-group v-model="rolesForm">
          <el-checkbox
            v-for="r in options.roles"
            :key="r.value"
            :value="r.value"
            style="display: block; margin-bottom: 8px"
          >
            {{ r.label }}
            <div class="muted">{{ r.description }}</div>
          </el-checkbox>
        </el-checkbox-group>
      </div>
      <template #footer>
        <el-button @click="rolesVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingRoles" @click="submitRoles">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
/**
 * 用户管理（仅超级管理员）。
 * 日常业务（充值审核等）由业务管理员在另一个菜单处理，本页不涉及。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import {
  listAdminUsers,
  createAdminUser,
  setUserStatus,
  assignUserRoles,
  resetUserPassword,
  getAdminOptions,
  type AdminUser,
  type AdminOptions,
  type RoleKey,
  type UserStatus,
} from '@/api/modules/admin-users'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/utils/utils'

const auth = useAuthStore()
const loading = ref(false)
const items = ref<AdminUser[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const query = reactive<{ keyword: string; status: UserStatus | ''; role: RoleKey | '' }>({
  keyword: '',
  status: '',
  role: '',
})

// 后端下发的状态/角色枚举，前端不写死
const options = ref<AdminOptions>({ statuses: [], roles: [] })
const statusLabelMap = computed(() =>
  Object.fromEntries(options.value.statuses.map((s) => [s.value, s.label])),
)
const roleLabelMap = computed(() =>
  Object.fromEntries(options.value.roles.map((r) => [r.value, r.label])),
)
function statusLabel(s: string) {
  return statusLabelMap.value[s] ?? s
}
function roleLabel(r: string) {
  return roleLabelMap.value[r] ?? r
}
function statusTag(s: string) {
  return ({ active: 'success', inactive: 'info', banned: 'danger' } as Record<string, string>)[s] ?? 'info'
}
function roleTag(r: string) {
  return ({ super_admin: 'danger', admin: 'warning', user: 'info' } as Record<string, string>)[r] ?? 'info'
}

async function load() {
  loading.value = true
  try {
    const r = await listAdminUsers({
      page: page.value,
      pageSize: pageSize.value,
      keyword: query.keyword || undefined,
      status: query.status || undefined,
      role: query.role || undefined,
    })
    items.value = r.items
    total.value = r.total
  } catch (e: unknown) {
    ElMessage.error((e as { message?: string })?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  void load()
}
function onResetSearch() {
  query.keyword = ''
  query.status = ''
  query.role = ''
  onSearch()
}

// ===== 新建用户 =====
const createVisible = ref(false)
const creating = ref(false)
const createForm = reactive({
  username: '',
  password: '',
  email: '',
  nickname: '',
  roleKeys: ['user'] as RoleKey[],
})
function openCreate() {
  createForm.username = ''
  createForm.password = ''
  createForm.email = ''
  createForm.nickname = ''
  createForm.roleKeys = ['user']
  createVisible.value = true
}
async function submitCreate() {
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(createForm.username)) {
    ElMessage.error('用户名需为 3-30 位字母/数字/下划线')
    return
  }
  if (createForm.password.length < 8) {
    ElMessage.error('密码至少 8 位')
    return
  }
  creating.value = true
  try {
    await createAdminUser({
      username: createForm.username,
      password: createForm.password,
      email: createForm.email,
      nickname: createForm.nickname || undefined,
      roleKeys: createForm.roleKeys,
    })
    ElMessage.success('用户已创建')
    createVisible.value = false
    await load()
  } catch (e: unknown) {
    ElMessage.error((e as { message?: string })?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

// ===== 改状态 =====
const statusVisible = ref(false)
const savingStatus = ref(false)
const editingStatusUser = ref<AdminUser | null>(null)
const statusForm = ref<UserStatus | ''>('')
function onSetStatus(row: AdminUser) {
  if (row.userId === auth.user?.id) {
    ElMessage.warning('不能修改自己的状态')
    return
  }
  editingStatusUser.value = row
  statusForm.value = row.status
  statusVisible.value = true
}
async function submitStatus() {
  if (!editingStatusUser.value || !statusForm.value) {
    ElMessage.error('请选择新状态')
    return
  }
  savingStatus.value = true
  try {
    await setUserStatus(editingStatusUser.value.userId, statusForm.value)
    ElMessage.success('状态已更新')
    statusVisible.value = false
    await load()
  } catch (e: unknown) {
    ElMessage.error((e as { message?: string })?.message || '操作失败')
  } finally {
    savingStatus.value = false
  }
}

// ===== 分配角色 =====
const rolesVisible = ref(false)
const savingRoles = ref(false)
const editingUser = ref<AdminUser | null>(null)
const rolesForm = ref<string[]>([])
function onAssignRoles(row: AdminUser) {
  if (row.userId === auth.user?.id) {
    ElMessage.warning('不能修改自己的角色')
    return
  }
  editingUser.value = row
  rolesForm.value = [...row.roleKeys]
  rolesVisible.value = true
}
async function submitRoles() {
  if (!editingUser.value) return
  if (!rolesForm.value.length) {
    ElMessage.error('至少要分配一个角色')
    return
  }
  savingRoles.value = true
  try {
    await assignUserRoles(editingUser.value.userId, rolesForm.value)
    ElMessage.success('角色已更新，该用户已被强制下线')
    rolesVisible.value = false
    await load()
  } catch (e: unknown) {
    ElMessage.error((e as { message?: string })?.message || '操作失败')
  } finally {
    savingRoles.value = false
  }
}

// ===== 重置密码 =====
async function onResetPwd(row: AdminUser) {
  try {
    const { value } = await ElMessageBox.prompt(
      `为 ${row.username} 设置新密码（8-72 位），重置后该用户会被强制下线。`,
      '重置密码',
      {
        inputPattern: /^.{8,72}$/,
        inputErrorMessage: '密码长度需在 8-72 位之间',
        inputType: 'password',
      },
    )
    await resetUserPassword(row.userId, value || '')
    ElMessage.success('密码已重置')
  } catch (e: unknown) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error((e as { message?: string })?.message || '操作失败')
  }
}

onMounted(async () => {
  try {
    options.value = await getAdminOptions()
  } catch {
    // options 拉取失败不阻塞列表加载
  }
  await load()
})
</script>

<style scoped>
.admin-users-page {
  display: grid;
  gap: 16px;
}
.muted {
  color: #97a0af;
  font-size: 12px;
}
.mono {
  font-family: ui-monospace, monospace;
}
</style>
