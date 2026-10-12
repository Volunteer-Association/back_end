import { request } from '../client'

/** 以 multipart/form-data 将选择的文件发送至服务端对象存储。 */
export function uploadFiles(formData: FormData) {
  return request.post<unknown>('/upload', formData)
}
