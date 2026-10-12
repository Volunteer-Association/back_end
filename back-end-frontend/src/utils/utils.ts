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
