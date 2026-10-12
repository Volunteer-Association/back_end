import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  exchangeOAuthCode,
  login as loginApi,
  logoutSession,
  register as registerApi,
  type LoginUser,
} from '@/api/modules/auth'

const TOKEN_KEY = 'access_token'
const LEGACY_TOKEN_KEY = 'token'
const USER_KEY = 'user'

/** 从浏览器本地缓存恢复用户展示信息；损坏的数据会被清理。 */
function readStoredUser(): LoginUser | null {
  try {
    const stored = localStorage.getItem(USER_KEY)
    return stored ? (JSON.parse(stored) as LoginUser) : null
  } catch {
    localStorage.removeItem(USER_KEY)
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) ?? '')
  const user = ref<LoginUser | null>(readStoredUser())
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

  /** 同步令牌和用户资料至 Pinia 状态及本地缓存。 */
  function setSession(nextToken: string, nextUser: LoginUser) {
    token.value = nextToken
    user.value = nextUser
    localStorage.setItem(TOKEN_KEY, nextToken)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    localStorage.setItem(USER_KEY, JSON.stringify(user.value))
  }

  /** 更新登录账号名，避免账号完善后界面仍显示系统生成名。 */
  function updateUsername(username: string) {
    if (!user.value) return
    user.value = { ...user.value, username }
    localStorage.setItem(USER_KEY, JSON.stringify(user.value))
  }

  /** 将服务器确认后的个人资料合并至当前用户状态。 */
  function updateProfile(profile: Partial<LoginUser>) {
    if (!user.value) return
    user.value = { ...user.value, ...profile }
    localStorage.setItem(USER_KEY, JSON.stringify(user.value))
  }

  /** 清除已失效的会话，不再向服务端发起注销请求。 */
  function clearSession() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  /** 即使注销请求失败，也清除浏览器中的本地会话。 */
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
  }
})
