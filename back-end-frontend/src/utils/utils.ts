interface Positions {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
}
// utils.ts
class Utils {
  // static getDate() {
  //   const date = new Date()
  //   const year = date.getFullYear()
  //   const month = date.getMonth() + 1
  //   const day = date.getDate()
  //   const hour = date.getHours()
  //   const minute = date.getMinutes()
  //   const second = date.getSeconds()
  //   return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  // }

  // static getUUID() {
  //   const s4 = () => {
  //     return Math.floor((1 + Math.random()) * 0x10000)
  //       .toString(16)
  //       .substring(1)
  //   }
  //   return `${s4() + s4()}-${s4()}-${s4()}${s4()}${s4()}`
  // }

  // static getRandomNumber(min: number, max: number) {
  //   return Math.floor(Math.random() * (max - min + 1)) + min
  // }

  constructor() {
    
  }

  getCurrentPosition(Position: Positions) {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(resolve, reject, Position)
      } else {
        reject(new Error('Geolocation is not supported by this browser.'))
      } 
    })
  }

}

export default Utils

/**
 * 把后端 ISO 时间（UTC）格式化为本地时间字符串：YYYY-MM-DD HH:mm:ss。
 *
 * 后端返回的是 '2026-10-14T02:00:58.000Z' 这种 UTC 串，
 * 直接渲染会露出 T/Z 且时区不对；全项目时间列统一用本函数。
 * 格式固定写死，不用 toLocaleString()，避免随浏览器区域设置变化。
 */
export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
