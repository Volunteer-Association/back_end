import { request } from '../client'

export function createDemo(data: unknown) {
  return request.post<unknown>('/demo', data)
}

export function findDemos() {
  return request.get<unknown[]>('/demo')
}

export function findDemo(id: string) {
  return request.get<unknown>(`/demo/${id}`)
}

export function updateDemo(id: string, data: unknown) {
  return request.patch<unknown>(`/demo/${id}`, data)
}

export function removeDemo(id: string) {
  return request.delete<unknown>(`/demo/${id}`)
}
