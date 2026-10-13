import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      vue(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: parseInt(env.VITE_PORT) || 5173,
      open: false,
      host: env.VITE_HOST || 'localhost',
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, '')
        }
      }
    },
    build: {
      // 生产环境不生成 sourcemap，避免源码暴露与产物体积膨胀。
      sourcemap: false,
      rollupOptions: {
        output: {
          // 大体积第三方库单独分包，利用浏览器缓存并行加载。
          manualChunks(id: string) {
            if (id.includes('node_modules/three')) return 'three'
            if (id.includes('node_modules/@tensorflow')) return 'tensorflow'
            if (id.includes('node_modules/element-plus')) return 'element'
            if (
              id.includes('node_modules/vue') ||
              id.includes('node_modules/@vue') ||
              id.includes('node_modules/pinia') ||
              id.includes('node_modules/vue-router')
            ) {
              return 'vue'
            }
          },
        },
      },
    },
  }
})
