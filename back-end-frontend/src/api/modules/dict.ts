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

/** 业务侧：按类型查询启用项。 */
export function getEnabledDictItems(dictType: string) {
  return request.get<DictItem[]>('/dict/items', { params: { dictType } })
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
