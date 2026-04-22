import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { adminFetch } from '../../core/admin-fetch';
import { useTheme } from '../../core/theme-store';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'api-keys' | 'nft' | 'chains' | 'contracts' | 'access' | 'wallet' | 'connectkit' | 'runnercoin' | 'mint' | 'tokens' | 'jwt';

interface SidebarTab { id: TabId; label: string; icon: React.ReactNode }

interface AlchemyConfig {
  api_key: string;
  network: string;
  webhook_signing_key: string;
}

interface NftToken {
  tokenId: string;
  title: string;
  description?: string;
  image?: string;
  contract: { address: string };
  tokenType: string;
}

interface AlchemyChain {
  id: string;
  name: string;
  network: string;
  rpc: string;
  explorer: string;
  currency: string;
  alchemy_supported: boolean;
  enabled: boolean;
}

interface ContractAbi {
  id: string;
  name: string;
  address: string;
  chain: string;
  abi: string;
  bytecode: string;
  created_at: string;
}

interface PrebuiltContract {
  name: string;
  artifact_path: string;
  artifact_exists: boolean;
}

interface DeployEstimate {
  contract_name: string;
  chain: string;
  gas_estimate: number;
  gas_price_wei: number;
  max_cost_wei: number;
  max_cost_eth: string;
}

interface PrebuiltTemplate {
  name: string;
  chain: string;
  abi: string;
  bytecode: string;
  constructor_args: unknown[];
  wallet_address: string;
}

interface NftAccessRule {
  id: string;
  name: string;
  chain: string;
  contract_address: string;
  token_id?: string;
  min_balance: number;
  granted_roles: string[];
  active: boolean;
}

interface SiteWallet {
  address: string;
  has_private_key: boolean;
  created_at: string;
}

interface ConnectKitConfig {
  walletconnect_project_id: string;
  alchemy_id: string;
  infura_id: string;
  app_name: string;
  app_description: string;
  app_url: string;
  app_icon: string;
}

interface RunnerCoinConfig {
  token_name: string;
  token_symbol: string;
  total_supply: string;
  bonding_curve_k: string;
  base_price: string;
  tge_threshold: string;
  contract_address: string;
  treasury_address: string;
  launch_chain: string;
  bonding_curve_locked: boolean;
  lp_tx_hash: string;
  lp_address: string;
}

interface PortfolioToken {
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  contract_address: string;
  network: string;
  logo?: string;
  price_usd?: number | null;
  value_usd?: number | null;
}

interface TokenPrice {
  symbol: string;
  price: string;
  currency: string;
  updatedAt?: string;
}

interface LaunchGuide {
  chain: string;
  dex: string;
  steps: string[];
  smithii_url: string | null;
  uniswap_url: string;
  cost_estimate: string;
}

interface JwtConfig {
  has_private_key: boolean;
  public_key: string;
  key_id: string;
  enabled: boolean;
}

interface TrailLabPoi {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  rarity: string;
}

interface TrailLabRoute {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  distance_km: number;
  elevation_m: number;
}

// ─── Sidebar tabs ─────────────────────────────────────────────────────────────

const TABS: SidebarTab[] = [
  {
    id: 'api-keys', label: 'API Keys',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    id: 'nft', label: 'NFT',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    id: 'chains', label: 'Chains',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
  },
  {
    id: 'contracts', label: 'Contracts',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    id: 'access', label: 'NFT Access',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    id: 'wallet', label: 'Site Wallet',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3m18-3V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3m18 0H3" />
      </svg>
    ),
  },
  {
    id: 'connectkit', label: 'ConnectKit',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    id: 'runnercoin', label: 'Runner Coin',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'mint', label: 'Mint',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    id: 'tokens', label: 'Tokens',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'jwt', label: 'JWT Auth',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
      </svg>
    ),
  },
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ active, onChange, t }: {
  active: TabId;
  onChange: (id: TabId) => void;
  t: ReturnType<typeof useTheme>;
}) {
  const btnRefs = useRef<Map<TabId, HTMLButtonElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ top: 0, height: 0 });

  useEffect(() => {
    const btn = btnRefs.current.get(active);
    const ctr = containerRef.current;
    if (!btn || !ctr) return;
    const bRect = btn.getBoundingClientRect();
    const cRect = ctr.getBoundingClientRect();
    setPill({ top: bRect.top - cRect.top, height: bRect.height });
  }, [active]);

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-0.5 py-3 px-2 border-r ${t.border} flex-shrink-0 w-40`}>
      <div className={`px-3 py-2 mb-1`}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Alchemy</span>
      </div>
      <motion.div
        className="absolute left-2 right-2 rounded-lg bg-violet-500/15 z-0"
        animate={{ y: pill.top, height: Math.max(0, pill.height - 4) }}
        initial={false}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        style={{ top: 2 }}
      />
      {TABS.map(tab => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={el => { if (el) btnRefs.current.set(tab.id, el); else btnRefs.current.delete(tab.id); }}
            onClick={() => onChange(tab.id)}
            className={`relative z-10 flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors w-full text-left ${isActive ? 'text-violet-400' : `${t.textMuted} hover:${t.text}`}`}
          >
            <span className={`flex-shrink-0 ${isActive ? 'text-violet-400' : ''}`}>{tab.icon}</span>
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/70">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  const t = useTheme();
  return (
    <div>
      <label className={`block text-xs font-medium ${t.text} mb-1`}>{label}</label>
      {hint && <p className={`text-[10px] ${t.textMuted} mb-1`}>{hint}</p>}
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string;
}) {
  const t = useTheme();
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2 rounded-lg text-xs border ${t.border} ${t.bgCard} ${t.text} placeholder:${t.textMuted} focus:outline-none focus:ring-1 focus:ring-violet-500/50 ${className}`}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 4 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  const t = useTheme();
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`w-full px-3 py-2 rounded-lg text-xs border ${t.border} ${t.bgCard} ${t.text} placeholder:${t.textMuted} focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono resize-none`}
    />
  );
}

function SaveBtn({ onClick, saving, saved, label = 'Save' }: {
  onClick: () => void; saving: boolean; saved: boolean; label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${saved ? 'bg-green-500 text-white' : 'bg-violet-500 hover:bg-violet-600 text-white'} disabled:opacity-50`}
    >
      {saving ? 'Saving…' : saved ? '✓ Saved' : label}
    </button>
  );
}

function useSave<T>(saveFn: (data: T) => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(data: T) {
    setSaving(true); setError(null);
    try {
      await saveFn(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }
  return { save, saving, saved, error };
}

// ─── Tab: API Keys ────────────────────────────────────────────────────────────

function ApiKeysTab({ t }: { t: ReturnType<typeof useTheme> }) {
  const [config, setConfig] = useState<AlchemyConfig>({ api_key: '', network: 'eth-mainnet', webhook_signing_key: '' });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const { save, saving, saved, error } = useSave(async (data: AlchemyConfig) => {
    await adminFetch('/admin/alchemy/config', { method: 'POST', body: JSON.stringify(data) });
  });

  useEffect(() => {
    adminFetch<AlchemyConfig>('/admin/alchemy/config').then(d => setConfig(d)).catch(() => {});
  }, []);

  async function testConnection() {
    setTesting(true); setTestResult(null);
    try {
      const r = await adminFetch<{ status: string; block: number }>('/admin/alchemy/test');
      setTestResult(`✓ Connected — latest block #${r.block}`);
    } catch (e: unknown) {
      setTestResult(`✗ ${e instanceof Error ? e.message : 'Connection failed'}`);
    } finally {
      setTesting(false);
    }
  }

  const NETWORKS = [
    { value: 'eth-mainnet', label: 'Ethereum Mainnet' },
    { value: 'eth-sepolia', label: 'Ethereum Sepolia' },
    { value: 'base-mainnet', label: 'Base Mainnet' },
    { value: 'base-sepolia', label: 'Base Sepolia' },
    { value: 'polygon-mainnet', label: 'Polygon Mainnet' },
    { value: 'polygon-amoy', label: 'Polygon Amoy' },
    { value: 'opt-mainnet', label: 'Optimism Mainnet' },
    { value: 'arb-mainnet', label: 'Arbitrum One' },
    { value: 'solana-mainnet', label: 'Solana Mainnet' },
    { value: 'solana-devnet', label: 'Solana Devnet' },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className={`text-lg font-semibold ${t.heading}`}>Alchemy API Keys</h2>
        <p className={`text-xs mt-1 ${t.textMuted}`}>Keys are encrypted at rest using AES-256. Never exposed in client responses.</p>
      </div>

      <Section title="Alchemy App Key">
        <Field label="API Key" hint="Your Alchemy app API key from dashboard.alchemy.com">
          <div className="flex gap-2">
            <Input
              value={config.api_key}
              onChange={v => setConfig(p => ({ ...p, api_key: v }))}
              placeholder="alchemy_XXXXXXXXXXXX"
              type={showKey ? 'text' : 'password'}
              className="flex-1"
            />
            <button
              onClick={() => setShowKey(p => !p)}
              className={`px-3 rounded-lg border ${t.border} ${t.textMuted} text-xs hover:${t.text}`}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>

        <Field label="Default Network">
          <select
            value={config.network}
            onChange={e => setConfig(p => ({ ...p, network: e.target.value }))}
            className={`w-full px-3 py-2 rounded-lg text-xs border ${t.border} ${t.bgCard} ${t.text} focus:outline-none focus:ring-1 focus:ring-violet-500/50`}
          >
            {NETWORKS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
        </Field>

        <Field label="Webhook Signing Key" hint="Used to verify Alchemy webhook payloads">
          <Input
            value={config.webhook_signing_key}
            onChange={v => setConfig(p => ({ ...p, webhook_signing_key: v }))}
            placeholder="whsec_XXXXXXXXXXXX"
            type="password"
          />
        </Field>
      </Section>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-3 items-center">
        <SaveBtn onClick={() => save(config)} saving={saving} saved={saved} />
        <button
          onClick={testConnection}
          disabled={testing || !config.api_key}
          className={`px-4 py-2 rounded-lg text-xs font-medium border ${t.border} ${t.textMuted} hover:border-violet-400 hover:text-violet-400 disabled:opacity-40 transition-colors`}
        >
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
      </div>

      {testResult && (
        <div className={`px-3 py-2 rounded-lg text-xs font-mono ${testResult.startsWith('✓') ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {testResult}
        </div>
      )}

      <Section title="Alchemy Notify (Webhooks)">
        <div className={`p-3 rounded-xl border ${t.border} ${t.bgCard} space-y-2`}>
          <p className={`text-xs ${t.text} font-medium`}>Webhook Endpoint</p>
          <code className={`text-[11px] font-mono ${t.textMuted} break-all`}>
            {`${import.meta.env.VITE_API_URL || 'https://api.ontrail.tech'}/admin/alchemy/webhook`}
          </code>
          <p className={`text-[10px] ${t.textMuted}`}>Register this URL in your Alchemy Notify dashboard for NFT/address activity webhooks.</p>
        </div>
      </Section>
    </div>
  );
}

// ─── Tab: NFT ─────────────────────────────────────────────────────────────────

function NftTab({ t }: { t: ReturnType<typeof useTheme> }) {
  const [chain, setChain] = useState('base-mainnet');
  const [walletOrContract, setWalletOrContract] = useState('');
  const [mode, setMode] = useState<'wallet' | 'contract'>('wallet');
  const [loading, setLoading] = useState(false);
  const [nfts, setNfts] = useState<NftToken[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pageKey, setPageKey] = useState<string | undefined>(undefined);

  const CHAINS = [
    { value: 'eth-mainnet', label: 'Ethereum' },
    { value: 'base-mainnet', label: 'Base' },
    { value: 'base-sepolia', label: 'Base Sepolia' },
    { value: 'polygon-mainnet', label: 'Polygon' },
    { value: 'opt-mainnet', label: 'Optimism' },
    { value: 'arb-mainnet', label: 'Arbitrum' },
  ];

  async function fetchNfts(reset = true) {
    if (!walletOrContract) return;
    setLoading(true); setError(null);
    if (reset) { setNfts([]); setPageKey(undefined); }
    try {
      const endpoint = mode === 'wallet'
        ? `/admin/alchemy/nft/wallet?chain=${chain}&address=${walletOrContract}${pageKey && !reset ? `&page_key=${pageKey}` : ''}`
        : `/admin/alchemy/nft/contract?chain=${chain}&contract=${walletOrContract}`;
      const r = await adminFetch<{ nfts: NftToken[]; page_key?: string }>(endpoint);
      setNfts(prev => reset ? r.nfts : [...prev, ...r.nfts]);
      setPageKey(r.page_key);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h2 className={`text-lg font-semibold ${t.heading}`}>NFT Explorer</h2>
        <p className={`text-xs mt-1 ${t.textMuted}`}>Query NFTs by wallet address or contract using Alchemy NFT API v3</p>
      </div>

      <div className="flex gap-2">
        {(['wallet', 'contract'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${mode === m ? 'bg-violet-500 text-white border-violet-500' : `${t.bgCard} ${t.border} ${t.textMuted}`}`}>
            {m === 'wallet' ? 'By Wallet' : 'By Contract'}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <select
          value={chain}
          onChange={e => setChain(e.target.value)}
          className={`px-3 py-2 rounded-lg text-xs border ${t.border} ${t.bgCard} ${t.text} focus:outline-none focus:ring-1 focus:ring-violet-500/50 flex-shrink-0`}
        >
          {CHAINS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <Input
          value={walletOrContract}
          onChange={setWalletOrContract}
          placeholder={mode === 'wallet' ? '0x… wallet address' : '0x… contract address'}
          className="flex-1"
        />
        <button
          onClick={() => fetchNfts()}
          disabled={loading || !walletOrContract}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors flex-shrink-0"
        >
          {loading ? 'Loading…' : 'Fetch'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {nfts.length > 0 && (
        <div className="space-y-3">
          <p className={`text-xs ${t.textMuted}`}>{nfts.length} NFTs found</p>
          <div className="grid grid-cols-2 gap-3">
            {nfts.map((nft, i) => (
              <div key={`${nft.contract.address}-${nft.tokenId}-${i}`}
                className={`rounded-xl border ${t.border} ${t.bgCard} overflow-hidden`}>
                {nft.image ? (
                  <img src={nft.image} alt={nft.title} className="w-full h-32 object-cover" />
                ) : (
                  <div className="w-full h-32 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center">
                    <span className="text-3xl">🖼</span>
                  </div>
                )}
                <div className="p-2.5">
                  <p className={`text-xs font-semibold truncate ${t.text}`}>{nft.title || `#${nft.tokenId}`}</p>
                  <p className={`text-[10px] ${t.textMuted} truncate font-mono`}>{nft.contract.address.slice(0, 12)}…</p>
                  <span className={`text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400`}>{nft.tokenType}</span>
                </div>
              </div>
            ))}
          </div>
          {pageKey && (
            <button
              onClick={() => fetchNfts(false)}
              disabled={loading}
              className={`w-full py-2 rounded-lg text-xs border ${t.border} ${t.textMuted} hover:border-violet-400 hover:text-violet-400 disabled:opacity-40 transition-colors`}
            >
              {loading ? 'Loading…' : 'Load More'}
            </button>
          )}
        </div>
      )}

      {!loading && nfts.length === 0 && walletOrContract && (
        <p className={`text-xs text-center py-8 ${t.textMuted}`}>No NFTs found for this address.</p>
      )}
    </div>
  );
}

// ─── Tab: Chains ──────────────────────────────────────────────────────────────

const DEFAULT_CHAINS: AlchemyChain[] = [
  { id: 'eth-mainnet', name: 'Ethereum', network: 'mainnet', rpc: 'https://eth-mainnet.g.alchemy.com/v2/', explorer: 'https://etherscan.io', currency: 'ETH', alchemy_supported: true, enabled: true },
  { id: 'base-mainnet', name: 'Base', network: 'mainnet', rpc: 'https://base-mainnet.g.alchemy.com/v2/', explorer: 'https://basescan.org', currency: 'ETH', alchemy_supported: true, enabled: true },
  { id: 'base-sepolia', name: 'Base Sepolia', network: 'testnet', rpc: 'https://base-sepolia.g.alchemy.com/v2/', explorer: 'https://sepolia.basescan.org', currency: 'ETH', alchemy_supported: true, enabled: false },
  { id: 'polygon-mainnet', name: 'Polygon', network: 'mainnet', rpc: 'https://polygon-mainnet.g.alchemy.com/v2/', explorer: 'https://polygonscan.com', currency: 'MATIC', alchemy_supported: true, enabled: false },
  { id: 'opt-mainnet', name: 'Optimism', network: 'mainnet', rpc: 'https://opt-mainnet.g.alchemy.com/v2/', explorer: 'https://optimistic.etherscan.io', currency: 'ETH', alchemy_supported: true, enabled: false },
  { id: 'arb-mainnet', name: 'Arbitrum One', network: 'mainnet', rpc: 'https://arb-mainnet.g.alchemy.com/v2/', explorer: 'https://arbiscan.io', currency: 'ETH', alchemy_supported: true, enabled: false },
  { id: 'solana-mainnet', name: 'Solana', network: 'mainnet', rpc: 'https://solana-mainnet.g.alchemy.com/v2/', explorer: 'https://explorer.solana.com', currency: 'SOL', alchemy_supported: true, enabled: true },
  { id: 'solana-devnet', name: 'Solana Devnet', network: 'testnet', rpc: 'https://solana-devnet.g.alchemy.com/v2/', explorer: 'https://explorer.solana.com/?cluster=devnet', currency: 'SOL', alchemy_supported: true, enabled: false },
];

function ChainsTab({ t }: { t: ReturnType<typeof useTheme> }) {
  const [chains, setChains] = useState<AlchemyChain[]>(DEFAULT_CHAINS);
  const { save, saving, saved, error } = useSave(async (data: AlchemyChain[]) => {
    await adminFetch('/admin/alchemy/chains', { method: 'POST', body: JSON.stringify(data) });
  });

  useEffect(() => {
    adminFetch<AlchemyChain[]>('/admin/alchemy/chains').then(d => setChains(d)).catch(() => {});
  }, []);

  function toggle(id: string) {
    setChains(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  }

  const networkColor: Record<string, string> = { mainnet: 'text-green-400 bg-green-400/10', testnet: 'text-yellow-400 bg-yellow-400/10' };

  return (
    <div className="space-y-5 p-6">
      <div>
        <h2 className={`text-lg font-semibold ${t.heading}`}>Chain Configuration</h2>
        <p className={`text-xs mt-1 ${t.textMuted}`}>Enable chains for NFT access control and token operations</p>
      </div>

      <div className="space-y-2">
        {chains.map(chain => (
          <div key={chain.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${t.border} ${t.bgCard}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-xs font-semibold ${t.text}`}>{chain.name}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${networkColor[chain.network] ?? 'text-gray-400 bg-gray-400/10'}`}>{chain.network}</span>
                {chain.alchemy_supported && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">Alchemy</span>}
              </div>
              <p className={`text-[10px] font-mono mt-0.5 ${t.textMuted} truncate`}>{chain.rpc}<span className="opacity-50">{'<key>'}</span></p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`text-[10px] font-mono ${t.textMuted}`}>{chain.currency}</span>
              <button
                onClick={() => toggle(chain.id)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${chain.enabled ? 'bg-violet-500' : 'bg-gray-500/40'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${chain.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <SaveBtn onClick={() => save(chains)} saving={saving} saved={saved} label="Save Chain Config" />
    </div>
  );
}

// ─── Tab: Contracts / ABI Publisher ──────────────────────────────────────────

function ContractsTab({ t }: { t: ReturnType<typeof useTheme> }) {
  type AbiEntry = { type?: string; name?: string; stateMutability?: string; inputs?: Array<{ name?: string; type?: string }>; outputs?: Array<{ name?: string; type?: string }> };

  const [abis, setAbis] = useState<ContractAbi[]>([]);
  const [prebuilt, setPrebuilt] = useState<PrebuiltContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [prebuiltChain, setPrebuiltChain] = useState('base-mainnet');
  const [prebuiltLoading, setPrebuiltLoading] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<DeployEstimate | null>(null);
  const [form, setForm] = useState({ name: '', address: '', chain: 'base-mainnet', abi: '', bytecode: '' });
  const [constructorInputs, setConstructorInputs] = useState<Array<{ name: string; type: string }>>([]);
  const [constructorValues, setConstructorValues] = useState<string[]>([]);
  const [siteWalletAddress, setSiteWalletAddress] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContractAbi | null>(null);

  const parsedAbi = useMemo(() => {
    try {
      const arr = JSON.parse(form.abi || '[]') as AbiEntry[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [form.abi]);

  const abiActions = useMemo(() => {
    return parsedAbi.filter((x) => x?.type === 'function' && x?.stateMutability !== 'view' && x?.stateMutability !== 'pure');
  }, [parsedAbi]);

  useEffect(() => {
    const ctor = parsedAbi.find((x) => x?.type === 'constructor');
    const inputs = (ctor?.inputs || []).map((i) => ({ name: i.name || 'arg', type: i.type || 'string' }));
    setConstructorInputs(inputs);
    setConstructorValues((prev) => inputs.map((_, idx) => prev[idx] ?? ''));
  }, [parsedAbi]);

  useEffect(() => {
    Promise.all([
      adminFetch<ContractAbi[]>('/admin/alchemy/contracts').then(setAbis).catch(() => {}),
      adminFetch<PrebuiltContract[]>('/admin/alchemy/contracts/prebuilt').then(setPrebuilt).catch(() => {}),
      adminFetch<SiteWallet>('/admin/alchemy/wallet').then(w => setSiteWalletAddress(w.address || '')).catch(() => setSiteWalletAddress('')),
    ]).finally(() => setLoading(false));
  }, []);

  function parseArg(raw: string, solidityType: string): unknown {
    const t = solidityType.toLowerCase();
    if (t.endsWith('[]')) {
      return raw.split(',').map((x) => x.trim()).filter(Boolean);
    }
    if (t.startsWith('uint') || t.startsWith('int')) {
      return raw.trim() === '' ? '0' : raw.trim();
    }
    if (t === 'bool') {
      return raw.trim().toLowerCase() === 'true';
    }
    return raw;
  }

  function constructorArgsPayload(): unknown[] {
    return constructorInputs.map((inp, idx) => parseArg(constructorValues[idx] ?? '', inp.type));
  }

  async function loadPrebuiltTemplate(name: string) {
    setPrebuiltLoading(name + ':template');
    setError(null);
    try {
      const tpl = await adminFetch<PrebuiltTemplate>(`/admin/alchemy/contracts/prebuilt/template/${name}?chain=${encodeURIComponent(prebuiltChain)}`);
      setForm({
        name: tpl.name,
        chain: tpl.chain,
        address: '',
        abi: tpl.abi,
        bytecode: tpl.bytecode,
      });
      const ctorVals = (tpl.constructor_args || []).map((x) => String(x));
      setConstructorValues(ctorVals);
      setShowAdd(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load template');
    } finally {
      setPrebuiltLoading(null);
    }
  }

  async function estimatePrebuilt(name: string) {
    setPrebuiltLoading(name);
    setError(null);
    try {
      const r = await adminFetch<DeployEstimate>('/admin/alchemy/contracts/prebuilt/estimate', {
        method: 'POST',
        body: JSON.stringify({ contract_name: name, chain: prebuiltChain, deploy: false }),
      });
      setEstimate(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Estimate failed');
    } finally {
      setPrebuiltLoading(null);
    }
  }

  async function publishPrebuilt(name: string, deploy: boolean) {
    setPrebuiltLoading(name + (deploy ? ':deploy' : ':publish'));
    setError(null);
    try {
      const r = await adminFetch<{ record: ContractAbi; estimate: DeployEstimate; deployed?: { tx_hash: string; contract_address: string } }>(
        '/admin/alchemy/contracts/prebuilt/publish',
        {
          method: 'POST',
          body: JSON.stringify({ contract_name: name, chain: prebuiltChain, deploy }),
        }
      );
      setAbis(prev => [r.record, ...prev]);
      setEstimate(r.estimate);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPrebuiltLoading(null);
    }
  }

  async function publish() {
    setPublishing(true); setError(null);
    try {
      JSON.parse(form.abi); // validate JSON
      const record = await adminFetch<ContractAbi>('/admin/alchemy/contracts', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setAbis(prev => [record, ...prev]);
      setShowAdd(false);
      setForm({ name: '', address: '', chain: 'base-mainnet', abi: '', bytecode: '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  }

  async function estimateDraft() {
    setPublishing(true); setError(null);
    try {
      const r = await adminFetch<{ estimate: DeployEstimate }>('/admin/alchemy/contracts/custom/publish', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          chain: form.chain,
          abi: form.abi,
          bytecode: form.bytecode,
          deploy: false,
          constructor_args: constructorArgsPayload(),
        }),
      });
      setEstimate(r.estimate);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Estimate failed');
    } finally {
      setPublishing(false);
    }
  }

  async function deployAndPublishDraft() {
    setPublishing(true); setError(null);
    try {
      const r = await adminFetch<{ record: ContractAbi; estimate: DeployEstimate; deployed?: { tx_hash: string; contract_address: string } }>(
        '/admin/alchemy/contracts/custom/publish',
        {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            chain: form.chain,
            abi: form.abi,
            bytecode: form.bytecode,
            deploy: true,
            constructor_args: constructorArgsPayload(),
          }),
        }
      );
      setAbis(prev => [r.record, ...prev]);
      setEstimate(r.estimate);
      setForm({ name: '', address: '', chain: 'base-mainnet', abi: '', bytecode: '' });
      setConstructorInputs([]);
      setConstructorValues([]);
      setShowAdd(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Deploy failed');
    } finally {
      setPublishing(false);
    }
  }

  async function deleteAbi(id: string) {
    await adminFetch(`/admin/alchemy/contracts/${id}`, { method: 'DELETE' });
    setAbis(prev => prev.filter(a => a.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  const CHAINS = ['eth-mainnet', 'base-mainnet', 'base-sepolia', 'polygon-mainnet', 'opt-mainnet', 'arb-mainnet', 'solana-mainnet'];

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <div className="flex-1 p-6 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-lg font-semibold ${t.heading}`}>Contract Publisher</h2>
            <p className={`text-xs mt-0.5 ${t.textMuted}`}>Edit contract draft, review actions, then estimate/deploy from site wallet</p>
          </div>
          <button
            onClick={() => setShowAdd(p => !p)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Contract'}
          </button>
        </div>

        <div className={`rounded-xl border ${t.border} ${t.bgCard} p-4 space-y-3`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-xs font-semibold ${t.heading}`}>Prebuilt Contracts</p>
              <p className={`text-[10px] ${t.textMuted}`}>One-click estimate and deploy from server artifacts</p>
              <p className={`text-[10px] mt-1 ${t.textMuted}`}>
                Site wallet: {siteWalletAddress ? `${siteWalletAddress.slice(0, 10)}...${siteWalletAddress.slice(-8)}` : 'Not configured'}
              </p>
            </div>
            <select
              value={prebuiltChain}
              onChange={e => setPrebuiltChain(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs border ${t.border} ${t.bgCard} ${t.text}`}
            >
              {['base-mainnet', 'base-sepolia', 'eth-mainnet', 'sepolia'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {prebuilt.map(p => (
              <div key={p.name} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${t.border}`}>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${t.text}`}>{p.name}</p>
                  <p className={`text-[10px] ${p.artifact_exists ? 'text-green-400' : 'text-yellow-400'}`}>
                    {p.artifact_exists ? 'Artifact ready' : 'Artifact missing, compile on publish'}
                  </p>
                </div>
                <button
                  onClick={() => estimatePrebuilt(p.name)}
                  disabled={!!prebuiltLoading}
                  className={`px-2.5 py-1.5 rounded text-[11px] border ${t.border} ${t.textMuted} hover:text-violet-400 hover:border-violet-400 disabled:opacity-40`}
                >
                  {prebuiltLoading === p.name ? 'Estimating…' : 'Estimate'}
                </button>
                <button
                  onClick={() => loadPrebuiltTemplate(p.name)}
                  disabled={!!prebuiltLoading}
                  className={`px-2.5 py-1.5 rounded text-[11px] border ${t.border} ${t.textMuted} hover:text-violet-400 hover:border-violet-400 disabled:opacity-40`}
                >
                  {prebuiltLoading === p.name + ':template' ? 'Loading…' : 'Load to Editor'}
                </button>
                <button
                  onClick={() => publishPrebuilt(p.name, false)}
                  disabled={!!prebuiltLoading}
                  className={`px-2.5 py-1.5 rounded text-[11px] border ${t.border} ${t.textMuted} hover:text-violet-400 hover:border-violet-400 disabled:opacity-40`}
                >
                  {prebuiltLoading === p.name + ':publish' ? 'Publishing…' : 'Publish ABI'}
                </button>
                <button
                  onClick={() => publishPrebuilt(p.name, true)}
                  disabled={!!prebuiltLoading}
                  className="px-2.5 py-1.5 rounded text-[11px] bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-40"
                >
                  {prebuiltLoading === p.name + ':deploy' ? 'Deploying…' : 'Deploy + Publish'}
                </button>
              </div>
            ))}
          </div>

          {estimate && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
              <p className="text-xs font-semibold text-violet-300">Gas Estimate: {estimate.contract_name}</p>
              <p className={`text-[11px] mt-1 ${t.textMuted}`}>
                Gas: {estimate.gas_estimate.toLocaleString()} · Max Cost: {estimate.max_cost_eth} ETH
              </p>
              <p className={`text-[11px] ${t.textMuted}`}>Recommended wallet balance: at least {Math.max(Number(estimate.max_cost_eth) * 1.5, 0.003).toFixed(6)} ETH</p>
            </div>
          )}
        </div>

        <AnimatePresence>
          {showAdd && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`rounded-xl border ${t.border} ${t.bgCard} p-4 space-y-3`}
            >
              <p className={`text-xs font-semibold ${t.heading}`}>Contract Draft Editor</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <Input value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="RunnerToken" />
                </Field>
                <Field label="Chain">
                  <select value={form.chain} onChange={e => setForm(p => ({ ...p, chain: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg text-xs border ${t.border} ${t.bgCard} ${t.text} focus:outline-none focus:ring-1 focus:ring-violet-500/50`}>
                    {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Contract Address (optional if not yet deployed)">
                <Input value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="0x…" />
              </Field>
              <Field label="ABI (JSON)" hint="Paste the contract ABI array">
                <Textarea value={form.abi} onChange={v => setForm(p => ({ ...p, abi: v }))} placeholder='[{"type":"function",...}]' rows={5} />
              </Field>
              <Field label="Bytecode (optional, for deployment)">
                <Textarea value={form.bytecode} onChange={v => setForm(p => ({ ...p, bytecode: v }))} placeholder="0x608060…" rows={3} />
              </Field>

              {constructorInputs.length > 0 && (
                <Field label="Constructor Inputs" hint="Fill deployment params clearly before posting to chain">
                  <div className="grid grid-cols-2 gap-2">
                    {constructorInputs.map((inp, idx) => (
                      <div key={`${inp.name}-${idx}`}>
                        <p className={`text-[10px] mb-1 ${t.textMuted}`}>{inp.name || `arg_${idx}`} ({inp.type})</p>
                        <Input
                          value={constructorValues[idx] || ''}
                          onChange={v => setConstructorValues(prev => prev.map((x, i) => (i === idx ? v : x)))}
                          placeholder={inp.type.endsWith('[]') ? 'comma,separated,values' : 'value'}
                        />
                      </div>
                    ))}
                  </div>
                </Field>
              )}

              <Field label="Detected Actions" hint="Writable functions from ABI">
                <div className={`rounded-lg border ${t.border} p-2 max-h-40 overflow-y-auto`}>
                  {abiActions.length === 0 ? (
                    <p className={`text-[11px] ${t.textMuted}`}>No writable actions detected yet.</p>
                  ) : (
                    abiActions.map((fn, i) => (
                      <div key={`${fn.name || 'fn'}-${i}`} className={`text-[11px] ${t.text} py-0.5`}>
                        <span className="text-violet-400">{fn.name || 'unnamed'}</span>
                        <span className={`ml-2 ${t.textMuted}`}>
                          ({(fn.inputs || []).map(inp => `${inp.type || 'any'} ${inp.name || ''}`.trim()).join(', ')})
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Field>

              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={publish}
                  disabled={publishing || !form.name || !form.abi}
                  className="px-4 py-2 rounded-lg text-xs font-medium border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 disabled:opacity-40 transition-colors"
                >
                  {publishing ? 'Working…' : 'Publish ABI Only'}
                </button>
                <button
                  onClick={estimateDraft}
                  disabled={publishing || !form.name || !form.abi || !form.bytecode}
                  className="px-4 py-2 rounded-lg text-xs font-medium border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 disabled:opacity-40 transition-colors"
                >
                  {publishing ? 'Working…' : 'Estimate Draft Gas'}
                </button>
                <button
                  onClick={deployAndPublishDraft}
                  disabled={publishing || !form.name || !form.abi || !form.bytecode}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors"
                >
                  {publishing ? 'Deploying…' : 'Deploy + Publish Draft'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <p className={`text-xs ${t.textMuted} py-4`}>Loading…</p>
        ) : abis.length === 0 ? (
          <div className={`text-center py-12 ${t.textMuted}`}>
            <p className="text-3xl mb-2">📋</p>
            <p className="text-xs">No contracts published yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {abis.map(abi => (
              <div
                key={abi.id}
                onClick={() => setSelected(s => s?.id === abi.id ? null : abi)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${selected?.id === abi.id ? 'border-violet-500/50 bg-violet-500/5' : `${t.border} ${t.bgCard} hover:border-violet-500/30`}`}
              >
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 flex-shrink-0 text-sm">📋</div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${t.text}`}>{abi.name}</p>
                  <p className={`text-[10px] font-mono ${t.textMuted} truncate`}>{abi.address || 'No address'} · {abi.chain}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteAbi(abi.id); }}
                  className={`p-1.5 rounded-lg ${t.textMuted} hover:text-red-400 hover:bg-red-400/10 transition-colors`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ABI Viewer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className={`border-l ${t.border} ${t.bgCard} flex flex-col overflow-hidden flex-shrink-0`}
          >
            <div className={`flex items-center justify-between px-4 py-3 border-b ${t.border}`}>
              <p className={`text-xs font-semibold ${t.heading}`}>{selected.name}</p>
              <button onClick={() => setSelected(null)} className={`p-1 ${t.textMuted} hover:${t.text}`}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className={`text-[10px] font-semibold uppercase tracking-widest ${t.textMuted} mb-2`}>ABI</p>
              <pre className={`text-[10px] font-mono ${t.textMuted} whitespace-pre-wrap break-all leading-relaxed`}>
                {JSON.stringify(JSON.parse(selected.abi || '[]'), null, 2)}
              </pre>
              {selected.bytecode && (
                <>
                  <p className={`text-[10px] font-semibold uppercase tracking-widest ${t.textMuted} mt-4 mb-2`}>Bytecode</p>
                  <p className={`text-[10px] font-mono ${t.textMuted} break-all`}>{selected.bytecode.slice(0, 200)}…</p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Tab: NFT Access Control ───────────────────────────────────────────────────

const AVAILABLE_ROLES = ['admin', 'runner', 'premium', 'ancient_holder', 'nft_holder', 'trail_creator', 'verified'];

function AccessTab({ t }: { t: ReturnType<typeof useTheme> }) {
  const [rules, setRules] = useState<NftAccessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Omit<NftAccessRule, 'id' | 'created_at'>>({
    name: '',
    chain: 'base-mainnet',
    contract_address: '',
    token_id: '',
    min_balance: 1,
    granted_roles: [],
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<NftAccessRule[]>('/admin/alchemy/access-rules').then(setRules).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function saveRule() {
    setSaving(true); setError(null);
    try {
      const r = await adminFetch<NftAccessRule>('/admin/alchemy/access-rules', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setRules(prev => [r, ...prev]);
      setShowAdd(false);
      setForm({ name: '', chain: 'base-mainnet', contract_address: '', token_id: '', min_balance: 1, granted_roles: [], active: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(id: string, active: boolean) {
    await adminFetch(`/admin/alchemy/access-rules/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
    setRules(prev => prev.map(r => r.id === id ? { ...r, active } : r));
  }

  async function deleteRule(id: string) {
    await adminFetch(`/admin/alchemy/access-rules/${id}`, { method: 'DELETE' });
    setRules(prev => prev.filter(r => r.id !== id));
  }

  function toggleRole(role: string) {
    setForm(prev => ({
      ...prev,
      granted_roles: prev.granted_roles.includes(role)
        ? prev.granted_roles.filter(r => r !== role)
        : [...prev.granted_roles, role],
    }));
  }

  const CHAINS = ['eth-mainnet', 'base-mainnet', 'base-sepolia', 'polygon-mainnet'];

  return (
    <div className="space-y-5 p-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-semibold ${t.heading}`}>NFT Access Control</h2>
          <p className={`text-xs mt-0.5 ${t.textMuted}`}>Grant user roles based on NFT ownership — checked on login and profile visits</p>
        </div>
        <button
          onClick={() => setShowAdd(p => !p)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Add Rule'}
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`rounded-xl border ${t.border} ${t.bgCard} p-4 space-y-3`}
          >
            <p className={`text-xs font-semibold ${t.heading}`}>New Access Rule</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rule Name">
                <Input value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Ancient NFT Holders" />
              </Field>
              <Field label="Chain">
                <select value={form.chain} onChange={e => setForm(p => ({ ...p, chain: e.target.value }))}
                  className={`w-full px-3 py-2 rounded-lg text-xs border ${t.border} ${t.bgCard} ${t.text} focus:outline-none focus:ring-1 focus:ring-violet-500/50`}>
                  {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <Field label="NFT Contract Address">
              <Input value={form.contract_address} onChange={v => setForm(p => ({ ...p, contract_address: v }))} placeholder="0x…" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Token ID (optional, leave blank for any)">
                <Input value={form.token_id || ''} onChange={v => setForm(p => ({ ...p, token_id: v }))} placeholder="0 (any)" />
              </Field>
              <Field label="Min Balance">
                <Input value={String(form.min_balance)} onChange={v => setForm(p => ({ ...p, min_balance: Number(v) || 1 }))} placeholder="1" type="number" />
              </Field>
            </div>
            <Field label="Granted Roles" hint="Select roles to grant when user holds this NFT">
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_ROLES.map(role => (
                  <button
                    key={role}
                    onClick={() => toggleRole(role)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${form.granted_roles.includes(role) ? 'bg-violet-500 text-white border-violet-500' : `${t.border} ${t.textMuted}`}`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </Field>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={saveRule}
              disabled={saving || !form.name || !form.contract_address || form.granted_roles.length === 0}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Create Rule'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`rounded-xl border ${t.border} ${t.bgCard} p-3 space-y-2`}>
        <p className={`text-[10px] font-semibold uppercase tracking-widest ${t.textMuted}`}>How it works</p>
        <div className="space-y-1">
          {['On user login — NFT balances checked via Alchemy API', 'On profile visit — background job validates NFT ownership', 'Roles assigned automatically; revoked when NFT is transferred', 'Uses Base chain by default (low fees), any EVM chain supported'].map(s => (
            <p key={s} className={`text-[11px] ${t.textMuted} flex items-center gap-2`}>
              <span className="text-violet-400">→</span>{s}
            </p>
          ))}
        </div>
      </div>

      {loading ? (
        <p className={`text-xs ${t.textMuted}`}>Loading…</p>
      ) : rules.length === 0 ? (
        <div className={`text-center py-10 ${t.textMuted}`}>
          <p className="text-3xl mb-2">🛡</p>
          <p className="text-xs">No access rules configured</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${rule.active ? 'border-violet-500/30 bg-violet-500/5' : `${t.border} ${t.bgCard}`}`}>
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${rule.active ? 'bg-green-400' : 'bg-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${t.text}`}>{rule.name}</p>
                <p className={`text-[10px] font-mono ${t.textMuted} truncate`}>{rule.contract_address} · {rule.chain}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {rule.granted_roles.map(r => (
                    <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">{r}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleRule(rule.id, !rule.active)}
                  className={`relative inline-flex h-4.5 w-8 items-center rounded-full transition-colors ${rule.active ? 'bg-violet-500' : 'bg-gray-500/40'}`}
                  style={{ height: 18, width: 32 }}
                >
                  <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${rule.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <button
                  onClick={() => deleteRule(rule.id)}
                  className={`p-1.5 rounded-lg ${t.textMuted} hover:text-red-400 hover:bg-red-400/10 transition-colors`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Site Wallet ─────────────────────────────────────────────────────────

function WalletTab({ t }: { t: ReturnType<typeof useTheme> }) {
  const [wallet, setWallet] = useState<SiteWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportData, setExportData] = useState<{ private_key: string; mnemonic: string } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);

  useEffect(() => {
    adminFetch<SiteWallet>('/admin/alchemy/wallet')
      .then(setWallet)
      .catch(() => setWallet(null))
      .finally(() => setLoading(false));
  }, []);

  async function createWallet() {
    setCreating(true); setError(null);
    try {
      const w = await adminFetch<SiteWallet>('/admin/alchemy/wallet/create', { method: 'POST' });
      setWallet(w);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create wallet');
    } finally {
      setCreating(false);
    }
  }

  async function exportWallet() {
    setExportLoading(true); setError(null);
    try {
      const data = await adminFetch<{ private_key: string; mnemonic: string }>('/admin/alchemy/wallet/export', { method: 'POST' });
      setExportData(data);
      setShowExport(true);
      setConfirmExport(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className={`text-lg font-semibold ${t.heading}`}>Site Wallet</h2>
        <p className={`text-xs mt-1 ${t.textMuted}`}>Platform-managed Ethereum wallet used to deploy contracts and sign transactions via Alchemy.</p>
      </div>

      {loading ? (
        <p className={`text-xs ${t.textMuted}`}>Loading…</p>
      ) : wallet ? (
        <div className="space-y-4">
          <div className={`rounded-xl border ${t.border} p-4 space-y-3`} style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.05))' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400 text-lg">🔐</div>
              <div>
                <p className={`text-xs font-semibold ${t.heading}`}>Site Wallet</p>
                <p className={`text-[10px] ${t.textMuted}`}>Created {new Date(wallet.created_at).toLocaleDateString()}</p>
              </div>
              <span className="ml-auto text-[10px] px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium">Active</span>
            </div>
            <div>
              <p className={`text-[10px] ${t.textMuted} mb-1`}>Address</p>
              <code className={`text-xs font-mono ${t.text} break-all`}>{wallet.address}</code>
            </div>
            <p className={`text-[10px] ${t.textMuted}`}>
              {wallet.has_private_key ? '🔒 Private key stored encrypted (AES-256 Fernet)' : '⚠ No private key stored — import-only wallet'}
            </p>
          </div>

          <Section title="Export Keys">
            <div className={`p-4 rounded-xl border border-red-500/20 bg-red-500/5 space-y-3`}>
              <div className="flex items-start gap-3">
                <span className="text-red-400 mt-0.5">⚠</span>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-red-400">Sensitive Operation</p>
                  <p className={`text-[10px] ${t.textMuted}`}>Exporting private keys exposes them in your browser. Only do this in a secure environment. Never share these keys.</p>
                </div>
              </div>
              {!confirmExport ? (
                <button
                  onClick={() => setConfirmExport(true)}
                  className="px-4 py-2 rounded-lg text-xs font-medium border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Show Private Keys…
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-400 font-medium">Are you sure? This will show your private key in plaintext.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={exportWallet}
                      disabled={exportLoading}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-red-500 hover:bg-red-600 text-white disabled:opacity-40 transition-colors"
                    >
                      {exportLoading ? 'Decrypting…' : 'Yes, Export Keys'}
                    </button>
                    <button
                      onClick={() => setConfirmExport(false)}
                      className={`px-4 py-2 rounded-lg text-xs font-medium border ${t.border} ${t.textMuted} hover:${t.text}`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Section>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`rounded-xl border ${t.border} ${t.bgCard} p-6 text-center space-y-3`}>
            <p className="text-3xl">🪙</p>
            <p className={`text-sm font-medium ${t.text}`}>No site wallet exists</p>
            <p className={`text-xs ${t.textMuted}`}>Create a wallet to deploy contracts and sign platform transactions</p>
            <button
              onClick={createWallet}
              disabled={creating}
              className="px-5 py-2.5 rounded-lg text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors"
            >
              {creating ? 'Creating…' : 'Create Site Wallet'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Export popup */}
      <AnimatePresence>
        {showExport && exportData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowExport(false); setExportData(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className={`w-full max-w-lg mx-4 rounded-2xl border border-red-500/30 ${t.bg} p-6 space-y-4 shadow-2xl`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔑</span>
                <div>
                  <p className={`text-sm font-semibold ${t.heading}`}>Wallet Keys — Keep Secret</p>
                  <p className={`text-[10px] text-red-400`}>Never share these. Close this window when done.</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-widest text-red-400/70 mb-1`}>Private Key</p>
                  <div className={`p-3 rounded-lg border border-red-500/20 bg-red-500/5 font-mono text-[11px] ${t.text} break-all select-all`}>
                    {exportData.private_key}
                  </div>
                </div>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-widest text-red-400/70 mb-1`}>Mnemonic Phrase</p>
                  <div className={`p-3 rounded-lg border border-red-500/20 bg-red-500/5 font-mono text-[11px] ${t.text} break-all select-all`}>
                    {exportData.mnemonic || '(not available for imported wallets)'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setShowExport(false); setExportData(null); }}
                className="w-full py-2.5 rounded-lg text-xs font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                Close & Clear
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Tab: ConnectKit ──────────────────────────────────────────────────────────

const DEFAULT_CONNECTKIT: ConnectKitConfig = {
  walletconnect_project_id: '', alchemy_id: '', infura_id: '',
  app_name: 'OnTrail', app_description: 'Web3 SocialFi Running App',
  app_url: 'https://ontrail.tech', app_icon: 'https://ontrail.tech/logo.png',
};

function ConnectKitTab({ t }: { t: ReturnType<typeof useTheme> }) {
  const [cfg, setCfg] = useState<ConnectKitConfig>(DEFAULT_CONNECTKIT);
  const { save, saving, saved, error } = useSave(async (data: ConnectKitConfig) => {
    await adminFetch('/admin/alchemy/connectkit', { method: 'PUT', body: JSON.stringify(data) });
  });

  useEffect(() => {
    adminFetch<ConnectKitConfig>('/admin/alchemy/connectkit').then(setCfg).catch(() => {});
  }, []);

  function set(k: keyof ConnectKitConfig, v: string) { setCfg(p => ({ ...p, [k]: v })); }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className={`text-lg font-semibold ${t.heading}`}>ConnectKit Configuration</h2>
        <p className={`text-xs mt-1 ${t.textMuted}`}>Configure wallet connection providers (WalletConnect, Alchemy, Infura) for the dApp frontend</p>
      </div>

      <Section title="Provider Keys">
        <Field label="WalletConnect Project ID" hint="Get from cloud.walletconnect.com">
          <Input value={cfg.walletconnect_project_id} onChange={v => set('walletconnect_project_id', v)} placeholder="abc123…" type="password" />
        </Field>
        <Field label="Alchemy ID" hint="Same key as API Keys tab (used in ConnectKit client config)">
          <Input value={cfg.alchemy_id} onChange={v => set('alchemy_id', v)} placeholder="alchemy_XXXXXXXXXXXX" type="password" />
        </Field>
        <Field label="Infura ID (optional)" hint="Fallback provider">
          <Input value={cfg.infura_id} onChange={v => set('infura_id', v)} placeholder="abcdef1234567890" type="password" />
        </Field>
      </Section>

      <Section title="App Metadata">
        <Field label="App Name">
          <Input value={cfg.app_name} onChange={v => set('app_name', v)} placeholder="OnTrail" />
        </Field>
        <Field label="App Description">
          <Input value={cfg.app_description} onChange={v => set('app_description', v)} placeholder="Web3 SocialFi Running App" />
        </Field>
        <Field label="App URL">
          <Input value={cfg.app_url} onChange={v => set('app_url', v)} placeholder="https://ontrail.tech" />
        </Field>
        <Field label="App Icon URL">
          <Input value={cfg.app_icon} onChange={v => set('app_icon', v)} placeholder="https://ontrail.tech/logo.png" />
        </Field>
      </Section>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <SaveBtn onClick={() => save(cfg)} saving={saving} saved={saved} label="Save ConnectKit Config" />
    </div>
  );
}

// ─── Tab: Runner Coin ─────────────────────────────────────────────────────────

const DEFAULT_RC: RunnerCoinConfig = {
  token_name: 'OnTrail Runner', token_symbol: 'ONTR', total_supply: '1000000000',
  bonding_curve_k: '0.0001', base_price: '0.000001', tge_threshold: '69420',
  contract_address: '', treasury_address: '',
  launch_chain: 'base-mainnet', bonding_curve_locked: false, lp_tx_hash: '', lp_address: '',
};

const LAUNCH_CHAINS = [
  { value: 'base-mainnet', label: 'Base Mainnet (recommended — cheap gas, EVM, Uniswap v3)' },
  { value: 'eth-mainnet', label: 'Ethereum Mainnet (highest liquidity, highest gas)' },
  { value: 'solana-mainnet', label: 'Solana (pump.fun bonding curve, Raydium at TGE)' },
];

function RunnerCoinTab({ t }: { t: ReturnType<typeof useTheme> }) {
  const [cfg, setCfg] = useState<RunnerCoinConfig>(DEFAULT_RC);
  const [guide, setGuide] = useState<LaunchGuide | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [lockSaving, setLockSaving] = useState(false);
  const [lockResult, setLockResult] = useState<string | null>(null);
  const { save, saving, saved, error } = useSave(async (data: RunnerCoinConfig) => {
    await adminFetch('/admin/alchemy/runnercoin', { method: 'PUT', body: JSON.stringify(data) });
    // Also save launch info
    await adminFetch('/admin/alchemy/runnercoin/launch', {
      method: 'PUT',
      body: JSON.stringify({
        launch_chain: data.launch_chain,
        bonding_curve_locked: data.bonding_curve_locked,
        lp_tx_hash: data.lp_tx_hash,
        lp_address: data.lp_address,
      }),
    });
  });

  useEffect(() => {
    adminFetch<RunnerCoinConfig>('/admin/alchemy/runnercoin').then(setCfg).catch(() => {});
  }, []);

  async function fetchGuide() {
    setGuideLoading(true);
    try {
      const g = await adminFetch<LaunchGuide>('/admin/alchemy/runnercoin/launch-guide');
      setGuide(g);
    } catch { /* ignore */ }
    finally { setGuideLoading(false); }
  }

  async function lockBondingCurve() {
    setLockSaving(true); setLockResult(null);
    try {
      await adminFetch('/admin/alchemy/runnercoin/launch', {
        method: 'PUT',
        body: JSON.stringify({
          launch_chain: cfg.launch_chain,
          bonding_curve_locked: true,
          lp_tx_hash: cfg.lp_tx_hash,
          lp_address: cfg.lp_address,
        }),
      });
      setCfg(p => ({ ...p, bonding_curve_locked: true }));
      setLockResult('✓ Bonding curve locked. Proceed to create liquidity pool.');
    } catch (e: unknown) {
      setLockResult(`✗ ${e instanceof Error ? e.message : 'Failed'}`);
    } finally { setLockSaving(false); }
  }

  function set(k: keyof RunnerCoinConfig, v: string | boolean) {
    setCfg(p => ({ ...p, [k]: v }));
  }

  const isSolana = cfg.launch_chain === 'solana-mainnet';

  return (
    <div className="space-y-6 p-6 overflow-y-auto">
      <div>
        <h2 className={`text-lg font-semibold ${t.heading}`}>Runner Coin Settings</h2>
        <p className={`text-xs mt-1 ${t.textMuted}`}>Configure, launch, and manage the ONTR runner token across chains</p>
      </div>

      <Section title="Launch Chain">
        <Field label="Choose Launch Chain" hint="Determines token standard, DEX, and LP creation flow">
          <select
            value={cfg.launch_chain}
            onChange={e => { set('launch_chain', e.target.value); setGuide(null); }}
            className={`w-full px-3 py-2 rounded-lg text-xs border ${t.border} ${t.bgCard} ${t.text} focus:outline-none focus:ring-1 focus:ring-violet-500/50`}
          >
            {LAUNCH_CHAINS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${t.border} ${t.bgCard}`}>
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.bonding_curve_locked ? 'bg-orange-400' : 'bg-green-400'}`} />
          <div className="flex-1">
            <p className={`text-xs font-medium ${t.text}`}>
              Bonding Curve: {cfg.bonding_curve_locked ? '🔒 Locked (ready for LP)' : '🟢 Active (accumulating)'}
            </p>
            <p className={`text-[10px] ${t.textMuted}`}>
              {cfg.bonding_curve_locked ? 'Create a liquidity pool to enable open trading.' : 'Token is on bonding curve. Lock when ready to migrate to open market.'}
            </p>
          </div>
          {!cfg.bonding_curve_locked && (
            <button onClick={lockBondingCurve} disabled={lockSaving}
              className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40 transition-colors flex-shrink-0">
              {lockSaving ? 'Locking…' : 'Lock Curve'}
            </button>
          )}
        </div>
        {lockResult && (
          <p className={`text-xs ${lockResult.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{lockResult}</p>
        )}
      </Section>

      <Section title="Token Identity">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Token Name">
            <Input value={cfg.token_name} onChange={v => set('token_name', v)} placeholder="OnTrail Runner" />
          </Field>
          <Field label="Symbol">
            <Input value={cfg.token_symbol} onChange={v => set('token_symbol', v)} placeholder="ONTR" />
          </Field>
        </div>
        <Field label="Total Supply">
          <Input value={cfg.total_supply} onChange={v => set('total_supply', v)} placeholder="1000000000" />
        </Field>
      </Section>

      <Section title={isSolana ? 'Bonding Curve (pump.fun)' : 'Bonding Curve'}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Curve K (slope)" hint={isSolana ? 'pump.fun uses quadratic: price = base + k·x²' : 'Custom EVM curve: price = base + k·x²'}>
            <Input value={cfg.bonding_curve_k} onChange={v => set('bonding_curve_k', v)} placeholder="0.0001" />
          </Field>
          <Field label={isSolana ? 'Base Price (SOL)' : 'Base Price (ETH)'} hint="Price at zero supply">
            <Input value={cfg.base_price} onChange={v => set('base_price', v)} placeholder="0.000001" />
          </Field>
        </div>
        <Field label={isSolana ? 'TGE Threshold (SOL)' : 'Bonding Curve Lock Target'} hint={isSolana ? 'SOL raised to trigger Raydium migration (pump.fun default: 69420)' : 'Amount raised to lock curve and open Uniswap trading'}>
          <Input value={cfg.tge_threshold} onChange={v => set('tge_threshold', v)} placeholder={isSolana ? '69420' : '10'} />
        </Field>
      </Section>

      <Section title="Deployed Addresses">
        <Field label="Token Contract Address">
          <Input value={cfg.contract_address} onChange={v => set('contract_address', v)} placeholder={isSolana ? 'Solana mint address (base58)…' : '0x… ERC-20 address'} />
        </Field>
        <Field label="Treasury Address">
          <Input value={cfg.treasury_address} onChange={v => set('treasury_address', v)} placeholder="Treasury wallet address…" />
        </Field>
      </Section>

      {cfg.bonding_curve_locked && (
        <Section title="Liquidity Pool">
          <Field label="LP Transaction Hash">
            <Input value={cfg.lp_tx_hash} onChange={v => set('lp_tx_hash', v)} placeholder="0x… (from Uniswap / pump.fun)" />
          </Field>
          <Field label="LP Contract / Pool Address">
            <Input value={cfg.lp_address} onChange={v => set('lp_address', v)} placeholder="0x… Uniswap v3 pool address" />
          </Field>
        </Section>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      <SaveBtn onClick={() => save(cfg)} saving={saving} saved={saved} label="Save Runner Coin Settings" />

      {/* LP Creation Guide */}
      <Section title="Liquidity Pool Guide">
        <div className={`p-4 rounded-xl border ${t.border} ${t.bgCard} space-y-3`}>
          <div className="flex items-center justify-between">
            <p className={`text-xs font-medium ${t.text}`}>Step-by-step LP creation for {LAUNCH_CHAINS.find(c => c.value === cfg.launch_chain)?.label.split(' (')[0]}</p>
            <button onClick={fetchGuide} disabled={guideLoading}
              className="px-3 py-1 rounded-lg text-[10px] font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40">
              {guideLoading ? 'Loading…' : guide ? 'Refresh' : 'Load Guide'}
            </button>
          </div>

          {guide && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] px-2 py-1 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20`}>{guide.dex}</span>
                <span className={`text-[10px] px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20`}>{guide.cost_estimate}</span>
              </div>
              <ol className="space-y-2">
                {guide.steps.map((step, i) => (
                  <li key={i} className={`text-xs ${t.textMuted} pl-1`}>{step}</li>
                ))}
              </ol>
              <div className="flex gap-2 pt-1">
                {guide.smithii_url && (
                  <a href={guide.smithii_url} target="_blank" rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white transition-colors">
                    Open Smithii →
                  </a>
                )}
                <a href={guide.uniswap_url} target="_blank" rel="noreferrer"
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${t.border} ${t.textMuted} hover:border-violet-400 hover:text-violet-400 transition-colors`}>
                  {isSolana ? 'pump.fun →' : 'Uniswap →'}
                </a>
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

// ─── Tab: JWT Auth ────────────────────────────────────────────────────────────

function JwtTab({ t }: { t: ReturnType<typeof useTheme> }) {
  const [cfg, setCfg] = useState<JwtConfig>({ has_private_key: false, public_key: '', key_id: '', enabled: false });
  const [keyId, setKeyId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [testJwt, setTestJwt] = useState('');
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const { save, saving, saved, error } = useSave(async () => {
    await adminFetch('/admin/alchemy/jwt/config', { method: 'PUT', body: JSON.stringify({ key_id: keyId, enabled }) });
  });

  useEffect(() => {
    adminFetch<JwtConfig>('/admin/alchemy/jwt/config').then(d => {
      setCfg(d); setKeyId(d.key_id); setEnabled(d.enabled);
    }).catch(() => {});
  }, []);

  async function generate() {
    setGenerating(true);
    try {
      const r = await adminFetch<{ public_key: string }>('/admin/alchemy/jwt/generate', { method: 'POST', body: '{}' });
      setCfg(prev => ({ ...prev, has_private_key: true, public_key: r.public_key }));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setGenerating(false); }
  }

  async function testToken() {
    setTesting(true); setTestJwt('');
    try {
      const r = await adminFetch<{ jwt: string }>('/admin/alchemy/jwt/test-token', { method: 'POST', body: '{}' });
      setTestJwt(r.jwt);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setTesting(false); }
  }

  function copyKey() {
    navigator.clipboard.writeText(cfg.public_key);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className={`text-lg font-semibold ${t.heading}`}>JWT Auth</h2>
        <p className={`text-xs mt-1 ${t.textMuted}`}>Replace API key in URL with RSA-signed JWTs for enhanced security</p>
      </div>

      <Section title="Setup Guide">
        <ol className={`space-y-2 text-xs ${t.textMuted}`}>
          <li><span className="text-violet-400 font-medium">1.</span> Generate a key pair below</li>
          <li><span className="text-violet-400 font-medium">2.</span> Copy the public key → paste into Alchemy Dashboard → Apps → JWT Keys</li>
          <li><span className="text-violet-400 font-medium">3.</span> Copy the Key ID shown in Alchemy dashboard</li>
          <li><span className="text-violet-400 font-medium">4.</span> Paste Key ID here → Save → Enable JWT Auth</li>
        </ol>
      </Section>

      <Section title="Key Pair">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className={`flex-1 px-3 py-2 rounded-lg text-xs border ${t.border} ${t.bgCard} ${t.textMuted}`}>
              {cfg.has_private_key ? '✓ Private key stored (encrypted)' : 'No key pair generated yet'}
            </div>
            <button onClick={generate} disabled={generating}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 transition-colors whitespace-nowrap">
              {generating ? 'Generating…' : cfg.has_private_key ? 'Regenerate' : 'Generate Key Pair'}
            </button>
          </div>
          {cfg.public_key && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium ${t.text}`}>Public Key (paste in Alchemy Dashboard)</span>
                <button onClick={copyKey}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${copied ? 'bg-green-500/20 text-green-400' : 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20'}`}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className={`p-3 rounded-lg text-[10px] font-mono overflow-auto border ${t.border} ${t.bgCard} ${t.textMuted} max-h-32`}>{cfg.public_key}</pre>
            </div>
          )}
        </div>
      </Section>

      <Section title="Key ID & Enable">
        <div className="space-y-3">
          <Field label="Alchemy Key ID" hint="From Alchemy dashboard after uploading public key">
            <Input value={keyId} onChange={setKeyId} placeholder="kid_…" />
          </Field>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs font-medium ${t.text}`}>Enable JWT Auth</p>
              <p className={`text-[10px] ${t.textMuted}`}>Use signed JWTs instead of API key in URL</p>
            </div>
            <button onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-violet-500' : 'bg-gray-600'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex gap-2">
            <SaveBtn onClick={() => save(null)} saving={saving} saved={saved} />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </Section>

      {cfg.has_private_key && cfg.key_id && (
        <Section title="Test JWT">
          <div className="space-y-3">
            <button onClick={testToken} disabled={testing}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 disabled:opacity-50 transition-colors">
              {testing ? 'Generating…' : 'Generate Test JWT (10min)'}
            </button>
            {testJwt && (
              <pre className={`p-3 rounded-lg text-[10px] font-mono overflow-auto border ${t.border} ${t.bgCard} text-green-400 max-h-24 whitespace-pre-wrap break-all`}>{testJwt}</pre>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Tab: Mint ────────────────────────────────────────────────────────────────

type MintSubtab = 'access-nft' | 'poi' | 'route' | 'airdrop';

function MintTab({ t }: { t: ReturnType<typeof useTheme> }) {
  const [sub, setSub] = useState<MintSubtab>('access-nft');
  const [result, setResult] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [siteWallet, setSiteWallet] = useState('');

  // Trail Lab data
  const [trailPois, setTrailPois] = useState<TrailLabPoi[]>([]);
  const [trailRoutes, setTrailRoutes] = useState<TrailLabRoute[]>([]);

  // Access NFT fields
  const [accessTo, setAccessTo] = useState('');
  const [accessTier, setAccessTier] = useState('runner');
  const [accessUri, setAccessUri] = useState('');

  // POI fields
  const [poiTo, setPoiTo] = useState('');
  const [poiUri, setPoiUri] = useState('');
  const [poiRarity, setPoiRarity] = useState('common');
  const [poiSelected, setPoiSelected] = useState('');

  // Route fields
  const [routeTo, setRouteTo] = useState('');
  const [routeUri, setRouteUri] = useState('');
  const [routeDifficulty, setRouteDifficulty] = useState('easy');
  const [routeDistance, setRouteDistance] = useState('');
  const [routeElevation, setRouteElevation] = useState('');
  const [routeGps, setRouteGps] = useState('');
  const [routeSelected, setRouteSelected] = useState('');

  // Airdrop fields
  const [airdropType, setAirdropType] = useState<'token' | 'access' | 'poi' | 'route'>('token');
  const [airdropAddresses, setAirdropAddresses] = useState('');
  const [airdropAmount, setAirdropAmount] = useState('1');
  const [airdropContract, setAirdropContract] = useState('');
  const [transferTo, setTransferTo] = useState('');

  // Image upload
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    adminFetch<SiteWallet>('/admin/alchemy/wallet').then(w => {
      setSiteWallet(w.address);
      setAccessTo(w.address);
      setPoiTo(w.address);
      setRouteTo(w.address);
    }).catch(() => {});
    adminFetch<TrailLabPoi[]>('/admin/alchemy/traillab/pois').then(setTrailPois).catch(() => {});
    adminFetch<TrailLabRoute[]>('/admin/alchemy/traillab/routes').then(setTrailRoutes).catch(() => {});
  }, []);

  // When a Trail Lab POI is selected, fill fields
  useEffect(() => {
    if (!poiSelected) return;
    const poi = trailPois.find(p => p.id === poiSelected);
    if (poi) { setPoiRarity(poi.rarity); }
  }, [poiSelected, trailPois]);

  // When a Trail Lab Route is selected, fill fields
  useEffect(() => {
    if (!routeSelected) return;
    const route = trailRoutes.find(r => r.id === routeSelected);
    if (route) {
      setRouteDifficulty(route.difficulty);
      setRouteDistance(Math.round(route.distance_km * 1000).toString());
      setRouteElevation(Math.round(route.elevation_m).toString());
    }
  }, [routeSelected, trailRoutes]);

  async function uploadImage(file: File, setUri: (v: string) => void) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('admin_token') || '';
      const resp = await fetch('/admin/alchemy/upload/image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json() as { url: string };
      setUri(data.url);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setUploading(false); }
  }

  function ImageUpload({ setUri }: { setUri: (v: string) => void }) {
    return (
      <label className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border border-dashed cursor-pointer transition-colors ${t.border} ${t.textMuted} hover:border-violet-400 hover:text-violet-400`}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        {uploading ? 'Uploading…' : 'Upload image'}
        <input type="file" accept="image/*" className="hidden" disabled={uploading}
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, setUri); }} />
      </label>
    );
  }

  async function mintAccessNft() {
    setMinting(true); setResult(null);
    try {
      const r = await adminFetch<{ tx_hash: string; token_id: string }>('/admin/alchemy/mint/access-nft', {
        method: 'POST',
        body: JSON.stringify({ to: accessTo, tier: accessTier, uri: accessUri }),
      });
      setResult(`✓ Access NFT minted — Token #${r.token_id} | Tx: ${r.tx_hash}`);
    } catch (e: unknown) { setResult(`✗ ${e instanceof Error ? e.message : 'Failed'}`); }
    finally { setMinting(false); }
  }

  async function mintPoi() {
    setMinting(true); setResult(null);
    try {
      const r = await adminFetch<{ tx_hash: string; token_id: string }>('/admin/alchemy/mint/poi', {
        method: 'POST',
        body: JSON.stringify({ to: poiTo, uri: poiUri, rarity: poiRarity, poi_id: poiSelected || undefined }),
      });
      setResult(`✓ POI minted — Token #${r.token_id} | Tx: ${r.tx_hash}`);
    } catch (e: unknown) { setResult(`✗ ${e instanceof Error ? e.message : 'Failed'}`); }
    finally { setMinting(false); }
  }

  async function mintRoute() {
    setMinting(true); setResult(null);
    try {
      const waypoints: number[] = routeGps.trim().split('\n').filter(Boolean).flatMap(line => {
        const [lat, lng] = line.split(',').map(s => Math.round(parseFloat(s.trim()) * 1e6));
        return [lat, lng];
      });
      const r = await adminFetch<{ tx_hash: string; token_id: string }>('/admin/alchemy/mint/route', {
        method: 'POST',
        body: JSON.stringify({
          to: routeTo, uri: routeUri, difficulty: routeDifficulty,
          distance_meters: parseInt(routeDistance) || 0,
          elevation_gain_meters: parseInt(routeElevation) || 0,
          gps_waypoints: waypoints,
          route_id: routeSelected || undefined,
        }),
      });
      setResult(`✓ Route minted — Token #${r.token_id} | Tx: ${r.tx_hash} | ${waypoints.length / 2} waypoints`);
    } catch (e: unknown) { setResult(`✗ ${e instanceof Error ? e.message : 'Failed'}`); }
    finally { setMinting(false); }
  }

  async function airdrop() {
    setMinting(true); setResult(null);
    try {
      const addresses = airdropAddresses.split('\n').map(a => a.trim()).filter(Boolean);
      const r = await adminFetch<{ success: number; failed: number }>('/admin/alchemy/mint/airdrop', {
        method: 'POST',
        body: JSON.stringify({ addresses, amount: parseInt(airdropAmount), nft_type: airdropType, contract: airdropContract }),
      });
      setResult(`✓ Airdrop queued — ${r.success} addresses`);
    } catch (e: unknown) { setResult(`✗ ${e instanceof Error ? e.message : 'Failed'}`); }
    finally { setMinting(false); }
  }

  async function transferNft() {
    setMinting(true); setResult(null);
    try {
      const r = await adminFetch<{ tx_hash: string }>('/admin/alchemy/mint/airdrop', {
        method: 'POST',
        body: JSON.stringify({ addresses: [transferTo], amount: parseInt(airdropAmount), nft_type: airdropType, contract: airdropContract }),
      });
      setResult(`✓ Transfer queued — Tx: ${r.tx_hash}`);
    } catch (e: unknown) { setResult(`✗ ${e instanceof Error ? e.message : 'Failed'}`); }
    finally { setMinting(false); }
  }

  const subtabs: { id: MintSubtab; label: string }[] = [
    { id: 'access-nft', label: 'Access NFT' },
    { id: 'poi', label: 'POI NFT' },
    { id: 'route', label: 'Route NFT' },
    { id: 'airdrop', label: 'Airdrop / Transfer' },
  ];

  const ACCESS_TIERS = ['runner', 'premium', 'ancient_holder', 'trail_creator', 'nft_holder'];
  const POI_RARITIES = ['common', 'uncommon', 'rare', 'legendary'];
  const DIFFICULTIES = ['easy', 'moderate', 'hard', 'ultra'];
  const AIRDROP_TYPES = [
    { value: 'token', label: 'Runner Token' },
    { value: 'access', label: 'Access NFT' },
    { value: 'poi', label: 'POI NFT' },
    { value: 'route', label: 'Route NFT' },
  ];

  const selectClass = `w-full px-3 py-2 rounded-lg text-xs border ${t.border} ${t.bgCard} ${t.text} focus:outline-none focus:ring-1 focus:ring-violet-500/50`;

  return (
    <div className="space-y-5 p-6">
      <div>
        <h2 className={`text-lg font-semibold ${t.heading}`}>Mint</h2>
        <p className={`text-xs mt-1 ${t.textMuted}`}>
          Mint NFTs via site wallet using Alchemy RPC
          {siteWallet && <span className="ml-2 text-violet-400 font-mono">{siteWallet.slice(0, 8)}…{siteWallet.slice(-6)}</span>}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {subtabs.map(st => (
          <button key={st.id} onClick={() => { setSub(st.id); setResult(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${sub === st.id ? 'bg-violet-500 text-white border-violet-500' : `${t.bgCard} ${t.border} ${t.textMuted}`}`}>
            {st.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={sub} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
          className="space-y-4">

          {sub === 'access-nft' && (
            <>
              <Field label="Recipient Address" hint="Defaults to site wallet">
                <Input value={accessTo} onChange={setAccessTo} placeholder="0x…" />
              </Field>
              <Field label="Access Tier">
                <select value={accessTier} onChange={e => setAccessTier(e.target.value)} className={selectClass}>
                  {ACCESS_TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
                </select>
              </Field>
              <Field label="Metadata URI" hint="IPFS/Arweave URI or upload an image">
                <div className="flex gap-2">
                  <Input value={accessUri} onChange={setAccessUri} placeholder="ipfs://Qm… or https://…" />
                  <ImageUpload setUri={setAccessUri} />
                </div>
              </Field>
              <button onClick={mintAccessNft} disabled={minting || !accessTo}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors">
                {minting ? 'Minting…' : 'Mint Access NFT'}
              </button>
            </>
          )}

          {sub === 'poi' && (
            <>
              {trailPois.length > 0 && (
                <Field label="Pick from Trail Lab" hint="Select a POI to auto-fill fields">
                  <select value={poiSelected} onChange={e => setPoiSelected(e.target.value)} className={selectClass}>
                    <option value="">— Select POI —</option>
                    {trailPois.map(p => <option key={p.id} value={p.id}>{p.name} ({p.rarity})</option>)}
                  </select>
                </Field>
              )}
              <Field label="Recipient Address" hint="Defaults to site wallet">
                <Input value={poiTo} onChange={setPoiTo} placeholder="0x…" />
              </Field>
              <Field label="Metadata URI" hint="IPFS/Arweave URI or upload an image">
                <div className="flex gap-2">
                  <Input value={poiUri} onChange={setPoiUri} placeholder="ipfs://Qm… or https://…" />
                  <ImageUpload setUri={setPoiUri} />
                </div>
              </Field>
              <Field label="Rarity">
                <select value={poiRarity} onChange={e => setPoiRarity(e.target.value)} className={selectClass}>
                  {POI_RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <button onClick={mintPoi} disabled={minting || !poiTo}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors">
                {minting ? 'Minting…' : 'Mint POI NFT'}
              </button>
            </>
          )}

          {sub === 'route' && (
            <>
              {trailRoutes.length > 0 && (
                <Field label="Pick from Trail Lab" hint="Select a route to auto-fill fields">
                  <select value={routeSelected} onChange={e => setRouteSelected(e.target.value)} className={selectClass}>
                    <option value="">— Select Route —</option>
                    {trailRoutes.map(r => <option key={r.id} value={r.id}>{r.name} ({r.difficulty}, {r.distance_km.toFixed(1)}km)</option>)}
                  </select>
                </Field>
              )}
              <Field label="Recipient Address" hint="Defaults to site wallet">
                <Input value={routeTo} onChange={setRouteTo} placeholder="0x…" />
              </Field>
              <Field label="Metadata URI" hint="IPFS/Arweave URI or upload an image">
                <div className="flex gap-2">
                  <Input value={routeUri} onChange={setRouteUri} placeholder="ipfs://Qm… or https://…" />
                  <ImageUpload setUri={setRouteUri} />
                </div>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Difficulty">
                  <select value={routeDifficulty} onChange={e => setRouteDifficulty(e.target.value)} className={selectClass}>
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
                <Field label="Distance (m)">
                  <Input value={routeDistance} onChange={setRouteDistance} placeholder="5000" />
                </Field>
                <Field label="Elevation (m)">
                  <Input value={routeElevation} onChange={setRouteElevation} placeholder="300" />
                </Field>
              </div>
              <Field label="GPS Waypoints" hint="One coordinate per line: lat,lng">
                <Textarea value={routeGps} onChange={setRouteGps} placeholder={"59.9139,10.7522\n59.9200,10.7600\n…"} rows={4} />
              </Field>
              <button onClick={mintRoute} disabled={minting || !routeTo}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors">
                {minting ? 'Minting…' : 'Mint Route NFT'}
              </button>
            </>
          )}

          {sub === 'airdrop' && (
            <>
              <Field label="Type">
                <select value={airdropType} onChange={e => setAirdropType(e.target.value as typeof airdropType)} className={selectClass}>
                  {AIRDROP_TYPES.map(at => <option key={at.value} value={at.value}>{at.label}</option>)}
                </select>
              </Field>
              {airdropType !== 'token' && (
                <Field label="Contract Address">
                  <Input value={airdropContract} onChange={setAirdropContract} placeholder="0x…" />
                </Field>
              )}
              <Field label="Amount per wallet">
                <Input value={airdropAmount} onChange={setAirdropAmount} placeholder="1" />
              </Field>

              <div className={`p-3 rounded-lg border ${t.border} ${t.bgCard} space-y-3`}>
                <p className={`text-[10px] font-semibold uppercase tracking-widest text-violet-400`}>Batch Airdrop</p>
                <Field label="Wallet Addresses" hint="One address per line">
                  <Textarea value={airdropAddresses} onChange={setAirdropAddresses} placeholder={"0x…\n0x…\n…"} rows={5} />
                </Field>
                <button onClick={airdrop} disabled={minting || !airdropAddresses.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors">
                  {minting ? 'Queuing…' : 'Queue Airdrop'}
                </button>
              </div>

              {airdropType !== 'token' && (
                <div className={`p-3 rounded-lg border ${t.border} ${t.bgCard} space-y-3`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-widest text-violet-400`}>Single Transfer</p>
                  <Field label="Transfer To Address">
                    <Input value={transferTo} onChange={setTransferTo} placeholder="0x…" />
                  </Field>
                  <button onClick={transferNft} disabled={minting || !transferTo}
                    className={`px-4 py-2 rounded-lg text-xs font-medium border ${t.border} ${t.textMuted} hover:border-violet-400 hover:text-violet-400 transition-colors disabled:opacity-40`}>
                    {minting ? 'Transferring…' : 'Transfer NFT'}
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {result && (
        <div className={`px-3 py-2.5 rounded-lg text-xs font-mono ${result.startsWith('✓') ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {result}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Tokens (Portfolio) ──────────────────────────────────────────────────

const PORTFOLIO_NETWORKS = [
  { value: 'eth-mainnet', label: 'Ethereum' },
  { value: 'base-mainnet', label: 'Base' },
  { value: 'polygon-mainnet', label: 'Polygon' },
  { value: 'solana-mainnet', label: 'Solana' },
  { value: 'opt-mainnet', label: 'Optimism' },
  { value: 'arb-mainnet', label: 'Arbitrum' },
];

function TokensTab({ t }: { t: ReturnType<typeof useTheme> }) {
  const [address, setAddress] = useState('');
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>(['eth-mainnet', 'base-mainnet']);
  const [tokens, setTokens] = useState<PortfolioToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceSymbols, setPriceSymbols] = useState('');
  const [prices, setPrices] = useState<TokenPrice[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  function toggleNetwork(v: string) {
    setSelectedNetworks(prev =>
      prev.includes(v) ? prev.filter(n => n !== v) : [...prev, v]
    );
  }

  async function fetchPortfolio() {
    if (!address) return;
    setLoading(true); setError(null); setTokens([]);
    try {
      const nets = selectedNetworks.join(',');
      const data = await adminFetch<{ tokens: PortfolioToken[] }>(
        `/admin/alchemy/portfolio/tokens?address=${encodeURIComponent(address)}&networks=${encodeURIComponent(nets)}`
      );
      setTokens(data.tokens || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio');
    } finally { setLoading(false); }
  }

  async function fetchPrices() {
    const syms = priceSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!syms.length) return;
    setPriceLoading(true); setPriceError(null); setPrices([]);
    try {
      const data = await adminFetch<{ data: TokenPrice[] }>(
        '/admin/alchemy/prices/by-symbol',
        { method: 'POST', body: JSON.stringify({ symbols: syms }) }
      );
      // Normalize — Alchemy wraps in data.data array
      const arr: TokenPrice[] = Array.isArray(data) ? data : (data as { data?: TokenPrice[] }).data || [];
      setPrices(arr);
    } catch (e: unknown) {
      setPriceError(e instanceof Error ? e.message : 'Failed to fetch prices');
    } finally { setPriceLoading(false); }
  }

  const totalUsd = tokens.reduce((sum, t) => sum + (t.value_usd ?? 0), 0);

  return (
    <div className="space-y-6 p-6 overflow-y-auto">
      <div>
        <h2 className={`text-lg font-semibold ${t.heading}`}>Token Portfolio</h2>
        <p className={`text-xs mt-1 ${t.textMuted}`}>View ERC-20 / SPL token balances for any wallet via Alchemy Portfolio API</p>
      </div>

      <Section title="Wallet Lookup">
        <Field label="Wallet Address">
          <Input value={address} onChange={setAddress} placeholder="0x… or Solana address (base58)" />
        </Field>
        <div>
          <p className={`text-[10px] font-medium mb-2 ${t.textMuted}`}>Networks</p>
          <div className="flex flex-wrap gap-2">
            {PORTFOLIO_NETWORKS.map(n => (
              <button key={n.value} onClick={() => toggleNetwork(n.value)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                  selectedNetworks.includes(n.value)
                    ? 'bg-violet-500/20 text-violet-400 border-violet-500/50'
                    : `${t.bgCard} ${t.textMuted} ${t.border} hover:border-violet-500/40`
                }`}>
                {n.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={fetchPortfolio} disabled={loading || !address}
          className="mt-1 px-4 py-2 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors">
          {loading ? 'Loading…' : 'Fetch Portfolio'}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </Section>

      {tokens.length > 0 && (
        <Section title={`Token Balances (${tokens.length} tokens${totalUsd > 0 ? ` · $${totalUsd.toFixed(2)}` : ''})`}>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {tokens.map((tok, i) => (
              <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border ${t.border} ${t.bgCard}`}>
                {tok.logo ? (
                  <img src={tok.logo} alt={tok.symbol} className="w-6 h-6 rounded-full flex-shrink-0 object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full flex-shrink-0 bg-violet-500/20 flex items-center justify-center">
                    <span className={`text-[8px] font-bold text-violet-400`}>{(tok.symbol || '?').slice(0, 2)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-xs font-semibold ${t.text}`}>{tok.symbol}</span>
                    <span className={`text-[10px] ${t.textMuted} truncate`}>{tok.name}</span>
                  </div>
                  <p className={`text-[10px] ${t.textMuted}`}>{tok.network}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-xs font-mono ${t.text}`}>
                    {parseFloat(tok.balance || '0').toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </p>
                  {tok.value_usd != null && (
                    <p className={`text-[10px] ${t.textMuted}`}>${tok.value_usd.toFixed(2)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Token Price Lookup">
        <Field label="Symbols (comma-separated)" hint="e.g. ETH, USDC, ONTR">
          <Input value={priceSymbols} onChange={setPriceSymbols} placeholder="ETH, USDC, MATIC" />
        </Field>
        <button onClick={fetchPrices} disabled={priceLoading || !priceSymbols}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors">
          {priceLoading ? 'Fetching…' : 'Get Prices'}
        </button>
        {priceError && <p className="text-xs text-red-400">{priceError}</p>}
        {prices.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {prices.map((p, i) => (
              <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${t.border} ${t.bgCard}`}>
                <span className={`text-xs font-semibold ${t.text}`}>{p.symbol}</span>
                <div className="text-right">
                  <span className={`text-xs font-mono text-violet-400`}>${parseFloat(p.price || '0').toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                  {p.currency && p.currency !== 'USD' && (
                    <span className={`ml-1 text-[10px] ${t.textMuted}`}>{p.currency}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function AlchemyApp() {
  const t = useTheme();
  const [tab, setTab] = useState<TabId>('api-keys');

  const content: Record<TabId, React.ReactNode> = {
    'api-keys': <ApiKeysTab t={t} />,
    'nft': <NftTab t={t} />,
    'chains': <ChainsTab t={t} />,
    'contracts': <ContractsTab t={t} />,
    'access': <AccessTab t={t} />,
    'wallet': <WalletTab t={t} />,
    'connectkit': <ConnectKitTab t={t} />,
    'runnercoin': <RunnerCoinTab t={t} />,
    'mint': <MintTab t={t} />,
    'tokens': <TokensTab t={t} />,
    'jwt': <JwtTab t={t} />,
  };

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar active={tab} onChange={setTab} t={t} />
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {content[tab]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
