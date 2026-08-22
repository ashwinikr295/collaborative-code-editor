import process from 'process';

export interface ExecutionLog {
  id: string;
  timestamp: string;
  roomId: string;
  language: string;
  executionTimeMs: number;
  status: 'SUCCESS' | 'COMPILATION_ERROR' | 'RUNTIME_ERROR' | 'NETWORK_ERROR';
  runBy: string;
  stdoutSnippet: string;
  stderrSnippet: string;
}

// In-memory circular buffer for execution audit logs (stores up to 50 recent executions)
const MAX_LOGS = 50;
const executionLogs: ExecutionLog[] = [];
let totalExecutionsCount = 0;

export function addExecutionLog(data: {
  roomId: string;
  language: string;
  executionTimeMs: number;
  status: 'SUCCESS' | 'COMPILATION_ERROR' | 'RUNTIME_ERROR' | 'NETWORK_ERROR';
  runBy?: string;
  stdout?: string;
  stderr?: string;
  compilationError?: string;
}): ExecutionLog {
  totalExecutionsCount++;
  
  const id = Math.random().toString(36).substring(2, 10);
  const timestamp = new Date().toISOString();

  let finalStatus = data.status;
  if (data.compilationError) {
    finalStatus = 'COMPILATION_ERROR';
  } else if (data.stderr && data.stderr.trim().length > 0) {
    finalStatus = 'RUNTIME_ERROR';
  }

  const logItem: ExecutionLog = {
    id,
    timestamp,
    roomId: data.roomId || 'default',
    language: data.language || 'unknown',
    executionTimeMs: data.executionTimeMs || 0,
    status: finalStatus,
    runBy: data.runBy || 'Anonymous',
    stdoutSnippet: (data.stdout || '').substring(0, 200),
    stderrSnippet: (data.compilationError || data.stderr || '').substring(0, 200),
  };

  executionLogs.unshift(logItem);
  if (executionLogs.length > MAX_LOGS) {
    executionLogs.pop();
  }

  return logItem;
}

export function getExecutionLogs(): ExecutionLog[] {
  return executionLogs;
}

export function getAdminStats(activeDocsCount: number, isOffline: boolean) {
  const memUsage = process.memoryUsage();
  return {
    activeRoomsCount: activeDocsCount,
    totalExecutionsCount,
    executionMode: isOffline ? 'Host Sandbox (Local Mode)' : 'BullMQ / Redis Sandbox Queue',
    isDockerActive: process.env.LITE_MODE !== 'true',
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMb: Math.round(memUsage.heapUsed / 1024 / 1024),
  };
}
