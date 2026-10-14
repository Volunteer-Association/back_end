import { request } from '../client'

export interface DictItem {
  id: string
  dictType: string
  dictKey: string
  itemValue: string
  sortOrder: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface DictItemInput {
  dictType: string
  dictKey: string
  itemValue: string
  sortOrder?: number
  enabled?: boolean
}

/** 字典类型注册表项：前后端共用，新增业务字典只改后端注册表。 */
export interface DictTypeOption {
  value: string
  label: string
  keyHint: string
}

/** 业务侧：按类型查询启用项。 */
export function getEnabledDictItems(dictType: string) {
  return request.get<DictItem[]>('/dict/items', { params: { dictType } })
}

/** 字典类型注册表（类型下拉选项）。 */
export function getDictTypes() {
  return request.get<DictTypeOption[]>('/dict/types')
}

/** 管理员：查询全部。 */
export function getAllDictItems(dictType?: string) {
  return request.get<DictItem[]>('/admin/dict/items', {
    params: dictType ? { dictType } : {},
  })
}

export function createDictItem(input: DictItemInput) {
  return request.post<DictItem>('/admin/dict/items', input)
}

export function updateDictItem(id: string, input: Partial<DictItemInput>) {
  return request.patch<DictItem>(`/admin/dict/items/${encodeURIComponent(id)}`, input)
}

export function deleteDictItem(id: string) {
  return request.delete<{ success: true }>(
    `/admin/dict/items/${encodeURIComponent(id)}`,
  )
}
