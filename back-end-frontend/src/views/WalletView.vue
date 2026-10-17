<template>
  <section class="wallet-page">
    <PageHeader
      title="我的钱包"
      description="账户余额、充值申请与消费流水。"
    >
      <template #actions>
        <el-button type="primary" @click="openTransfer">转账</el-button>
        <el-button type="primary" @click="openRecharge">申请充值</el-button>
        <el-button type="warning" @click="openWithdraw">提现</el-button>
        <el-button type="danger" @click="openRedPacket">发红包</el-button>
        <el-button @click="openPaymentPassword">支付密码</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never" class="balance-card">
      <span class="balance-label">账户余额</span>
      <strong class="balance-value">¥{{ balance.balanceYuan }}</strong>
    </el-card>

    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>
        <strong>我的红包</strong>
      </template>
      <el-table :data="pendingPackets" stripe v-if="pendingPackets.length" style="margin-bottom: 12px">
        <el-table-column label="来自" prop="from" width="180" />
        <el-table-column label="金额" width="120">
          <template #default="{ row }"><strong>¥{{ row.amountYuan }}</strong></template>
        </el-table-column>
        <el-table-column label="祝福语" prop="greeting" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="claimPacket(row.id)">领取</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-table :data="receivedPackets" stripe>
        <el-table-column label="来自" prop="from" width="200" />
        <el-table-column label="金额" width="120">
          <template #default="{ row }">
            <strong>¥{{ row.amountYuan }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="领取时间" width="200">
          <template #default="{ row }">{{ formatDateTime(row.receivedAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!pendingPackets.length && !receivedPackets.length" description="暂无红包" :image-size="60" />
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

    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>
        <strong>月度账单</strong>
      </template>
      <el-table :data="monthly" stripe v-if="monthly.length">
        <el-table-column label="月份" prop="month" width="120" />
        <el-table-column label="收入" width="150">
          <template #default="{ row }"><span style="color:#67c23a">+¥{{ row.incomeYuan }}</span></template>
        </el-table-column>
        <el-table-column label="支出" width="150">
          <template #default="{ row }"><span style="color:#f56c6c">-¥{{ row.expenseYuan }}</span></template>
        </el-table-column>
        <el-table-column label="笔数" prop="count" width="100" />
      </el-table>
      <el-empty v-else description="暂无数据" :image-size="60" />
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
          <el-input v-model="transferForm.amountYuan" :placeholder="`最低 1 元，单笔上限 ${paymentOptions.riskLimits.transferSingleMaxYuan} 元`">
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

    <!-- 提现弹窗 -->
    <el-dialog v-model="wd.visible" title="提现到银行卡" width="480px">
      <el-alert type="info" :closable="false" style="margin-bottom: 12px"
        :title="`提现手续费 0.1%（最低1元），单笔 ${paymentOptions.riskLimits.withdrawSingleMinYuan}元~${paymentOptions.riskLimits.withdrawSingleMaxYuan}元。提交后管理员审核打款。`" />
      <el-form label-width="100px">
        <el-form-item label="选择银行卡">
          <el-select v-model="wd.cardId" placeholder="选择银行卡" style="width:100%">
            <el-option v-for="c in cards" :key="c.id" :label="`${c.bankName} (${c.cardNo})`" :value="c.id" />
          </el-select>
          <el-button text type="primary" @click="wd.addMode = true">+ 添加银行卡</el-button>
          <el-button v-if="wd.cardId" text type="danger" @click="delCard(wd.cardId)">删除此卡</el-button>
        </el-form-item>
        <template v-if="wd.addMode">
          <el-form-item label="银行名称"><el-input v-model="wd.newCard.bankName" placeholder="如 中国建设银行" /></el-form-item>
          <el-form-item label="卡号"><el-input v-model="wd.newCard.cardNo" placeholder="银行卡号" /></el-form-item>
          <el-form-item label="持卡人"><el-input v-model="wd.newCard.cardHolder" placeholder="需与实名一致" /></el-form-item>
          <el-form-item label="支行"><el-input v-model="wd.newCard.branchName" placeholder="选填" /></el-form-item>
          <el-button size="small" @click="saveNewCard">保存卡片</el-button>
        </template>
        <el-form-item label="提现金额">
          <el-input v-model="wd.amount" placeholder="元">
            <template #append>元</template>
          </el-input>
        </el-form-item>
        <el-form-item label="支付密码">
          <el-input v-model="wd.pwd" type="password" show-password placeholder="6位数字支付密码"
            maxlength="6" oninput="this.value=this.value.replace(/\D/g,'')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="wd.visible = false">取消</el-button>
        <el-button type="primary" :loading="wd.submitting" @click="submitWithdraw">确认提现</el-button>
      </template>
    </el-dialog>

    <!-- 发红包弹窗 -->
    <el-dialog v-model="rp.visible" title="发红包" width="440px">
      <el-alert type="warning" :closable="false" style="margin-bottom: 12px" title="红包金额立即扣除，24小时未领取自动退回。" />
      <el-form label-width="80px">
        <el-form-item label="对方邮箱">
          <el-input v-model="rp.toEmail" placeholder="接收人邮箱" />
        </el-form-item>
        <el-form-item label="金额">
          <el-input v-model="rp.amount" :placeholder="`元，单笔上限 ${paymentOptions.riskLimits.redpacketSingleMaxYuan} 元`" />
        </el-form-item>
        <el-form-item label="祝福语">
          <el-input v-model="rp.greeting" placeholder="恭喜发财" maxlength="20" />
        </el-form-item>
        <el-form-item label="支付密码">
          <el-input v-model="rp.pwd" type="password" show-password placeholder="6位数字"
            maxlength="6" oninput="this.value=this.value.replace(/\D/g,'')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rp.visible = false">取消</el-button>
        <el-button type="danger" :loading="rp.submitting" @click="submitRedPacket">发红包</el-button>
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
  getPaymentPasswordStatus,
  setupPaymentPassword,
  changePaymentPassword,
  getPaymentsOptions,
  listBankCards,
  addBankCard,
  removeBankCard,
  requestWithdraw,
  sendRedPacket,
  myReceivedPackets,
  myPendingPackets,
  receiveRedPacket,
  monthlySummary,
  type BalanceInfo,
  type RechargeChannel,
  type RechargeOrder,
  type BalanceTxn,
  type BankCard,
} from '@/api/modules/payments'
import { formatDateTime } from '@/utils/utils'

const balance = ref<BalanceInfo>({ balanceCents: 0, balanceYuan: '0.00' })
const recharges = ref<RechargeOrder[]>([])
const txns = ref<BalanceTxn[]>([])
const receivedPackets = ref<any[]>([])
const pendingPackets = ref<any[]>([])
const monthly = ref<{ month: string; incomeYuan: string; expenseYuan: string; count: number }[]>([])

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

// ===== 提现 =====
const cards = ref<BankCard[]>([])
const wd = reactive({
  visible: false,
  cardId: null as number | null,
  amount: '',
  pwd: '',
  submitting: false,
  addMode: false,
  newCard: { bankName: '', cardNo: '', cardHolder: '', branchName: '' },
})

async function loadCards() {
  cards.value = await listBankCards()
  if (!wd.cardId && cards.value.length) wd.cardId = cards.value[0].id
}

function openWithdraw() {
  wd.visible = true
  wd.addMode = false
  wd.amount = ''
  wd.pwd = ''
  loadCards()
}

async function saveNewCard() {
  try {
    await addBankCard(wd.newCard)
    ElMessage.success('银行卡已添加')
    wd.addMode = false
    wd.newCard = { bankName: '', cardNo: '', cardHolder: '', branchName: '' }
    await loadCards()
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '添加失败'
    ElMessage.error(msg)
  }
}

async function delCard(id: number) {
  try {
    await removeBankCard(id)
    ElMessage.success('已删除')
    wd.cardId = null
    await loadCards()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '删除失败')
  }
}

async function submitWithdraw() {
  if (!wd.cardId) return ElMessage.warning('请选择银行卡')
  if (!wd.amount) return ElMessage.warning('请输入金额')
  if (!wd.pwd) return ElMessage.warning('请输入支付密码')
  wd.submitting = true
  try {
    await requestWithdraw({ bankCardId: wd.cardId, amountYuan: wd.amount, paymentPassword: wd.pwd })
    ElMessage.success('提现申请已提交，请等待管理员打款')
    wd.visible = false
    await reload()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '提现失败')
  } finally {
    wd.submitting = false
  }
}

// ===== 红包 =====
const rp = reactive({
  visible: false,
  toEmail: '',
  amount: '',
  greeting: '',
  pwd: '',
  submitting: false,
})
function openRedPacket() {
  rp.visible = true
  rp.toEmail = ''
  rp.amount = ''
  rp.greeting = ''
  rp.pwd = ''
}
async function submitRedPacket() {
  if (!rp.toEmail) return ElMessage.warning('请输入对方邮箱')
  if (!rp.amount) return ElMessage.warning('请输入金额')
  if (!rp.pwd) return ElMessage.warning('请输入支付密码')
  rp.submitting = true
  try {
    await sendRedPacket({ toEmail: rp.toEmail, amountYuan: rp.amount, greeting: rp.greeting, paymentPassword: rp.pwd })
    ElMessage.success('红包已发送')
    rp.visible = false
    await reload()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '发送失败')
  } finally {
    rp.submitting = false
  }
}
async function claimPacket(id: string) {
  try {
    const r = await receiveRedPacket(id)
    ElMessage.success(`成功领取 ¥${r.amountYuan}`)
    await reload()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '领取失败')
  }
}

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
  txnTypes: { value: string; label: string }[]
  riskLimits: {
    transferSingleMaxYuan: number
    transferDailyMaxYuan: number
    withdrawSingleMinYuan: number
    withdrawSingleMaxYuan: number
    redpacketSingleMaxYuan: number
  }
}>({ rechargeStatuses: [], rechargeChannels: [], txnTypes: [], riskLimits: {
  transferSingleMaxYuan: 10000, transferDailyMaxYuan: 50000,
  withdrawSingleMinYuan: 1, withdrawSingleMaxYuan: 50000,
  redpacketSingleMaxYuan: 2000,
} })

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
  return paymentOptions.value.txnTypes.find((x) => x.value === t)?.label ?? t
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
  try { receivedPackets.value = await myReceivedPackets() } catch { receivedPackets.value = [] }
  try { pendingPackets.value = await myPendingPackets() } catch { pendingPackets.value = [] }
  try { monthly.value = await monthlySummary() } catch { monthly.value = [] }
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
