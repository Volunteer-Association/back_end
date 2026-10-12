<template>
  <main class="callback-page">
    <el-card shadow="always">
      <el-result
        :icon="error ? 'error' : 'info'"
        :title="error ? '第三方登录失败' : '正在完成登录'"
        :sub-title="error || '正在安全验证并登录，请稍候…'"
      >
        <template v-if="error" #extra>
          <el-button type="primary" @click="returnFromError">
            {{ auth.isAuthenticated ? '返回账号绑定' : '返回登录' }}
          </el-button>
        </template>
      </el-result>
    </el-card>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const error = ref('')

const errorMessages: Record<string, string> = {
  access_denied: '你取消了第三方授权。',
  account_link_failed: '绑定失败；该第三方账号可能已绑定到其他本地账号。',
  invalid_state: '登录状态校验失败，请重新发起登录。',
  missing_code: '第三方平台未返回授权凭证，请重试。',
  oauth_failed: '第三方平台验证失败，请稍后重试。',
  unsupported_provider: '不支持此第三方登录方式。',
}

onMounted(async () => {
  const code = route.query.code
  const oauthError = route.query.error
  const linked = route.query.linked
  window.history.replaceState({}, document.title, '/auth/callback')

  if (linked === 'gitee' || linked === 'github') {
    ElMessage.success(`${linked === 'gitee' ? 'Gitee' : 'GitHub'} 账号绑定成功`)
    await router.replace({ name: 'account' })
    return
  }

  if (typeof oauthError === 'string') {
    error.value = errorMessages[oauthError] || '第三方登录失败，请重试。'
    return
  }
  if (typeof code !== 'string' || !code) {
    error.value = '缺少登录凭证，请重新发起登录。'
    return
  }

  try {
    await auth.completeOAuth(code)
    ElMessage.success('登录成功')
    const savedRedirect = sessionStorage.getItem('oauth:redirect')
    sessionStorage.removeItem('oauth:redirect')
    const target =
      savedRedirect?.startsWith('/') && !savedRedirect.startsWith('//')
        ? savedRedirect
        : '/'
    await router.replace(target)
  } catch {
    error.value = '登录凭证无效或已过期，请重新发起登录。'
  }
})

function returnFromError() {
  void router.replace(
    auth.isAuthenticated ? { name: 'account' } : { name: 'login' },
  )
}
</script>

<style scoped>
.callback-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  background: #f4f7fb;
}

.callback-page :deep(.el-card) {
  width: min(100%, 480px);
  border: 0;
  border-radius: 16px;
}
</style>
