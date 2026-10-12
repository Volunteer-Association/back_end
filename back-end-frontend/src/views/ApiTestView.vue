<template>
  <div class="api-test-container">
    <h1>API接口测试</h1>
    
    <div class="test-section">
      <h2>1. 系统信息</h2>
      <el-button @click="getSystemInfo" :loading="loading.system">获取系统信息</el-button>
      <div v-if="systemInfo" class="result">
        <pre>{{ systemInfo }}</pre>
      </div>
    </div>

    <div class="test-section">
      <h2>2. 演示数据CRUD操作</h2>
      <div class="demo-actions">
        <el-button @click="createDemo" :loading="loading.create">创建数据</el-button>
        <el-button @click="getAllDemos" :loading="loading.findAll">获取所有数据</el-button>
        <el-button @click="getDemoById" :loading="loading.findOne">根据ID获取数据</el-button>
        <el-button @click="updateDemo" :loading="loading.update">更新数据</el-button>
        <el-button @click="deleteDemo" :loading="loading.remove">删除数据</el-button>
      </div>
      <div v-if="demoResult" class="result">
        <pre>{{ demoResult }}</pre>
      </div>
    </div>

    <div class="test-section">
      <h2>3. 文件上传</h2>
      <p>请前往 <router-link to="/upload">文件上传页面</router-link> 测试文件上传功能</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createDemo as createDemoRequest,
  findDemo as findDemoRequest,
  findDemos,
  getSystemInfo as getSystemInfoRequest,
  removeDemo as removeDemoRequest,
  updateDemo as updateDemoRequest,
} from '@/api'

const loading = reactive({
  system: false,
  create: false,
  findAll: false,
  findOne: false,
  update: false,
  remove: false
})

const systemInfo = ref<unknown>(null)
const demoResult = ref<unknown>(null)

// 系统信息
const getSystemInfo = async () => {
  loading.system = true
  try {
    const response = await getSystemInfoRequest()
    systemInfo.value = response
    ElMessage.success('系统信息获取成功')
  } catch (error) {
    console.error('获取系统信息失败:', error)
    systemInfo.value = null
    const responseError =
      typeof error === 'object' && error !== null
        ? (error as { statusCode?: unknown; message?: unknown })
        : null
    if (responseError?.statusCode === 401) {
      ElMessage.error('系统信息接口需要有效登录，请重新登录后重试')
    } else {
      ElMessage.error(
        typeof responseError?.message === 'string'
          ? `获取系统信息失败：${responseError.message}`
          : '获取系统信息失败，请稍后重试',
      )
    }
  } finally {
    loading.system = false
  }
}

// 演示数据操作
const createDemo = async () => {
  loading.create = true
  try {
    const demoData = {
      name: '测试数据' + Date.now(),
      description: '这是一个测试数据'
    }
    const response = await createDemoRequest(demoData)
    demoResult.value = response
    ElMessage.success('创建数据成功')
  } catch (error) {
    console.error('创建数据失败:', error)
    ElMessage.error('创建数据失败')
  } finally {
    loading.create = false
  }
}

const getAllDemos = async () => {
  loading.findAll = true
  try {
    const response = await findDemos()
    demoResult.value = response
    ElMessage.success('获取所有数据成功')
  } catch (error) {
    console.error('获取数据失败:', error)
    ElMessage.error('获取数据失败')
  } finally {
    loading.findAll = false
  }
}

const getDemoById = async () => {
  loading.findOne = true
  try {
    const response = await findDemoRequest('1')
    demoResult.value = response
    ElMessage.success('根据ID获取数据成功')
  } catch (error) {
    console.error('根据ID获取数据失败:', error)
    ElMessage.error('根据ID获取数据失败')
  } finally {
    loading.findOne = false
  }
}

const updateDemo = async () => {
  loading.update = true
  try {
    const updateData = {
      name: '更新后的数据',
      description: '这是更新后的描述'
    }
    const response = await updateDemoRequest('1', updateData)
    demoResult.value = response
    ElMessage.success('更新数据成功')
  } catch (error) {
    console.error('更新数据失败:', error)
    ElMessage.error('更新数据失败')
  } finally {
    loading.update = false
  }
}

const deleteDemo = async () => {
  loading.remove = true
  try {
    const response = await removeDemoRequest('1')
    demoResult.value = response
    ElMessage.success('删除数据成功')
  } catch (error) {
    console.error('删除数据失败:', error)
    ElMessage.error('删除数据失败')
  } finally {
    loading.remove = false
  }
}

</script>

<style scoped>
.api-test-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.test-section {
  margin-bottom: 40px;
  padding: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.test-section h2 {
  color: #333;
  margin-bottom: 15px;
}

.demo-actions, .audio-actions {
  margin-bottom: 15px;
}

.demo-actions .el-button, .audio-actions .el-button {
  margin-right: 10px;
  margin-bottom: 10px;
}

.result {
  margin-top: 15px;
  padding: 15px;
  background-color: #f5f5f5;
  border-radius: 4px;
  max-height: 300px;
  overflow: auto;
}

.result pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
