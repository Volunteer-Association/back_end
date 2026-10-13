<template>
  <el-container class="app-layout">
    <el-header class="app-header" height="56px">
      <div class="brand">
        <span class="brand-logo">管</span>
        <span v-if="!collapsed" class="brand-name">管理控制台</span>
      </div>
      <div class="account">
        <el-avatar
          class="account-avatar"
          :size="32"
          :src="auth.user?.avatar || undefined"
        >
          {{ (auth.user?.nickname || auth.user?.username || 'U').slice(0, 1) }}
        </el-avatar>
        <span v-if="!collapsed" class="account-name">{{
          auth.user?.nickname || auth.user?.username
        }}</span>
        <el-button v-if="!collapsed" text @click="signOut">退出登录</el-button>
      </div>
    </el-header>

    <el-container class="body-container">
      <el-aside :width="asideWidth" class="app-aside">
        <el-menu
          :default-active="activeMenu"
          :collapse="collapsed"
          :collapse-transition="false"
          router
          class="app-menu"
        >
          <el-menu-item index="/">
            <el-icon><HomeFilled /></el-icon>
            <template #title>首页</template>
          </el-menu-item>

          <el-sub-menu index="finance">
            <template #title>
              <el-icon><Wallet /></el-icon>
              <span>财务管理</span>
            </template>
            <el-menu-item index="/bills">账单管理</el-menu-item>
            <el-menu-item index="/wallet">我的钱包</el-menu-item>
          </el-sub-menu>

          <el-sub-menu index="tools">
            <template #title>
              <el-icon><Tools /></el-icon>
              <span>系统工具</span>
            </template>
            <el-menu-item index="/upload">文件上传</el-menu-item>
            <el-menu-item index="/api-test">API 测试</el-menu-item>
          </el-sub-menu>

          <el-sub-menu
            v-if="auth.user?.role === 'admin'"
            index="admin"
          >
            <template #title>
              <el-icon><Setting /></el-icon>
              <span>管理后台</span>
            </template>
            <el-menu-item index="/admin/logs">系统日志</el-menu-item>
            <el-menu-item index="/admin/dict">数据字典</el-menu-item>
            <el-menu-item index="/admin/recharges">充值审核</el-menu-item>
            <el-menu-item index="/admin/reconcile">钱包对账</el-menu-item>
          </el-sub-menu>

          <el-sub-menu index="others">
            <template #title>
              <el-icon><More /></el-icon>
              <span>其他</span>
            </template>
            <el-menu-item index="/three">3D 展示</el-menu-item>
            <el-menu-item index="/aidemo">AI 项目</el-menu-item>
            <el-menu-item index="/about">关于</el-menu-item>
            <el-menu-item index="/profile">个人资料</el-menu-item>
            <el-menu-item index="/account">账号绑定</el-menu-item>
          </el-sub-menu>
        </el-menu>

        <!-- 左下角折叠按钮（蓝框位置） -->
        <div class="aside-toggle" @click="collapsed = !collapsed">
          <el-icon :size="18">
            <Expand v-if="collapsed" />
            <Fold v-else />
          </el-icon>
        </div>
      </el-aside>

      <el-container class="main-container">
        <!-- 红框：独立滚动的主内容区 -->
        <el-main class="app-main">
          <el-breadcrumb separator="/" class="app-breadcrumb">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentTitle">
              {{ currentTitle }}
            </el-breadcrumb-item>
          </el-breadcrumb>
          <div class="app-content">
            <RouterView />
          </div>
        </el-main>
        <el-footer class="app-footer">
          © 2026 管理控制台 · 企业精神管理平台
        </el-footer>
      </el-container>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  HomeFilled,
  Wallet,
  Tools,
  Setting,
  More,
  Expand,
  Fold,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const collapsed = ref(false)
const asideWidth = computed(() => (collapsed.value ? '64px' : '220px'))

const activeMenu = computed(() => route.path)
const currentTitle = computed(() => (route.meta.title as string) || '')

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
/* 整个应用锁定视口，body 不滚动 */
.app-layout {
  height: 100vh;
  height: 100svh;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #e7ebf1;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-logo {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: #fff;
  font-weight: 700;
  background: linear-gradient(135deg, #409eff, #667eea);
  border-radius: 8px;
}

.brand-name {
  color: #17233d;
  font-size: 18px;
  font-weight: 700;
  white-space: nowrap;
}

.account {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #596579;
}

.account-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.body-container {
  height: calc(100vh - 56px);
  height: calc(100svh - 56px);
}

.app-aside {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid #e7ebf1;
  transition: width 0.2s ease;
  overflow: hidden;
}

.app-menu {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  border-right: none;
}

/* 左下角折叠按钮 */
.aside-toggle {
  display: grid;
  place-items: center;
  height: 44px;
  border-top: 1px solid #e7ebf1;
  color: #596579;
  cursor: pointer;
  transition: background 0.15s;
}

.aside-toggle:hover {
  background: #f4f7fb;
  color: #409eff;
}

.main-container {
  height: 100%;
}

/* 红框区域：唯一可滚动的地方 */
.app-main {
  background: #f4f7fb;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
}

.app-breadcrumb {
  padding: 16px 24px 0;
}

.app-content {
  padding: 16px 24px 24px;
}

.app-footer {
  padding: 10px 24px;
  text-align: center;
  color: #97a0af;
  font-size: 13px;
  background: #fff;
  border-top: 1px solid #e7ebf1;
}
</style>
