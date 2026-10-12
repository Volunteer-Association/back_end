<template>
  <section class="account-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-heading">
          <div>
            <h1>账号绑定</h1>
            <p>绑定后可使用对应的 Gitee 或 GitHub 账号登录当前本地账号。</p>
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

    <el-card class="password-card" shadow="never">
      <template #header>
        <div>
          <h2>本地密码</h2>
          <p>
            {{
              hasLocalPassword
                ? '账号已设置本地密码；修改时需要验证当前密码。'
                : '设置后，除第三方快捷登录外，也可以使用本地账号密码登录。'
            }}
          </p>
        </div>
      </template>
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-position="top"
      >
        <el-form-item
          v-if="hasLocalPassword"
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
          {{ hasLocalPassword ? '修改本地密码' : '设置本地密码' }}
        </el-button>
      </el-form>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  getLinkedOAuthProviders,
  getOAuthProviders,
  getPasswordStatus,
  setLocalPassword,
  startOAuthLink,
  type OAuthProvider,
} from '@/api/modules/auth'

const router = useRouter()
const loading = ref(true)
const linkingProvider = ref<OAuthProvider | null>(null)
const providers = ref<OAuthProvider[]>([])
const linkedProviders = ref<OAuthProvider[]>([])
const hasLocalPassword = ref(false)
const passwordFormRef = ref<FormInstance>()
const savingPassword = ref(false)
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const passwordRules = computed<FormRules>(() => ({
  currentPassword: hasLocalPassword.value
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
  try {
    const [available, linked, passwordStatus] = await Promise.all([
      getOAuthProviders(),
      getLinkedOAuthProviders(),
      getPasswordStatus(),
    ])
    providers.value = available.providers
    linkedProviders.value = linked
    hasLocalPassword.value = passwordStatus.hasLocalPassword
  } catch {
    ElMessage.error('读取账号绑定状态失败，请刷新页面重试')
  } finally {
    loading.value = false
  }
})

async function savePassword() {
  if (!passwordFormRef.value || savingPassword.value) return
  const valid = await passwordFormRef.value.validate().catch(() => false)
  if (!valid) return

  savingPassword.value = true
  try {
    await setLocalPassword({
      ...(hasLocalPassword.value
        ? { currentPassword: passwordForm.currentPassword }
        : {}),
      newPassword: passwordForm.newPassword,
    })
    hasLocalPassword.value = true
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
  margin-top: 20px;
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
}
</style>
