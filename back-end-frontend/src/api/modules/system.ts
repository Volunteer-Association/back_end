import { request } from '../client'

export function getSystemInfo() {
  return request.get<unknown>('/system')
}
