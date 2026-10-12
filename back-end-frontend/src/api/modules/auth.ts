import { request } from '../client'

/** 登录后可安全放入前端会话状态的用户字段，不包含密码或认证密钥。 */
export interface LoginUser {
  id: string
  username: string
  email: string
  nickname: string | null
  avatar: string | null
  role: 'admin' | 'user'
  mobile?: string | null
  sex?: number | null
}

export interface UserProfile {
  email: string
  nickname: string | null
  avatar: string | null
  mobile: string | null
  sex: number | null
}

export interface SessionSettings {
  allowMultiLogin: boolean
}

/** 登录、注册和 OAuth 兑换共用的会话响应结构。 */
export interface LoginResponse {
  code: number
  message: string
  data: {
    accessToken: string
    user: LoginUser
  }
}

export interface AuditLog {
  id: number
  level: 'info' | 'warn' | 'error'
  message: string
  user: { id: string; username: string } | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

export type OAuthProvider = 'gitee' | 'github'

/** 使用本地账号密码登录，并由浏览器接收 HttpOnly Refresh Token。 */
export function login(data: { username: string; password: string }) {
  return request.post<LoginResponse>('/auth/login', data, {
    withCredentials: true,
  })
}

/** 请求向邮箱发送一次性注册验证码。 */
export function sendRegistrationCode(data: { email: string }) {
  return request.post<{
    message: string
    retryAfterSeconds: number
  }>('/auth/register/email-code', data)
}

/** 使用邮箱验证码创建本地账号并建立登录会话。 */
export function register(data: {
  username: string
  email: string
  password: string
  emailCode: string
}) {
  return request.post<LoginResponse>('/auth/register', data, {
    withCredentials: true,
  })
}

/** 查询后端已配置的第三方登录平台。 */
export function getOAuthProviders() {
  return request.get<{ providers: OAuthProvider[] }>('/auth/oauth/providers')
}

/** 以 OAuth 回调产生的一次性兑换码创建本地登录会话。 */
export function exchangeOAuthCode(code: string) {
  return request.post<LoginResponse>(
    '/auth/oauth/exchange',
    { code },
    { withCredentials: true },
  )
}

/** 撤销当前会话的 Refresh Token 并清除服务端 Cookie。 */
export function logoutSession() {
  return request.post<void>('/auth/logout', undefined, {
    withCredentials: true,
  })
}

/** 查询当前用户是否已设置本地账号和密码。 */
export function getPasswordStatus() {
  return request.get<{
    username: string
    hasLocalPassword: boolean
    requiresUsernameSetup: boolean
  }>('/auth/password')
}

/** 设置首次本地凭据，或验证旧密码后修改密码。 */
export function setLocalPassword(data: {
  username?: string
  currentPassword?: string
  newPassword: string
}) {
  return request.post<{
    message: string
    username: string
    hasLocalPassword: boolean
    requiresUsernameSetup: boolean
  }>('/auth/password', data)
}

/** 获取当前登录用户的个人资料。 */
export function getUserProfile() {
  return request.get<UserProfile>('/auth/profile')
}

/** 更新当前用户允许编辑的个人资料字段。 */
export function updateUserProfile(data: {
  nickname?: string | null
  mobile?: string | null
  sex?: number
}) {
  return request.patch<UserProfile>('/auth/profile', data)
}

/** 获取当前账号的多设备登录设置。 */
export function getSessionSettings() {
  return request.get<SessionSettings>('/auth/session-settings')
}

/** 更新当前账号的多设备登录设置。 */
export function updateSessionSettings(data: SessionSettings) {
  return request.patch<SessionSettings>('/auth/session-settings', data)
}

/** 查询当前用户已经关联的第三方平台。 */
export function getLinkedOAuthProviders() {
  return request.get<OAuthProvider[]>('/auth/oauth-links')
}

/** 管理员分页查询审计日志。 */
export function getAuditLogs(params: {
  page: number
  limit: number
  level?: AuditLog['level']
}) {
  return request.get<{
    items: AuditLog[]
    page: number
    limit: number
    total: number
  }>('/admin/logs', { params })
}

/** 为已登录用户启动第三方账号绑定流程。 */
export function startOAuthLink(provider: OAuthProvider) {
  return request.post<{ authorizationUrl: string }>(
    `/auth/oauth/${provider}/link`,
    undefined,
    { withCredentials: true },
  )
}
