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
  mode: 'tunnel' | 'lan' | 'local' | 'proxy';
  web_url: string;
  deep_link: string;
  cloudflare_status: 'running' | 'stopped' | 'errored' | string;
  cloudflare_url: string | null;
  port_health_status: 'free' | 'bound-by-ontrail' | 'in-use-by-other-process' | 'unknown' | string;
  port_health_message: string;
  port_health_pid: number | null;
}

interface ExpoPortHealth {
  port: number;
  status: 'free' | 'bound-by-ontrail' | 'in-use-by-other-process' | 'unknown' | string;
  message: string;
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
  const [checkingPort, setCheckingPort] = useState(false);
  const [portHealth, setPortHealth] = useState<ExpoPortHealth | null>(null);
  const [modeValue, setModeValue] = useState<ExpoStatus['mode']>('tunnel');
  const [modeError, setModeError] = useState('');
  const [modeMsg, setModeMsg] = useState('');
  const [savingMode, setSavingMode] = useState(false);
  const [controlBusy, setControlBusy] = useState<'start' | 'restart' | 'stop' | 'prewarm' | 'cloudflare-start' | 'cloudflare-stop' | null>(null);
  const [controlMsg, setControlMsg] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const data = await adminFetch<ExpoStatus>('/admin/expo/status');
      setStatus(data);
      setPortValue(String(data.port));
      setModeValue(data.mode);
      setPortHealth({
        port: data.port,
        status: data.port_health_status,
        message: data.port_health_message,
        pid: data.port_health_pid,
      });
      setError('');
    } catch (e: any) {
      setError(e.message || 'Expo Go server status is unavailable');
      setStatus(null);
    }
  }, []);

  const checkPort = useCallback(async (value: string) => {
    const err = validatePort(value);
    if (err) {
      setPortError(err);
      setPortHealth(null);
      return;
    }

    setCheckingPort(true);
    setPortError('');
    try {
      const data = await adminFetch<ExpoPortHealth>(`/admin/expo/port-check?port=${Number(value)}`);
      setPortHealth(data);
    } catch (e: any) {
      setPortError(e.message || 'Unable to check port');
      setPortHealth(null);
    } finally {
      setCheckingPort(false);
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

  const runControlAction = async (action: 'start' | 'restart' | 'stop' | 'prewarm') => {
    setControlBusy(action);
    setControlMsg('');
    try {
      const endpoint = action === 'prewarm' ? '/admin/expo/prewarm' : `/admin/expo/${action}`;
      const data = await adminFetch<{ status: string; message: string }>(endpoint, { method: 'POST' });
      setRestartMsg(action === 'restart' ? (data.message || 'Server restarted successfully') : '');
      setControlMsg(data.message || 'Action completed');
      await loadAll();
    } catch (e: any) {
      const message = `Failed: ${e.message}`;
      setRestartMsg(action === 'restart' ? message : '');
      setControlMsg(message);
    } finally {
      setControlBusy(null);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    await runControlAction('restart');
    setRestarting(false);
  };

  const handleCloudflareAction = async (action: 'start' | 'stop') => {
    const busyKey = `cloudflare-${action}` as const;
    setControlBusy(busyKey);
    setControlMsg('');
    try {
      const data = await adminFetch<{ status: string; message: string; url?: string | null }>(`/admin/expo/cloudflare/${action}`, {
        method: 'POST',
      });
      setControlMsg(data.url ? `${data.message}: ${data.url}` : data.message || 'Cloudflare action completed');
      await loadAll();
    } catch (e: any) {
      setControlMsg(`Failed: ${e.message}`);
    } finally {
      setControlBusy(null);
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

  const handleModeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModeError('');
    setModeMsg('');
    setSavingMode(true);
    try {
      const data = await adminFetch<{ mode: ExpoStatus['mode']; message: string }>('/admin/expo/mode', {
        method: 'PUT',
        body: JSON.stringify({ mode: modeValue }),
      });
      setModeMsg(data.message || `Mode updated to ${data.mode}`);
      await loadAll();
    } catch (e: any) {
      setModeError(e.message);
    } finally {
      setSavingMode(false);
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

  const portHealthTone = (health: ExpoPortHealth | null) => {
    if (!health) return 'bg-gray-50 border-gray-200 text-gray-600';
    if (health.status === 'bound-by-ontrail') return 'bg-green-50 border-green-200 text-green-700';
    if (health.status === 'free') return 'bg-sky-50 border-sky-200 text-sky-700';
    if (health.status === 'in-use-by-other-process') return 'bg-amber-50 border-amber-200 text-amber-700';
    return 'bg-gray-50 border-gray-200 text-gray-600';
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
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Status + Controls row */}
      {status && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
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
              <div className={`rounded-lg border px-3 py-2 text-xs ${portHealthTone(portHealth)}`}>
                <div className="font-medium uppercase tracking-wide">Port Health</div>
                <div className="mt-1 normal-case tracking-normal">{status.port_health_message}</div>
                {status.port_health_pid && (
                  <div className="mt-1 font-mono">PID {status.port_health_pid}</div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Mode</span>
                <span className="text-sm font-mono text-gray-800">{status.mode}</span>
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
            <p className="text-sm text-gray-500 mb-4">Start, stop, restart, or prewarm the Expo Go bundler.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => runControlAction('start')} disabled={controlBusy !== null}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {controlBusy === 'start' && <Spinner />}
                Start
              </button>
              <button onClick={handleRestart} disabled={controlBusy !== null || restarting}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {controlBusy === 'restart' && <Spinner />}
                Restart
              </button>
              <button onClick={() => runControlAction('stop')} disabled={controlBusy !== null}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {controlBusy === 'stop' && <Spinner />}
                Stop
              </button>
              <button onClick={() => runControlAction('prewarm')} disabled={controlBusy !== null}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {controlBusy === 'prewarm' && <Spinner />}
                Prewarm
              </button>
            </div>
            {controlMsg && (
              <p className={`text-sm mt-3 ${controlMsg.startsWith('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                {controlMsg}
              </p>
            )}
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
                  onChange={e => { setPortValue(e.target.value); setPortError(''); setPortMsg(''); setPortHealth(null); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => checkPort(portValue)} disabled={checkingPort || savingPort}
                  className="px-5 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                  {checkingPort && <Spinner />}
                  Check Port
                </button>
                <button type="submit" disabled={savingPort}
                  className="px-5 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                  {savingPort && <Spinner />}
                  Update Port
                </button>
              </div>
              {portHealth && (
                <div className={`rounded-lg border px-3 py-2 text-sm ${portHealthTone(portHealth)}`}>
                  <p>{portHealth.message}</p>
                  {portHealth.pid && <p className="mt-1 font-mono text-xs">PID {portHealth.pid}</p>}
                </div>
              )}
              {portError && <p className="text-sm text-red-600">{portError}</p>}
              {portMsg && <p className="text-sm text-green-600">{portMsg}</p>}
              <p className="text-xs text-gray-400">You can also check a specific local port with <span className="font-mono">npm run port:check --workspace=apps/mobile -- --port 8082</span>.</p>
            </form>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Launch & Mode</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="block text-gray-500">Expo Go deep link</span>
                  <a href={status.web_url} target="_blank" rel="noopener noreferrer" className="font-mono text-green-600 break-all hover:text-green-700">
                    {status.deep_link}
                  </a>
                </div>
                <div>
                  <span className="block text-gray-500">Web proxy</span>
                  <a href={status.web_url} target="_blank" rel="noopener noreferrer" className="font-mono text-gray-800 break-all hover:text-gray-900">
                    {status.web_url}
                  </a>
                </div>
                <div>
                  <span className="block text-gray-500">Cloudflare tunnel</span>
                  <span className="font-mono text-xs text-gray-700 break-all">
                    {status.cloudflare_url || `status: ${status.cloudflare_status}`}
                  </span>
                </div>
              </div>
            </div>
            <form onSubmit={handleModeSubmit} className="space-y-3 border-t border-gray-100 pt-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Connection Mode</label>
                <select
                  value={modeValue}
                  onChange={e => { setModeValue(e.target.value as ExpoStatus['mode']); setModeError(''); setModeMsg(''); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400"
                >
                  <option value="tunnel">Tunnel</option>
                  <option value="lan">LAN</option>
                  <option value="local">Localhost</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Use tunnel for remote Expo Go access, LAN for same-network devices, and localhost for server-local debugging.</p>
              </div>
              <button type="submit" disabled={savingMode}
                className="px-5 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {savingMode && <Spinner />}
                Update Mode
              </button>
              {modeError && <p className="text-sm text-red-600">{modeError}</p>}
              {modeMsg && <p className="text-sm text-green-600">{modeMsg}</p>}
            </form>
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Cloudflare Quick Tunnel</p>
                <p className="text-xs text-gray-400">Start or stop a temporary Cloudflare tunnel for remote Expo debugging.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => handleCloudflareAction('start')} disabled={controlBusy !== null}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                  {controlBusy === 'cloudflare-start' && <Spinner />}
                  Start Cloudflare Tunnel
                </button>
                <button type="button" onClick={() => handleCloudflareAction('stop')} disabled={controlBusy !== null}
                  className="px-4 py-2 bg-slate-500 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                  {controlBusy === 'cloudflare-stop' && <Spinner />}
                  Stop Cloudflare Tunnel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sessions */}
      {sessions && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active Sessions</h3>
          <p className="text-3xl font-bold text-gray-900">{sessions.count}</p>
          <p className="text-sm text-gray-500 mt-1">connected Expo Go clients</p>
          {sessions.sessions.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4">State</th>
                    <th className="py-2 pr-4">Local</th>
                    <th className="py-2">Peer</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.sessions.map((session, index) => (
                    <tr key={`${session.peer}-${index}`} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2 pr-4 font-mono text-xs text-gray-700">{session.state}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-gray-500">{session.local}</td>
                      <td className="py-2 font-mono text-xs text-gray-500">{session.peer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
