<template>
  <el-upload
    v-model:file-list="fileList"
    ref="uploadRef"
    class="upload-demo"
    multiple
    :auto-upload="false"
    :http-request="uploadRequest"
    :before-upload="beforeUpload"
    name="files"
    :on-error="handleUploadError"
  >
    <el-button type="primary">Click to upload</el-button>
    <template #tip>
      <div class="el-upload__tip">
        每个文件不能超过500KB。
      </div>
    </template>
  </el-upload>
  <el-button
    type="success"
    :disabled="fileList.length === 0"
    @click="uploadRef?.submit()"
  >
    开始上传
  </el-button>
</template>
<script lang="ts" setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type {
  UploadInstance,
  UploadRequestHandler,
  UploadUserFile,
} from 'element-plus'
import { uploadFiles } from '@/api/modules/upload'

const fileList = ref<UploadUserFile[]>([])
const uploadRef = ref<UploadInstance>()

const beforeUpload = (file: File) => {
  if (file.size > 500 * 1024) {
    ElMessage.error(`${file.name} 超过500KB限制`)
    return false
  }
  return true
}

const uploadRequest: UploadRequestHandler = async ({ file }) => {
  const formData = new FormData()
  formData.append('files', file)
  return uploadFiles(formData)
}

const handleUploadError = () => {
  ElMessage.error('文件上传失败，请检查网络和 OSS 配置')
}
</script>
