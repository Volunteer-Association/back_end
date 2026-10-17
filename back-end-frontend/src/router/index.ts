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
          path: 'notifications',
          name: 'notifications',
          component: () => import('@/views/NotificationsView.vue'),
          meta: { title: '消息通知' },
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
          path: 'admin/kyc',
          name: 'admin-kyc',
          component: () => import('@/views/AdminKycView.vue'),
          meta: { admin: true, title: '实名审核' },
        },
        {
          path: 'admin/withdraw-pending',
          name: 'admin-withdraw',
          component: () => import('@/views/AdminWithdrawView.vue'),
          meta: { admin: true, title: '提现审核' },
        },
        {
          path: 'admin/reconcile',
          name: 'admin-reconcile',
          component: () => import('@/views/AdminReconcileView.vue'),
          meta: { admin: true, title: '钱包对账' },
        },
        {
          path: 'admin/risk-config',
          name: 'admin-risk',
          component: () => import('@/views/AdminRiskView.vue'),
          meta: { admin: true, title: '风控规则' },
        },
        {
          path: 'admin/monitor',
          name: 'admin-monitor',
          component: () => import('@/views/AdminMonitorView.vue'),
          meta: { admin: true, title: '系统监控' },
        },
        {
          path: 'admin/users',
          name: 'admin-users',
          component: () => import('@/views/AdminUsersView.vue'),
          meta: { superAdmin: true, title: '用户管理' },
        },
        {
          path: 'admin/roles',
          name: 'admin-roles',
          component: () => import('@/views/AdminRolesView.vue'),
          meta: { superAdmin: true, title: '角色管理' },
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

/** 当前激活的角色（用户在右上角切换的那个），决定能进哪些页面。 */
function getActiveRole(): string {
  const auth = useAuthStore()
  const stored = localStorage.getItem('active_role')
  const roles = auth.user?.roles
  if (Array.isArray(roles) && roles.length) {
    return roles.includes(stored ?? '') ? (stored as string) : roles[0]
  }
  return auth.user?.role ?? 'user'
}

let sessionRestored = false

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.public) {
    if (to.name === 'login' && auth.isAuthenticated) {
      return { name: 'home' }
    }
    return true
  }

  // 首次进入时：不管 token 在不在，只要 user 没加载就调 restore
  // restore 内部：有 token 调 /auth/profile 拿 user，没 token 调 /auth/refresh
  if (!sessionRestored) {
    sessionRestored = true
    if (!auth.user) {
      await auth.restore()
    }
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  const activeRole = getActiveRole()
  if (to.meta.admin && activeRole !== 'admin') {
    return { name: 'home' }
  }
  if (to.meta.superAdmin && activeRole !== 'super_admin') {
    return { name: 'home' }
  }

  return true
})

export default router
