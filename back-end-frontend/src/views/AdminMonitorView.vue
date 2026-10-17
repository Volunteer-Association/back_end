<template>
  <section style="padding:0;background:#f5f7fa;min-height:calc(100vh - 60px)">
    <!-- 顶部五卡片 -->
    <div style="display:flex;gap:16px;padding:16px;background:#f5f7fa">
      <div style="flex:1;background:#fff;border-radius:8px;padding:20px;text-align:center">
        <svg viewBox="0 0 120 120" style="width:110px;height:110px">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#f0f0f0" stroke-width="10" />
          <circle cx="60" cy="60" r="50" fill="none" :stroke="ringColor(cpuLoadPct)" stroke-width="10"
            stroke-dasharray="314" :stroke-dashoffset="314 - 314*cpuLoadPct/100" stroke-linecap="round" />
          <text x="60" y="65" text-anchor="middle" font-size="26" font-weight="bold" fill="#333">{{ cpuLoadPct }}<tspan font-size="14">%</tspan></text>
        </svg>
        <div style="color:#999;font-size:13px;text-align:left;margin-top:4px">负载</div>
        <div style="font-size:20px;font-weight:bold;color:#333;text-align:left">{{ loadText }}</div>
      </div>
      <div style="flex:1;background:#fff;border-radius:8px;padding:20px;text-align:center">
        <svg viewBox="0 0 120 120" style="width:110px;height:110px">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#f0f0f0" stroke-width="10" />
          <circle cx="60" cy="60" r="50" fill="none" :stroke="ringColor(cpuPct)" stroke-width="10"
            stroke-dasharray="314" :stroke-dashoffset="314 - 314*cpuPct/100" stroke-linecap="round" />
          <text x="60" y="65" text-anchor="middle" font-size="26" font-weight="bold" fill="#333">{{ cpuPct }}<tspan font-size="14">%</tspan></text>
        </svg>
        <div style="color:#999;font-size:13px;text-align:left;margin-top:4px">CPU</div>
        <div style="font-size:20px;font-weight:bold;color:#333;text-align:left">{{ data.cpu?.cores || 0 }}<span style="font-size:13px;color:#999">核心</span></div>
      </div>
      <div style="flex:1;background:#fff;border-radius:8px;padding:20px;text-align:center">
        <svg viewBox="0 0 120 120" style="width:110px;height:110px">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#f0f0f0" stroke-width="10" />
          <circle cx="60" cy="60" r="50" fill="none" :stroke="ringColor(memPct)" stroke-width="10"
            stroke-dasharray="314" :stroke-dashoffset="314 - 314*memPct/100" stroke-linecap="round" />
          <text x="60" y="65" text-anchor="middle" font-size="26" font-weight="bold" fill="#333">{{ memPct }}<tspan font-size="14">%</tspan></text>
        </svg>
        <div style="color:#999;font-size:13px;text-align:left;margin-top:4px">内存</div>
        <div style="font-size:16px;font-weight:bold;color:#333;text-align:left">
          <span style="color:#67c23a">{{ data.memory?.usedGB || 0 }}</span><span style="font-size:11px;color:#999">MB</span> / <span style="color:#333">{{ data.memory?.totalGB || 0 }}</span><span style="font-size:11px;color:#999">GB</span>
        </div>
      </div>
      <template v-for="(d,i) in (data.disks||[]).slice(0,2)" :key="i">
      <div style="flex:1;background:#fff;border-radius:8px;padding:20px;text-align:center">
        <svg viewBox="0 0 120 120" style="width:110px;height:110px">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#f0f0f0" stroke-width="10" />
          <circle cx="60" cy="60" r="50" fill="none" :stroke="ringColor(d.usagePercent)" stroke-width="10"
            stroke-dasharray="314" :stroke-dashoffset="314 - 314*d.usagePercent/100" stroke-linecap="round" />
          <text x="60" y="65" text-anchor="middle" font-size="26" font-weight="bold" fill="#333">{{ d.usagePercent }}<tspan font-size="14">%</tspan></text>
        </svg>
        <div style="color:#999;font-size:13px;text-align:left;margin-top:4px">{{ d.drive }}</div>
        <div style="font-size:14px;font-weight:bold;color:#333;text-align:left">
          <span style="color:#67c23a">{{ d.usedGB }}</span><span style="font-size:11px;color:#999">GB</span> / <span style="color:#333">{{ d.totalGB }}</span><span style="font-size:11px;color:#999">GB</span>
        </div>
      </div>
      </template>
    </div>

    <!-- 流量 + 磁盘IO -->
    <div style="padding:0 16px 16px">
    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="流量" name="net">
          <!-- 4个小统计 -->
          <el-row :gutter="12" style="margin-bottom:12px">
            <el-col :span="6">
              <div style="background:#f8f9fa;padding:10px;border-radius:6px">
                <span style="color:#67c23a">●</span> <span style="color:#999">上行</span> <b style="float:right">{{ fmtSpeed(data.net?.txMbps) }}</b>
              </div>
            </el-col>
            <el-col :span="6">
              <div style="background:#f8f9fa;padding:10px;border-radius:6px">
                <span style="color:#e6a23c">●</span> <span style="color:#999">下行</span> <b style="float:right">{{ fmtSpeed(data.net?.rxMbps) }}</b>
              </div>
            </el-col>
            <el-col :span="6">
              <div style="background:#f8f9fa;padding:10px;border-radius:6px">
                <span style="color:#999">总发送</span> <b style="float:right">{{ data.net?.totalTxMB || 0 }} MB</b>
              </div>
            </el-col>
            <el-col :span="6">
              <div style="background:#f8f9fa;padding:10px;border-radius:6px">
                <span style="color:#999">总接收</span> <b style="float:right">{{ data.net?.totalRxMB || 0 }} MB</b>
              </div>
            </el-col>
          </el-row>
          <div style="position:relative" @mousemove="onHover" @mouseleave="hoverIdx=-1">
            <svg width="100%" height="220" viewBox="0 0 800 220" preserveAspectRatio="none">
              <line x1="0" y1="40" x2="800" y2="40" stroke="#eee" stroke-dasharray="4" />
              <line x1="0" y1="90" x2="800" y2="90" stroke="#eee" stroke-dasharray="4" />
              <line x1="0" y1="140" x2="800" y2="140" stroke="#eee" stroke-dasharray="4" />
              <line x1="0" y1="190" x2="800" y2="190" stroke="#eee" stroke-dasharray="4" />
              <polygon :points="txArea" fill="#67c23a" fill-opacity="0.15" />
              <polygon :points="rxArea" fill="#e6a23c" fill-opacity="0.15" />
              <polyline :points="txPoints" fill="none" stroke="#67c23a" stroke-width="2" />
              <polyline :points="rxPoints" fill="none" stroke="#e6a23c" stroke-width="2" />
              <line v-if="hoverIdx>=0" :x1="hoverVBX" y1="0" :x2="hoverVBX" y2="220" stroke="#999" stroke-dasharray="4" />
              <!-- 底部固定时间刻度 -->
              <text x="20" y="215" font-size="11" fill="#999">2分钟前</text>
              <text x="200" y="215" font-size="11" fill="#999">90秒前</text>
              <text x="380" y="215" font-size="11" fill="#999">60秒前</text>
              <text x="560" y="215" font-size="11" fill="#999">30秒前</text>
              <text x="760" y="215" font-size="11" fill="#999">现在</text>
            </svg>
            <div v-if="hoverIdx>=0" class="monitor-tooltip" :style="{ left: hoverX+'px', top: '10px' }">
              <div style="color:#67c23a">● 上行: {{ fmtSpeed(txHistory[hoverIdx]) }}</div>
              <div style="color:#e6a23c">● 下行: {{ fmtSpeed(rxHistory[hoverIdx]) }}</div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="磁盘IO" name="io">
          <el-row :gutter="12" style="margin-bottom:12px">
            <el-col :span="6">
              <div style="background:#f8f9fa;padding:10px;border-radius:6px">
                <span style="color:#f56c6c">●</span> <span style="color:#999">读取</span> <b style="float:right">{{ fmtSpeed(data.diskIO?.readMBs) }}</b>
              </div>
            </el-col>
            <el-col :span="6">
              <div style="background:#f8f9fa;padding:10px;border-radius:6px">
                <span style="color:#409eff">●</span> <span style="color:#999">写入</span> <b style="float:right">{{ fmtSpeed(data.diskIO?.writeMBs) }}</b>
              </div>
            </el-col>
          </el-row>
          <svg width="100%" height="200" viewBox="0 0 800 200" preserveAspectRatio="none" @mousemove="onHoverIO" @mouseleave="ioHoverIdx=-1">
            <line x1="0" y1="40" x2="800" y2="40" stroke="#eee" stroke-dasharray="4" />
            <line x1="0" y1="90" x2="800" y2="90" stroke="#eee" stroke-dasharray="4" />
            <line x1="0" y1="140" x2="800" y2="140" stroke="#eee" stroke-dasharray="4" />
            <polygon :points="readArea" fill="#f56c6c" fill-opacity="0.15" />
            <polygon :points="writeArea" fill="#409eff" fill-opacity="0.15" />
            <polyline :points="readPoints" fill="none" stroke="#f56c6c" stroke-width="2" />
            <polyline :points="writePoints" fill="none" stroke="#409eff" stroke-width="2" />
            <line v-if="ioHoverIdx>=0" :x1="ioHoverVBX" y1="0" :x2="ioHoverVBX" y2="200" stroke="#999" stroke-dasharray="4" />
          </svg>
          <div v-if="ioHoverIdx>=0" class="monitor-tooltip" :style="{ left: ioHoverX+'px', top: '10px' }">
            <div style="color:#f56c6c">● 读取: {{ fmtSpeed(readHistory[ioHoverIdx]) }}</div>
            <div style="color:#409eff">● 写入: {{ fmtSpeed(writeHistory[ioHoverIdx]) }}</div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { request } from '@/api'

const data = ref<any>({})
let timer: any = null
let loading = false
const MAX_POINTS = 60
const activeTab = ref('net')
const rxHistory = ref<number[]>([])
const txHistory = ref<number[]>([])
const readHistory = ref<number[]>([])
const writeHistory = ref<number[]>([])
const timeHistory = ref<string[]>([])
const hoverIdx = ref(-1)
const hoverX = ref('0%')
const hoverVBX = ref(0)
const ioHoverIdx = ref(-1)
const ioHoverX = ref('0px')
const ioHoverVBX = ref(0)

const cpuPct = computed(() => data.value.cpu?.usagePercent || 0)
const memPct = computed(() => data.value.memory?.usagePercent || 0)
const cpuLoadPct = computed(() => {
  // Windows 用 Processor Queue Length / 核数 作为负载
  const q = data.value.cpu?.queueLen || 0
  const cores = data.value.cpu?.cores || 1
  return Math.min(100, Math.round((q / cores) * 100))
})
const loadText = computed(() => cpuLoadPct.value < 30 ? '运行流畅' : cpuLoadPct.value < 70 ? '负载较高' : '负载过高')

function ringColor(v: number) {
  return v > 80 ? '#f56c6c' : v > 60 ? '#e6a23c' : '#67c23a'
}
function fmtSpeed(v: number) {
  if (!v) return '0 B/s'
  if (v < 0.001) return (v*1024*1024).toFixed(0) + ' B/s'
  if (v < 1) return (v*1024).toFixed(0) + ' KB/s'
  return v.toFixed(2) + ' MB/s'
}

function buildPoints(hist: number[], H: number, max: number = 5) {
  if (!hist.length) return { line: '', area: '' }
  const W = 800
  const stepX = W / MAX_POINTS
  const pts = hist.map((v, i) => {
    const x = W - (hist.length - 1 - i) * stepX
    const y = (H - 30) - Math.min(1, v / max) * (H - 60)
    return [x, y]
  })
  const line = pts.map(p => p.join(',')).join(' ')
  const area = `0,${H-30} ` + pts.map(p => p.join(',')).join(' ') + ` ${W},${H-30}`
  return { line, area }
}
const rxPoints = computed(() => buildPoints(rxHistory.value, 220).line)
const txPoints = computed(() => buildPoints(txHistory.value, 220).line)
const rxArea = computed(() => buildPoints(rxHistory.value, 220).area)
const txArea = computed(() => buildPoints(txHistory.value, 220).area)
const readPoints = computed(() => buildPoints(readHistory.value, 200, 2).line)
const writePoints = computed(() => buildPoints(writeHistory.value, 200, 2).line)
const readArea = computed(() => buildPoints(readHistory.value, 200, 2).area)
const writeArea = computed(() => buildPoints(writeHistory.value, 200, 2).area)

function onHover(e: MouseEvent) {
  const svg = e.currentTarget as HTMLElement
  const rect = svg.getBoundingClientRect()
  // 转成 viewBox 坐标 (0-800)
  const vbX = ((e.clientX - rect.left) / rect.width) * 800
  hoverX.value = ((e.clientX - rect.left) / rect.width) * 100 + '%'
  hoverVBX.value = vbX
  const idx = Math.round((1 - vbX / 800) * (rxHistory.value.length - 1))
  hoverIdx.value = Math.max(0, Math.min(rxHistory.value.length - 1, idx))
}

function onHoverIO(e: MouseEvent) {
  const svg = e.currentTarget as HTMLElement
  const rect = svg.getBoundingClientRect()
  const vbX = ((e.clientX - rect.left) / rect.width) * 800
  ioHoverX.value = (e.clientX - rect.left) + 'px'
  ioHoverVBX.value = vbX
  const idx = Math.round((1 - vbX / 800) * (readHistory.value.length - 1))
  ioHoverIdx.value = Math.max(0, Math.min(readHistory.value.length - 1, idx))
}

async function load() {
  if (loading) return
  loading = true
  try {
    data.value = await request.get('/admin/system/metrics')
    rxHistory.value.push(data.value.net?.rxMbps || 0)
    txHistory.value.push(data.value.net?.txMbps || 0)
    readHistory.value.push(data.value.diskIO?.readMBs || 0)
    writeHistory.value.push(data.value.diskIO?.writeMBs || 0)
    timeHistory.value.push(new Date().toTimeString().slice(3,8))
    if (rxHistory.value.length > MAX_POINTS) rxHistory.value.shift()
    if (txHistory.value.length > MAX_POINTS) txHistory.value.shift()
    if (readHistory.value.length > MAX_POINTS) readHistory.value.shift()
    if (writeHistory.value.length > MAX_POINTS) writeHistory.value.shift()
    if (timeHistory.value.length > MAX_POINTS) timeHistory.value.shift()
  } catch { /* ignore */ } finally { loading = false }
}
onMounted(() => { load(); timer = setInterval(load, 2000) })
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.monitor-tooltip {
  position: absolute;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
  pointer-events: none;
  z-index: 10;
  white-space: nowrap;
}
</style>
