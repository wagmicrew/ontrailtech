import React, { useState, useEffect } from 'react';

interface LensConfig {
  id?: string;
  lens_api_key?: string | null;
  lens_api_url: string;
  lens_graphql_url: string;
  lens_rpc_url: string;
  lens_chain_id: number;
  auth_endpoint_url?: string | null;
  auth_secret?: string | null;
  auth_access: string;
  lens_wallet_address?: string | null;
  lens_explorer_url?: string | null;
  mode: string;
  friendpass_contract_address?: string | null;
  profile_wallet_contract_address?: string | null;
  gho_onramp_enabled: boolean;
  gho_onramp_amount?: string | null;
  lens_token_onramp_enabled: boolean;
  lens_token_onramp_amount?: string | null;
}

interface TestResult {
  success: boolean;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  summary?: string;
  error?: string;
}

interface ConnectionTest {
  lens_connection: { success: boolean; message: string; chain_id?: number; api_url?: string };
  grove_connection: { success: boolean; message: string; api_url?: string };
  lens_testnet: { success: boolean; message: string; chain_id?: number };
}

interface SyncStatus {
  summary: {
    total_pois: number;
    synced_pois: number;
    unsynced_pois: number;
    total_routes: number;
    synced_routes: number;
    unsynced_routes: number;
    total_users: number;
    synced_users: number;
    unsynced_users: number;
  };
  sync_percentage: {
    pois: number;
    routes: number;
    users: number;
  };
  last_sync: string | null;
  sync_enabled: boolean;
}

const NETWORK_PRESETS: Record<string, { label: string; chain_id: number; api_url: string; graphql_url: string; rpc_url: string; explorer_url: string }> = {
  testnet: {
    label: 'Testnet (chain 371112)',
    chain_id: 371112,
    api_url: 'https://api.testnet.lens.xyz',
    graphql_url: 'https://api.testnet.lens.xyz/graphql',
    rpc_url: 'https://rpc.testnet.lens.xyz',
    explorer_url: 'https://block-explorer.testnet.lens.xyz',
  },
  mainnet: {
    label: 'Mainnet (chain 232)',
    chain_id: 232,
    api_url: 'https://api.lens.xyz',
    graphql_url: 'https://api.lens.xyz/graphql',
    rpc_url: 'https://rpc.lens.xyz',
    explorer_url: 'https://explorer.lens.xyz',
  },
};

function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-400 mt-1">{children}</p>;
}

function SourceBadge({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
    >
      ↗ {label}
    </a>
  );
}

function Field({ label, hint, source, children }: { label: string; hint?: string; source?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <Hint>{hint}</Hint>}
      {source && <SourceBadge href={source.href} label={source.label} />}
    </div>
  );
}

export default function LensPage() {
  const [config, setConfig] = useState<LensConfig>({
    lens_api_url: NETWORK_PRESETS.testnet.api_url,
    lens_graphql_url: NETWORK_PRESETS.testnet.graphql_url,
    lens_rpc_url: NETWORK_PRESETS.testnet.rpc_url,
    lens_chain_id: NETWORK_PRESETS.testnet.chain_id,
    lens_explorer_url: NETWORK_PRESETS.testnet.explorer_url,
    auth_access: 'custom',
    auth_endpoint_url: 'https://api.ontrail.tech/api/lens/auth',
    mode: 'simulate',
    gho_onramp_enabled: false,
    lens_token_onramp_enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [connectionTest, setConnectionTest] = useState<ConnectionTest | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [activeTab, setActiveTab] = useState('config');

  useEffect(() => {
    fetchConfig();
    fetchTestStatus();
    fetchSyncStatus();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/admin/lens/config');
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('Failed to fetch Lens config:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTestStatus = async () => {
    try {
      const response = await fetch('/api/admin/lens/tests/status');
      const data = await response.json();
      console.log('Test status:', data);
    } catch (error) {
      console.error('Failed to fetch test status:', error);
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const response = await fetch('/api/admin/lens/sync/status');
      const data = await response.json();
      setSyncStatus(data);
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
    }
  };

  const applyNetworkPreset = (key: string) => {
    const preset = NETWORK_PRESETS[key];
    if (!preset) return;
    setConfig((c) => ({
      ...c,
      lens_chain_id: preset.chain_id,
      lens_api_url: preset.api_url,
      lens_graphql_url: preset.graphql_url,
      lens_rpc_url: preset.rpc_url,
      lens_explorer_url: preset.explorer_url,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const response = await fetch('/api/admin/lens/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (response.ok) {
        setSaveMsg({ ok: true, text: 'Configuration saved successfully.' });
      } else {
        setSaveMsg({ ok: false, text: 'Server returned an error. Check API logs.' });
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      setSaveMsg({ ok: false, text: 'Network error — could not save configuration.' });
    } finally {
      setSaving(false);
    }
  };

  const runTests = async () => {
    setTestRunning(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/admin/lens/tests/run', { method: 'POST' });
      const data = await response.json();
      setTestResult(data);
    } catch (error) {
      console.error('Failed to run tests:', error);
      setTestResult({ success: false, error: 'Failed to run tests', summary: 'Test execution failed' });
    } finally {
      setTestRunning(false);
    }
  };

  const testConnection = async () => {
    try {
      const response = await fetch('/api/admin/lens/tests/connection', { method: 'POST' });
      const data = await response.json();
      setConnectionTest(data);
    } catch (error) {
      console.error('Failed to test connection:', error);
    }
  };

  const generateSecret = () => {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
    setConfig((c) => ({ ...c, auth_secret: hex }));
  };

  const currentNetwork = Object.entries(NETWORK_PRESETS).find(
    ([, p]) => p.chain_id === config.lens_chain_id
  )?.[0] ?? 'custom';

  if (loading) {
    return <div className="p-6 text-gray-500">Loading...</div>;
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const disabledInputCls = `${inputCls} bg-gray-100 text-gray-400 cursor-not-allowed`;
  const selectCls = `${inputCls} appearance-none`;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Social-Fi Setup</h1>
        <p className="text-sm text-gray-500 mt-1">Configure Lens Protocol integration for social interactions and testing</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[{ key: 'config', label: 'Configuration' }, { key: 'tests', label: 'Tests' }, { key: 'sync', label: 'Sync Objects' }, { key: 'info', label: 'Information' }].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── CONFIG TAB ── */}
      {activeTab === 'config' && (
        <div className="space-y-6">

          {/* Network Preset */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-800">Network Preset</p>
                <p className="text-xs text-blue-600">Selecting a preset auto-fills all network URLs and Chain ID below.</p>
              </div>
              <select
                className="px-3 py-2 border border-blue-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={currentNetwork}
                onChange={(e) => applyNetworkPreset(e.target.value)}
              >
                <option value="testnet">Testnet (chain 371112)</option>
                <option value="mainnet">Mainnet (chain 232)</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs text-blue-700">
              <div><span className="font-medium">Chain ID:</span> {config.lens_chain_id}</div>
              <div><span className="font-medium">API:</span> {config.lens_api_url.replace('https://', '')}</div>
              <div><span className="font-medium">RPC:</span> {config.lens_rpc_url.replace('https://', '')}</div>
              <div><span className="font-medium">Explorer:</span> {(config.lens_explorer_url ?? '—').replace('https://', '')}</div>
            </div>
          </div>

          {/* Mode + Operation */}
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Operation Mode</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Mode"
                hint="Simulate: no real transactions. Live: production mode using real contracts."
              >
                <select
                  className={selectCls}
                  value={config.mode}
                  onChange={(e) => setConfig({ ...config, mode: e.target.value })}
                >
                  <option value="simulate">Simulate — safe testing, no real txns</option>
                  <option value="live">Live — production (requires contracts)</option>
                </select>
              </Field>

              <Field
                label="Auth Access"
                hint="Custom: requires your own Auth Endpoint. Public: open access. Restricted: allowlist only."
                source={{ href: 'https://docs.lens.xyz/docs/authentication', label: 'Lens Auth docs' }}
              >
                <select
                  className={selectCls}
                  value={config.auth_access}
                  onChange={(e) => setConfig({ ...config, auth_access: e.target.value })}
                >
                  <option value="public">Public — no auth required</option>
                  <option value="custom">Custom — your own auth endpoint (App Verification)</option>
                  <option value="restricted">Restricted — allowlist only</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Network URLs (read-only summary + editable override) */}
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Network Endpoints</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Chain ID" hint="232 = Mainnet · 371112 = Testnet">
                <input
                  type="number"
                  className={inputCls}
                  value={config.lens_chain_id}
                  onChange={(e) => setConfig({ ...config, lens_chain_id: parseInt(e.target.value) })}
                />
              </Field>

              <Field
                label="RPC URL"
                source={{ href: 'https://docs.lens.xyz/docs/network', label: 'Lens network docs' }}
              >
                <input
                  type="text"
                  className={inputCls}
                  value={config.lens_rpc_url}
                  onChange={(e) => setConfig({ ...config, lens_rpc_url: e.target.value })}
                />
              </Field>

              <Field label="API URL">
                <input
                  type="text"
                  className={inputCls}
                  value={config.lens_api_url}
                  onChange={(e) => setConfig({ ...config, lens_api_url: e.target.value })}
                />
              </Field>

              <Field label="GraphQL URL">
                <input
                  type="text"
                  className={inputCls}
                  value={config.lens_graphql_url}
                  onChange={(e) => setConfig({ ...config, lens_graphql_url: e.target.value })}
                />
              </Field>

              <Field label="Lens Explorer URL">
                <input
                  type="text"
                  className={inputCls}
                  value={config.lens_explorer_url || ''}
                  onChange={(e) => setConfig({ ...config, lens_explorer_url: e.target.value || null })}
                  placeholder="https://explorer.lens.xyz"
                />
              </Field>
            </div>
          </section>

          {/* App Credentials */}
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-1">App Credentials</h2>
            <p className="text-xs text-gray-500 mb-3">
              Register your app at <a href="https://developer.lens.xyz" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">developer.lens.xyz</a> to get your API Key and Auth details.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="API Key"
                hint="Required for App Verification. Found in your Lens Developer dashboard."
                source={{ href: 'https://developer.lens.xyz', label: 'Get API key' }}
              >
                <input
                  type="password"
                  className={inputCls}
                  value={config.lens_api_key || ''}
                  onChange={(e) => setConfig({ ...config, lens_api_key: e.target.value || null })}
                  placeholder="lens_api_…"
                />
              </Field>

              <Field
                label="Auth Secret"
                hint="Shared secret between your backend and Lens. Click Generate to create one automatically."
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    className={inputCls}
                    value={config.auth_secret || ''}
                    onChange={(e) => setConfig({ ...config, auth_secret: e.target.value || null })}
                    placeholder="Random secret — keep private"
                  />
                  <button
                    type="button"
                    onClick={generateSecret}
                    className="px-3 py-2 text-xs font-medium bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 whitespace-nowrap"
                  >
                    Generate
                  </button>
                </div>
              </Field>

              <Field
                label="Auth Endpoint URL"
                hint="Only required when Auth Access = Custom. Must be publicly reachable by Lens servers."
              >
                <input
                  type="text"
                  className={config.auth_access === 'custom' ? inputCls : disabledInputCls}
                  value={config.auth_endpoint_url || ''}
                  onChange={(e) => setConfig({ ...config, auth_endpoint_url: e.target.value || null })}
                  placeholder="https://api.ontrail.tech/api/lens/auth"
                  disabled={config.auth_access !== 'custom'}
                />
              </Field>

              <Field
                label="Lens Wallet Address"
                hint="The wallet used by your backend to sign Lens transactions. Export the 0x address from your wallet app."
                source={{ href: 'https://docs.lens.xyz/docs/wallets', label: 'Wallet docs' }}
              >
                <input
                  type="text"
                  className={inputCls}
                  value={config.lens_wallet_address || ''}
                  onChange={(e) => setConfig({ ...config, lens_wallet_address: e.target.value || null })}
                  placeholder="0x…"
                />
              </Field>
            </div>
          </section>

          {/* Contract Addresses */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold text-gray-800">Contract Addresses</h2>
              {config.mode === 'simulate' && (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">Simulate mode — contracts not used, but you can still save addresses</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Run <code className="bg-gray-100 px-1 rounded">npx hardhat run contracts/scripts/deploy.js --network lens</code> and paste the printed addresses below.
              Or look them up on the{' '}
              <a href={config.lens_chain_id === 232 ? 'https://explorer.lens.xyz' : 'https://block-explorer.testnet.lens.xyz'} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Lens Explorer</a>.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="FriendPass Contract"
                hint="Output label: FriendShares from deploy.js"
                source={{ href: config.lens_chain_id === 232 ? 'https://explorer.lens.xyz' : 'https://block-explorer.testnet.lens.xyz', label: 'Find on Explorer' }}
              >
                <input
                  type="text"
                  className={inputCls}
                  value={config.friendpass_contract_address || ''}
                  onChange={(e) => setConfig({ ...config, friendpass_contract_address: e.target.value || null })}
                  placeholder="0x…"
                />
              </Field>

              <Field
                label="Profile Wallet Contract"
                hint="Output label: Treasury or POINFT from deploy.js"
                source={{ href: config.lens_chain_id === 232 ? 'https://explorer.lens.xyz' : 'https://block-explorer.testnet.lens.xyz', label: 'Find on Explorer' }}
              >
                <input
                  type="text"
                  className={inputCls}
                  value={config.profile_wallet_contract_address || ''}
                  onChange={(e) => setConfig({ ...config, profile_wallet_contract_address: e.target.value || null })}
                  placeholder="0x…"
                />
              </Field>
            </div>

            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <p className="text-xs font-medium text-gray-600 mb-1">All contracts deployed by <code className="bg-gray-100 px-1 rounded">contracts/scripts/deploy.js</code></p>
              <div className="grid grid-cols-3 gap-x-6 gap-y-0.5 text-xs text-gray-500">
                {['Treasury', 'POINFT', 'RouteNFT', 'BondingCurve', 'FriendShares', 'TGEFactory'].map((name) => (
                  <span key={name} className="font-mono">{name}</span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Use the FriendShares address for FriendPass Contract above.</p>
            </div>
          </section>

          {/* Onramp */}
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Onramp Configuration</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">GHO Onramp</p>
                    <p className="text-xs text-gray-400">Fund new users with GHO stablecoin on Lens</p>
                  </div>
                  <Toggle
                    id="gho-toggle"
                    checked={config.gho_onramp_enabled}
                    onChange={(v) => setConfig({ ...config, gho_onramp_enabled: v })}
                  />
                </div>
                {config.gho_onramp_enabled && (
                  <Field label="Default GHO Amount" hint="Amount of GHO to send per new user">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={inputCls}
                      value={config.gho_onramp_amount || ''}
                      onChange={(e) => setConfig({ ...config, gho_onramp_amount: e.target.value })}
                      placeholder="0.10"
                    />
                  </Field>
                )}
              </div>

              <div className="p-4 border border-gray-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Lens Token Onramp</p>
                    <p className="text-xs text-gray-400">Fund new users with LENS tokens on Lens Chain</p>
                  </div>
                  <Toggle
                    id="lens-token-toggle"
                    checked={config.lens_token_onramp_enabled}
                    onChange={(v) => setConfig({ ...config, lens_token_onramp_enabled: v })}
                  />
                </div>
                {config.lens_token_onramp_enabled && (
                  <Field label="Default LENS Amount" hint="Amount of LENS tokens to send per new user">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={inputCls}
                      value={config.lens_token_onramp_amount || ''}
                      onChange={(e) => setConfig({ ...config, lens_token_onramp_amount: e.target.value })}
                      placeholder="0.10"
                    />
                  </Field>
                )}
              </div>
            </div>
          </section>

          {saveMsg && (
            <div className={`px-4 py-2 rounded text-sm ${saveMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {saveMsg.text}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      )}

      {/* ── TESTS TAB ── */}
      {activeTab === 'tests' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Lens Integration Tests</h2>
          
          <div className="flex gap-2">
            <button
              onClick={testConnection}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
            >
              Test Connection
            </button>
            <button
              onClick={runTests}
              disabled={testRunning}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {testRunning ? 'Running Tests…' : 'Run All Tests'}
            </button>
          </div>

          {connectionTest && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Connection Status</h3>
              <div className="space-y-2">
                {[
                  { key: 'lens_connection', label: 'Lens Connection' },
                  { key: 'grove_connection', label: 'Grove Storage' },
                  { key: 'lens_testnet', label: 'Lens Testnet' },
                ].map(({ key, label }) => {
                  const entry = connectionTest[key as keyof ConnectionTest];
                  return (
                    <div key={key} className={`p-3 rounded border text-sm ${entry.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="font-medium">{label}</div>
                      <div className="text-gray-600">{entry.message}</div>
                      {(entry as any).chain_id && <div className="text-xs text-gray-400">Chain ID: {(entry as any).chain_id}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {testResult && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Test Results</h3>
              <div className={`p-3 rounded border text-sm ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="font-medium">{testResult.summary}</div>
                {testResult.exit_code !== undefined && <div>Exit Code: {testResult.exit_code}</div>}
              </div>
              {testResult.stdout && (
                <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64">{testResult.stdout}</pre>
              )}
              {testResult.stderr && (
                <pre className="text-xs bg-red-50 p-3 rounded overflow-auto max-h-64 text-red-700">{testResult.stderr}</pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SYNC TAB ── */}
      {activeTab === 'sync' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Social-Fi Object Sync</h2>
          
          {syncStatus && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
              <h3 className="font-semibold text-sm">Sync Status Dashboard</h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'POIs', synced: syncStatus.summary.synced_pois, total: syncStatus.summary.total_pois, pct: syncStatus.sync_percentage.pois },
                  { label: 'Routes', synced: syncStatus.summary.synced_routes, total: syncStatus.summary.total_routes, pct: syncStatus.sync_percentage.routes },
                  { label: 'Users', synced: syncStatus.summary.synced_users, total: syncStatus.summary.total_users, pct: syncStatus.sync_percentage.users },
                ].map(({ label, synced, total, pct }) => (
                  <div key={label} className="p-3 border rounded bg-white">
                    <div className="text-xs font-medium text-gray-500">{label}</div>
                    <div className="text-2xl font-bold">{synced} <span className="text-base text-gray-400">/ {total}</span></div>
                    <div className="text-xs text-gray-400">{pct}% synced</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium">Sync Enabled:</span>
                <span className={syncStatus.sync_enabled ? 'text-green-600' : 'text-red-600'}>
                  {syncStatus.sync_enabled ? 'Yes' : 'No'}
                </span>
                {syncStatus.last_sync && (
                  <span className="text-gray-400">Last Sync: {new Date(syncStatus.last_sync).toLocaleString()}</span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {[
              { title: 'POIs → Lens Publications', desc: 'Sync POI locations as Lens posts with metadata', endpoints: ['POST /api/admin/lens/sync/poi/{poi_id}', 'POST /api/admin/lens/sync/pois/batch'] },
              { title: 'Routes → Lens Collections', desc: 'Sync routes as Lens collections/groups', endpoints: ['POST /api/admin/lens/sync/route/{route_id}', 'POST /api/admin/lens/sync/routes/batch'] },
              { title: 'Messages → Lens Comments', desc: 'Sync messages as Lens comments/replies', endpoints: ['Available via lens_sync service'] },
              { title: 'FriendPass → Lens Collects', desc: 'Sync FriendPass purchases as Lens social actions', endpoints: ['POST /api/admin/lens/sync/friendpass'] },
            ].map(({ title, desc, endpoints }) => (
              <div key={title} className="p-4 border rounded space-y-2">
                <h3 className="font-semibold text-sm">{title}</h3>
                <p className="text-xs text-gray-500">{desc}</p>
                <div className="space-y-0.5">
                  {endpoints.map((ep) => (
                    <code key={ep} className="block text-xs bg-gray-100 px-2 py-0.5 rounded">{ep}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── INFO TAB ── */}
      {activeTab === 'info' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Lens Protocol Information</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: 'Lens Protocol', body: 'Decentralized social protocol for SocialFi — Accounts, Usernames, Graphs, Groups, Feeds.', href: 'https://docs.lens.xyz', linkLabel: 'Documentation' },
              { title: 'Grove Storage', body: 'Onchain-controlled decentralized storage layer for metadata and media.', href: 'https://docs.lens.xyz/docs/storage', linkLabel: 'Storage docs' },
              { title: 'Lens Chain', body: 'High-performance blockchain for SocialFi — fast settlement + modular Social Primitives.', href: 'https://docs.lens.xyz/docs/chain/overview', linkLabel: 'Chain docs' },
              { title: 'Developer Portal', body: 'Register your app, generate API keys, and manage App Verification credentials.', href: 'https://developer.lens.xyz', linkLabel: 'developer.lens.xyz' },
            ].map(({ title, body, href, linkLabel }) => (
              <div key={title} className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                <h3 className="font-semibold text-sm">{title}</h3>
                <p className="text-sm text-gray-600">{body}</p>
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                  {linkLabel} →
                </a>
              </div>
            ))}
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-sm text-blue-800 mb-2">Where to find each value</h3>
            <table className="w-full text-xs text-gray-700">
              <thead><tr className="text-left text-gray-500"><th className="pb-1">Field</th><th className="pb-1">Where to get it</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                <tr><td className="py-1 font-medium pr-4">API Key</td><td><a href="https://developer.lens.xyz" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">developer.lens.xyz</a> → Your App → API Keys</td></tr>
                <tr><td className="py-1 font-medium pr-4">Auth Secret</td><td>Generate any cryptographically random string (e.g. <code className="bg-gray-100 px-1 rounded">openssl rand -hex 32</code>)</td></tr>
                <tr><td className="py-1 font-medium pr-4">Auth Endpoint URL</td><td>Your own backend URL — e.g. <code className="bg-gray-100 px-1 rounded">https://api.ontrail.tech/api/lens/auth</code></td></tr>
                <tr><td className="py-1 font-medium pr-4">Lens Wallet Address</td><td>The 0x address of the wallet your backend uses to sign transactions</td></tr>
                <tr><td className="py-1 font-medium pr-4">Contract Addresses</td><td>Output of <code className="bg-gray-100 px-1 rounded">hardhat run scripts/deploy.js</code> or from <a href="https://block-explorer.testnet.lens.xyz" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Lens Explorer</a></td></tr>
                <tr><td className="py-1 font-medium pr-4">Chain ID / URLs</td><td>Use the Network Preset selector in the Configuration tab — fills all values automatically</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
