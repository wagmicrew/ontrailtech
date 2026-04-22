import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '../../core/admin-fetch';
import { useTheme } from '../../core/theme-store';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'api-keys' | 'nft' | 'chains' | 'contracts' | 'access';

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
  const [abis, setAbis] = useState<ContractAbi[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', chain: 'base-mainnet', abi: '', bytecode: '' });
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContractAbi | null>(null);

  useEffect(() => {
    adminFetch<ContractAbi[]>('/admin/alchemy/contracts').then(setAbis).catch(() => {}).finally(() => setLoading(false));
  }, []);

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
            <p className={`text-xs mt-0.5 ${t.textMuted}`}>Publish ABIs and smart contract addresses</p>
          </div>
          <button
            onClick={() => setShowAdd(p => !p)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Contract'}
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
              <p className={`text-xs font-semibold ${t.heading}`}>New Contract</p>
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
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={publish}
                disabled={publishing || !form.name || !form.abi}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors"
              >
                {publishing ? 'Publishing…' : 'Publish ABI'}
              </button>
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
