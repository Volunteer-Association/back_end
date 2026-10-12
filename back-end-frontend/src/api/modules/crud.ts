import { request } from '../client'

/** 读取指定资源列表，可选传入查询参数。 */
export function readResource<T>(
  resource: string,
  params?: Record<string, unknown>,
) {
  return request.get<T[]>(`/${resource}`, { params })
}

/** 向指定资源集合创建记录。 */
export function createResource<T>(resource: string, data: unknown) {
  return request.post<T>(`/${resource}`, data)
}

/** 按 ID 更新指定资源记录。 */
export function updateResource<T>(
  resource: string,
  id: string | number,
  data: unknown,
) {
  return request.patch<T>(`/${resource}/${id}`, data)
}

/** 按 ID 删除指定资源记录。 */
export function removeResource<T>(resource: string, id: string | number) {
  return request.delete<T>(`/${resource}/${id}`)
}
