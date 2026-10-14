<template>
  <section class="recharge-admin-page">
    <PageHeader
      title="充值审核"
      description="核对用户线下转账后批准到账，余额自动入账。"
    >
      <template #actions>
        <el-radio-group v-model="statusFilter" @change="onStatusChange">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="pending">待审核</el-radio-button>
          <el-radio-button value="approved">已到账</el-radio-button>
          <el-radio-button value="rejected">已驳回</el-radio-button>
        </el-radio-group>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <el-form inline style="margin-bottom: 12px">
        <el-form-item label="用户ID">
          <el-input
            v-model="userIdFilter"
            placeholder="按用户ID精确筛选"
            clearable
            style="width: 220px"
            @keyup.enter="onSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="onSearch">查询</el-button>
          <el-button @click="onReset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="orders" stripe>
        <el-table-column label="充值单号" width="230">
          <template #default="{ row }">
            <code class="mono">{{ row.orderNo || row.id }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="userId" label="用户" width="130" />
        <el-table-column label="金额" width="110">
          <template #default="{ row }">
            <strong>¥{{ (row.amountCents / 100).toFixed(2) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="90">
          <template #default="{ row }">{{ channelLabel(row.channel) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="tagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="用户备注" min-width="140">
          <template #default="{ row }">{{ row.userNote || '—' }}</template>
        </el-table-column>
        <el-table-column label="审核结果" min-width="150">
          <template #default="{ row }">
            <span v-if="row.status === 'pending'" class="muted">—</span>
            <span
              v-else
              :class="row.status === 'rejected' ? 'review-reject' : 'review-approve'"
            >
              {{ row.reviewNote || (row.status === 'rejected' ? '驳回（未填写原因）' : '已到账') }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="内部备注" min-width="140">
          <template #default="{ row }">
            <span class="internal-note">{{ row.adminNote || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="审核人" width="110">
          <template #default="{ row }">
            {{ row.reviewedByName || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="审核时间" width="160">
          <template #default="{ row }">
            {{ row.reviewedAt ? formatDateTime(row.reviewedAt) : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openDetail(row)">详情</el-button>
            <template v-if="row.status === 'pending'">
              <el-button text type="success" @click="openReview(row, 'approve')">批准</el-button>
              <el-button text type="danger" @click="openReview(row, 'reject')">驳回</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        style="margin-top: 12px; justify-content: flex-end"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="reload"
        @size-change="reload"
      />
    </el-card>

    <!-- 充值单详情 -->
    <el-dialog
      v-model="detailVisible"
      title="充值单详情"
      width="min(640px, calc(100vw - 32px))"
      destroy-on-close
    >
      <el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="充值单号" :span="2">
          <code class="mono">{{ detail.orderNo || detail.id }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="内部ID" :span="2">
          <span class="muted mono">{{ detail.id }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="用户ID">{{ detail.userId }}</el-descriptions-item>
        <el-descriptions-item label="金额">
          <strong>¥{{ (detail.amountCents / 100).toFixed(2) }}</strong>
        </el-descriptions-item>
        <el-descriptions-item label="转账渠道">{{ channelLabel(detail.channel) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="tagType(detail.status)" size="small">
            {{ statusLabel(detail.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="用户备注" :span="2">
          {{ detail.userNote || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="审核结果（用户可见）" :span="2">
          <span
            v-if="detail.status !== 'pending'"
            :class="detail.status === 'rejected' ? 'review-reject' : 'review-approve'"
          >
            {{ detail.reviewNote || (detail.status === 'rejected' ? '驳回（未填写原因）' : '已到账') }}
          </span>
          <span v-else class="muted">待审核</span>
        </el-descriptions-item>
        <el-descriptions-item label="内部备注（仅管理员可见）" :span="2">
          <span class="internal-note">{{ detail.adminNote || '—' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="审核人">
          {{ detail.reviewedByName || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="审核时间">
          {{ detail.reviewedAt ? formatDateTime(detail.reviewedAt) : '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="申请时间">
          {{ formatDateTime(detail.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ formatDateTime(detail.updatedAt) }}
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button
          v-if="detail && detail.status === 'pending'"
          type="success"
          @click="detailVisible = false; openReview(detail, 'approve')"
        >
          批准到账
        </el-button>
        <el-button
          v-if="detail && detail.status === 'pending'"
          type="danger"
          @click="detailVisible = false; openReview(detail, 'reject')"
        >
          驳回
        </el-button>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 审核对话框（批准 / 驳回） -->
    <el-dialog
      v-model="reviewVisible"
      :title="reviewForm.mode === 'approve' ? '批准充值' : '驳回充值'"
      width="min(520px, calc(100vw - 32px))"
      destroy-on-close
    >
      <el-alert
        v-if="reviewForm.mode === 'approve'"
        type="success"
        :closable="false"
        title="批准后用户余额将立即增加，并写入充值流水。"
        :description="`单笔 ¥${reviewAmount}`"
        show-icon
        style="margin-bottom: 12px"
      />
      <el-alert
        v-else
        type="error"
        :closable="false"
        title="驳回不扣款，需要给用户填写驳回原因。"
        :description="`单笔 ¥${reviewAmount}`"
        show-icon
        style="margin-bottom: 12px"
      />
      <el-form
        ref="reviewFormRef"
        :model="reviewForm"
        :rules="reviewRules"
        label-position="top"
      >
        <el-form-item
          :label="reviewForm.mode === 'approve' ? '审核结果说明（用户可见，选填）' : '驳回原因（用户可见，必填）'"
          prop="reviewNote"
        >
          <el-input
            v-model="reviewForm.reviewNote"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            :placeholder="
              reviewForm.mode === 'approve'
                ? '如：已核对支付宝到账'
                : '如：未查到转账记录，请核对后重新申请'
            "
          />
        </el-form-item>
        <el-form-item label="内部备注（仅管理员可见，选填）" prop="adminNote">
          <el-input
            v-model="reviewForm.adminNote"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            placeholder="如：凭证号、内部处理意见，不会展示给用户"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewVisible = false">取消</el-button>
        <el-button
          :type="reviewForm.mode === 'approve' ? 'success' : 'danger'"
          :loading="submitting"
          @click="submitReview"
        >
          {{ reviewForm.mode === 'approve' ? '确认批准' : '确认驳回' }}
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
/**
 * 充值审核管理页（仅管理员）。
 *
 * - 列表按「审核结果 / 内部备注 / 审核人 / 审核时间」分列展示
 * - 操作列可查看完整详情，或对待审核单批准/驳回
 * - 审核结果说明（reviewNote）用户可见，驳回时必填；
 *   内部备注（adminNote）仅管理员可见，全程不返回给用户端。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import {
  adminApproveRecharge,
  adminListRecharges,
  adminRejectRecharge,
  type AdminRechargeOrder,
} from '@/api/modules/payments'
import { formatDateTime } from '@/utils/utils'

const loading = ref(false)
const orders = ref<AdminRechargeOrder[]>([])
const statusFilter = ref<'' | 'pending' | 'approved' | 'rejected'>('pending')
const userIdFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

function channelLabel(c: string) {
  return { alipay: '支付宝', wechat: '微信', bank: '银行' }[c as 'alipay' | 'wechat' | 'bank']
}

function statusLabel(s: string) {
  return { pending: '待审核', approved: '已到账', rejected: '已驳回' }[
    s as 'pending' | 'approved' | 'rejected'
  ]
}

function tagType(s: string) {
  return { pending: 'warning', approved: 'success', rejected: 'danger' }[
    s as 'pending' | 'approved' | 'rejected'
  ] as never
}

async function reload() {
  loading.value = true
  try {
    const result = await adminListRecharges({
      page: page.value,
      pageSize: pageSize.value,
      status: statusFilter.value || undefined,
      userId: userIdFilter.value.trim(),
    })
    orders.value = result.items
    total.value = result.total
  } finally {
    loading.value = false
  }
}

/** 状态切换（顶部 radio）：回到第一页再查。 */
function onStatusChange() {
  page.value = 1
  void reload()
}

/** 点击查询（用户ID筛选）：回到第一页。 */
function onSearch() {
  page.value = 1
  void reload()
}

function onReset() {
  userIdFilter.value = ''
  statusFilter.value = ''
  page.value = 1
  void reload()
}

// ===== 详情弹窗 =====
const detailVisible = ref(false)
const detail = ref<AdminRechargeOrder | null>(null)

function openDetail(order: AdminRechargeOrder) {
  detail.value = order
  detailVisible.value = true
}

// ===== 审核弹窗 =====
const reviewVisible = ref(false)
const submitting = ref(false)
const reviewFormRef = ref<FormInstance>()
const reviewForm = reactive({
  mode: 'approve' as 'approve' | 'reject',
  orderId: '',
  amountCents: 0,
  reviewNote: '',
  adminNote: '',
})

const reviewAmount = computed(() =>
  (reviewForm.amountCents / 100).toFixed(2),
)

const reviewRules: FormRules = {
  reviewNote: [
    {
      validator: (_rule, value: string, callback) => {
        if (reviewForm.mode === 'reject' && !(value || '').trim()) {
          callback(new Error('驳回时必须填写驳回原因'))
        } else if ((value || '').length > 200) {
          callback(new Error('审核结果说明最多 200 字'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  adminNote: [
    { max: 200, message: '内部备注最多 200 字', trigger: 'blur' },
  ],
}

function openReview(order: AdminRechargeOrder, mode: 'approve' | 'reject') {
  reviewForm.mode = mode
  reviewForm.orderId = order.id
  reviewForm.amountCents = order.amountCents
  reviewForm.reviewNote = ''
  reviewForm.adminNote = ''
  reviewVisible.value = true
}

async function submitReview() {
  if (!reviewFormRef.value) return
  try {
    await reviewFormRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    const reviewNote = reviewForm.reviewNote.trim()
    const adminNote = reviewForm.adminNote.trim()
    if (reviewForm.mode === 'approve') {
      await adminApproveRecharge(
        reviewForm.orderId,
        reviewNote || undefined,
        adminNote || undefined,
      )
      ElMessage.success('已到账')
    } else {
      await adminRejectRecharge(
        reviewForm.orderId,
        reviewNote,
        adminNote || undefined,
      )
      ElMessage.success('已驳回')
    }
    reviewVisible.value = false
    detailVisible.value = false
    await reload()
  } catch (e: unknown) {
    ElMessage.error(
      (e as { message?: string })?.message || '操作失败，请稍后重试',
    )
  } finally {
    submitting.value = false
  }
}

onMounted(() => void reload())
</script>

<style scoped>
.recharge-admin-page {
  display: grid;
  gap: 20px;
}

.review-approve {
  color: #22a06b;
}

.review-reject {
  color: #e05b5b;
}

.internal-note {
  color: #8a6d1d;
}

.muted {
  color: #97a0af;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #475669;
  background: #f4f7fb;
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
