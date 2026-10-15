<template>
  <section class="wallet-page">
    <PageHeader
      title="我的钱包"
      description="账户余额、充值申请与消费流水。"
    >
      <template #actions>
        <el-button type="primary" @click="openTransfer">转账</el-button>
        <el-button type="primary" @click="openRecharge">申请充值</el-button>
        <el-button @click="openPaymentPassword">支付密码</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never" class="balance-card">
      <span class="balance-label">账户余额</span>
      <strong class="balance-value">¥{{ balance.balanceYuan }}</strong>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <strong>充值记录</strong>
      </template>
      <el-table :data="recharges" stripe>
        <el-table-column label="充值单号" width="230">
          <template #default="{ row }">
            <code class="mono">{{ row.orderNo || row.id }}</code>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }">
            <strong>¥{{ (row.amountCents / 100).toFixed(2) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="100">
          <template #default="{ row }">
            {{ channelLabel(row.channel) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审核结果" min-width="200">
          <template #default="{ row }">
            <div v-if="row.status === 'pending'" class="muted">等待管理员核对到账</div>
            <div v-else class="review-info">
              <div
                :class="row.status === 'rejected' ? 'review-reject' : 'review-approve'"
              >
                <template v-if="row.status === 'rejected'">
                  驳回原因：{{ row.reviewNote || '管理员未填写原因' }}
                </template>
                <template v-else>
                  {{ row.reviewNote || '已核对到账' }}
                </template>
              </div>
              <div class="muted review-time">
                {{ formatDateTime(row.reviewedAt) }}
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="userNote" label="转账备注" min-width="160">
          <template #default="{ row }">{{ row.userNote || '—' }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="申请时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <strong>余额流水</strong>
      </template>
      <el-table :data="txns" stripe>
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag size="small">{{ txnTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="变动" width="120">
          <template #default="{ row }">
            <strong :class="row.amountCents >= 0 ? 'amount-income' : 'amount-expense'">
              {{ row.amountCents >= 0 ? '+' : '−' }}¥{{ (Math.abs(row.amountCents) / 100).toFixed(2) }}
            </strong>
          </template>
        </el-table-column>
        <el-table-column label="余额" width="110">
          <template #default="{ row }">
            <span class="balance-after">¥{{ (row.balanceAfterCents / 100).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="说明" min-width="180">
          <template #default="{ row }">{{ row.note || '—' }}</template>
        </el-table-column>
        <el-table-column label="流水号" width="260">
          <template #default="{ row }">
            <code class="mono">{{ row.txnNo || row.id }}</code>
          </template>
        </el-table-column>
        <el-table-column label="关联单号" width="220">
          <template #default="{ row }">
            <code v-if="row.refType === 'admin_adjust'" class="muted">管理员调整</code>
            <code v-else-if="row.refId" class="mono">{{ row.refId }}</code>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      title="申请线下充值"
      width="min(480px, calc(100vw - 32px))"
      destroy-on-close
    >
      <el-alert
        type="info"
        :closable="false"
        title="人工充值说明"
        description="请先通过支付宝/微信/银行转账到公司对公账户，再在此填写金额和转账信息。管理员核对到账后余额会自动入账。"
        show-icon
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="recharge-form">
        <el-form-item label="充值金额（元）" prop="amountYuan">
          <el-input v-model="form.amountYuan" placeholder="如 100.00（1 元～10 万元）">
            <template #prepend>¥</template>
          </el-input>
        </el-form-item>
        <el-form-item label="转账渠道" prop="channel">
          <el-radio-group v-model="form.channel">
            <el-radio-button value="alipay">支付宝</el-radio-button>
            <el-radio-button value="wechat">微信</el-radio-button>
            <el-radio-button value="bank">银行转账</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="转账备注" prop="userNote">
          <el-input
            v-model="form.userNote"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            placeholder="付款人姓名、转账时间等，便于管理员核对"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">提交申请</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="transferVisible"
      title="转账"
      width="min(480px, calc(100vw - 32px))"
      destroy-on-close
    >
      <el-alert
        type="warning"
        :closable="false"
        title="转账即时到账"
        description="输入对方注册邮箱，转账立即从你的余额扣除并打入对方余额。转账完成后不可撤回，请核对收款方。"
        show-icon
      />
      <el-form ref="transferFormRef" :model="transferForm" :rules="transferRules" label-position="top" class="recharge-form">
        <el-form-item label="收款方账号（邮箱）" prop="toAccount">
          <el-input v-model.trim="transferForm.toAccount" placeholder="如 friend@example.com" maxlength="100" />
        </el-form-item>
        <el-form-item label="转账金额（元）" prop="amountYuan">
          <el-input v-model="transferForm.amountYuan" placeholder="最低 1 元，单笔上限 10 万元">
            <template #prepend>¥</template>
          </el-input>
        </el-form-item>
        <el-form-item label="备注" prop="note">
          <el-input v-model="transferForm.note" type="textarea" :rows="2" maxlength="200" placeholder="选填" />
        </el-form-item>
        <el-form-item label="支付密码" prop="paymentPassword">
          <el-input
            v-model="transferForm.paymentPassword"
            type="password"
            maxlength="6"
            show-password
            placeholder="请输入 6 位支付密码"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="primary" :loading="transferring" @click="submitTransfer">确认转账</el-button>
      </template>
    </el-dialog>

    <!-- 支付密码设置/修改弹窗：所有密码框都带眼睛图标，设置/修改需二次确认一致 -->
    <el-dialog
      v-model="pwdDialogVisible"
      :title="pwdMode === 'setup' ? '设置支付密码' : '修改支付密码'"
      width="min(420px, calc(100vw - 32px))"
      destroy-on-close
    >
      <el-alert
        v-if="pwdMode === 'setup'"
        type="info"
        :closable="false"
        title="支付密码用于账单支付、余额转账时验证，请务必记住"
        style="margin-bottom: 14px"
      />
      <el-form label-position="top" @submit.prevent>
        <el-form-item v-if="pwdMode === 'change'" label="原支付密码">
          <el-input
            v-model="pwdForm.oldPwd"
            type="password"
            show-password
            maxlength="6"
            placeholder="请输入原支付密码"
            inputmode="numeric"
          />
        </el-form-item>
        <el-form-item :label="pwdMode === 'setup' ? '新支付密码' : '新支付密码'">
          <el-input
            v-model="pwdForm.newPwd"
            type="password"
            show-password
            maxlength="6"
            placeholder="6 位数字"
            inputmode="numeric"
          />
        </el-form-item>
        <el-form-item label="确认新支付密码">
          <el-input
            v-model="pwdForm.confirmPwd"
            type="password"
            show-password
            maxlength="6"
            placeholder="请再次输入新支付密码"
            inputmode="numeric"
            @keyup.enter="submitPwdDialog"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdSubmitting" @click="submitPwdDialog">
          {{ pwdMode === 'setup' ? '确认设置' : '确认修改' }}
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
/**
 * 我的钱包页面。
 *
 * 功能：
 * - 显示账户余额（渐变卡片）
 * - 充值记录列表（人工充值，管理员审核后到账）
 * - 余额流水（所有收支明细，带流水号和关联单号）
 * - 申请充值对话框（提交后等待管理员审核）
 * - 转账对话框（输入对方邮箱，即时到账，带幂等键防重复扣款）
 */
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import {
  getBalance,
  listMyRecharges,
  listMyTxns,
  requestRecharge,
  transfer,
  getPaymentPasswordStatus,
  setupPaymentPassword,
  changePaymentPassword,
  getPaymentsOptions,
  type BalanceInfo,
  type RechargeChannel,
  type RechargeOrder,
  type BalanceTxn,
} from '@/api/modules/payments'
import { formatDateTime } from '@/utils/utils'

const balance = ref<BalanceInfo>({ balanceCents: 0, balanceYuan: '0.00' })
const recharges = ref<RechargeOrder[]>([])
const txns = ref<BalanceTxn[]>([])

const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
// 每次打开充值弹窗生成新的幂等键，防止重复点击/网络重试产生重复充值单。
const rechargeRequestId = ref('')
const form = reactive({
  amountYuan: '',
  channel: 'alipay' as RechargeChannel,
  userNote: '',
})

const rules: FormRules = {
  amountYuan: [
    { required: true, message: '请输入金额' },
    {
      pattern: /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/,
      message: '金额格式不正确',
    },
  ],
  channel: [{ required: true, message: '请选择渠道' }],
}

const transferVisible = ref(false)
const transferring = ref(false)
const transferFormRef = ref<FormInstance>()
const transferForm = reactive({ toAccount: '', amountYuan: '', note: '', paymentPassword: '' })
const transferRequestId = ref('')
const transferRules: FormRules = {  toAccount: [
    { required: true, message: '请输入收款方邮箱' },
    { type: 'email', message: '邮箱格式不正确' },
  ],
  amountYuan: [
    { required: true, message: '请输入金额' },
    { pattern: /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, message: '金额格式不正确' },
  ],
  paymentPassword: [
    { required: true, message: '请输入支付密码' },
    { pattern: /^\d{6}$/, message: '支付密码必须是 6 位数字' },
  ],
}

// 支付密码设置/修改弹窗状态
const pwdDialogVisible = ref(false)
const pwdSubmitting = ref(false)
const pwdMode = ref<'setup' | 'change'>('setup')
const pwdForm = reactive({ oldPwd: '', newPwd: '', confirmPwd: '' })

// 业务枚举（充值状态、渠道）由后端下发，前端不写死
const paymentOptions = ref<{
  rechargeStatuses: { value: string; label: string }[]
  rechargeChannels: { value: string; label: string }[]
}>({ rechargeStatuses: [], rechargeChannels: [] })

function channelLabel(c: string) {
  return paymentOptions.value.rechargeChannels.find((x) => x.value === c)?.label ?? c
}

function statusTag(s: string) {
  return ({ pending: 'warning', approved: 'success', rejected: 'danger' } as Record<string, string>)[s] ?? 'info'
}

function statusLabel(s: string) {
  return paymentOptions.value.rechargeStatuses.find((x) => x.value === s)?.label ?? s
}

function txnTypeLabel(t: string) {
  return {
    recharge: '充值',
    consume: '消费',
    refund: '退款',
    transfer_out: '转出',
    transfer_in: '转入',
    adjust: '调整',
  }[t as never] ?? t
}

function openRecharge() {
  form.amountYuan = ''
  form.userNote = ''
  form.channel = 'alipay'
  rechargeRequestId.value =
    crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  dialogVisible.value = true
}

/** 支付密码设置/修改入口：查状态后打开统一弹窗。 */
async function openPaymentPassword() {
  let status: { set: boolean }
  try {
    status = await getPaymentPasswordStatus()
  } catch {
    ElMessage.error('查询支付密码状态失败')
    return
  }
  pwdMode.value = status.set ? 'change' : 'setup'
  pwdForm.oldPwd = ''
  pwdForm.newPwd = ''
  pwdForm.confirmPwd = ''
  pwdDialogVisible.value = true
}

async function submitPwdDialog() {
  if (!/^\d{6}$/.test(pwdForm.newPwd)) {
    ElMessage.error('新支付密码必须是 6 位数字')
    return
  }
  if (pwdForm.newPwd !== pwdForm.confirmPwd) {
    ElMessage.error('两次输入的新密码不一致')
    return
  }
  if (pwdMode.value === 'change' && !/^\d{6}$/.test(pwdForm.oldPwd)) {
    ElMessage.error('请输入正确的原支付密码')
    return
  }
  pwdSubmitting.value = true
  try {
    if (pwdMode.value === 'setup') {
      await setupPaymentPassword(pwdForm.newPwd)
      ElMessage.success('支付密码设置成功')
    } else {
      await changePaymentPassword(pwdForm.oldPwd, pwdForm.newPwd)
      ElMessage.success('支付密码已修改')
    }
    pwdDialogVisible.value = false
  } catch (e: unknown) {
    ElMessage.error((e as { message?: string })?.message || '操作失败，请稍后重试')
  } finally {
    pwdSubmitting.value = false
  }
}

function openTransfer() {
  transferForm.toAccount = ''
  transferForm.amountYuan = ''
  transferForm.note = ''
  transferForm.paymentPassword = ''
  // 每次打开对话框生成新的幂等键（类似微信/支付宝的商户订单号）
  transferRequestId.value =
    crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  transferVisible.value = true
}

async function submitTransfer() {
  if (!transferFormRef.value) return
  try {
    await transferFormRef.value.validate()
  } catch {
    return
  }
  const amountCents = Math.round(Number(transferForm.amountYuan) * 100)
  if (amountCents < 100) {
    ElMessage.error('最低转账 1 元')
    return
  }
  transferring.value = true
  try {
    const r = await transfer({
      toAccount: transferForm.toAccount,
      amountCents,
      requestId: transferRequestId.value,
      note: transferForm.note || null,
      paymentPassword: transferForm.paymentPassword,
    })
    const targetName = r.toNickname || r.toAccount
    ElMessage.success(`转账成功给 ${targetName}，剩余余额 ¥${(r.fromBalanceAfterCents / 100).toFixed(2)}`)
    transferVisible.value = false
    await reload()
  } catch (e: unknown) {
    // axios 拦截器已把 response.data 直接 reject，e 本身就是 { message } 或 Error
    const msg =
      (e as { message?: string })?.message ||
      '转账失败，请稍后重试'
    ElMessage.error(msg)
  } finally {
    transferring.value = false
  }
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  const amountCents = Math.round(Number(form.amountYuan) * 100)
  if (amountCents < 100) {
    ElMessage.error('最低充值 1 元')
    return
  }
  submitting.value = true
  try {
    await requestRecharge({
      amountCents,
      channel: form.channel,
      userNote: form.userNote || null,
      requestId: rechargeRequestId.value,
    })
    ElMessage.success('已提交充值申请，请等待管理员审核')
    dialogVisible.value = false
    await reload()
  } catch (e: unknown) {
    const msg =
      (e as { message?: string })?.message || '提交失败，请稍后重试'
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

async function reload() {
  balance.value = await getBalance()
  recharges.value = await listMyRecharges()
  txns.value = await listMyTxns()
}

onMounted(async () => {
  try {
    paymentOptions.value = await getPaymentsOptions()
  } catch {
    // 枚举拉取失败不阻塞页面
  }
  await reload()
})
</script>

<style scoped>
.wallet-page {
  display: grid;
  gap: 20px;
}

.balance-card :deep(.el-card__body) {
  padding: 28px;
  text-align: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.balance-label {
  display: block;
  opacity: 0.85;
  margin-bottom: 8px;
}

.balance-value {
  font-size: 36px;
  font-variant-numeric: tabular-nums;
}

.amount-income {
  color: #22a06b;
}

.amount-expense {
  color: #e05b5b;
}

.balance-after {
  color: #7a8598;
  font-variant-numeric: tabular-nums;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #475669;
  background: #f4f7fb;
  padding: 1px 6px;
  border-radius: 4px;
}

.muted {
  color: #c0c6d0;
}

.review-info {
  display: grid;
  gap: 2px;
}

.review-approve {
  color: #22a06b;
}

.review-reject {
  color: #e05b5b;
}

.review-time {
  font-size: 12px;
}

.recharge-form {
  margin-top: 16px;
}
</style>
