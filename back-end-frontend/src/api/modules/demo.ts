import { request } from '../client'

/** 与演示接口 DTO 对应；当前后端只模拟处理，不会持久化记录。 */
export interface DemoInput {
  name: string
  description?: string
}

/** 创建演示资源，提交 name 和可选 description。 */
export function createDemo(data: DemoInput) {
  return request.post<unknown>('/demo', data)
}

/** 查询演示资源列表；当前后端返回模拟内容。 */
export function findDemos() {
  return request.get<unknown[]>('/demo')
}

/** 按数字 ID 查询一条演示资源。 */
export function findDemo(id: string) {
  return request.get<unknown>(`/demo/${id}`)
}

/** 修改演示资源字段；当前后端不会保存更改。 */
export function updateDemo(id: string, data: Partial<DemoInput>) {
  return request.patch<unknown>(`/demo/${id}`, data)
}

/** 删除演示资源；当前后端仅返回模拟结果。 */
export function removeDemo(id: string) {
  return request.delete<unknown>(`/demo/${id}`)
}
