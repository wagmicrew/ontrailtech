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

export default function LensPage() {
  const [config, setConfig] = useState<LensConfig>({
    lens_api_url: 'https://api.testnet.lens.xyz',
    lens_graphql_url: 'https://api.testnet.lens.xyz/graphql',
    lens_rpc_url: 'https://rpc.testnet.lens.xyz',
    lens_chain_id: 371112,
    auth_access: 'custom',
    mode: 'simulate',
    gho_onramp_enabled: false,
    lens_token_onramp_enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/lens/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (response.ok) {
        alert('Lens configuration saved successfully');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const runTests = async () => {
    setTestRunning(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/admin/lens/tests/run', {
        method: 'POST',
      });
      const data = await response.json();
      setTestResult(data);
    } catch (error) {
      console.error('Failed to run tests:', error);
      setTestResult({
        success: false,
        error: 'Failed to run tests',
        summary: 'Test execution failed',
      });
    } finally {
      setTestRunning(false);
    }
  };

  const testConnection = async () => {
    try {
      const response = await fetch('/api/admin/lens/tests/connection', {
        method: 'POST',
      });
      const data = await response.json();
      setConnectionTest(data);
    } catch (error) {
      console.error('Failed to test connection:', error);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Social-Fi Setup</h1>
        <p className="text-muted-foreground">
          Configure Lens Protocol integration for social interactions and testing
        </p>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('config')}
          className={`px-4 py-2 ${activeTab === 'config' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          Configuration
        </button>
        <button
          onClick={() => setActiveTab('tests')}
          className={`px-4 py-2 ${activeTab === 'tests' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          Tests
        </button>
        <button
          onClick={() => setActiveTab('sync')}
          className={`px-4 py-2 ${activeTab === 'sync' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          Sync Objects
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={`px-4 py-2 ${activeTab === 'info' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          Information
        </button>
      </div>

      {activeTab === 'config' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Lens Protocol Configuration</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Mode</label>
              <select
                className="w-full px-3 py-2 border rounded"
                value={config.mode}
                onChange={(e) => setConfig({ ...config, mode: e.target.value })}
              >
                <option value="simulate">Simulate</option>
                <option value="live">Live</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Simulate mode for testing, Live mode for production
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Chain ID</label>
              <input
                type="number"
                className="w-full px-3 py-2 border rounded"
                value={config.lens_chain_id}
                onChange={(e) => setConfig({ ...config, lens_chain_id: parseInt(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                371111 for Lens Chain mainnet, 371112 for testnet
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">RPC URL</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded"
                value={config.lens_rpc_url}
                onChange={(e) => setConfig({ ...config, lens_rpc_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">API URL</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded"
                value={config.lens_api_url}
                onChange={(e) => setConfig({ ...config, lens_api_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">GraphQL URL</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded"
                value={config.lens_graphql_url}
                onChange={(e) => setConfig({ ...config, lens_graphql_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <input
                type="password"
                className="w-full px-3 py-2 border rounded"
                value={config.lens_api_key || ''}
                onChange={(e) => setConfig({ ...config, lens_api_key: e.target.value || null })}
                placeholder="Enter Lens API key"
              />
              <p className="text-xs text-muted-foreground">
                Required for App Verification
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Auth Endpoint URL</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded"
                value={config.auth_endpoint_url || ''}
                onChange={(e) => setConfig({ ...config, auth_endpoint_url: e.target.value || null })}
                placeholder="https://your-domain.com/auth"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Auth Secret</label>
              <input
                type="password"
                className="w-full px-3 py-2 border rounded"
                value={config.auth_secret || ''}
                onChange={(e) => setConfig({ ...config, auth_secret: e.target.value || null })}
                placeholder="Enter auth secret"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Auth Access</label>
              <select
                className="w-full px-3 py-2 border rounded"
                value={config.auth_access}
                onChange={(e) => setConfig({ ...config, auth_access: e.target.value })}
              >
                <option value="custom">Custom</option>
                <option value="public">Public</option>
                <option value="restricted">Restricted</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Custom required for App Verification
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Lens Wallet Address</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded"
                value={config.lens_wallet_address || ''}
                onChange={(e) => setConfig({ ...config, lens_wallet_address: e.target.value || null })}
                placeholder="0x..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Lens Explorer URL</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded"
                value={config.lens_explorer_url || ''}
                onChange={(e) => setConfig({ ...config, lens_explorer_url: e.target.value || null })}
                placeholder="https://explorer.lens.xyz"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-4">Contract Addresses (Live Mode)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">FriendPass Contract</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded"
                  value={config.friendpass_contract_address || ''}
                  onChange={(e) => setConfig({ ...config, friendpass_contract_address: e.target.value || null })}
                  placeholder="0x..."
                  disabled={config.mode === 'simulate'}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Profile Wallet Contract</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded"
                  value={config.profile_wallet_contract_address || ''}
                  onChange={(e) => setConfig({ ...config, profile_wallet_contract_address: e.target.value || null })}
                  placeholder="0x..."
                  disabled={config.mode === 'simulate'}
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-4">Onramp Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Enable GHO Onramp</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.gho_onramp_enabled}
                    onChange={(e) => setConfig({ ...config, gho_onramp_enabled: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Enabled</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">GHO Amount</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full px-3 py-2 border rounded"
                  value={config.gho_onramp_amount || ''}
                  onChange={(e) => setConfig({ ...config, gho_onramp_amount: e.target.value })}
                  placeholder="0.1"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Enable Lens Token Onramp</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.lens_token_onramp_enabled}
                    onChange={(e) => setConfig({ ...config, lens_token_onramp_enabled: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Enabled</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Lens Token Amount</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full px-3 py-2 border rounded"
                  value={config.lens_token_onramp_amount || ''}
                  onChange={(e) => setConfig({ ...config, lens_token_onramp_amount: e.target.value })}
                  placeholder="0.1"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      )}

      {activeTab === 'tests' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Lens Integration Tests</h2>
          
          <div className="flex gap-2">
            <button
              onClick={testConnection}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Test Connection
            </button>
            <button
              onClick={runTests}
              disabled={testRunning}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {testRunning ? 'Running Tests...' : 'Run All Tests'}
            </button>
          </div>

          {connectionTest && (
            <div className="space-y-2">
              <h3 className="font-semibold">Connection Status</h3>
              <div className="space-y-2">
                <div className={`p-3 rounded ${connectionTest.lens_connection.success ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="font-medium">Lens Connection</div>
                  <div className="text-sm">{connectionTest.lens_connection.message}</div>
                  {connectionTest.lens_connection.chain_id && (
                    <div className="text-xs text-muted-foreground">Chain ID: {connectionTest.lens_connection.chain_id}</div>
                  )}
                </div>
                <div className={`p-3 rounded ${connectionTest.grove_connection.success ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="font-medium">Grove Storage</div>
                  <div className="text-sm">{connectionTest.grove_connection.message}</div>
                </div>
                <div className={`p-3 rounded ${connectionTest.lens_testnet.success ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="font-medium">Lens Testnet</div>
                  <div className="text-sm">{connectionTest.lens_testnet.message}</div>
                </div>
              </div>
            </div>
          )}

          {testResult && (
            <div className="space-y-2">
              <h3 className="font-semibold">Test Results</h3>
              <div className={`p-3 rounded ${testResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="font-medium">{testResult.summary}</div>
                {testResult.exit_code !== undefined && (
                  <div className="text-sm">Exit Code: {testResult.exit_code}</div>
                )}
              </div>
              {testResult.stdout && (
                <div className="mt-2">
                  <h4 className="font-medium text-sm">Output:</h4>
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-64">
                    {testResult.stdout}
                  </pre>
                </div>
              )}
              {testResult.stderr && (
                <div className="mt-2">
                  <h4 className="font-medium text-sm text-red-600">Errors:</h4>
                  <pre className="text-xs bg-red-50 p-2 rounded overflow-auto max-h-64">
                    {testResult.stderr}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'sync' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Social-Fi Object Sync</h2>
          
          {syncStatus && (
            <div className="p-4 bg-gray-50 rounded space-y-4">
              <h3 className="font-semibold">Sync Status Dashboard</h3>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 border rounded">
                  <div className="text-sm font-medium">POIs</div>
                  <div className="text-2xl font-bold">{syncStatus.summary.synced_pois} / {syncStatus.summary.total_pois}</div>
                  <div className="text-xs text-muted-foreground">{syncStatus.sync_percentage.pois}% synced</div>
                </div>
                <div className="p-3 border rounded">
                  <div className="text-sm font-medium">Routes</div>
                  <div className="text-2xl font-bold">{syncStatus.summary.synced_routes} / {syncStatus.summary.total_routes}</div>
                  <div className="text-xs text-muted-foreground">{syncStatus.sync_percentage.routes}% synced</div>
                </div>
                <div className="p-3 border rounded">
                  <div className="text-sm font-medium">Users</div>
                  <div className="text-2xl font-bold">{syncStatus.summary.synced_users} / {syncStatus.summary.total_users}</div>
                  <div className="text-xs text-muted-foreground">{syncStatus.sync_percentage.users}% synced</div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium">Sync Enabled:</span>
                <span className={syncStatus.sync_enabled ? 'text-green-600' : 'text-red-600'}>
                  {syncStatus.sync_enabled ? 'Yes' : 'No'}
                </span>
                {syncStatus.last_sync && (
                  <span className="text-muted-foreground">
                    Last Sync: {new Date(syncStatus.last_sync).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border rounded space-y-2">
              <h3 className="font-semibold">POIs → Lens Publications</h3>
              <p className="text-sm text-muted-foreground">
                Sync POI locations as Lens posts with metadata
              </p>
              <div className="text-xs text-muted-foreground">
                <div>Endpoint: POST /api/admin/lens/sync/poi/{'{poi_id}'}</div>
                <div>Batch: POST /api/admin/lens/sync/pois/batch</div>
              </div>
            </div>

            <div className="p-4 border rounded space-y-2">
              <h3 className="font-semibold">Routes → Lens Collections</h3>
              <p className="text-sm text-muted-foreground">
                Sync routes as Lens collections/groups
              </p>
              <div className="text-xs text-muted-foreground">
                <div>Endpoint: POST /api/admin/lens/sync/route/{'{route_id}'}</div>
                <div>Batch: POST /api/admin/lens/sync/routes/batch</div>
              </div>
            </div>

            <div className="p-4 border rounded space-y-2">
              <h3 className="font-semibold">Messages → Lens Comments</h3>
              <p className="text-sm text-muted-foreground">
                Sync messages as Lens comments/replies
              </p>
              <div className="text-xs text-muted-foreground">
                Available via lens_sync service
              </div>
            </div>

            <div className="p-4 border rounded space-y-2">
              <h3 className="font-semibold">FriendPass → Lens Collects</h3>
              <p className="text-sm text-muted-foreground">
                Sync FriendPass purchases as Lens social actions
              </p>
              <div className="text-xs text-muted-foreground">
                Endpoint: POST /api/admin/lens/sync/friendpass
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 rounded space-y-2">
            <h3 className="font-semibold">Sync Status</h3>
            <p className="text-sm">
              Use the API endpoints above to trigger sync operations. Sync status and results are returned in the response.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'info' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Lens Protocol Information</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded space-y-2">
              <h3 className="font-semibold">Lens Protocol</h3>
              <p className="text-sm">
                Lens is a decentralized social protocol built for SocialFi. It provides modular social primitives
                including Accounts, Usernames, Graphs, Groups, and Feeds.
              </p>
              <a
                href="https://lens.xyz/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                View Documentation →
              </a>
            </div>

            <div className="p-4 bg-gray-50 rounded space-y-2">
              <h3 className="font-semibold">Grove Storage</h3>
              <p className="text-sm">
                Grove is a secure, flexible, onchain-controlled storage layer for Web3 apps. It provides
                decentralized storage with the speed of centralized solutions.
              </p>
              <a
                href="https://lens.xyz/docs/storage"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                View Documentation →
              </a>
            </div>

            <div className="p-4 bg-gray-50 rounded space-y-2">
              <h3 className="font-semibold">Lens Chain</h3>
              <p className="text-sm">
                Lens Chain is a high-performance blockchain stack built for SocialFi, combining modular
                Social Primitives, fast settlement, and decentralized storage.
              </p>
              <a
                href="https://lens.xyz/docs/chain/overview"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                View Documentation →
              </a>
            </div>

            <div className="p-4 bg-gray-50 rounded space-y-2">
              <h3 className="font-semibold">Features</h3>
              <ul className="space-y-1 text-sm">
                <li>✓ Profile creation and management</li>
                <li>✓ Follow/unfollow functionality</li>
                <li>✓ Post creation with metadata</li>
                <li>✓ Feed retrieval</li>
                <li>✓ Grove storage integration</li>
                <li>✓ Profile wallet support</li>
                <li>✓ POI and route sync</li>
                <li>✓ FriendPass social actions</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
