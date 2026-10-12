<template>
  <div class="app-layout">
    <header class="app-header">
      <RouterLink class="brand" :to="{ name: 'home' }">管理控制台</RouterLink>
      <nav class="app-nav" aria-label="主导航">
        <RouterLink :to="{ name: 'home' }">首页</RouterLink>
        <RouterLink :to="{ name: 'upload' }">文件上传</RouterLink>
        <RouterLink :to="{ name: 'about' }">关于</RouterLink>
        <RouterLink :to="{ name: 'account' }">账号绑定</RouterLink>
        <RouterLink
          v-if="auth.user?.role === 'admin'"
          :to="{ name: 'admin-logs' }"
        >
          审计日志
        </RouterLink>
        <RouterLink :to="{ name: 'three' }">3D 展示</RouterLink>
        <RouterLink :to="{ name: 'aidemo' }">AI 项目</RouterLink>
        <RouterLink :to="{ name: 'api-test' }">API 测试</RouterLink>
      </nav>
      <div class="account">
        <el-avatar
          :size="34"
          :src="auth.user?.avatar || undefined"
          :alt="auth.user?.nickname || auth.user?.username || '用户头像'"
        >
          {{ (auth.user?.nickname || auth.user?.username || 'U').slice(0, 1) }}
        </el-avatar>
        <span>{{ auth.user?.nickname || auth.user?.username }}</span>
        <el-button text @click="signOut">退出登录</el-button>
      </div>
    </header>
    <main class="app-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter, RouterLink, RouterView } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function signOut() {
  try {
    await auth.logout()
  } catch {
    ElMessage.error('服务端注销失败，本地登录状态已清除')
  }
  void router.replace({ name: 'login' })
}
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  background: #f4f7fb;
}

.app-header {
  min-height: 68px;
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 0 32px;
  background: #fff;
  border-bottom: 1px solid #e7ebf1;
}

.brand {
  color: #17233d;
  font-size: 18px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.app-nav {
  display: flex;
  flex: 1;
  gap: 20px;
}

.app-nav a {
  color: #596579;
  text-decoration: none;
}

.app-nav a.router-link-active {
  color: #409eff;
}

.account {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #596579;
  white-space: nowrap;
}

.app-content {
  max-width: 1440px;
  margin: 0 auto;
  padding: 28px 32px;
}

@media (max-width: 800px) {
  .app-header {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 14px;
    padding: 16px;
  }

  .app-nav {
    order: 3;
    flex-basis: 100%;
    flex-wrap: wrap;
    gap: 12px 18px;
  }

  .account {
    margin-left: auto;
  }

  .app-content {
    padding: 20px 16px;
  }
}
</style>
