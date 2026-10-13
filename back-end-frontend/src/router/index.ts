import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/auth/callback',
      name: 'oauth-callback',
      component: () => import('@/views/OAuthCallbackView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/views/HomeView.vue'),
          meta: { title: '首页' },
        },
        {
          path: 'bills',
          name: 'bills',
          component: () => import('@/views/BillsView.vue'),
          meta: { title: '账单管理' },
        },
        {
          path: 'wallet',
          name: 'wallet',
          component: () => import('@/views/WalletView.vue'),
          meta: { title: '我的钱包' },
        },
        {
          path: 'about',
          name: 'about',
          component: () => import('@/views/AboutView.vue'),
          meta: { title: '关于' },
        },
        {
          path: 'account',
          name: 'account',
          component: () => import('@/views/AccountView.vue'),
          meta: { title: '账号绑定' },
        },
        {
          path: 'profile',
          name: 'user-profile',
          component: () => import('@/views/UserProfileView.vue'),
          meta: { title: '个人资料' },
        },
        {
          path: 'admin/logs',
          name: 'admin-logs',
          component: () => import('@/views/AdminLogsView.vue'),
          meta: { admin: true, title: '系统日志' },
        },
        {
          path: 'admin/dict',
          name: 'admin-dict',
          component: () => import('@/views/DictAdminView.vue'),
          meta: { admin: true, title: '数据字典' },
        },
        {
          path: 'admin/recharges',
          name: 'admin-recharges',
          component: () => import('@/views/AdminRechargeView.vue'),
          meta: { admin: true, title: '充值审核' },
        },
        {
          path: 'upload',
          name: 'upload',
          component: () => import('@/views/FileUploadView.vue'),
          meta: { title: '文件上传' },
        },
        {
          path: 'text',
          name: 'text',
          component: () => import('@/views/TextView.vue'),
          meta: { title: '文本页' },
        },
        {
          path: 'web3d',
          name: 'three',
          component: () => import('@/views/ThreeView.vue'),
          meta: { title: '3D 展示' },
        },
        {
          path: 'aidemo',
          name: 'aidemo',
          component: () => import('@/views/AIdemoView.vue'),
          meta: { title: 'AI 项目' },
        },
        {
          path: 'api-test',
          name: 'api-test',
          component: () => import('@/views/ApiTestView.vue'),
          meta: { title: 'API 测试' },
        },
      ],
    },
  ],
})

/** 统一执行页面登录检查及管理员页面的角色检查。 */
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.public) {
    if (to.name === 'login' && auth.isAuthenticated) {
      return { name: 'home' }
    }
    return true
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.admin && auth.user?.role !== 'admin') {
    return { name: 'home' }
  }

  return true
})

export default router
