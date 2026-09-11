import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Activity, Terminal, Shield, Cpu, CheckCircle2, AlertTriangle, XCircle, Lock, KeyRound, LogOut } from 'lucide-react';

interface AdminStats {
  activeRoomsCount: number;
  totalExecutionsCount: number;
  executionMode: string;
  isDockerActive: boolean;
  uptimeSeconds: number;
  memoryUsageMb: number;
}

interface ExecutionLog {
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

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [adminKey, setAdminKey] = useState<string>(() => sessionStorage.getItem('coedit_admin_key') || '');
  const [keyInput, setKeyInput] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<ExecutionLog | null>(null);

  const fetchAdminData = async (keyToUse = adminKey) => {
    if (!keyToUse) {
      setIsAuthenticated(false);
      return;
    }

    setLoading(true);
    setError(null);

    let apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl || apiUrl.includes('localhost')) {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;
      apiUrl = `${protocol}//${hostname}:1234`;
    }

    try {
      const headers = { 'x-admin-key': keyToUse };
      const [statsRes, logsRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/stats`, { headers }),
        fetch(`${apiUrl}/api/admin/logs`, { headers })
      ]);

      if (statsRes.status === 401 || logsRes.status === 401) {
        setIsAuthenticated(false);
        sessionStorage.removeItem('coedit_admin_key');
        setAuthError('Invalid Admin Secret Key. Please try again.');
        return;
      }

      if (!statsRes.ok || !logsRes.ok) {
        throw new Error('Failed to fetch server metrics or logs.');
      }

      const statsData = await statsRes.json();
      const logsData = await logsRes.json();

      if (statsData.success) {
        setStats(statsData.stats);
        setIsAuthenticated(true);
        sessionStorage.setItem('coedit_admin_key', keyToUse);
        setAuthError(null);
      }
      if (logsData.success) setLogs(logsData.logs);
    } catch (err: any) {
      console.error('Error fetching admin data:', err);
      setError(err.message || 'Unable to connect to sync server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminKey) {
      fetchAdminData(adminKey);
      const interval = setInterval(() => fetchAdminData(adminKey), 5000);
      return () => clearInterval(interval);
    }
  }, [adminKey]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      setAuthError('Please enter an Admin Secret Key');
      return;
    }
    const entered = keyInput.trim();
    setAdminKey(entered);
    fetchAdminData(entered);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('coedit_admin_key');
    setAdminKey('');
    setIsAuthenticated(false);
    setKeyInput('');
  };

  const formatUptime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m ${seconds % 60}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> SUCCESS
          </span>
        );
      case 'COMPILATION_ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" /> BUILD ERROR
          </span>
        );
      case 'RUNTIME_ERROR':
      case 'NETWORK_ERROR':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> RUNTIME ERROR
          </span>
        );
    }
  };

  // Render Admin Passcode Login Modal if not authenticated
  // Render Admin Passcode Login Modal if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-xl flex flex-col gap-6 my-auto">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shadow-sm">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Authentication</h1>
            <p className="text-xs text-slate-600">
              Enter your Admin Secret Key to access server telemetry & audit logs.
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-indigo-600" /> Secret Key
              </label>
              <input
                type="password"
                placeholder="Enter admin secret key..."
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  setAuthError(null);
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white text-slate-900 text-sm placeholder-slate-400 outline-none transition-all"
              />
              {authError && <span className="text-xs text-rose-500 px-1 mt-0.5">{authError}</span>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 cursor-pointer mt-2"
            >
              {loading ? 'Authenticating...' : 'Unlock Dashboard'}
            </button>
          </form>

          <button
            onClick={() => navigate('/')}
            className="text-xs text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 p-6 md:p-10 font-sans selection:bg-indigo-500 selection:text-white overflow-y-auto">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        
        {/* Header Bar */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/')}
              className="p-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-sm"
              title="Back to Home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Dashboard</h1>
                <span className="bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                  Authenticated Session
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Real-time monitoring for WebSocket sessions, BullMQ Redis queue, Docker sandbox, & audit logs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => fetchAdminData()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-all cursor-pointer shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
              Refresh
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-semibold text-rose-600 transition-all cursor-pointer"
              title="Lock Admin Dashboard"
            >
              <LogOut className="w-3.5 h-3.5" />
              Lock
            </button>
          </div>
        </header>

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* System Health Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Card 1: Active Rooms */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Rooms</span>
              <Activity className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-1">
              {stats ? stats.activeRoomsCount : '-'}
            </div>
            <span className="text-[11px] text-slate-500">Live Yjs CRDT room sessions</span>
          </div>

          {/* Card 2: Total Executions */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Executions</span>
              <Terminal className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-1">
              {stats ? stats.totalExecutionsCount : '-'}
            </div>
            <span className="text-[11px] text-slate-500">Jobs processed across sandbox</span>
          </div>

          {/* Card 3: Execution Mode & Docker Status */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Sandbox Engine</span>
              <Shield className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-sm font-bold text-slate-900 mt-1 truncate" title={stats?.executionMode || ''}>
              {stats?.isDockerActive ? 'Docker Containerized' : 'Host Isolation Mode'}
            </div>
            <span className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {stats?.executionMode || 'Online'}
            </span>
          </div>

          {/* Card 4: Server Health / Uptime */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Server Health</span>
              <Cpu className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-1 flex items-baseline gap-2">
              <span>{stats ? formatUptime(stats.uptimeSeconds) : '-'}</span>
              <span className="text-xs font-normal text-slate-500 font-mono">({stats?.memoryUsageMb || 0}MB RAM)</span>
            </div>
            <span className="text-[11px] text-slate-500">Process uptime & heap memory</span>
          </div>

        </div>

        {/* Execution Audit Log Table */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Code Execution Security Audit Trail</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time log of compilation runtime, output status, and container execution metrics.
              </p>
            </div>
            <span className="text-xs font-mono bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg text-slate-600 font-medium">
              {logs.length} Recent Logs
            </span>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No code executions logged yet. Run code in any editor workspace room to generate audit events.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-3">Timestamp</th>
                    <th className="py-3 px-3">Room ID</th>
                    <th className="py-3 px-3">Language</th>
                    <th className="py-3 px-3">Runtime</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Output Snippet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {logs.map((log) => (
                    <tr 
                      key={log.id} 
                      onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-3 font-mono text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-3 font-mono text-indigo-600 font-medium">
                        {log.roomId}
                      </td>
                      <td className="py-3 px-3 font-semibold uppercase text-slate-600">
                        {log.language}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700">
                        {log.executionTimeMs}ms
                      </td>
                      <td className="py-3 px-3">
                        {getStatusBadge(log.status)}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500 max-w-xs truncate">
                        {log.stdoutSnippet || log.stderrSnippet || '(no output)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Selected Log Modal / Detail Drawer */}
        {selectedLog && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4 shadow-xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-600" /> Log Details — Job ID: {selectedLog.id}
              </h3>
              <button 
                onClick={() => setSelectedLog(null)}
                className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                Close ✕
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div><span className="text-slate-500">Room:</span> <span className="text-slate-800">{selectedLog.roomId}</span></div>
              <div><span className="text-slate-500">Language:</span> <span className="text-slate-800">{selectedLog.language}</span></div>
              <div><span className="text-slate-500">Duration:</span> <span className="text-slate-800">{selectedLog.executionTimeMs}ms</span></div>
              <div><span className="text-slate-500">Status:</span> {selectedLog.status}</div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-600">Output Log Stream:</span>
              <pre className="p-4 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto max-h-48">
                {selectedLog.stdoutSnippet || selectedLog.stderrSnippet || 'No output recorded.'}
              </pre>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
