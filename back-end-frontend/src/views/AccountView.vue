<template>
  <section class="account-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-heading">
          <div>
            <h1>账号安全与绑定</h1>
            <p>设置本地密码，或管理可用于快捷登录的第三方账号。</p>
          </div>
          <el-button @click="router.push('/')">返回首页</el-button>
        </div>
      </template>

      <el-alert
        class="security-note"
        type="info"
        :closable="false"
        title="请先登录需要绑定的本地账号，再完成第三方授权。"
      />

      <el-skeleton v-if="loading" :rows="2" animated />
      <div v-else class="provider-list">
        <div v-for="provider in providers" :key="provider" class="provider-row">
          <div>
            <h2>{{ providerName(provider) }}</h2>
            <p>
              {{
                linkedProviders.includes(provider)
                  ? '已绑定到当前账号'
                  : '尚未绑定'
              }}
            </p>
          </div>
          <el-tag
            :type="linkedProviders.includes(provider) ? 'success' : 'info'"
          >
            {{ linkedProviders.includes(provider) ? '已绑定' : '未绑定' }}
          </el-tag>
          <el-button
            v-if="!linkedProviders.includes(provider)"
            type="primary"
            :loading="linkingProvider === provider"
            @click="linkProvider(provider)"
          >
            绑定 {{ providerName(provider) }}
          </el-button>
        </div>
        <el-empty
          v-if="!providers.length"
          description="服务端尚未配置可用的第三方登录"
        />
      </div>
    </el-card>

    <el-card class="session-card" shadow="never">
      <template #header>
        <div>
          <h2>登录设备管理</h2>
          <p>控制当前账号是否可以在多个设备上同时保持登录。</p>
        </div>
      </template>
      <el-skeleton v-if="sessionSettingsLoading" :rows="1" animated />
      <el-alert
        v-else-if="sessionSettingsError"
        type="error"
        :closable="false"
        :title="sessionSettingsError"
      >
        <el-button text type="primary" @click="loadSessionSettings">
          重新读取
        </el-button>
      </el-alert>
      <div v-else class="session-setting">
        <div>
          <strong>允许多设备同时登录</strong>
          <p>
            {{
              sessionSettings.allowMultiLogin
                ? '开启后，多个设备可以同时保持登录。'
                : '关闭后，下次登录会使其他设备退出；现有会话暂时不受影响。'
            }}
          </p>
        </div>
        <el-switch
          v-model="sessionSettings.allowMultiLogin"
          :loading="savingSessionSettings"
          :disabled="savingSessionSettings"
          active-text="允许"
          inactive-text="禁止"
          @change="saveSessionSettings"
        />
      </div>
    </el-card>

    <el-card class="password-card" shadow="never">
      <template #header>
        <div>
          <h2>{{ requiresUsernameSetup ? '完善本地账号' : '本地密码' }}</h2>
          <p>
            {{
              requiresUsernameSetup
                ? '首次第三方登录已完成，请设置自己的本地登录账号和密码。完成后可使用账号密码登录。'
                : hasLocalPassword === true
                  ? '账号已设置本地密码；修改时需要验证当前密码。'
                  : hasLocalPassword === false
                    ? '尚未设置本地密码。设置后，除第三方快捷登录外，也可以使用本地账号密码登录。'
                    : '正在读取本地密码状态…'
            }}
          </p>
          <div v-if="auth.user?.avatar" class="signed-in-profile">
            <el-avatar
              :size="56"
              :src="auth.user.avatar"
              :alt="auth.user.nickname || auth.user.username"
            />
            <span>{{ auth.user.nickname || auth.user.username }}</span>
          </div>
        </div>
      </template>
      <el-alert
        v-if="passwordStatusError"
        type="error"
        :closable="false"
        :title="passwordStatusError"
      >
        <el-button text type="primary" @click="loadPasswordStatus">
          重新读取
        </el-button>
      </el-alert>
      <el-skeleton v-else-if="hasLocalPassword === null" :rows="3" animated />
      <el-form
        v-else
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-position="top"
      >
        <el-form-item
          v-if="requiresUsernameSetup"
          label="本地登录账号"
          prop="username"
        >
          <el-input
            v-model.trim="passwordForm.username"
            autocomplete="username"
            placeholder="3-60 位字母、数字、下划线或连字符"
          />
        </el-form-item>
        <el-form-item
          v-if="hasLocalPassword === true"
          label="当前密码"
          prop="currentPassword"
        >
          <el-input
            v-model="passwordForm.currentPassword"
            autocomplete="current-password"
            show-password
            type="password"
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            autocomplete="new-password"
            placeholder="请输入 8-72 位密码"
            show-password
            type="password"
          />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            autocomplete="new-password"
            show-password
            type="password"
          />
        </el-form-item>
        <el-button
          type="primary"
          :loading="savingPassword"
          @click="savePassword"
        >
          {{
            requiresUsernameSetup
              ? '保存本地账号并设置密码'
              : hasLocalPassword
                ? '修改本地密码'
                : '设置本地密码'
          }}
        </el-button>
      </el-form>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  getLinkedOAuthProviders,
  getOAuthProviders,
  getPasswordStatus,
  getSessionSettings,
  setLocalPassword,
  startOAuthLink,
  updateSessionSettings,
  type OAuthProvider,
} from '@/api/modules/auth'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(true)
const linkingProvider = ref<OAuthProvider | null>(null)
const providers = ref<OAuthProvider[]>([])
const linkedProviders = ref<OAuthProvider[]>([])
const hasLocalPassword = ref<boolean | null>(null)
const requiresUsernameSetup = ref(false)
const passwordStatusError = ref('')
const passwordFormRef = ref<FormInstance>()
const savingPassword = ref(false)
const sessionSettingsLoading = ref(true)
const sessionSettingsError = ref('')
const savingSessionSettings = ref(false)
const sessionSettings = reactive({ allowMultiLogin: false })
const passwordForm = reactive({
  username: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const passwordRules = computed<FormRules>(() => ({
  username: requiresUsernameSetup.value
    ? [
        { required: true, message: '请输入本地登录账号', trigger: 'blur' },
        {
          pattern: /^[A-Za-z0-9_-]{3,60}$/,
          message: '登录账号需为 3-60 位字母、数字、下划线或连字符',
          trigger: 'blur',
        },
      ]
    : [],
  currentPassword: hasLocalPassword.value === true
    ? [{ required: true, message: '请输入当前密码', trigger: 'blur' }]
    : [],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, max: 72, message: '密码长度需为 8-72 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}))

function providerName(provider: OAuthProvider) {
  return provider === 'gitee' ? 'Gitee' : 'GitHub'
}

onMounted(async () => {
  await loadSessionSettings()
  try {
    const [available, linked] = await Promise.all([
      getOAuthProviders(),
      getLinkedOAuthProviders(),
    ])
    providers.value = available.providers
    linkedProviders.value = linked
  } catch {
    ElMessage.error('读取第三方账号绑定状态失败，请刷新页面重试')
  } finally {
    loading.value = false
  }
  await loadPasswordStatus()
})

async function loadSessionSettings() {
  sessionSettingsLoading.value = true
  sessionSettingsError.value = ''
  try {
    const result = await getSessionSettings()
    sessionSettings.allowMultiLogin = result.allowMultiLogin
  } catch (error: unknown) {
    sessionSettingsError.value =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? `无法读取登录设备设置：${error.message}`
        : '无法读取登录设备设置，请稍后重试。'
  } finally {
    sessionSettingsLoading.value = false
  }
}

async function saveSessionSettings(allowMultiLogin: boolean | string | number) {
  if (savingSessionSettings.value) return
  const nextValue = allowMultiLogin === true
  const previousValue = !nextValue
  savingSessionSettings.value = true
  try {
    const result = await updateSessionSettings({
      allowMultiLogin: nextValue,
    })
    sessionSettings.allowMultiLogin = result.allowMultiLogin
    ElMessage.success('登录设备设置已保存')
  } catch (error: unknown) {
    sessionSettings.allowMultiLogin = previousValue
    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : '登录设备设置保存失败，请重试'
    ElMessage.error(message)
  } finally {
    savingSessionSettings.value = false
  }
}

async function loadPasswordStatus() {
  passwordStatusError.value = ''
  hasLocalPassword.value = null
  try {
    const result = await getPasswordStatus()
    hasLocalPassword.value = result.hasLocalPassword
    requiresUsernameSetup.value = result.requiresUsernameSetup
    passwordForm.username = result.requiresUsernameSetup ? '' : result.username
  } catch (error: unknown) {
    hasLocalPassword.value = null
    passwordStatusError.value =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? `无法读取密码状态：${error.message}`
        : '无法读取密码状态，请确认后端已更新并重新启动。'
  }
}

async function savePassword() {
  if (hasLocalPassword.value === null) return
  if (!passwordFormRef.value || savingPassword.value) return
  const valid = await passwordFormRef.value.validate().catch(() => false)
  if (!valid) return

  savingPassword.value = true
  try {
    await setLocalPassword({
      ...(requiresUsernameSetup.value
        ? { username: passwordForm.username }
        : {}),
      ...(hasLocalPassword.value === true
        ? { currentPassword: passwordForm.currentPassword }
        : {}),
      newPassword: passwordForm.newPassword,
    })
    hasLocalPassword.value = true
    requiresUsernameSetup.value = false
    auth.updateUsername(passwordForm.username || auth.user?.username || '')
    passwordForm.username = ''
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    passwordFormRef.value.clearValidate()
    ElMessage.success('本地密码已保存')
  } catch (error: unknown) {
    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : '密码保存失败，请重试'
    ElMessage.error(message)
  } finally {
    savingPassword.value = false
  }
}

async function linkProvider(provider: OAuthProvider) {
  if (linkingProvider.value) return
  linkingProvider.value = provider
  try {
    const { authorizationUrl } = await startOAuthLink(provider)
    window.location.assign(authorizationUrl)
  } catch {
    ElMessage.error(`发起 ${providerName(provider)} 绑定失败，请重试`)
    linkingProvider.value = null
  }
}
</script>

<style scoped>
.account-page {
  display: flex;
  flex-direction: column;
  max-width: 820px;
  margin: 0 auto;
}

.card-heading,
.provider-row {
  display: flex;
  align-items: center;
  gap: 20px;
}

.card-heading {
  justify-content: space-between;
}

.card-heading h1,
.provider-row h2 {
  margin: 0;
  color: #17233d;
}

.card-heading h1 {
  font-size: 20px;
}

.card-heading p,
.provider-row p {
  margin: 8px 0 0;
  color: #7a8598;
}

.security-note {
  margin-bottom: 16px;
}

.password-card {
  order: -1;
  margin-bottom: 20px;
}

.session-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.session-setting strong {
  color: #17233d;
}

.session-setting p {
  margin: 6px 0 0;
  color: #7a8598;
}

.password-card h2 {
  margin: 0;
  color: #17233d;
  font-size: 18px;
}

.password-card p {
  margin: 8px 0 0;
  color: #7a8598;
}

.signed-in-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  color: #596579;
}

.provider-row {
  min-height: 82px;
  padding: 16px 4px;
  border-bottom: 1px solid #edf0f5;
}

.provider-row > div:first-child {
  flex: 1;
}

.provider-row h2 {
  font-size: 16px;
}

@media (max-width: 560px) {
  .card-heading,
  .provider-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .session-setting {
    align-items: flex-start;
  }
}
</style>
