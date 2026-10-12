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
        },
        {
          path: 'about',
          name: 'about',
          component: () => import('@/views/AboutView.vue'),
        },
        {
          path: 'account',
          name: 'account',
          component: () => import('@/views/AccountView.vue'),
        },
        {
          path: 'admin/logs',
          name: 'admin-logs',
          component: () => import('@/views/AdminLogsView.vue'),
          meta: { admin: true },
        },
        {
          path: 'upload',
          name: 'upload',
          component: () => import('@/views/FileUploadView.vue'),
        },
        {
          path: 'text',
          name: 'text',
          component: () => import('@/views/TextView.vue'),
        },
        {
          path: 'web3d',
          name: 'three',
          component: () => import('@/views/ThreeView.vue'),
        },
        {
          path: 'aidemo',
          name: 'aidemo',
          component: () => import('@/views/AIdemoView.vue'),
        },
        {
          path: 'api-test',
          name: 'api-test',
          component: () => import('@/views/ApiTestView.vue'),
        },
      ],
    },
  ],
})

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
