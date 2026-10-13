<template>
  <section class="profile-page">
    <el-card shadow="never">
      <template #header>
        <PageHeader title="个人资料" description="管理当前账号的用户详细信息。">
          <template #actions>
            <el-button @click="router.push({ name: 'account' })">
              账号安全与绑定
            </el-button>
          </template>
        </PageHeader>
      </template>

      <el-skeleton v-if="loading" :rows="4" animated />
      <el-alert
        v-else-if="loadError"
        type="error"
        :closable="false"
        :title="loadError"
      >
        <el-button text type="primary" @click="loadProfile">
          重新读取
        </el-button>
      </el-alert>

      <div v-else class="profile-body">
        <!-- 头像上传区 -->
        <div class="avatar-section">
          <el-upload
            :show-file-list="false"
            :auto-upload="false"
            accept="image/jpeg,image/png,image/gif,image/webp"
            :on-change="onFileSelected"
          >
            <el-avatar :size="96" :src="avatarUrl">
              {{ (profile.nickname || 'U').slice(0, 1) }}
            </el-avatar>
            <div class="avatar-tip">
              <el-icon v-if="uploading" class="is-loading"><Loading /></el-icon>
              <span>{{ uploading ? '上传中...' : '点击更换头像' }}</span>
            </div>
          </el-upload>
        </div>

        <el-form label-position="top" class="profile-form">
          <el-form-item label="邮箱">
            <el-input :model-value="profile.email" disabled />
          </el-form-item>
          <el-form-item label="昵称">
            <el-input
              v-model.trim="profile.nickname"
              maxlength="60"
              show-word-limit
              placeholder="请输入昵称"
            />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input
              v-model.trim="profile.mobile"
              maxlength="11"
              inputmode="numeric"
              placeholder="选填，11 位手机号"
            />
          </el-form-item>
          <el-form-item label="性别">
            <el-select v-model="profile.sex" class="profile-sex">
              <el-option label="保密" :value="2" />
              <el-option label="女" :value="0" />
              <el-option label="男" :value="1" />
            </el-select>
          </el-form-item>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="loading"
            @click="saveProfile"
          >
            保存个人资料
          </el-button>
        </el-form>
      </div>
    </el-card>

    <AvatarCropper
      v-model="cropperVisible"
      :file="selectedFile"
      @success="onCropped"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import AvatarCropper from '@/components/AvatarCropper.vue'
import {
  getUserProfile,
  updateUserProfile,
} from '@/api/modules/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(true)
const saving = ref(false)
const uploading = ref(false)
const loadError = ref('')
const profile = reactive({
  email: '',
  nickname: '',
  mobile: '',
  sex: 2,
  avatar: '' as string | null,
})

const avatarUrl = computed(() => {
  if (!profile.avatar) return ''
  // 已经是完整 URL（如 OAuth 头像）直接用；本地路径补全后端地址
  if (/^https?:\/\//.test(profile.avatar)) return profile.avatar
  return profile.avatar
})

function errorMessage(error: unknown, fallback: string) {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : fallback
}

async function loadProfile() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await getUserProfile()
    profile.email = result.email
    profile.nickname = result.nickname || ''
    profile.mobile = result.mobile || ''
    profile.sex = result.sex ?? 2
    profile.avatar = result.avatar
  } catch (error: unknown) {
    loadError.value = `无法读取个人资料：${errorMessage(error, '请稍后重试')}`
  } finally {
    loading.value = false
  }
}

const cropperVisible = ref(false)
const selectedFile = ref<File | null>(null)

function onFileSelected(uploadFile: { raw: File }) {
  const file = uploadFile.raw
  if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
    ElMessage.error('仅支持 jpg/png/gif/webp 图片')
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('原图不能超过 5MB')
    return
  }
  selectedFile.value = file
  cropperVisible.value = true
}

function onCropped(url: string) {
  profile.avatar = url
  auth.updateProfile({ avatar: url })
  cropperVisible.value = false
}

async function saveProfile() {
  if (saving.value) return
  if (profile.nickname.length > 60) {
    ElMessage.error('昵称不能超过 60 个字符')
    return
  }
  if (profile.mobile && !/^\d{11}$/.test(profile.mobile)) {
    ElMessage.error('手机号需为 11 位数字')
    return
  }

  saving.value = true
  try {
    const updated = await updateUserProfile({
      nickname: profile.nickname || null,
      mobile: profile.mobile || null,
      sex: profile.sex,
    })
    profile.email = updated.email
    profile.nickname = updated.nickname || ''
    profile.mobile = updated.mobile || ''
    profile.sex = updated.sex ?? 2
    profile.avatar = updated.avatar
    auth.updateProfile({
      email: updated.email,
      nickname: updated.nickname,
      avatar: updated.avatar,
      mobile: updated.mobile,
      sex: updated.sex,
    })
    ElMessage.success('个人资料已保存')
  } catch (error: unknown) {
    ElMessage.error(errorMessage(error, '个人资料保存失败，请重试'))
  } finally {
    saving.value = false
  }
}

onMounted(loadProfile)
</script>

<style scoped>
.profile-page {
  max-width: 820px;
  margin: 0 auto;
}

.profile-body {
  display: grid;
  gap: 24px;
}

.avatar-section {
  display: flex;
  justify-content: center;
  padding: 20px 0;
  background: #f8fafc;
  border-radius: 8px;
}

.avatar-section :deep(.el-upload) {
  display: grid;
  justify-items: center;
  gap: 8px;
  cursor: pointer;
}

.avatar-section :deep(.el-avatar) {
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.avatar-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #409eff;
  font-size: 13px;
}

.profile-sex {
  width: 100%;
}
</style>
