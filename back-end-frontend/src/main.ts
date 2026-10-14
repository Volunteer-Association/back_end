import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import { useAuthStore } from '@/stores/auth'

import App from './App.vue'
import router from './router'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
// 全局中文 locale：日期选择器的月份/星期、分页、对话框按钮等全部中文化
app.use(ElementPlus, { locale: zhCn })

// 全局捕获组件渲染错误，避免未处理异常导致白屏；开发环境仍打印完整堆栈。
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue error]', info, err)
}

window.addEventListener('auth:session-expired', () => {
  useAuthStore(pinia).clearSession()
  if (router.currentRoute.value.name !== 'login') {
    void router.replace({ name: 'login' })
  }
})

app.mount('#app')
