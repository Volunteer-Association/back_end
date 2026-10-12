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
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  getLinkedOAuthProviders,
  getOAuthProviders,
  startOAuthLink,
  type OAuthProvider,
} from '@/api/modules/auth'

const router = useRouter()
const loading = ref(true)
const linkingProvider = ref<OAuthProvider | null>(null)
const providers = ref<OAuthProvider[]>([])
const linkedProviders = ref<OAuthProvider[]>([])

function providerName(provider: OAuthProvider) {
  return provider === 'gitee' ? 'Gitee' : 'GitHub'
}

onMounted(async () => {
  try {
    const [available, linked] = await Promise.all([
      getOAuthProviders(),
      getLinkedOAuthProviders(),
    ])
    providers.value = available.providers
    linkedProviders.value = linked
  } catch {
    ElMessage.error('读取账号绑定状态失败，请刷新页面重试')
  } finally {
    loading.value = false
  }
})

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
