import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';

async function adminFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('ontrail_token');
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

interface ExpoStatus {
  status: 'running' | 'stopped' | 'errored';
  port: number;
  uptime: number;
  memory_mb: number;
  pid: number | null;
}

interface ExpoLogs {
  lines: string[];
}

interface ExpoSessions {
  count: number;
  sessions: any[];
}

export default function ExpoGoPage() {
  const [status, setStatus] = useState<ExpoStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [sessions, setSessions] = useState<ExpoSessions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restarting, setRestarting] = useState(false);
  const [restartMsg, setRestartMsg] = useState('');
  const [portValue, setPortValue] = useState('');
  const [portError, setPortError] = useState('');
  const [portMsg, setPortMsg] = useState('');
  const [savingPort, setSavingPort] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await adminFetch<ExpoStatus>('/admin/expo/status');
      setStatus(data);
      setPortValue(String(data.port));
      setError('');
    } catch (e: any) {
      setError(e.message || 'Expo Go server status is unavailable');
      setStatus(null);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const data = await adminFetch<ExpoLogs>('/admin/expo/logs');
      setLogs(data.lines || []);
    } catch {
      // non-critical, don't overwrite main error
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const data = await adminFetch<ExpoSessions>('/admin/expo/sessions');
      setSessions(data);
    } catch {
      // non-critical
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadStatus(), loadLogs(), loadSessions()]);
    setLoading(false);
  }, [loadStatus, loadLogs, loadSessions]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRestart = async () => {
    setRestarting(true);
    setRestartMsg('');
    try {
      const data = await adminFetch<{ status: string; message: string }>('/admin/expo/restart', { method: 'POST' });
      setRestartMsg(data.message || 'Server restarted successfully');
      await loadAll();
    } catch (e: any) {
      setRestartMsg(`Failed: ${e.message}`);
    } finally {
      setRestarting(false);
    }
  };

  const validatePort = (val: string): string | null => {
    const num = Number(val);
    if (!val || isNaN(num) || !Number.isInteger(num)) return 'Port must be an integer';
    if (num < 1024 || num > 65535) return 'Port must be between 1024 and 65535';
    return null;
  };

  const handlePortSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validatePort(portValue);
    if (err) { setPortError(err); return; }
    setPortError('');
    setPortMsg('');
    setSavingPort(true);
    try {
      const data = await adminFetch<{ port: number; message: string }>('/admin/expo/port', {
        method: 'PUT',
        body: JSON.stringify({ port: Number(portValue) }),
      });
      setPortMsg(data.message || `Port updated to ${data.port}`);
      await loadAll();
    } catch (e: any) {
      setPortError(e.message);
    } finally {
      setSavingPort(false);
    }
  };

  const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const statusColor = (s: string) => {
    if (s === 'running') return 'bg-green-100 text-green-700';
    if (s === 'errored') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Expo Go</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor and manage the Expo Go development server</p>
        </div>
        <button onClick={loadAll}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
          {loading && <Spinner />}
          Refresh
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          Expo Go server status is unavailable
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Status + Controls row */}
      {status && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Server Status Card */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Server Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor(status.status)}`}>
                  {status.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Port</span>
                <span className="text-sm font-mono text-gray-800">{status.port}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Uptime</span>
                <span className="text-sm font-mono text-gray-800">{formatUptime(status.uptime)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Memory</span>
                <span className="text-sm font-mono text-gray-800">{status.memory_mb.toFixed(1)} MB</span>
              </div>
              {status.pid && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">PID</span>
                  <span className="text-sm font-mono text-gray-800">{status.pid}</span>
                </div>
              )}
            </div>
          </div>

          {/* Restart Card */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Server Control</h3>
            <p className="text-sm text-gray-500 mb-4">Restart the Expo Go development server process.</p>
            <button onClick={handleRestart} disabled={restarting}
              className="px-5 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
              {restarting && <Spinner />}
              Restart Server
            </button>
            {restartMsg && (
              <p className={`text-sm mt-3 ${restartMsg.startsWith('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                {restartMsg}
              </p>
            )}
          </div>

          {/* Port Config Card */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Port Configuration</h3>
            <form onSubmit={handlePortSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Port (1024–65535)</label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={portValue}
                  onChange={e => { setPortValue(e.target.value); setPortError(''); setPortMsg(''); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400"
                />
              </div>
              <button type="submit" disabled={savingPort}
                className="px-5 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {savingPort && <Spinner />}
                Update Port
              </button>
              {portError && <p className="text-sm text-red-600">{portError}</p>}
              {portMsg && <p className="text-sm text-green-600">{portMsg}</p>}
            </form>
          </div>
        </div>
      )}

      {/* Sessions */}
      {sessions && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active Sessions</h3>
          <p className="text-3xl font-bold text-gray-900">{sessions.count}</p>
          <p className="text-sm text-gray-500 mt-1">connected Expo Go clients</p>
        </div>
      )}

      {/* Logs */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Process Logs</h3>
          <span className="text-xs text-gray-400">Last {logs.length} lines</span>
        </div>
        {logs.length > 0 ? (
          <div className="bg-gray-900 p-4 max-h-80 overflow-y-auto font-mono text-xs leading-5">
            {logs.map((line, i) => (
              <div key={i} className="text-gray-300 whitespace-pre-wrap break-all">{line}</div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-gray-400 text-sm">No log lines available</div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
