import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import UsersPage from './admin/UsersPage';
import DatabasePage from './admin/DatabasePage';
import Web3Page from './admin/Web3Page';
import FitnessPage from './admin/FitnessPage';
import ExpoGoPage from './admin/ExpoGoPage';
import TrailLabPage from './admin/TrailLabPage';
import AppsPage from './admin/AppsPage';

type AdminSection = 'users' | 'database' | 'web3' | 'fitness' | 'expo' | 'trail-lab' | 'config' | 'logs' | 'apps';

interface NavItem {
  id: AdminSection;
  label: string;
  icon: React.ReactNode;
}

const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
  </svg>
);
const DatabaseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
  </svg>
);
const Web3Icon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
  </svg>
);
const FitnessIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>
);
const ExpoIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
  </svg>
);
const ConfigIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const LogsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const AppsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
  </svg>
);

const TrailLabIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
  </svg>
);

const NAV: NavItem[] = [
  { id: 'users', label: 'Users', icon: <UserIcon /> },
  { id: 'database', label: 'Database', icon: <DatabaseIcon /> },
  { id: 'web3', label: 'Web3', icon: <Web3Icon /> },
  { id: 'fitness', label: 'Fitness', icon: <FitnessIcon /> },
  { id: 'expo', label: 'Expo Go', icon: <ExpoIcon /> },
  { id: 'trail-lab', label: 'Trail Lab', icon: <TrailLabIcon /> },
  { id: 'apps', label: 'App Installer', icon: <AppsIcon /> },
  { id: 'config', label: 'Configuration', icon: <ConfigIcon /> },
  { id: 'logs', label: 'Audit Logs', icon: <LogsIcon /> },
];

export default function Admin() {
  const { isConnected, isAdmin, username, email } = useAuth();
  const [section, setSection] = useState<AdminSection>('users');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Sign in required</h2>
          <p className="text-sm text-gray-500">Please sign in to access the admin panel.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Access Denied</h2>
          <p className="text-sm text-gray-500">Admin privileges required.</p>
        </div>
      </div>
    );
  }

  const activeItem = NAV.find(n => n.id === section);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 overflow-hidden -mx-6 -mb-6">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} flex-shrink-0 bg-white border-r border-gray-100 flex flex-col transition-all duration-200 ease-in-out`}>
        <div className="h-14 flex items-center justify-between px-3 border-b border-gray-100">
          {sidebarOpen && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-800 truncate">Admin Panel</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(o => !o)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors ml-auto flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              {sidebarOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />}
            </svg>
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map(item => (
            <button key={item.id} onClick={() => setSection(item.id)}
              title={!sidebarOpen ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm transition-all ${section === item.id ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              <span className={`flex-shrink-0 ${section === item.id ? 'text-green-600' : ''}`}>{item.icon}</span>
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        {sidebarOpen && (
          <div className="p-3 border-t border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {(username || email || 'A')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{username || email || 'Admin'}</p>
                <p className="text-[10px] text-gray-400">Administrator</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-100 flex items-center px-5 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>Admin</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-gray-700 font-medium">{activeItem?.label}</span>
          </div>
          <div className="ml-auto">
            <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">Admin</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {section === 'users' && <UsersPage />}
          {section === 'database' && <DatabasePage />}
          {section === 'web3' && <Web3Page />}
          {section === 'fitness' && <FitnessPage />}
          {section === 'expo' && <ExpoGoPage />}
          {section === 'trail-lab' && <TrailLabPage />}
          {section === 'apps' && <AppsPage />}
          {section === 'config' && <ConfigSection />}
          {section === 'logs' && <LogsSection />}
        </main>
      </div>
    </div>
  );
}

/* ── Config Section ── */
const GOOGLE_SETTING_FIELDS = [
  { key: 'google_client_id', label: 'Shared Google client ID', placeholder: 'Base fallback client ID', sensitive: false },
  { key: 'google_web_client_id', label: 'Web client ID', placeholder: 'Used by Google Identity Services on the website', sensitive: false },
  { key: 'google_expo_client_id', label: 'Expo client ID', placeholder: 'Used by Expo AuthSession / Expo Go', sensitive: false },
  { key: 'google_ios_client_id', label: 'iOS client ID', placeholder: 'Used by the native iOS app flow', sensitive: false },
  { key: 'google_android_client_id', label: 'Android client ID', placeholder: 'Used by the native Android app flow', sensitive: false },
  { key: 'google_client_secret', label: 'Google client secret', placeholder: 'Keep this private; server-side only', sensitive: true },
];

function ConfigSection() {
  const [configKey, setConfigKey] = useState('');
  const [configValue, setConfigValue] = useState('');
  const [message, setMessage] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [siteSettings, setSiteSettings] = useState<Record<string, string>>({});
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    let active = true;

    setLoadingSettings(true);
    api.getAllSettings()
      .then((rows) => {
        if (!active) return;
        const nextSettings = Object.fromEntries(rows.map((row) => [row.key, row.value || '']));
        setSiteSettings(nextSettings);
      })
      .catch((err) => {
        if (!active) return;
        setSettingsMessage(`✗ ${err.message || 'Could not load site settings'}`);
      })
      .finally(() => {
        if (active) setLoadingSettings(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const updateConfig = async () => {
    try {
      const token = localStorage.getItem('ontrail_token');
      const API = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';
      let val: any = configValue;
      try { val = JSON.parse(configValue); } catch {}
      const res = await fetch(`${API}/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ config_key: configKey, config_value: val }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
      setMessage(`✓ Config "${configKey}" updated`);
    } catch (e: any) { setMessage(`✗ ${e.message}`); }
  };

  const updateGoogleSettings = async () => {
    setSavingSettings(true);
    setSettingsMessage('');
    try {
      await Promise.all(
        GOOGLE_SETTING_FIELDS.map((field) => api.updateSetting(field.key, siteSettings[field.key] || '')),
      );
      setSettingsMessage('✓ Google OAuth site settings updated');
    } catch (e: any) {
      setSettingsMessage(`✗ ${e.message || 'Failed to update Google OAuth settings'}`);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Configuration</h2>
        <p className="text-sm text-gray-500 mt-1">Update runtime configuration parameters</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Google OAuth Site Settings</h3>
            <p className="text-sm text-gray-500 mt-1">These values drive Google login for the web app, Expo app, and the backend audience allowlist.</p>
          </div>
          <button
            onClick={updateGoogleSettings}
            disabled={loadingSettings || savingSettings}
            className="px-5 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {savingSettings ? 'Saving…' : 'Save Google settings'}
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {GOOGLE_SETTING_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{field.label}</label>
              <input
                type={field.sensitive ? 'password' : 'text'}
                value={siteSettings[field.key] || ''}
                onChange={(e) => setSiteSettings((current) => ({ ...current, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                disabled={loadingSettings}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 disabled:bg-gray-50"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          Public client IDs are exposed through public settings for the login screens. The client secret stays admin-only and is not returned by the public settings endpoint.
        </div>

        {settingsMessage && <p className={`mt-4 text-sm ${settingsMessage.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{settingsMessage}</p>}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Parameter</label>
            <select value={configKey} onChange={e => setConfigKey(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400">
              <option value="">Select parameter…</option>
              {['reputation_weights', 'bonding_curve_base', 'bonding_curve_k', 'tge_threshold', 'grid_max_pois'].map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Value (JSON or string)</label>
            <textarea value={configValue} onChange={e => setConfigValue(e.target.value)}
              rows={4} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400" />
          </div>
          <button onClick={updateConfig} disabled={!configKey}
            className="px-5 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            Save
          </button>
          {message && <p className={`text-sm ${message.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{message}</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Logs Section ── */
function LogsSection() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLogs = async () => {
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('ontrail_token');
      const API = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';
      const res = await fetch(`${API}/admin/audit-logs?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
      setLogs(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useState(() => { loadLogs(); });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Audit Logs</h2>
          <p className="text-sm text-gray-500 mt-1">Recent admin actions and system events</p>
        </div>
        <button onClick={loadLogs}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
          {loading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
          Refresh
        </button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {logs.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No logs found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {['Time', 'User', 'Action', 'Resource', 'Details'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.user_id?.slice(0, 8)}…</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium">{log.action}</span></td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{log.resource_type}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono max-w-xs truncate">{JSON.stringify(log.metadata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
