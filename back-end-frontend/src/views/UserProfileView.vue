<template>
  <section class="profile-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-heading">
          <div>
            <h1>个人资料</h1>
            <p>管理当前账号的用户详细信息。</p>
          </div>
          <el-button @click="router.push({ name: 'account' })">
            账号安全与绑定
          </el-button>
        </div>
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
      <el-form v-else label-position="top" class="profile-form">
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
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getUserProfile, updateUserProfile } from '@/api/modules/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const profile = reactive({
  email: '',
  nickname: '',
  mobile: '',
  sex: 2,
})

/** 优先展示 API 返回的可读错误信息，未知异常时使用页面级提示。 */
function errorMessage(error: unknown, fallback: string) {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : fallback
}

/** 读取资料并维护独立的加载错误状态，便于用户重试。 */
async function loadProfile() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await getUserProfile()
    profile.email = result.email
    profile.nickname = result.nickname || ''
    profile.mobile = result.mobile || ''
    profile.sex = result.sex ?? 2
  } catch (error: unknown) {
    loadError.value = `无法读取个人资料：${errorMessage(error, '请稍后重试')}`
  } finally {
    loading.value = false
  }
}

/** 保存前在前端提供即时反馈；后端 DTO 仍是最终校验边界。 */
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

.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-heading h1 {
  margin: 0;
  color: #17233d;
  font-size: 20px;
}

.page-heading p {
  margin: 8px 0 0;
  color: #7a8598;
}

.profile-sex {
  width: 100%;
}

@media (max-width: 520px) {
  .page-heading {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
