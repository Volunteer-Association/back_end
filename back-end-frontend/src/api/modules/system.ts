import { request } from '../client'

/** 获取当前后端进程的 CPU、内存和基础操作系统信息，需已登录。 */
export function getSystemInfo() {
  return request.get<unknown>('/system')
}
