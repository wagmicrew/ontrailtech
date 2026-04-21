import { useState, useEffect, useRef } from 'react';
import { useSnapshot } from 'valtio';
import { systemStore } from '../../core/system-store';
import { eventBus } from '../../core/event-bus';
import { adminFetch } from '../../core/admin-fetch';

interface KernelProcess {
  id: string;
  app_id: string;
  name: string;
  state: 'running' | 'stopped' | 'error';
  owner: string | null;
  started_at: string;
  permissions: string[];
}

export default function SystemMonitorApp() {
  const snap = useSnapshot(systemStore);
  const [processes, setProcesses] = useState<KernelProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [tab, setTab] = useState<'processes' | 'logs'>('processes');
  const logsRef = useRef<HTMLDivElement>(null);

  const loadProcesses = async () => {
    setLoading(true);
    try {
      const data = await adminFetch('/kernel/processes');
      setProcesses(Array.isArray(data) ? data : []);
    } catch {
      // Kernel may not be available yet; show empty state
      setProcesses([]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    loadProcesses();
    const interval = setInterval(loadProcesses, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsub = eventBus.subscribe('kernel:message', (msg: any) => {
      const ts = new Date().toLocaleTimeString();
      setLogs(l => [`[${ts}] ${msg?.event ?? 'event'}: ${JSON.stringify(msg?.payload ?? null)}`, ...l.slice(0, 199)]);
    });
    const connUnsub = eventBus.subscribe('kernel:connected', () => {
      setLogs(l => [`[${new Date().toLocaleTimeString()}] ✅ Kernel connected`, ...l.slice(0, 199)]);
    });
    return () => { unsub(); connUnsub(); };
  }, []);

  const stopProcess = async (id: string) => {
    try { await adminFetch(`/kernel/process/${id}`, { method: 'DELETE' }); loadProcesses(); }
    catch {}
  };

  const stateColor = (s: string) => {
    if (s === 'running') return 'bg-green-100 text-green-700';
    if (s === 'error') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-500';
  };

  return (
    <div className="p-6 space-y-6 bg-white min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">System Monitor</h2>
          <p className="text-sm text-gray-500 mt-1">Kernel processes and real-time event log</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${snap.kernelConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">{snap.kernelConnected ? 'Kernel online' : 'Kernel offline'}</span>
          </div>
          <div className="flex gap-2">
            {(['processes', 'logs'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t === 'processes' ? '⚙ Processes' : '📋 Event Log'}
              </button>
            ))}
          </div>
          <button onClick={loadProcesses} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors flex items-center gap-1.5">
            {loading && <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
            Refresh
          </button>
        </div>
      </div>

      {tab === 'processes' && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          {processes.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="text-4xl mb-3">{snap.kernelConnected ? '⚙' : '🔌'}</div>
              <p className="text-gray-500 text-sm">{snap.kernelConnected ? 'No kernel processes running' : 'Kernel is not connected — processes unavailable'}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Process', 'App', 'State', 'Owner', 'Started', 'Permissions', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {processes.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stateColor(p.state)}`}>{p.state}</span></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.owner || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{p.started_at ? new Date(p.started_at).toLocaleTimeString() : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(p.permissions || []).slice(0, 3).map(perm => (
                          <span key={perm} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-mono">{perm}</span>
                        ))}
                        {p.permissions?.length > 3 && <span className="text-gray-400 text-xs">+{p.permissions.length - 3}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => stopProcess(p.id)} className="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium transition-colors">Stop</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400/70" />
              <div className="w-3 h-3 rounded-full bg-amber-400/70" />
              <div className="w-3 h-3 rounded-full bg-green-400/70" />
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${snap.kernelConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
              <span className="text-xs text-gray-500">Kernel event stream</span>
              <button onClick={() => setLogs([])} className="text-xs text-gray-600 hover:text-gray-400 ml-2">Clear</button>
            </div>
          </div>
          <div ref={logsRef} className="h-80 overflow-y-auto p-4 font-mono text-xs text-green-400 space-y-0.5">
            {logs.length === 0 ? (
              <div className="text-gray-600">{snap.kernelConnected ? 'Waiting for events…' : 'Connect to kernel to see events'}</div>
            ) : logs.map((line, i) => (
              <div key={i} className="leading-5">{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
