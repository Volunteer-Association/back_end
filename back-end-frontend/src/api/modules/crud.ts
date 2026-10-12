import { request } from '../client'

export function readResource<T>(
  resource: string,
  params?: Record<string, unknown>,
) {
  return request.get<T[]>(`/${resource}`, { params })
}

export function createResource<T>(resource: string, data: unknown) {
  return request.post<T>(`/${resource}`, data)
}

export function updateResource<T>(
  resource: string,
  id: string | number,
  data: unknown,
) {
  return request.patch<T>(`/${resource}/${id}`, data)
}

export function removeResource<T>(resource: string, id: string | number) {
  return request.delete<T>(`/${resource}/${id}`)
}
