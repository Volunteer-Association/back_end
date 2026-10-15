<template>
  <section class="profile-page">
    <el-card shadow="never">
      <template #header>
        <PageHeader title="个人资料" description="管理当前账号的用户详细信息。">
          <template #actions>
            <el-button @click="router.push({ name: 'account' })">
              账号安全与绑定
            </el-button>
          </template>
        </PageHeader>
      </template>

      <el-skeleton v-if="loading" :rows="4" animated />
      <el-alert
        v-else-if="loadError"
        type="error"
        :closable="false"
        :title="loadError"
      >
        <el-button text type="primary" @click="loadProfile">
          重新读取
        </el-button>
      </el-alert>

      <div v-else class="profile-body">
        <!-- 头像 + 账号基本信息 -->
        <div class="account-section">
          <div class="avatar-section">
            <el-upload
              v-if="editing"
              :show-file-list="false"
              :auto-upload="false"
              accept="image/jpeg,image/png,image/gif,image/webp"
              :on-change="onFileSelected"
            >
              <el-avatar :size="96" :src="avatarUrl">
                {{ (profile.nickname || 'U').slice(0, 1) }}
              </el-avatar>
              <div class="avatar-tip">
                <el-icon v-if="uploading" class="is-loading"><Loading /></el-icon>
                <span>{{ uploading ? '上传中...' : '点击更换头像' }}</span>
              </div>
            </el-upload>
            <el-avatar v-else :size="96" :src="avatarUrl">
              {{ (profile.nickname || 'U').slice(0, 1) }}
            </el-avatar>
          </div>

          <div class="account-meta">
            <h2>{{ profile.nickname || '未设置昵称' }}</h2>
            <p class="meta-line">登录账号：<b>{{ accountInfo.username || '-' }}</b></p>
            <p class="meta-line">用户 ID：<code>{{ accountInfo.userId || '-' }}</code></p>
            <p class="meta-line">当前角色：
              <el-tag
                v-for="r in accountInfo.roles"
                :key="r"
                size="small"
                :type="roleTagType(r)"
                class="role-tag"
              >
                {{ roleLabelMap.get(r) || r }}
              </el-tag>
            </p>
            <p class="meta-line">注册时间：{{ accountInfo.createdAt || '-' }}</p>
          </div>
        </div>

        <!-- 只读模式：label:value 横向列表 -->
        <div v-if="!editing" class="readonly-list">
          <div class="row"><span class="label">邮箱</span><span class="value">{{ profile.email || '-' }}</span></div>
          <div class="row"><span class="label">昵称</span><span class="value">{{ profile.nickname || '-' }}</span></div>
          <div class="row"><span class="label">手机号</span><span class="value">{{ profile.mobile || '未绑定' }}</span></div>
          <div class="row"><span class="label">性别</span><span class="value">{{ genderLabel }}</span></div>
          <div class="group-title">证件信息</div>
          <div class="row"><span class="label">证件类型</span><span class="value">{{ idTypeLabel }}</span></div>
          <div class="row"><span class="label">证件号码</span><span class="value">{{ profile.idNumber || '未填写' }}</span></div>
          <div class="row"><span class="label">联系地址</span><span class="value">{{ profile.address || '未填写' }}</span></div>
          <div class="action-row">
            <el-button type="primary" @click="enterEdit">修改资料</el-button>
          </div>
        </div>

        <!-- 编辑模式：表单输入 -->
        <el-form v-else label-position="top" class="profile-form">
          <el-form-item label="邮箱">
            <el-input
              v-model.trim="profile.email"
              placeholder="用于登录和转账收款"
              maxlength="100"
            />
            <div class="form-tip">修改后用于登录和接收转账；如已被他人占用会提示</div>
          </el-form-item>

          <template v-if="emailChanged">
            <el-form-item label="邮箱验证码">
              <div class="code-row">
                <el-input
                  v-model.trim="emailCode"
                  placeholder="输入新邮箱收到的 6 位验证码"
                  maxlength="6"
                />
                <el-button
                  :disabled="cooldownLeft > 0"
                  :loading="sendingCode"
                  @click="sendCode"
                >
                  {{ cooldownLeft > 0 ? `${cooldownLeft}s 后重发` : '发送验证码' }}
                </el-button>
              </div>
              <div class="form-tip">验证码将发送到上面填写的新邮箱，5 分钟内有效</div>
            </el-form-item>
          </template>

          <el-form-item label="昵称">
            <el-input
              v-model.trim="profile.nickname"
              maxlength="60"
              show-word-limit
              placeholder="请输入昵称"
            />
          </el-form-item>

          <el-form-item label="手机号">
            <el-input
              v-model.trim="profile.mobile"
              maxlength="11"
              inputmode="numeric"
              placeholder="选填，11 位手机号"
            />
          </el-form-item>

          <el-form-item label="性别">
            <el-select v-model="profile.sex" class="full-width">
              <el-option label="保密" :value="2" />
              <el-option label="女" :value="0" />
              <el-option label="男" :value="1" />
            </el-select>
          </el-form-item>

          <el-divider content-position="left">证件信息</el-divider>

          <el-form-item label="证件类型">
            <el-select v-model="profile.idType" class="full-width" placeholder="请选择证件类型">
              <el-option v-for="t in idTypes" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
          </el-form-item>

          <el-form-item label="证件号码">
            <el-input
              v-model.trim="profile.idNumber"
              maxlength="50"
              placeholder="请输入证件号码"
            />
          </el-form-item>

          <el-form-item label="联系地址">
            <el-input
              v-model.trim="profile.address"
              type="textarea"
              :rows="2"
              maxlength="255"
              show-word-limit
              placeholder="选填，省/市/区/详细地址"
            />
          </el-form-item>

          <div class="action-row">
            <el-button :loading="saving" type="primary" @click="saveProfile">保存</el-button>
            <el-button @click="cancelEdit">取消</el-button>
          </div>
        </el-form>
      </div>
    </el-card>

    <AvatarCropper
      v-model="cropperVisible"
      :file="selectedFile"
      @success="onCropped"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import AvatarCropper from '@/components/AvatarCropper.vue'
import {
  getUserProfile,
  updateUserProfile,
  sendChangeEmailCode,
  getProfileOptions,
  getRoleOptions,
  type RoleOption,
} from '@/api/modules/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(true)
const saving = ref(false)
const uploading = ref(false)
const loadError = ref('')

/** 默认只读，点"修改资料"进入编辑模式 */
const editing = ref(false)

const profile = reactive({
  email: '',
  nickname: '',
  mobile: '',
  sex: 2,
  avatar: '' as string | null,
  idType: null as number | null,
  idTypeLabel: '',
  idNumber: '',
  address: '',
})

// 账号信息（只读，从 auth store 取）
const accountInfo = reactive({
  username: '',
  userId: '',
  roles: [] as string[],
  createdAt: '',
})

// 编辑开始时的快照，点取消时还原
const snapshot = ref<typeof profile | null>(null)

// 邮箱验证码
const initialEmail = ref('')
const emailCode = ref('')
const sendingCode = ref(false)
const cooldownLeft = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

// 后端字典
const idTypes = ref<{ value: number; label: string }[]>([])
const allRoles = ref<RoleOption[]>([])

const roleLabelMap = computed(() => new Map(allRoles.value.map((r) => [r.value, r.label])))
const idTypeLabel = computed(() => {
  // 优先用后端冗余存的 label（字典改名后不会受影响）
  if (profile.idTypeLabel) return profile.idTypeLabel
  const t = idTypes.value.find((x) => x.value === profile.idType)
  return t?.label || (profile.idType ? String(profile.idType) : '未设置')
})

const genderLabel = computed(() => {
  switch (profile.sex) {
    case 0: return '女'
    case 1: return '男'
    default: return '保密'
  }
})

/** 不同角色用不同颜色：超管 danger、业务管理员 warning、普通用户 primary */
function roleTagType(r: string): 'danger' | 'warning' | 'primary' {
  if (r === 'super_admin') return 'danger'
  if (r === 'admin') return 'warning'
  return 'primary'
}

const emailChanged = computed(
  () => profile.email.trim().toLowerCase() !== initialEmail.value.trim().toLowerCase(),
)

const avatarUrl = computed(() => {
  if (!profile.avatar) return ''
  return /^https?:\/\//.test(profile.avatar) ? profile.avatar : profile.avatar
})

function errorMessage(error: unknown, fallback: string) {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : fallback
}

async function loadProfile() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await getUserProfile()
    profile.email = result.email
    initialEmail.value = result.email
    profile.nickname = result.nickname || ''
    profile.mobile = result.mobile || ''
    profile.sex = result.sex ?? 2
    profile.avatar = result.avatar
    profile.idType = result.idType ?? null
    profile.idTypeLabel = result.idTypeLabel || ''
    profile.idNumber = result.idNumber || ''
    profile.address = result.address || ''

    // accountInfo 直接从 profile 接口读（后端连表返回了完整信息）
    accountInfo.username = result.username || ''
    accountInfo.userId = result.id || ''
    accountInfo.roles = Array.isArray(result.roles) ? result.roles : result.role ? [result.role] : []
    accountInfo.createdAt = (result.createdAt || '').slice(0, 10)
  } catch (error: unknown) {
    loadError.value = `无法读取个人资料：${errorMessage(error, '请稍后重试')}`
  } finally {
    loading.value = false
  }
}

const cropperVisible = ref(false)
const selectedFile = ref<File | null>(null)

function onFileSelected(uploadFile: { raw: File }) {
  const file = uploadFile.raw
  if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
    ElMessage.error('仅支持 jpg/png/gif/webp 图片')
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('原图不能超过 5MB')
    return
  }
  selectedFile.value = file
  cropperVisible.value = true
}

function onCropped(url: string) {
  profile.avatar = url
  cropperVisible.value = false
}

function enterEdit() {
  snapshot.value = { ...profile }
  editing.value = true
}

function cancelEdit() {
  if (snapshot.value) {
    Object.assign(profile, snapshot.value)
  }
  editing.value = false
  emailCode.value = ''
}

async function sendCode() {
  if (sendingCode.value) return
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    ElMessage.error('请先输入正确格式的新邮箱')
    return
  }
  sendingCode.value = true
  try {
    const r = await sendChangeEmailCode(profile.email)
    ElMessage.success('验证码已发送到新邮箱')
    cooldownLeft.value = r.cooldownSeconds || 60
    if (cooldownTimer) clearInterval(cooldownTimer)
    cooldownTimer = setInterval(() => {
      cooldownLeft.value -= 1
      if (cooldownLeft.value <= 0 && cooldownTimer) {
        clearInterval(cooldownTimer)
        cooldownTimer = null
      }
    }, 1000)
  } catch (error: unknown) {
    ElMessage.error(errorMessage(error, '验证码发送失败'))
  } finally {
    sendingCode.value = false
  }
}

async function saveProfile() {
  if (saving.value) return
  if (profile.nickname.length > 60) {
    ElMessage.error('昵称不能超过 60 个字符')
    return
  }
  if (profile.mobile && !/^\d{11}$/.test(profile.mobile)) {
    ElMessage.error('手机号需为 11 位数字')
    return
  }
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    ElMessage.error('邮箱格式不正确')
    return
  }
  if (emailChanged.value && !emailCode.value) {
    ElMessage.error('修改邮箱需要填写新邮箱收到的验证码')
    return
  }

  saving.value = true
  try {
    const updated = await updateUserProfile({
      nickname: profile.nickname || null,
      email: emailChanged.value ? profile.email : undefined,
      emailCode: emailChanged.value ? emailCode.value : undefined,
      mobile: profile.mobile || null,
      sex: profile.sex,
      idType: profile.idType,
      idNumber: profile.idNumber || null,
      address: profile.address || null,
    })
    profile.email = updated.email
    initialEmail.value = updated.email
    profile.nickname = updated.nickname || ''
    profile.mobile = updated.mobile || ''
    profile.sex = updated.sex ?? 2
    profile.avatar = updated.avatar
    emailCode.value = ''
    editing.value = false
    // 同步到全局 store，顶部导航头像/昵称立即刷新
    auth.updateProfile({
      email: updated.email,
      nickname: updated.nickname,
      avatar: updated.avatar,
      mobile: updated.mobile,
      sex: updated.sex,
    })
    ElMessage.success('个人资料已保存')
  } catch (error: unknown) {
    ElMessage.error(errorMessage(error, '个人资料保存失败，请重试'))
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadProfile(), loadOptions()])
})

async function loadOptions() {
  try {
    const [po, ro] = await Promise.all([getProfileOptions(), getRoleOptions()])
    idTypes.value = po.idTypes
    allRoles.value = ro.roles
  } catch {
    // 字典拉不到用兜底
  }
}
</script>

<style scoped>
.profile-page {
  max-width: 820px;
  margin: 0 auto;
}

.profile-body {
  display: grid;
  gap: 24px;
}

.account-section {
  display: flex;
  gap: 24px;
  align-items: center;
  padding: 20px;
  background: #f8fafc;
  border-radius: 8px;
}

.account-meta h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.meta-line {
  margin: 4px 0;
  font-size: 13px;
  color: #606266;
}

.meta-line code {
  background: #eef1f5;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.role-tag {
  margin-right: 6px;
}

.avatar-section :deep(.el-upload) {
  display: grid;
  justify-items: center;
  gap: 8px;
  cursor: pointer;
}

.avatar-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #409eff;
  font-size: 13px;
}

.full-width {
  width: 100%;
}

.read-text {
  padding: 6px 0;
  font-size: 14px;
  color: #303133;
  line-height: 1.5;
  min-height: 24px;
}

.readonly-list {
  display: grid;
  gap: 14px;
}

.readonly-list .row {
  display: flex;
  align-items: baseline;
  gap: 16px;
  font-size: 14px;
}

.readonly-list .label {
  flex: 0 0 90px;
  color: #909399;
}

.readonly-list .value {
  color: #303133;
  word-break: break-all;
}

.readonly-list .group-title {
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px solid #ebeef5;
  font-weight: 600;
  color: #303133;
}

.form-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #97a0af;
  line-height: 1.5;
}

.code-row {
  display: flex;
  gap: 12px;
  width: 100%;
}
.code-row :deep(.el-input) {
  flex: 1;
}

.action-row {
  margin-top: 8px;
  display: flex;
  gap: 12px;
}
</style>
