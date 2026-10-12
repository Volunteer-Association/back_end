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

  async function login(credentials: { username: string; password: string }) {
    const response = await loginApi(credentials)
    setSession(response.data.accessToken, response.data.user)
    return response
  }

  async function completeOAuth(code: string) {
    const response = await exchangeOAuthCode(code)
    setSession(response.data.accessToken, response.data.user)
    return response
  }

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
    localStorage.setItem(TOKEN_KEY, nextToken)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    localStorage.setItem(USER_KEY, JSON.stringify(user.value))
  }

  function updateUsername(username: string) {
    if (!user.value) return
    user.value = { ...user.value, username }
    localStorage.setItem(USER_KEY, JSON.stringify(user.value))
  }

  function updateProfile(profile: Partial<LoginUser>) {
    if (!user.value) return
    user.value = { ...user.value, ...profile }
    localStorage.setItem(USER_KEY, JSON.stringify(user.value))
  }

  async function logout() {
    try {
      await logoutSession()
    } finally {
      token.value = ''
      user.value = null
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(LEGACY_TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
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
    logout,
  }
})
