import { useState, useEffect } from 'react';
import { adminFetch, API_BASE } from '../../core/admin-fetch';

interface FitnessProvider {
  id: string; name: string; icon: string; color: string; docUrl: string;
  fields: { key: string; label: string; sensitive?: boolean; hint?: string }[];
}

const PROVIDERS: FitnessProvider[] = [
  {
    id: 'strava', name: 'Strava', icon: '🚴', color: 'orange', docUrl: 'https://developers.strava.com/',
    fields: [
      { key: 'client_id', label: 'Client ID', hint: 'From Strava API settings' },
      { key: 'client_secret', label: 'Client Secret', sensitive: true },
      { key: 'webhook_verify_token', label: 'Webhook Verify Token', sensitive: true },
    ],
  },
  {
    id: 'samsung_health', name: 'Samsung Health', icon: '💙', color: 'blue', docUrl: 'https://developer.samsung.com/health',
    fields: [
      { key: 'app_id', label: 'App ID' },
      { key: 'app_secret', label: 'App Secret', sensitive: true },
    ],
  },
  {
    id: 'apple_health', name: 'Apple Health / HealthKit', icon: '🍎', color: 'red', docUrl: 'https://developer.apple.com/health-fitness/',
    fields: [
      { key: 'team_id', label: 'Apple Team ID' },
      { key: 'bundle_id', label: 'Bundle ID', hint: 'e.g. tech.ontrail.app' },
      { key: 'key_id', label: 'Key ID (AuthKey)', sensitive: true },
      { key: 'private_key', label: 'Private Key (.p8 content)', sensitive: true },
    ],
  },
  {
    id: 'ontrail', name: 'OnTrail App (Own)', icon: '🏃', color: 'green', docUrl: '',
    fields: [
      { key: 'webhook_secret', label: 'Webhook Secret', sensitive: true },
      { key: 'api_key', label: 'Internal API Key', sensitive: true },
      { key: 'steps_per_reputation', label: 'Steps per Reputation Point', hint: 'e.g. 1000 steps = 1 rep point' },
    ],
  },
];

const COLOR_MAP: Record<string, { bg: string; border: string; badge: string; ring: string }> = {
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', ring: 'focus:ring-orange-400/30 focus:border-orange-400' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',     ring: 'focus:ring-blue-400/30 focus:border-blue-400' },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700',       ring: 'focus:ring-red-400/30 focus:border-red-400' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-100 text-green-700',   ring: 'focus:ring-green-400/30 focus:border-green-400' },
};

export default function FitnessApp() {
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [stepsStats, setStepsStats] = useState<any | null>(null);

  useEffect(() => {
    adminFetch('/admin/fitness/config').then(data => { setConfigs(data.configs || {}); setEnabled(data.enabled || {}); }).catch(() => {});
    adminFetch('/admin/fitness/stats').then(setStepsStats).catch(() => {});
  }, []);

  const setField = (pId: string, key: string, value: string) =>
    setConfigs(c => ({ ...c, [pId]: { ...(c[pId] || {}), [key]: value } }));

  const saveProvider = async (pId: string) => {
    setErrors(e => ({ ...e, [pId]: '' }));
    try {
      await adminFetch(`/admin/fitness/config/${pId}`, { method: 'PUT', body: JSON.stringify({ config: configs[pId] || {}, enabled: enabled[pId] ?? false }) });
      setSaved(s => ({ ...s, [pId]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [pId]: false })), 3000);
    } catch (e: any) { setErrors(er => ({ ...er, [pId]: e.message })); }
  };

  return (
    <div className="p-6 space-y-6 bg-white min-h-full">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Fitness Integrations</h2>
        <p className="text-sm text-gray-500 mt-1">Connect fitness apps — steps and activities earn reputation points</p>
      </div>

      {stepsStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Synced users', value: stepsStats.synced_users ?? '—' },
            { label: 'Steps today', value: stepsStats.steps_today?.toLocaleString() ?? '—' },
            { label: 'Rep points today', value: stepsStats.rep_today?.toFixed(0) ?? '—' },
            { label: 'Active connections', value: stepsStats.active_connections ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {PROVIDERS.map(provider => {
          const c = COLOR_MAP[provider.color];
          const cfg = configs[provider.id] || {};
          const isEnabled = enabled[provider.id] ?? false;
          return (
            <div key={provider.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${isEnabled ? c.border : 'border-gray-100'}`}>
              <div className={`px-5 py-4 flex items-center justify-between ${isEnabled ? c.bg : 'bg-gray-50'} border-b ${isEnabled ? c.border : 'border-gray-100'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{provider.icon}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{provider.name}</h3>
                    {provider.docUrl && <a href={provider.docUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-600">View docs ↗</a>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isEnabled ? c.badge : 'bg-gray-100 text-gray-500'}`}>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                  <button onClick={() => setEnabled(e => ({ ...e, [provider.id]: !isEnabled }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled ? 'bg-green-500' : 'bg-gray-200'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
              <div className="px-5 py-4 space-y-3">
                {provider.fields.map(field => {
                  const secretKey = `${provider.id}.${field.key}`;
                  return (
                    <div key={field.key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        {field.label}
                        {field.hint && <span className="ml-1.5 text-gray-400 font-normal">— {field.hint}</span>}
                      </label>
                      <div className="relative">
                        <input
                          type={field.sensitive && !showSecret[secretKey] ? 'password' : 'text'}
                          value={cfg[field.key] || ''}
                          onChange={e => setField(provider.id, field.key, e.target.value)}
                          placeholder={field.sensitive ? '••••••••' : undefined}
                          className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${field.sensitive ? 'pr-10' : ''} focus:outline-none focus:ring-2 ${c.ring}`}
                        />
                        {field.sensitive && (
                          <button type="button" onClick={() => setShowSecret(s => ({ ...s, [secretKey]: !s[secretKey] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              {showSecret[secretKey]
                                ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>
                              }
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="mt-2 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Webhook / Callback URL</p>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <code className="text-xs text-gray-600 font-mono flex-1 truncate">{API_BASE}/fitness/webhook/{provider.id}</code>
                    <button onClick={() => navigator.clipboard.writeText(`${API_BASE}/fitness/webhook/${provider.id}`)} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Copy">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button onClick={() => saveProvider(provider.id)} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors">Save</button>
                  {saved[provider.id] && <span className="text-sm text-green-600">✓ Saved</span>}
                  {errors[provider.id] && <span className="text-sm text-red-600">{errors[provider.id]}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
        <h3 className="font-semibold text-green-800 text-sm mb-2">📊 Steps → Reputation Pipeline</h3>
        <p className="text-sm text-green-700 leading-relaxed">
          When a connected fitness provider syncs step data, the engine converts steps to reputation points using the
          configured <strong>steps_per_reputation</strong> ratio. Each sync event creates a
          <code className="mx-1 text-xs bg-green-100 px-1 rounded">reputation_event</code> and the user's score updates in real-time.
        </p>
      </div>
    </div>
  );
}
