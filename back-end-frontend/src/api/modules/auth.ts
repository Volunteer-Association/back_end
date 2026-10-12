import { request } from '../client'

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

export function login(data: { username: string; password: string }) {
  return request.post<LoginResponse>('/auth/login', data, {
    withCredentials: true,
  })
}

export function sendRegistrationCode(data: { email: string }) {
  return request.post<{
    message: string
    retryAfterSeconds: number
  }>('/auth/register/email-code', data)
}

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

export function getOAuthProviders() {
  return request.get<{ providers: OAuthProvider[] }>('/auth/oauth/providers')
}

export function exchangeOAuthCode(code: string) {
  return request.post<LoginResponse>(
    '/auth/oauth/exchange',
    { code },
    { withCredentials: true },
  )
}

export function logoutSession() {
  return request.post<void>('/auth/logout', undefined, {
    withCredentials: true,
  })
}

export function getPasswordStatus() {
  return request.get<{
    username: string
    hasLocalPassword: boolean
    requiresUsernameSetup: boolean
  }>('/auth/password')
}

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

export function getUserProfile() {
  return request.get<UserProfile>('/auth/profile')
}

export function updateUserProfile(data: {
  nickname?: string | null
  mobile?: string | null
  sex?: number
}) {
  return request.patch<UserProfile>('/auth/profile', data)
}

export function getLinkedOAuthProviders() {
  return request.get<OAuthProvider[]>('/auth/oauth-links')
}

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

export function startOAuthLink(provider: OAuthProvider) {
  return request.post<{ authorizationUrl: string }>(
    `/auth/oauth/${provider}/link`,
    undefined,
    { withCredentials: true },
  )
}
