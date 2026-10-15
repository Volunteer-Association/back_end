<template>
  <section class="bills-page">
    <PageHeader
      title="账单管理"
      description="记录每一笔收入和支出，清晰掌握日常收支。"
    >
      <template #actions>
        <el-button type="primary" @click="openCreate">记一笔</el-button>
      </template>
    </PageHeader>

    <div class="summary-grid" v-loading="loading">
      <el-card shadow="never" class="summary-card income-card">
        <span class="summary-label">总收入</span>
        <strong>¥{{ formatAmount(summary.income) }}</strong>
      </el-card>
      <el-card shadow="never" class="summary-card expense-card">
        <span class="summary-label">总支出</span>
        <strong>¥{{ formatAmount(summary.expense) }}</strong>
      </el-card>
      <el-card shadow="never" class="summary-card balance-card">
        <span class="summary-label">收支结余</span>
        <strong :class="{ negative: Number(summary.balance) < 0 }">
          ¥{{ formatAmount(summary.balance) }}
        </strong>
      </el-card>
    </div>

    <el-card shadow="never" class="records-card">
      <div class="filters">
        <el-select
          v-model="filterType"
          aria-label="按收支类型筛选"
          class="filter-select"
          @change="onFilterTypeChange"
        >
          <el-option label="全部收支" value="all" />
          <el-option label="收入" value="income" />
          <el-option label="支出" value="expense" />
        </el-select>
        <el-select
          v-model="filterCategory"
          clearable
          placeholder="全部分类"
          aria-label="按分类筛选"
          class="filter-select"
          @change="reload"
        >
          <el-option
            v-for="category in filterCategories"
            :key="category"
            :label="category"
            :value="category"
          />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          aria-label="按日期范围筛选"
          @change="reload"
        />
        <el-button :loading="loading" @click="reload">
          刷新
        </el-button>
      </div>

      <!-- 内部滚动容器：滚动到底部自动加载下一页 -->
      <div
        ref="scrollContainer"
        class="scroll-container"
        @scroll="onScroll"
      >
        <el-table
          v-loading="loading && items.length === 0"
          :data="items"
          stripe
          class="desktop-table"
          aria-label="账单记录"
          empty-text="暂无账单记录"
        >
          <el-table-column label="账单号" width="240">
            <template #default="{ row }">
              <code class="mono">{{ row.billNo || row.id }}</code>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="90">
            <template #default="{ row }">
              <el-tag :type="row.type === 'income' ? 'success' : 'danger'">
                {{ row.type === 'income' ? '收入' : '支出' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="category" label="分类" width="110" />
          <el-table-column label="金额" width="140" align="right">
            <template #default="{ row }">
              <strong :class="row.type === 'income' ? 'amount-income' : 'amount-expense'">
                {{ row.type === 'income' ? '+' : '−' }}¥{{ formatAmount(row.amount) }}
              </strong>
            </template>
          </el-table-column>
          <el-table-column label="支付状态" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.type === 'income'" type="info" size="small">—</el-tag>
              <el-tag v-else-if="row.refundedAt" type="info" size="small">已退款</el-tag>
              <el-tag v-else-if="row.paidAt" type="success" size="small">已支付</el-tag>
              <el-tag v-else type="warning" size="small">待支付</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="note" label="备注" min-width="160">
            <template #default="{ row }">{{ row.note || '—' }}</template>
          </el-table-column>
          <el-table-column prop="transactionDate" label="日期" width="110" />
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.type === 'expense' && !row.paidAt && !row.refundedAt"
                text
                type="success"
                @click="payNow(row)"
              >支付</el-button>
              <el-button
                v-if="row.type === 'expense' && row.paidAt && !row.refundedAt"
                text
                type="warning"
                @click="refundNow(row)"
              >退款</el-button>
              <el-button
                v-if="row.type === 'expense' && row.refundedAt"
                text
                disabled
              >已退款</el-button>
              <el-button text type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button
                v-if="!row.paidAt"
                text
                type="danger"
                @click="confirmDelete(row)"
              >删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-loading="loading && items.length === 0" class="mobile-list">
          <article v-for="item in items" :key="item.id" class="bill-item">
            <div class="bill-item-heading">
              <div>
                <el-tag :type="item.type === 'income' ? 'success' : 'danger'">
                  {{ item.type === 'income' ? '收入' : '支出' }}
                </el-tag>
                <strong>{{ item.category }}</strong>
                <el-tag
                  v-if="item.type === 'expense'"
                  :type="item.refundedAt ? 'info' : item.paidAt ? 'success' : 'warning'"
                  size="small"
                >{{ item.refundedAt ? '已退款' : item.paidAt ? '已支付' : '待支付' }}</el-tag>
              </div>
              <strong :class="item.type === 'income' ? 'amount-income' : 'amount-expense'">
                {{ item.type === 'income' ? '+' : '−' }}¥{{ formatAmount(item.amount) }}
              </strong>
            </div>
            <p>{{ item.note || '无备注' }}</p>
            <div class="bill-item-footer">
              <time>{{ item.transactionDate }}</time>
              <span>
                <el-button
                  v-if="item.type === 'expense' && !item.paidAt && !item.refundedAt"
                  text
                  type="success"
                  @click="payNow(item)"
                >支付</el-button>
                <el-button
                  v-if="item.type === 'expense' && item.paidAt && !item.refundedAt"
                  text
                  type="warning"
                  @click="refundNow(item)"
                >退款</el-button>
                <el-button text type="primary" @click="openEdit(item)">编辑</el-button>
                <el-button
                  v-if="!item.paidAt"
                  text
                  type="danger"
                  @click="confirmDelete(item)"
                >删除</el-button>
              </span>
            </div>
          </article>
          <el-empty v-if="!loading && items.length === 0" description="暂无账单记录" />
        </div>

        <!-- 滚动加载状态提示 -->
        <div class="scroll-status">
          <span v-if="loading && items.length > 0">加载中...</span>
          <span v-else-if="items.length > 0 && items.length >= total">—— 已加载全部 ——</span>
          <span v-else-if="items.length > 0">下拉加载更多</span>
        </div>
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingBill ? '编辑账单' : '记一笔'"
      width="min(520px, calc(100vw - 32px))"
      destroy-on-close
    >
      <el-form
        ref="billFormRef"
        :model="form"
        :rules="formRules"
        label-position="top"
        @submit.prevent
      >
        <el-form-item label="收支类型" prop="type">
          <el-radio-group v-model="form.type" :disabled="editingLocked" @change="onFormTypeChange">
            <el-radio-button value="expense">支出</el-radio-button>
            <el-radio-button value="income">收入</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-select v-model="form.category" class="full-width">
            <el-option
              v-for="category in categories[form.type]"
              :key="category"
              :label="category"
              :value="category"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="金额（元）" prop="amount">
          <el-input
            v-model="form.amount"
            inputmode="decimal"
            maxlength="13"
            placeholder="请输入金额"
            :disabled="editingLocked"
          >
            <template #prepend>¥</template>
          </el-input>
          <div v-if="editingLocked" class="form-hint">
            该账单已进入支付/退款终态，金额与收支类型不可修改。
          </div>
        </el-form-item>
        <el-form-item label="日期" prop="transactionDate">
          <el-date-picker
            v-model="form.transactionDate"
            type="date"
            value-format="YYYY-MM-DD"
            format="YYYY-MM-DD"
            placeholder="选择日期"
            class="full-width"
          />
        </el-form-item>
        <el-form-item label="备注" prop="note">
          <el-input
            v-model="form.note"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="添加备注（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveBill">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 支付确认弹窗：显示应付金额 + 6 位支付密码（可切换可见性） -->
    <el-dialog
      v-model="payDialogVisible"
      title="余额支付"
      width="min(420px, calc(100vw - 32px))"
      destroy-on-close
    >
      <div v-if="payingBill" class="pay-summary">
        <div class="pay-row">
          <span>收款</span>
          <strong>{{ payingBill.category }}</strong>
        </div>
        <div class="pay-row">
          <span>支付金额</span>
          <strong class="pay-amount">¥{{ formatAmount(payingBill.amount) }}</strong>
        </div>
      </div>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="支付密码">
          <el-input
            v-model="payPassword"
            type="password"
            show-password
            maxlength="6"
            placeholder="请输入 6 位支付密码"
            inputmode="numeric"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="paying" @click="confirmPay">
          确认支付
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import {
  createBill,
  deleteBill,
  getBillSummary,
  getBills,
  payBill,
  refundBill,
  updateBill,
  type Bill,
  type BillInput,
  type BillType,
} from '@/api/modules/bills'
import { getDictTypes, getEnabledDictItems } from '@/api/modules/dict'

/** 分类从数据字典动态加载：类型清单由后端注册表驱动，
 *  dictType（bill_category_income）按后缀映射到账单类型（income）。 */
const categories = ref<Record<BillType, string[]>>({ income: [], expense: [] })

async function loadCategories() {
  try {
    const types = await getDictTypes()
    const entries = await Promise.all(
      types.map(async (t) => {
        const items = await getEnabledDictItems(t.value)
        return [
          t.value.replace(/^bill_category_/, ''),
          items.map((i) => i.itemValue),
        ] as const
      }),
    )
    const map = Object.fromEntries(entries) as Partial<Record<BillType, string[]>>
    categories.value = {
      income: map.income ?? [],
      expense: map.expense ?? [],
    }
  } catch {
    ElMessage.error('加载分类字典失败')
  }
}

function localDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function currentMonthRange(): [string, string] {
  const now = new Date()
  return [
    localDate(now.getFullYear(), now.getMonth() + 1, 1),
    localDate(now.getFullYear(), now.getMonth() + 1, now.getDate()),
  ]
}

const loading = ref(false)
const saving = ref(false)
// 支付弹窗状态
const payDialogVisible = ref(false)
const payPassword = ref('')
const paying = ref(false)
const payingBill = ref<Bill | null>(null)
const items = ref<Bill[]>([])
const summary = ref({ income: '0.00', expense: '0.00', balance: '0.00' })
const total = ref(0)
const page = ref(1)
const limit = 15
const filterType = ref<BillType | 'all'>('all')
const filterCategory = ref('')
const dateRange = ref<[string, string] | null>(currentMonthRange())
const dialogVisible = ref(false)
const editingBill = ref<Bill | null>(null)
const billFormRef = ref<FormInstance>()
const scrollContainer = ref<HTMLElement>()
let latestRequestId = 0

const filterCategories = computed(() =>
  filterType.value === 'all'
    ? [...categories.value.income, ...categories.value.expense]
    : categories.value[filterType.value],
)

const form = reactive<BillInput>({
  type: 'expense',
  category: '',
  amount: '',
  transactionDate: currentMonthRange()[1],
  note: null,
})

const formRules: FormRules<BillInput> = {
  type: [{ required: true, message: '请选择收支类型', trigger: 'change' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    {
      pattern: /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/,
      message: '请输入大于 0 且最多两位小数的金额',
      trigger: 'blur',
    },
  ],
  transactionDate: [{ required: true, message: '请选择日期', trigger: 'change' }],
}

/** 正在编辑的账单是否已进入支付/退款终态——这些状态下金额/类型字段锁定。 */
const editingLocked = computed(
  () => Boolean(editingBill.value?.paidAt || editingBill.value?.refundedAt),
)

/**
 * 从后端错误响应里提取人类可读的消息。
 * 后端 ValidationPipe 失败时 message 是 string[]，其他业务异常是 string；
 * 网络错误/非 Axios 错误则回退到 fallback。
 */
function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: unknown; error?: string }
    if (Array.isArray(e.message)) return e.message.filter(Boolean).join('；')
    if (typeof e.message === 'string' && e.message) return e.message
    if (typeof e.error === 'string' && e.error) return e.error
  }
  return fallback
}

function formatAmount(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (!match) return '0.00'
  const integer = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const fraction = (match[3] ?? '').padEnd(2, '0').slice(0, 2)
  return `${match[1]}${integer}.${fraction}`
}

function filters() {
  return {
    type: filterType.value === 'all' ? undefined : filterType.value,
    category: filterCategory.value || undefined,
    from: dateRange.value?.[0],
    to: dateRange.value?.[1],
  }
}

/** 重置到第一页并清空列表 */
async function reload() {
  page.value = 1
  items.value = []
  await loadPage(1, true)
}

/** 加载指定页；append=true 追加，false 覆盖 */
async function loadPage(targetPage: number, append = false) {
  const requestId = ++latestRequestId
  loading.value = true
  try {
    const query = filters()
    const [result, totals] = await Promise.all([
      getBills({ ...query, page: targetPage, limit }),
      getBillSummary(query),
    ])
    if (requestId !== latestRequestId) return
    items.value = append ? [...items.value, ...result.items] : result.items
    page.value = result.page
    total.value = result.total
    summary.value = totals
  } catch (e: unknown) {
    if (requestId === latestRequestId) {
      ElMessage.error(errorMessage(e, '加载账单失败，请稍后重试'))
    }
  } finally {
    if (requestId === latestRequestId) loading.value = false
  }
}

/** 滚动到底部自动加载下一页 */
function onScroll() {
  const el = scrollContainer.value
  if (!el || loading.value) return
  if (items.value.length >= total.value) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
    void loadPage(page.value + 1, true)
  }
}

function onFilterTypeChange() {
  if (!filterCategories.value.includes(filterCategory.value)) filterCategory.value = ''
  void reload()
}

function onFormTypeChange(value: BillType) {
  const list = categories.value[value]
  if (!list.includes(form.category)) form.category = list[0] ?? ''
}

function openCreate() {
  editingBill.value = null
  const firstExpense = categories.value.expense[0] ?? ''
  Object.assign(form, {
    type: 'expense',
    category: firstExpense,
    amount: '',
    transactionDate: currentMonthRange()[1],
    note: null,
  })
  dialogVisible.value = true
}

function openEdit(bill: Bill) {
  editingBill.value = bill
  Object.assign(form, {
    type: bill.type,
    category: bill.category,
    amount: bill.amount,
    transactionDate: bill.transactionDate,
    note: bill.note,
  })
  dialogVisible.value = true
}

async function saveBill() {
  if (!billFormRef.value) return
  try {
    await billFormRef.value.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    const input = { ...form, amount: form.amount.trim(), note: form.note?.trim() || null }
    if (editingBill.value) await updateBill(editingBill.value.id, input)
    else await createBill(input)
    ElMessage.success(editingBill.value ? '账单已更新' : '账单已添加')
    dialogVisible.value = false
    await reload()
  } catch (e: unknown) {
    ElMessage.error(errorMessage(e, '保存账单失败，请检查后重试'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete(bill: Bill) {
  try {
    await ElMessageBox.confirm(
      `确定删除这笔${bill.type === 'income' ? '收入' : '支出'}记录吗？`,
      '删除账单',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteBill(bill.id)
    ElMessage.success('账单已删除')
    await reload()
  } catch (e: unknown) {
    ElMessage.error(errorMessage(e, '删除账单失败，请稍后重试'))
  }
}

// ===== 余额支付（弹窗输入支付密码） =====
function payNow(bill: Bill) {
  payingBill.value = bill
  payPassword.value = ''
  payDialogVisible.value = true
}

async function confirmPay() {
  if (!payingBill.value) return
  if (!/^\d{6}$/.test(payPassword.value)) {
    ElMessage.error('支付密码必须是 6 位数字')
    return
  }
  paying.value = true
  try {
    const updated = await payBill(payingBill.value.id, payPassword.value)
    ElMessage.success('支付成功')
    payDialogVisible.value = false
    const idx = items.value.findIndex((b) => b.id === payingBill.value!.id)
    if (idx >= 0) items.value[idx] = updated
  } catch (e: unknown) {
    ElMessage.error(errorMessage(e, '支付失败，请稍后重试'))
  } finally {
    paying.value = false
  }
}

async function refundNow(bill: Bill) {
  try {
    await ElMessageBox.confirm(
      `将按实际扣款金额 ¥${formatAmount(bill.amount)} 退回你的余额，账单将进入「已退款」状态，确认退款？`,
      '账单退款',
      { confirmButtonText: '确认退款', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    const updated = await refundBill(bill.id)
    ElMessage.success('退款成功，金额已退回余额')
    const idx = items.value.findIndex((b) => b.id === bill.id)
    if (idx >= 0) items.value[idx] = updated
  } catch (e: unknown) {
    ElMessage.error(errorMessage(e, '退款失败，请稍后重试'))
  }
}

onMounted(async () => {
  await loadCategories()
  await reload()
})
</script>

<style scoped>
.bills-page {
  display: grid;
  gap: 20px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #475669;
  background: #f4f7fb;
  padding: 1px 6px;
  border-radius: 4px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.summary-card :deep(.el-card__body) {
  display: grid;
  gap: 10px;
  padding: 22px 24px;
}

.summary-label {
  color: #778297;
  font-size: 14px;
}

.summary-card strong {
  overflow-wrap: anywhere;
  color: #27354d;
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.income-card strong,
.amount-income {
  color: #22a06b;
}

.expense-card strong,
.amount-expense {
  color: #e05b5b;
}

.summary-card strong.negative {
  color: #e05b5b;
}

.records-card :deep(.el-card__body) {
  padding: 20px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;
}

.filter-select {
  width: 145px;
}

/* 内部滚动容器：固定最大高度，滚动到底部加载更多 */
.scroll-container {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;
}

.desktop-table {
  width: 100%;
}

.mobile-list {
  display: none;
}

.scroll-status {
  padding: 16px 0 4px;
  text-align: center;
  color: #97a0af;
  font-size: 13px;
}

.full-width {
  width: 100%;
}

.form-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #b88230;
  line-height: 1.5;
}

.pay-summary {
  display: grid;
  gap: 10px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #f6f8fb;
  border-radius: 8px;
}

.pay-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  color: #6b778c;
  font-size: 14px;
}

.pay-amount {
  color: #e05b5b;
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}

.bill-item {
  padding: 16px 0;
  border-bottom: 1px solid #edf0f5;
}

.bill-item-heading,
.bill-item-heading > div,
.bill-item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.bill-item-heading > div {
  justify-content: flex-start;
}

.bill-item-heading strong {
  color: #27354d;
}

.bill-item p {
  margin: 10px 0;
  color: #788399;
  overflow-wrap: anywhere;
}

.bill-item-footer {
  color: #97a0af;
  font-size: 13px;
}

/* 支付对话框 */
.pay-body {
  display: grid;
  gap: 18px;
}

.pay-amount {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16px;
  background: #f6f8fb;
  border-radius: 8px;
}

.pay-amount strong {
  color: #e05b5b;
  font-size: 26px;
  font-variant-numeric: tabular-nums;
}

.channel-group {
  display: flex;
  justify-content: center;
}

.qrcode-mock {
  display: grid;
  gap: 10px;
  justify-items: center;
}

.qrcode-placeholder {
  display: grid;
  place-items: center;
  width: 180px;
  height: 180px;
  background: repeating-linear-gradient(
    45deg,
    #f0f2f5,
    #f0f2f5 10px,
    #e4e7ed 10px,
    #e4e7ed 20px
  );
  color: #606266;
  border-radius: 8px;
}

.qrcode-tip {
  margin: 0;
  color: #97a0af;
  font-size: 13px;
}

@media (max-width: 680px) {
  .summary-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .summary-card :deep(.el-card__body) {
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
  }

  .summary-card strong {
    font-size: 20px;
    text-align: right;
  }

  .records-card :deep(.el-card__body) {
    padding: 14px;
  }

  .filters > * {
    flex: 1 1 calc(50% - 8px);
    min-width: 0;
  }

  .filter-select {
    width: auto;
  }

  .filters :deep(.el-date-editor) {
    width: 100%;
  }

  .desktop-table {
    display: none;
  }

  .mobile-list {
    display: block;
  }
}
</style>
