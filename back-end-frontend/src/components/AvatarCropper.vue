<template>
  <el-dialog
    v-model="visible"
    title="裁剪头像"
    width="min(480px, calc(100vw - 32px))"
    destroy-on-close
    @closed="onClosed"
  >
    <div class="cropper-wrapper">
      <img ref="imgRef" :src="imageUrl" alt="裁剪预览" />
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="uploading" @click="confirm">
        确认上传
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { uploadAvatar } from '@/api/modules/auth'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  file: File | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'success', url: string): void
}>()

const visible = ref(false)
const imgRef = ref<HTMLImageElement>()
const imageUrl = ref('')
const uploading = ref(false)
let cropper: Cropper | null = null

watch(
  () => props.modelValue,
  async (open) => {
    visible.value = open
    if (open && props.file) {
      imageUrl.value = URL.createObjectURL(props.file)
      await nextTick()
      initCropper()
    }
  },
)

function initCropper() {
  if (!imgRef.value) return
  cropper = new Cropper(imgRef.value, {
    aspectRatio: 1, // 正方形
    viewMode: 1,
    autoCropArea: 0.9,
    dragMode: 'move',
  })
}

async function confirm() {
  if (!cropper) return
  uploading.value = true
  try {
    cropper.getCroppedCanvas({
      width: 256,
      height: 256,
      imageSmoothingQuality: 'high',
    }).toBlob(async (blob: Blob | null) => {
      if (!blob) {
        ElMessage.error('裁剪失败，请重试')
        return
      }
      const file = new File([blob], 'avatar.png', { type: 'image/png' })
      try {
        const { url } = await uploadAvatar(file)
        ElMessage.success('头像已更新')
        emit('success', url)
        visible.value = false
        emit('update:modelValue', false)
      } catch (e: unknown) {
        ElMessage.error(
          (e as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? '上传失败',
        )
      } finally {
        uploading.value = false
      }
    }, 'image/png')
  } catch {
    uploading.value = false
  }
}

function onClosed() {
  cropper?.destroy()
  cropper = null
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
}
</script>

<style scoped>
.cropper-wrapper {
  width: 100%;
  height: 320px;
  background: #f4f7fb;
}

.cropper-wrapper img {
  max-width: 100%;
  display: block;
}
</style>
