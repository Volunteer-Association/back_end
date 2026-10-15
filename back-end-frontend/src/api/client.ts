import axios, {
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || '/api'
).replace(/\/+$/, '')

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT || 10000),
})

/**
 * Access Token 存 sessionStorage（不是 localStorage）：
 * - 刷新页面还在，不用每次都调 /auth/refresh
 * - 关闭标签页就清空，不跨标签持久化
 * User 信息不持久化，启动时调 /auth/profile 拿。
 * Refresh Token 在 HttpOnly Cookie 里，JS 读不到。
 */
const ACCESS_TOKEN_KEY = 'access_token'
let accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
let currentUser: unknown = null

function setToken(t: string) {
  accessToken = t
  if (t) sessionStorage.setItem(ACCESS_TOKEN_KEY, t)
  else sessionStorage.removeItem(ACCESS_TOKEN_KEY)
}

// 清理旧版本残留
if (typeof window !== 'undefined') {
  localStorage.removeItem('access_token')
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  sessionStorage.removeItem('user')
}

export function setAccessToken(token: string) {
  setToken(token)
}
export function getAccessToken() {
  return accessToken
}
export function setCurrentUser(user: unknown) {
  currentUser = user
}
export function getCurrentUser() {
  return currentUser
}

/** 每次 API 请求附带当前 Access Token；Refresh Token 不暴露给 JavaScript。 */
http.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

let refreshPromise: Promise<{ accessToken: string; user: unknown }> | null = null
let sessionExpirationHandled = false

/** 通过 HttpOnly Cookie 刷新短期 Access Token，并合并并发刷新请求。 */
function refreshAccessToken(): Promise<{ accessToken: string; user: unknown }> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ data?: { accessToken?: string; user?: unknown } }>(
        `${API_BASE_URL}/auth/refresh`,
        undefined,
        {
          timeout: Number(import.meta.env.VITE_API_TIMEOUT || 10000),
          withCredentials: true,
        },
      )
      .then(({ data }) => {
        const token = data.data?.accessToken
        if (!token) {
          throw new Error('Refresh response did not include an access token')
        }
        accessToken = token
        currentUser = data.data?.user ?? null
        setToken(token)
        return { accessToken: token, user: currentUser }
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

/** 清除所有本地会话缓存，供刷新失效时执行。 */
function clearLocalSession() {
  accessToken = ''
  currentUser = null
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  window.dispatchEvent(new Event('auth:session-expired'))

  const loginUrl = new URL(
    'login',
    new URL(import.meta.env.BASE_URL, window.location.origin),
  )
  if (
    !sessionExpirationHandled &&
    window.location.pathname !== loginUrl.pathname
  ) {
    sessionExpirationHandled = true
    window.location.replace(loginUrl.toString())
  }
}

/** 登录、注册及令牌端点自身失败时不递归触发令牌刷新。 */
function isAuthenticationRequest(url: string | undefined) {
  const path = url?.split('?')[0] ?? ''
  return [
    '/auth/login',
    '/login',
    '/auth/register',
    '/auth/register/email-code',
    '/auth/oauth/exchange',
    '/auth/refresh',
    '/auth/logout',
  ].some((endpoint) => path.endsWith(endpoint))
}

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error)

    const config = error.config as
      | (InternalAxiosRequestConfig & { _refreshRetried?: boolean })
      | undefined
    if (
      error.response?.status !== 401 ||
      !config ||
      isAuthenticationRequest(config.url)
    ) {
      return Promise.reject(error.response?.data ?? error)
    }

    if (config._refreshRetried) {
      clearLocalSession()
      return Promise.reject(error.response?.data ?? error)
    }

    config._refreshRetried = true
    try {
      const { accessToken: token } = await refreshAccessToken()
      config.headers.Authorization = `Bearer ${token}`
      return await http.request(config)
    } catch {
      clearLocalSession()
      return Promise.reject(error.response?.data ?? error)
    }
  },
)

/**
 * 应用启动时调用：尝试用 HttpOnly Cookie 里的 refresh token 恢复会话。
 * 成功返回 true，失败（没 cookie 或过期）返回 false。
 */
export async function tryRestoreSession(): Promise<boolean> {
  try {
    await refreshAccessToken()
    return true
  } catch {
    return false
  }
}

/** 为业务模块提供统一的 Axios 请求方法，并只返回响应数据体。 */
export const request = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return http.get<T>(url, config).then(({ data }) => data)
  },
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return http.post<T>(url, data, config).then(({ data }) => data)
  },
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return http.put<T>(url, data, config).then(({ data }) => data)
  },
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return http.patch<T>(url, data, config).then(({ data }) => data)
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return http.delete<T>(url, config).then(({ data }) => data)
  },
}
