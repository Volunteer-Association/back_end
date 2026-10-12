<template>
  <main class="login-page">
    <el-card class="login-card" shadow="always">
      <div class="login-heading">
        <h1>{{ mode === 'login' ? '欢迎登录' : '创建账号' }}</h1>
        <p>
          {{
            mode === 'login'
              ? '使用本地账号或第三方账号登录'
              : '注册后将自动使用用户名作为默认昵称'
          }}
        </p>
      </div>

      <div class="auth-modes">
        <el-button
          :type="mode === 'login' ? 'primary' : 'default'"
          @click="mode = 'login'"
        >登录</el-button>
        <el-button
          :type="mode === 'register' ? 'primary' : 'default'"
          @click="mode = 'register'"
        >注册</el-button>
      </div>

      <el-form
        v-if="mode === 'login'"
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @keyup.enter="submit"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model.trim="form.username"
            autocomplete="username"
            placeholder="请输入用户名"
            size="large"
          />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            autocomplete="current-password"
            placeholder="请输入密码"
            size="large"
            show-password
            type="password"
          />
        </el-form-item>
        <el-button
          class="submit-button"
          :loading="loading"
          type="primary"
          size="large"
          @click="submit"
        >
          登录
        </el-button>
      </el-form>
      <el-form
        v-else
        ref="registerFormRef"
        :model="registerForm"
        :rules="registerRules"
        label-position="top"
        @keyup.enter="submit"
      >
        <el-form-item label="用户名（注册后作为默认昵称）" prop="username">
          <el-input
            v-model.trim="registerForm.username"
            autocomplete="username"
            placeholder="3-60 位字母、数字、下划线或连字符"
            size="large"
          />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input
            v-model.trim="registerForm.email"
            autocomplete="email"
            placeholder="请输入邮箱"
            size="large"
          />
        </el-form-item>
        <el-form-item label="邮箱验证码" prop="emailCode">
          <div class="verification-row">
            <el-input
              v-model.trim="registerForm.emailCode"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="6 位验证码"
              size="large"
            />
            <el-button
              :disabled="countdown > 0"
              :loading="sendingCode"
              size="large"
              @click="sendCode"
            >{{ countdown > 0 ? `${countdown} 秒后重试` : '获取验证码' }}</el-button>
          </div>
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="registerForm.password"
            autocomplete="new-password"
            placeholder="请输入 8-72 位密码"
            size="large"
            show-password
            type="password"
          />
        </el-form-item>
        <el-button
          class="submit-button"
          :loading="loading"
          type="primary"
          size="large"
          @click="submit"
        >
          注册并登录
        </el-button>
      </el-form>
      <template v-if="oauthProviders.length">
        <div class="login-divider"><span>或使用第三方账号登录</span></div>
        <div class="oauth-buttons">
          <el-button
            v-if="oauthProviders.includes('gitee')"
            size="large"
            @click="startOAuth('gitee')"
          >
            使用 Gitee 登录
          </el-button>
          <el-button
            v-if="oauthProviders.includes('github')"
            size="large"
            @click="startOAuth('github')"
          >
            使用 GitHub 登录
          </el-button>
        </div>
      </template>
    </el-card>
  </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  getOAuthProviders,
  sendRegistrationCode,
  type OAuthProvider,
} from '@/api/modules/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const formRef = ref<FormInstance>()
const registerFormRef = ref<FormInstance>()
const loading = ref(false)
const sendingCode = ref(false)
const mode = ref<'login' | 'register'>('login')
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | undefined
const oauthProviders = ref<OAuthProvider[]>([])
const form = reactive({ username: '', password: '' })
const registerForm = reactive({
  username: '',
  email: '',
  emailCode: '',
  password: '',
})
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}
const registerRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_-]{3,60}$/,
      message: '用户名需为 3-60 位字母、数字、下划线或连字符',
      trigger: 'blur',
    },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效邮箱地址', trigger: 'blur' },
  ],
  emailCode: [
    { required: true, message: '请输入邮箱验证码', trigger: 'blur' },
    { pattern: /^\d{6}$/, message: '验证码为 6 位数字', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, max: 72, message: '密码长度需为 8-72 位', trigger: 'blur' },
  ],
}

onMounted(async () => {
  try {
    oauthProviders.value = (await getOAuthProviders()).providers
  } catch {
    oauthProviders.value = []
    ElMessage.warning('暂时无法获取第三方登录方式')
  }
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

function startOAuth(provider: OAuthProvider) {
  const redirect = route.query.redirect
  if (
    typeof redirect === 'string' &&
    redirect.startsWith('/') &&
    !redirect.startsWith('//')
  ) {
    sessionStorage.setItem('oauth:redirect', redirect)
  }
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
  window.location.assign(
    `${baseUrl.replace(/\/$/, '')}/auth/oauth/${provider}`,
  )
}

async function submit() {
  const activeForm =
    mode.value === 'login' ? formRef.value : registerFormRef.value
  if (!activeForm || loading.value) return

  const valid = await activeForm.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(form)
      ElMessage.success('登录成功')
    } else {
      await auth.register(registerForm)
      ElMessage.success('注册成功')
    }
    const redirect = route.query.redirect
    const target =
      typeof redirect === 'string' &&
      redirect.startsWith('/') &&
      !redirect.startsWith('//')
        ? redirect
        : '/'
    await router.replace(target)
  } catch (error: unknown) {
    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : mode.value === 'login'
          ? '用户名或密码错误，请重试'
          : '注册失败，请重试'
    ElMessage.error(message)
  } finally {
    loading.value = false
  }
}

async function sendCode() {
  if (sendingCode.value || countdown.value > 0) return
  const validEmail = await registerFormRef.value
    ?.validateField('email')
    .then(() => true)
    .catch(() => false)
  if (!validEmail) return

  sendingCode.value = true
  try {
    const result = await sendRegistrationCode({ email: registerForm.email })
    ElMessage.success(result.message)
    countdown.value = result.retryAfterSeconds
    countdownTimer = setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0 && countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = undefined
      }
    }, 1000)
  } catch (error: unknown) {
    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : '验证码发送失败，请稍后重试'
    ElMessage.error(message)
  } finally {
    sendingCode.value = false
  }
}
</script>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgb(64 158 255 / 18%), transparent 38%),
    #f4f7fb;
}

.login-card {
  width: min(100%, 420px);
  border: 0;
  border-radius: 16px;
}

.login-heading {
  margin-bottom: 28px;
  text-align: center;
}

.auth-modes {
  display: flex;
  margin: 0 0 20px;
}

.auth-modes :deep(.el-button) {
  flex: 1;
  margin: 0;
}

.verification-row {
  display: flex;
  width: 100%;
  gap: 8px;
}

.verification-row .el-input {
  min-width: 0;
}

.login-heading h1 {
  margin: 0 0 8px;
  color: #17233d;
  font-size: 26px;
}

.login-heading p {
  margin: 0;
  color: #7a8598;
}

.submit-button {
  width: 100%;
  margin-top: 8px;
}

.login-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 22px 0 16px;
  color: #98a2b3;
  font-size: 13px;
}

.login-divider::before,
.login-divider::after {
  flex: 1;
  height: 1px;
  background: #e7ebf1;
  content: '';
}

.oauth-buttons {
  display: flex;
  gap: 12px;
}

.oauth-buttons :deep(.el-button) {
  flex: 1;
  margin: 0;
}

@media (max-width: 480px) {
  .login-page {
    min-height: 100svh;
    padding: 16px;
  }

  .login-card {
    border-radius: 12px;
  }

  .login-heading h1 {
    font-size: 23px;
  }
}
</style>
