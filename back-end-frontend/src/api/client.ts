import axios, {
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'

const ACCESS_TOKEN_KEY = 'access_token'
const LEGACY_TOKEN_KEY = 'token'
const USER_KEY = 'user'
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || '/api'
).replace(/\/+$/, '')

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT || 10000),
})

/** 每次 API 请求附带当前 Access Token；Refresh Token 不暴露给 JavaScript。 */
http.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise: Promise<string> | null = null

/** 通过 HttpOnly Cookie 刷新短期 Access Token，并合并并发刷新请求。 */
function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ data?: { accessToken?: string } }>(
        `${API_BASE_URL}/auth/refresh`,
        undefined,
        {
          timeout: Number(import.meta.env.VITE_API_TIMEOUT || 10000),
          withCredentials: true,
        },
      )
      .then(({ data }) => {
        const accessToken = data.data?.accessToken
        if (!accessToken) {
          throw new Error('Refresh response did not include an access token')
        }
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
        localStorage.removeItem(LEGACY_TOKEN_KEY)
        return accessToken
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

/** 清除所有本地会话缓存，供刷新失效时执行。 */
function clearLocalSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
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
      window.location.assign('/login')
      return Promise.reject(error.response?.data ?? error)
    }

    config._refreshRetried = true
    try {
      const accessToken = await refreshAccessToken()
      config.headers.Authorization = `Bearer ${accessToken}`
      return await http.request(config)
    } catch (refreshError: unknown) {
      if (
        axios.isAxiosError(refreshError) &&
        refreshError.response?.status === 401
      ) {
        clearLocalSession()
        window.location.assign('/login')
      }
      return Promise.reject(error.response?.data ?? error)
    }
  },
)

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
