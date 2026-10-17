import { request } from '../client'

export type RoleKey = 'user' | 'admin' | 'super_admin'
export type UserStatus = 'active' | 'inactive' | 'banned'

export interface AdminUser {
  userId: string
  username: string
  email: string
  nickname: string | null
  status: UserStatus
  roleKeys: string[]
  role: RoleKey
  lastLoginAt: string | null
  lastLoginIp: string | null
  createdAt: string
}

export interface AdminUserPage {
  items: AdminUser[]
  total: number
  page: number
  pageSize: number
}

export interface OptionItem {
  value: string
  label: string
  description?: string
}

export interface AdminOptions {
  statuses: OptionItem[]
  roles: OptionItem[]
}

export function getAdminOptions() {
  return request.get<AdminOptions>('/admin/users/options')
}

export function listAdminUsers(params: {
  page?: number
  pageSize?: number
  keyword?: string
  status?: UserStatus
  role?: RoleKey
}) {
  return request.get<AdminUserPage>('/admin/users', { params })
}

export function createAdminUser(input: {
  username: string
  password: string
  email: string
  nickname?: string
  status?: UserStatus
  roleKeys?: RoleKey[]
}) {
  return request.post<AdminUser>('/admin/users', input)
}

export function setUserStatus(userId: string, status: UserStatus) {
  return request.patch<AdminUser>(`/admin/users/${encodeURIComponent(userId)}/status`, { status })
}

export function assignUserRoles(userId: string, roleKeys: string[]) {
  return request.patch<AdminUser>(`/admin/users/${encodeURIComponent(userId)}/roles`, { roleKeys })
}

export function resetUserPassword(userId: string, newPassword: string) {
  return request.post<{ success: true }>(
    `/admin/users/${encodeURIComponent(userId)}/reset-password`,
    { newPassword },
  )
}

// ===== 角色管理（超管） =====
export interface RoleItem {
  id: number
  key: string
  name: string
  description: string
  sortOrder: number
}
export function listAllRoles() {
  return request.get<RoleItem[]>('/admin/users/roles/list')
}
export function createRole(data: { key: string; name: string; description?: string; sortOrder?: number }) {
  return request.post('/admin/users/roles', data)
}
export function deleteRole(key: string) {
  return request.delete(`/admin/users/roles/${key}`)
}
export function updateRole(key: string, data: { name?: string; description?: string; sortOrder?: number }) {
  return request.put(`/admin/users/roles/${key}`, data)
}
/** 批量调整角色排序：传入调整后的完整有序 key 列表。 */
export function reorderRoles(keys: string[]) {
  return request.put('/admin/users/roles/sort', { keys })
}
