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
          class="account-avatar"
          :size="32"
          :src="auth.user?.avatar || undefined"
          :alt="auth.user?.nickname || auth.user?.username || '用户头像'"
        >
          {{ (auth.user?.nickname || auth.user?.username || 'U').slice(0, 1) }}
        </el-avatar>
        <span class="account-name">{{
          auth.user?.nickname || auth.user?.username
        }}</span>
        <el-button text aria-label="退出登录" @click="signOut">
          <span class="logout-label">退出登录</span>
          <span class="logout-short-label">退出</span>
        </el-button>
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
  min-height: 100svh;
  background: #f4f7fb;
}

.app-header {
  min-width: 0;
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
  min-width: 0;
  gap: 20px;
}

.app-nav a {
  flex-shrink: 0;
  color: #596579;
  text-decoration: none;
}

.app-nav a.router-link-active {
  color: #409eff;
}

.account {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  color: #596579;
  white-space: nowrap;
}

.account-avatar {
  flex: none;
}

.account-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.logout-short-label {
  display: none;
}

.app-content {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 28px 32px;
}

@media (max-width: 800px) {
  .app-header {
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 16px;
    padding: 12px 16px 0;
  }

  .app-nav {
    order: 3;
    flex-basis: 100%;
    gap: 8px;
    margin: 0 -16px;
    padding: 0 16px 12px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    white-space: nowrap;
  }

  .app-nav::-webkit-scrollbar {
    display: none;
  }

  .app-nav a {
    padding: 6px 10px;
    border-radius: 8px;
  }

  .account {
    margin-left: auto;
    gap: 8px;
  }

  .app-content {
    padding: 20px 16px;
  }
}

@media (max-width: 480px) {
  .app-header {
    gap: 10px;
    padding-right: 12px;
    padding-left: 12px;
  }

  .app-nav {
    margin-right: -12px;
    margin-left: -12px;
    padding-right: 12px;
    padding-left: 12px;
  }

  .account {
    gap: 6px;
  }

  .account-name {
    max-width: 92px;
    font-size: 13px;
  }

  .account :deep(.el-button) {
    padding: 6px 4px;
    font-size: 13px;
  }

  .logout-label {
    display: none;
  }

  .logout-short-label {
    display: inline;
  }

  .app-content {
    padding: 16px 12px;
  }
}
</style>
