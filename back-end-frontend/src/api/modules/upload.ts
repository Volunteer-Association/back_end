import { request } from '../client'

export function uploadFiles(formData: FormData) {
  return request.post<unknown>('/upload', formData)
}
