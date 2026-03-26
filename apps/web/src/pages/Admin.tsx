import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';

async function adminRequest(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('ontrail_token');
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export default function Admin() {
  const { isConnected } = useAuth();
  const [tab, setTab] = useState<'config' | 'simulate' | 'logs'>('config');
  const [configKey, setConfigKey] = useState('');
  const [configValue, setConfigValue] = useState('');
  const [simName, setSimName] = useState('');
  const [simParams, setSimParams] = useState({ base_price: 0.001, k: 0.0001, investor_count: 100, avg_investment: 1, tge_threshold: 10 });
  const [simResult, setSimResult] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  if (!isConnected) return <p className="text-gray-500 py-10 text-center">Connect wallet with admin role to access.</p>;

  const updateConfig = async () => {
    try {
      let val: any = configValue;
      try { val = JSON.parse(configValue); } catch {}
      await adminRequest('/admin/config', { method: 'POST', body: JSON.stringify({ config_key: configKey, config_value: val }) });
      setMessage(`Config "${configKey}" updated.`);
    } catch (err: any) { setMessage(err.message); }
  };

  const runSim = async () => {
    try {
      const result = await adminRequest('/admin/simulate', {
        method: 'POST', body: JSON.stringify({ simulation_name: simName, ...simParams }),
      });
      setSimResult(result);
    } catch (err: any) { setMessage(err.message); }
  };

  const loadLogs = async () => {
    try {
      const data = await adminRequest('/admin/audit-logs?limit=50');
      setLogs(data);
    } catch (err: any) { setMessage(err.message); }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Admin Dashboard</h2>
      <div className="flex gap-2 mb-6">
        {(['config', 'simulate', 'logs'] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); if (t === 'logs') loadLogs(); }}
            className={`px-4 py-2 rounded text-sm font-medium ${tab === t ? 'bg-ontrail-500 text-white' : 'bg-gray-200 text-gray-700'}`}>
            {t === 'config' ? 'Configuration' : t === 'simulate' ? 'Token Simulation' : 'Audit Logs'}
          </button>
        ))}
      </div>
      {message && <p className="text-sm text-ontrail-700 mb-4">{message}</p>}

      {tab === 'config' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-3">Update Configuration</h3>
          <div className="space-y-3">
            <select value={configKey} onChange={(e) => setConfigKey(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
              <option value="">Select parameter...</option>
              <option value="reputation_weights">Reputation Weights</option>
              <option value="bonding_curve_base">Bonding Curve Base Price</option>
              <option value="bonding_curve_k">Bonding Curve K Factor</option>
              <option value="tge_threshold">TGE Threshold</option>
              <option value="grid_max_pois">Grid Max POIs</option>
            </select>
            <textarea value={configValue} onChange={(e) => setConfigValue(e.target.value)}
              placeholder='Value (JSON or string)' rows={3} className="w-full border rounded px-3 py-2 text-sm font-mono" />
            <button onClick={updateConfig} disabled={!configKey}
              className="bg-ontrail-500 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50">Save</button>
          </div>
        </div>
      )}

      {tab === 'simulate' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-3">Token Economy Simulation</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <input type="text" value={simName} onChange={(e) => setSimName(e.target.value)}
              placeholder="Simulation name" className="col-span-2 border rounded px-3 py-2 text-sm" />
            {Object.entries(simParams).map(([k, v]) => (
              <div key={k}>
                <label className="text-xs text-gray-500">{k}</label>
                <input type="number" value={v} step="any"
                  onChange={(e) => setSimParams({ ...simParams, [k]: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2 text-sm" />
              </div>
            ))}
          </div>
          <button onClick={runSim} disabled={!simName}
            className="bg-ontrail-500 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50">Run Simulation</button>
          {simResult && (
            <div className="mt-4 bg-gray-50 rounded p-4 text-sm font-mono">
              <p>Final Supply: {simResult.final_supply}</p>
              <p>Pool Size: {simResult.pool_size?.toFixed(4)} ETH</p>
              <p>Final Price: {simResult.final_price?.toFixed(6)} ETH</p>
              <p>TGE Reached: {simResult.tge_reached ? '✅ Yes' : '❌ No'}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-3">Audit Logs</h3>
          {logs.length === 0 ? <p className="text-gray-400 text-sm">No logs found.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b">
                  <th className="py-2">Time</th><th>Action</th><th>User</th><th>Details</th>
                </tr></thead>
                <tbody>
                  {logs.map((log: any) => (
                    <tr key={log.id} className="border-b">
                      <td className="py-2 text-xs font-mono">{log.created_at?.slice(0, 19)}</td>
                      <td>{log.action}</td>
                      <td className="text-xs font-mono">{log.user_id?.slice(0, 8)}...</td>
                      <td className="text-xs">{JSON.stringify(log.metadata)?.slice(0, 60)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
