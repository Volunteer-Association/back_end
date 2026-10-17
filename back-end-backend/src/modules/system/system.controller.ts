import { Controller, Get, UseGuards, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard.js';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const isWin = process.platform === 'win32';

let cpuUsage = 0;
let lastCpuTimes: { user: number; system: number; idle: number } | null = null;
let netRxMbps = 0, netTxMbps = 0, netTotalRxMB = 0, netTotalTxMB = 0;
let lastNetBytes: { rx: number; tx: number; at: number } | null = null;
let disks: any[] = [];
let diskReadMBs = 0, diskWriteMBs = 0;
let procQueueLen = 0;

function sampleCpu() {
  const cpus = os.cpus();
  let user = 0, system = 0, idle = 0;
  for (const c of cpus) { user += c.times.user; system += c.times.sys; idle += c.times.idle; }
  const cur = { user, system, idle };
  if (lastCpuTimes) {
    const totalDiff = (cur.user + cur.system + cur.idle) - (lastCpuTimes.user + lastCpuTimes.system + lastCpuTimes.idle);
    const idleDiff = cur.idle - lastCpuTimes.idle;
    if (totalDiff > 0) cpuUsage = Math.min(100, Math.max(0, (1 - idleDiff / totalDiff) * 100));
  }
  lastCpuTimes = cur;
}

async function sampleNet() {
  let rx = 0, tx = 0;
  try {
    if (isWin) {
      const { stdout } = await execAsync('powershell -Command "Get-NetAdapterStatistics | Select-Object ReceivedBytes,SentBytes | ConvertTo-Json"', { timeout: 3000 });
      const arr = JSON.parse(stdout.trim());
      const list = Array.isArray(arr) ? arr : [arr];
      for (const n of list) { rx += Number(n.ReceivedBytes); tx += Number(n.SentBytes); }
    } else {
      const { stdout } = await execAsync('cat /proc/net/dev', { timeout: 2000 });
      for (const line of stdout.split('\n')) {
        const m = line.match(/^\s*(\w+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
        if (m && !m[1].startsWith('lo')) { rx += Number(m[2]); tx += Number(m[3]); }
      }
    }
  } catch { return; }
  const now = Date.now();
  if (lastNetBytes) {
    const sec = (now - lastNetBytes.at) / 1000;
    netRxMbps = Number(((rx - lastNetBytes.rx) / sec / 1024 / 1024).toFixed(3));
    netTxMbps = Number(((tx - lastNetBytes.tx) / sec / 1024 / 1024).toFixed(3));
  }
  netTotalRxMB = Number((rx/1024/1024).toFixed(1));
  netTotalTxMB = Number((tx/1024/1024).toFixed(1));
  lastNetBytes = { rx, tx, at: now };
}

async function sampleDisk() {
  try {
    if (isWin) {
      const { stdout } = await execAsync('powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json"', { timeout: 5000 });
      const arr = JSON.parse(stdout.trim());
      disks = (Array.isArray(arr) ? arr : [arr]).map((d: any) => {
        const usedGB = Number(d.Used) / 1024**3, freeGB = Number(d.Free) / 1024**3, totalGB = usedGB + freeGB;
        if (totalGB <= 0) return null;
        return { drive: d.Name + ':', totalGB: Number(totalGB.toFixed(1)), freeGB: Number(freeGB.toFixed(1)), usedGB: Number(usedGB.toFixed(1)), usagePercent: Number((usedGB/totalGB*100).toFixed(1)) };
      }).filter(Boolean);
    } else {
      const { stdout } = await execAsync('df -P -k', { timeout: 3000 });
      disks = stdout.trim().split('\n').slice(1).map((line: string) => {
        const p = line.split(/\s+/);
        if (!p[5] || p[5].startsWith('tmpfs')) return null;
        const totalGB = Number(p[1]) / 1024 / 1024;
        const usedGB = Number(p[2]) / 1024 / 1024;
        const freeGB = Number(p[3]) / 1024 / 1024;
        return { drive: p[5], totalGB: Number(totalGB.toFixed(1)), freeGB: Number(freeGB.toFixed(1)), usedGB: Number(usedGB.toFixed(1)), usagePercent: Number((usedGB/totalGB*100).toFixed(1)) };
      }).filter(Boolean);
    }
  } catch { /* keep old */ }
}

async function sampleQueue() {
  try {
    if (isWin) {
      const { stdout } = await execAsync('powershell -Command "(Get-Counter \'\\System\\Processor Queue Length\').CounterSamples.CookedValue"', { timeout: 2000 });
      procQueueLen = Number(stdout.trim());
    }
  } catch { /* keep old */ }
}

async function sampleDiskIO() {
  try {
    if (isWin) {
      const { stdout } = await execAsync('powershell -Command "(Get-Counter \'\\PhysicalDisk(_Total)\\Disk Read Bytes/sec\',\'\\PhysicalDisk(_Total)\\Disk Write Bytes/sec\').CounterSamples | Select-Object CookedValue | ConvertTo-Json"', { timeout: 3000 });
      const arr = JSON.parse(stdout.trim());
      const list = Array.isArray(arr) ? arr : [arr];
      if (list.length >= 2) {
        diskReadMBs = Number((Number(list[0].CookedValue) / 1024 / 1024).toFixed(3));
        diskWriteMBs = Number((Number(list[1].CookedValue) / 1024 / 1024).toFixed(3));
      }
    } else {
      diskReadMBs = 0; diskWriteMBs = 0;
    }
  } catch { /* keep old */ }
}

@ApiTags('系统-管理员')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('admin/system')
export class SystemController implements OnModuleInit, OnModuleDestroy {
  private cpuTimer: any;
  private sampleTimer: any;
  private diskTimer: any;

  onModuleInit() {
    sampleCpu();
    sampleNet();
    sampleDisk();
    sampleDiskIO();
    sampleQueue();
    this.cpuTimer = setInterval(sampleCpu, 1000);
    this.sampleTimer = setInterval(() => { sampleNet(); sampleDiskIO(); sampleQueue(); }, 2000);
    this.diskTimer = setInterval(sampleDisk, 30000);
  }

  onModuleDestroy() {
    clearInterval(this.cpuTimer);
    clearInterval(this.sampleTimer);
    clearInterval(this.diskTimer);
  }

  @Get('metrics')
  @ApiOperation({ summary: '系统资源监控（读内存采样值，毫秒返回）' })
  metrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return {
      cpu: { model: cpus[0]?.model || '', cores: cpus.length, usagePercent: Number(cpuUsage.toFixed(1)), loadAvg: os.loadavg().map(x => Number(x.toFixed(2))), queueLen: procQueueLen },
      memory: { totalGB: Number((totalMem/1024**3).toFixed(2)), usedGB: Number((usedMem/1024**3).toFixed(2)), freeGB: Number((freeMem/1024**3).toFixed(2)), usagePercent: Number(((usedMem/totalMem)*100).toFixed(1)) },
      disks,
      net: { rxMbps: netRxMbps, txMbps: netTxMbps, totalRxMB: netTotalRxMB, totalTxMB: netTotalTxMB },
      diskIO: { readMBs: diskReadMBs, writeMBs: diskWriteMBs },
      uptime: os.uptime(),
      hostname: os.hostname(),
      platform: os.platform(),
    };
  }
}
