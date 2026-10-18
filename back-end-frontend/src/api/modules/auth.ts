import { request } from '../client'

export { setAccessToken, setCurrentUser, tryRestoreSession, getAccessToken, getCurrentUser } from '../client'

/** 登录后可安全放入前端会话状态的用户字段，不包含密码或认证密钥。 */
export interface LoginUser {
  id: string
  username: string
  email: string
  nickname: string | null
  avatar: string | null
  /** 最高优先级角色（兼容字段） */
  role: 'super_admin' | 'admin' | 'user'
  /** 用户拥有的所有角色，权限叠加：同时有 admin 和 super_admin 就两份权限都有 */
  roles?: string[]
  mobile?: string | null
  sex?: number | null
  createdAt?: string | null
}

export interface UserProfile {
  id: string
  username: string
  email: string
  nickname: string | null
  avatar: string | null
  mobile: string | null
  sex: number | null
  role?: string
  roles?: string[]
  idType?: number | null
  idTypeLabel?: string | null
  idNumber?: string | null
  address?: string | null
  realName?: string | null
  verifyStatus?: number
  verifiedAt?: string | null
  rejectReason?: string | null
  createdAt?: string | null
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
  // 后端 logs.id 为 BIGINT UNSIGNED，JSON 序列化后以字符串返回，避免 JS 精度丢失。
  id: string
  level: 'info' | 'warn' | 'error'
  category: 'event' | 'http'
  message: string
  user: { id: string; username: string } | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

export type AuditLogCategory = 'event' | 'http'

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

/** 用户点击第三方登录时才由后端校验配置并创建授权状态。 */
export function startOAuthLogin(provider: OAuthProvider) {
  return request.post<{ authorizationUrl: string }>(
    `/auth/oauth/${provider}/start`,
    undefined,
    { withCredentials: true },
  )
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

export interface RoleOption {
  value: string
  label: string
  description?: string
  sortOrder: number
}

/** 拉取系统所有角色枚举（供右上角角色切换下拉，后端排序）。 */
export function getRoleOptions() {
  return request.get<{ roles: RoleOption[] }>('/auth/role-options')
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

/**
 * 更新当前用户允许编辑的个人资料字段。
 * 证件三要素（真实姓名/证件类型/证件号码）不在此处，须走实名认证 submitKyc。
 */
export function updateUserProfile(data: {
  nickname?: string | null
  email?: string
  emailCode?: string
  mobile?: string | null
  sex?: number
  avatar?: string | null
  address?: string | null
}) {
  return request.patch<UserProfile>('/auth/profile', data)
}

/** 发送修改邮箱验证码到新邮箱。 */
export function sendChangeEmailCode(email: string) {
  return request.post<{ cooldownSeconds: number }>('/auth/profile/email-code', { email })
}

/** 个人资料相关枚举（证件类型等）。 */
export interface ProfileOptions {
  idTypes: { value: number; label: string }[]
}
export function getProfileOptions() {
  return request.get<ProfileOptions>('/auth/profile/options')
}

/** 上传头像，返回 { url }；后端会自动写入用户资料。 */
export function uploadAvatar(file: File) {
  const form = new FormData()
  form.append('file', file)
  return request.post<{ url: string }>('/auth/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** 获取当前账号的多设备登录设置。 */
export function getSessionSettings() {
  return request.get<SessionSettings>('/auth/session-settings')
}

/** 更新当前账号的多设备登录设置。 */
export function updateSessionSettings(data: SessionSettings) {
  return request.patch<SessionSettings>('/auth/session-settings', data)
}

// ===== KYC 实名认证 =====

export interface KycStatus {
  status: number // 0未提交 1审核中 2已通过 3已拒绝
  realName: string | null
  verifiedAt: string | null
  rejectReason: string | null
  idNumber: string | null
  idType: number | null
  idTypeLabel: string | null
}

export function getKycStatus() {
  return request.get<KycStatus>('/auth/kyc/status')
}

export function submitKyc(data: {
  realName: string
  idType: number
  idNumber: string
}) {
  return request.post<{ ok: boolean; message: string }>('/auth/kyc/submit', data)
}

// ===== 管理员 KYC 审核 =====

export function adminKycPending() {
  return request.get<any[]>('/admin/users/kyc/pending')
}
export function adminKycApprove(userId: string) {
  return request.post(`/admin/users/kyc/${userId}/approve`)
}
export function adminKycReject(userId: string, reason?: string) {
  return request.post(`/admin/users/kyc/${userId}/reject`, { reason })
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
  category?: AuditLogCategory
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
