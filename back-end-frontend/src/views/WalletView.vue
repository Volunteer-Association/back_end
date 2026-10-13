<template>
  <section class="wallet-page">
    <PageHeader
      title="我的钱包"
      description="账户余额、充值申请与消费流水。"
    >
      <template #actions>
        <el-button type="primary" @click="openTransfer">转账</el-button>
        <el-button type="primary" @click="openRecharge">申请充值</el-button>
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
        <el-table-column label="充值单号" width="180">
          <template #default="{ row }">
            <code class="mono">{{ row.id }}</code>
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
        <el-table-column prop="userNote" label="备注" min-width="160">
          <template #default="{ row }">{{ row.userNote || '—' }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="申请时间" width="180" />
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
        <el-table-column label="流水号" width="160">
          <template #default="{ row }">
            <code class="mono">{{ row.id }}</code>
          </template>
        </el-table-column>
        <el-table-column label="关联单号" width="160">
          <template #default="{ row }">
            <code v-if="row.refId" class="mono">{{ row.refId }}</code>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="160" />
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
          <el-input v-model="form.amountYuan" placeholder="如 100.00（最低 1 元）">
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
          <el-input v-model="transferForm.amountYuan" placeholder="最低 1 元">
            <template #prepend>¥</template>
          </el-input>
        </el-form-item>
        <el-form-item label="备注" prop="note">
          <el-input v-model="transferForm.note" type="textarea" :rows="2" maxlength="200" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="primary" :loading="transferring" @click="submitTransfer">确认转账</el-button>
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
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import {
  getBalance,
  listMyRecharges,
  listMyTxns,
  requestRecharge,
  transfer,
  type BalanceInfo,
  type RechargeChannel,
  type RechargeOrder,
  type BalanceTxn,
} from '@/api/modules/payments'

const balance = ref<BalanceInfo>({ balanceCents: 0, balanceYuan: '0.00' })
const recharges = ref<RechargeOrder[]>([])
const txns = ref<BalanceTxn[]>([])

const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
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
const transferForm = reactive({ toAccount: '', amountYuan: '', note: '' })
const transferRequestId = ref('')
const transferRules: FormRules = {
  toAccount: [
    { required: true, message: '请输入收款方邮箱' },
    { type: 'email', message: '邮箱格式不正确' },
  ],
  amountYuan: [
    { required: true, message: '请输入金额' },
    { pattern: /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, message: '金额格式不正确' },
  ],
}

function channelLabel(c: RechargeChannel) {
  return { alipay: '支付宝', wechat: '微信', bank: '银行转账' }[c]
}

function statusTag(s: string) {
  return { pending: 'warning', approved: 'success', rejected: 'danger' }[
    s as 'pending' | 'approved' | 'rejected'
  ] as never
}

function statusLabel(s: string) {
  return { pending: '待审核', approved: '已到账', rejected: '已驳回' }[
    s as 'pending' | 'approved' | 'rejected'
  ]
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
  dialogVisible.value = true
}

function openTransfer() {
  transferForm.toAccount = ''
  transferForm.amountYuan = ''
  transferForm.note = ''
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

onMounted(() => void reload())
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

.recharge-form {
  margin-top: 16px;
}
</style>
