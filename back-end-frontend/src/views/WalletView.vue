<template>
  <section class="wallet-page">
    <div class="page-heading">
      <div>
        <h1>我的钱包</h1>
        <p>账户余额、充值申请与消费流水。</p>
      </div>
      <el-button type="primary" @click="openRecharge">申请充值</el-button>
    </div>

    <el-card shadow="never" class="balance-card">
      <span class="balance-label">账户余额</span>
      <strong class="balance-value">¥{{ balance.balanceYuan }}</strong>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <strong>充值记录</strong>
      </template>
      <el-table :data="recharges" stripe>
        <el-table-column prop="id" label="单号" width="180" />
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
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ txnTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="变动" width="140">
          <template #default="{ row }">
            <strong :class="row.amountCents >= 0 ? 'amount-income' : 'amount-expense'">
              {{ row.amountCents >= 0 ? '+' : '−' }}¥{{ (Math.abs(row.amountCents) / 100).toFixed(2) }}
            </strong>
          </template>
        </el-table-column>
        <el-table-column label="变动后余额" width="140">
          <template #default="{ row }">
            ¥{{ (row.balanceAfterCents / 100).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="note" label="说明" min-width="180">
          <template #default="{ row }">{{ row.note || '—' }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="180" />
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
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import {
  getBalance,
  listMyRecharges,
  listMyTxns,
  requestRecharge,
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
  return { recharge: '充值', consume: '消费', refund: '退款', adjust: '调整' }[
    t as 'recharge' | 'consume' | 'refund' | 'adjust'
  ]
}

function openRecharge() {
  form.amountYuan = ''
  form.userNote = ''
  form.channel = 'alipay'
  dialogVisible.value = true
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
    ElMessage.error(
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        '提交失败',
    )
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

.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h1 {
  color: #17233d;
  font-size: 24px;
}

.page-heading p {
  margin-top: 4px;
  color: #8590a3;
  font-size: 14px;
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

.recharge-form {
  margin-top: 16px;
}
</style>
