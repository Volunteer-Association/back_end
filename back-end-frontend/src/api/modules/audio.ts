import { request } from '../client'

export function getAudio(value: string) {
  return request.get<unknown>('/audio', { params: { value } })
}

export function updateAudio(value: string) {
  return request.put<unknown>('/audio', { value })
}
