import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  exchangeOAuthCode,
  login as loginApi,
  logoutSession,
  register as registerApi,
  getUserProfile,
  type LoginUser,
  setAccessToken,
  setCurrentUser,
  tryRestoreSession,
  getAccessToken,
  getCurrentUser,
} from '@/api/modules/auth'

/**
 * 会话状态：
 * - access_token 存 sessionStorage（刷新页面保留，关闭标签页清空）
 * - user 不持久化，每次启动调 /auth/profile 拿完整信息
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref(getAccessToken())
  const user = ref<LoginUser | null>(null)
  const isAuthenticated = computed(() => Boolean(token.value))

  /** 完成本地登录并缓存服务端签发的会话信息。 */
  async function login(credentials: { username: string; password: string }) {
    const response = await loginApi(credentials)
    setSession(response.data.accessToken, response.data.user)
    return response
  }

  /** 兑换 OAuth 一次性登录码并建立本地会话。 */
  async function completeOAuth(code: string) {
    const response = await exchangeOAuthCode(code)
    setSession(response.data.accessToken, response.data.user)
    return response
  }

  /** 注册完成后立即建立已登录会话。 */
  async function register(credentials: {
    username: string
    email: string
    password: string
    emailCode: string
  }) {
    const response = await registerApi(credentials)
    setSession(response.data.accessToken, response.data.user)
    return response
  }

  function setSession(nextToken: string, nextUser: LoginUser) {
    token.value = nextToken
    user.value = nextUser
    setAccessToken(nextToken)
    setCurrentUser(nextUser)
  }

  function updateUsername(username: string) {
    if (!user.value) return
    user.value = { ...user.value, username }
  }

  function updateProfile(profile: Partial<LoginUser>) {
    if (!user.value) return
    user.value = { ...user.value, ...profile }
    setCurrentUser(user.value)
  }

  function clearSession() {
    token.value = ''
    user.value = null
    setAccessToken('')
    setCurrentUser(null)
  }

  /**
   * 应用启动时：
   * - 有 access_token：调 /auth/profile 拿完整用户信息（不调 refresh）
   * - 没 access_token：用 HttpOnly cookie 调 /auth/refresh 恢复
   */
  async function restore(): Promise<boolean> {
    if (getAccessToken()) {
      try {
        const p = await getUserProfile()
        user.value = {
          id: p.id,
          username: p.username,
          email: p.email,
          nickname: p.nickname,
          avatar: p.avatar,
          role: (p.role as 'user' | 'admin' | 'super_admin') ?? 'user',
          roles: p.roles,
          mobile: p.mobile,
          sex: p.sex,
          createdAt: p.createdAt,
        }
        setCurrentUser(user.value)
        return true
      } catch {
        // token 失效，走 refresh
      }
    }
    const ok = await tryRestoreSession()
    if (ok) {
      token.value = getAccessToken()
      user.value = (getCurrentUser() as LoginUser) ?? null
    }
    return ok
  }

  async function logout() {
    try {
      await logoutSession()
    } finally {
      clearSession()
    }
  }

  return {
    token,
    user,
    isAuthenticated,
    login,
    register,
    completeOAuth,
    updateUsername,
    updateProfile,
    clearSession,
    logout,
    restore,
  }
})
