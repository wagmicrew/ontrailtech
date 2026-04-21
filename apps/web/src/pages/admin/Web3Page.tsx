import { useState, useEffect } from 'react';
import { useTheme } from '../../webos/core/theme-store';

const API = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';

async function adminFetch(path: string, options: RequestInit = {}) {
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

const SECTIONS = ['mint', 'contracts', 'chains', 'connectkit', 'runnercoin'] as const;
type Section = typeof SECTIONS[number];

const SECTION_LABELS: Record<Section, { label: string; icon: string; desc: string }> = {
  mint: { label: 'Mint & Airdrop', icon: '🪙', desc: 'Mint RunnerTokens or airdrop to wallets' },
  contracts: { label: 'Contract Publisher', icon: '📃', desc: 'Deploy or link Solidity contracts' },
  chains: { label: 'Chain Setup', icon: '⛓', desc: 'Configure supported chains & RPC endpoints' },
  connectkit: { label: 'ConnectKit', icon: '🔌', desc: 'ConnectKit / WalletConnect credentials' },
  runnercoin: { label: 'RunnerCoin', icon: '🏃', desc: 'RunnerCoin token parameters and bonding curve' },
};

export default function Web3Page() {
  const t = useTheme();
  const [section, setSection] = useState<Section>('mint');

  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-semibold ${t.heading}`}>Web3</h2>
        <p className={`text-sm mt-1 ${t.textMuted}`}>Token minting, smart contracts, and chain configuration</p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 flex-wrap">
        {SECTIONS.map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${section === s ? 'bg-green-500 text-white border-green-500 shadow-sm' : `${t.bgCard} ${t.border} ${t.textMuted} hover:border-green-300 hover:text-green-500`}`}>
            <span>{SECTION_LABELS[s].icon}</span>
            {SECTION_LABELS[s].label}
          </button>
        ))}
      </div>

      {section === 'mint' && <MintSection />}
      {section === 'contracts' && <ContractsSection />}
      {section === 'chains' && <ChainsSection />}
      {section === 'connectkit' && <ConnectKitSection />}
      {section === 'runnercoin' && <RunnerCoinSection />}
    </div>
  );
}

/* ── Mint & Airdrop ── */
function MintSection() {
  const [mintTo, setMintTo] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [airdropList, setAirdropList] = useState('');
  const [airdropAmount, setAirdropAmount] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const doMint = async () => {
    setLoading(true); setError(''); setResult('');
    try {
      const data = await adminFetch('/admin/web3/mint', {
        method: 'POST',
        body: JSON.stringify({ to: mintTo, amount: Number(mintAmount) }),
      });
      setResult(`✅ Minted ${mintAmount} tokens to ${mintTo}\nTx: ${data.tx_hash || '—'}`);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const doAirdrop = async () => {
    setLoading(true); setError(''); setResult('');
    try {
      const addresses = airdropList.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      const data = await adminFetch('/admin/web3/airdrop', {
        method: 'POST',
        body: JSON.stringify({ addresses, amount_each: Number(airdropAmount) }),
      });
      setResult(`✅ Airdropped to ${data.count} addresses`);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card title="Single Mint" icon="🪙">
        <div className="space-y-3">
          <InputField label="Recipient wallet address" value={mintTo} onChange={setMintTo} placeholder="0x…" />
          <InputField label="Amount (tokens)" value={mintAmount} onChange={setMintAmount} type="number" placeholder="100" />
          <GreenButton onClick={doMint} loading={loading} disabled={!mintTo || !mintAmount}>Mint Tokens</GreenButton>
        </div>
      </Card>

      <Card title="Airdrop" icon="🚀">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Wallet addresses (one per line or comma-separated)</label>
            <textarea value={airdropList} onChange={e => setAirdropList(e.target.value)}
              rows={5} placeholder="0x1234…&#10;0xabcd…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400" />
          </div>
          <InputField label="Amount per wallet" value={airdropAmount} onChange={setAirdropAmount} type="number" placeholder="10" />
          <GreenButton onClick={doAirdrop} loading={loading} disabled={!airdropList || !airdropAmount}>Start Airdrop</GreenButton>
        </div>
      </Card>

      {(result || error) && (
        <div className={`lg:col-span-2 rounded-xl p-4 text-sm font-mono whitespace-pre-wrap ${error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
          {error || result}
        </div>
      )}
    </div>
  );
}

/* ── Contract Publisher ── */
function ContractsSection() {
  const t = useTheme();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [abi, setAbi] = useState('');
  const [bytecode, setBytecode] = useState('');
  const [chainId, setChainId] = useState('1');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);

  useEffect(() => {
    adminFetch('/admin/web3/contracts').then(setContracts).catch(() => {});
  }, []);

  const publish = async () => {
    setLoading(true); setError(''); setResult('');
    try {
      let parsedAbi;
      try { parsedAbi = JSON.parse(abi); } catch { throw new Error('Invalid ABI JSON'); }
      const data = await adminFetch('/admin/web3/contracts', {
        method: 'POST',
        body: JSON.stringify({ name, address, abi: parsedAbi, bytecode, chain_id: Number(chainId) }),
      });
      setResult(`✅ Contract "${data.name}" registered at ${data.address}`);
      const updated = await adminFetch('/admin/web3/contracts');
      setContracts(updated);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <Card title="Register / Deploy Contract" icon="📃">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InputField label="Contract name" value={name} onChange={setName} placeholder="RunnerToken" />
          <InputField label="Chain ID" value={chainId} onChange={setChainId} type="number" placeholder="1" />
          <div className="md:col-span-2">
            <InputField label="Deployed address (leave blank to deploy)" value={address} onChange={setAddress} placeholder="0x…" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">ABI (JSON)</label>
            <textarea value={abi} onChange={e => setAbi(e.target.value)} rows={6} placeholder='[{"type":"function",…}]'
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Bytecode (optional, for new deploy)</label>
            <textarea value={bytecode} onChange={e => setBytecode(e.target.value)} rows={3} placeholder="0x608060…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400" />
          </div>
          <div className="md:col-span-2">
            <GreenButton onClick={publish} loading={loading} disabled={!name || !abi}>
              {address ? 'Register Contract' : 'Deploy & Register'}
            </GreenButton>
          </div>
        </div>
        {(result || error) && (
          <div className={`mt-3 rounded-lg p-3 text-sm ${error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>{error || result}</div>
        )}
      </Card>

      {contracts.length > 0 && (
        <Card title="Registered Contracts" icon="📋">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className={`border-b ${t.border}`}>
                {['Name', 'Address', 'Chain', 'Registered'].map(h => (
                  <th key={h} className={`text-left pb-2 text-xs font-semibold uppercase tracking-wide pr-4 ${t.sectionLabel}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody className={`divide-y ${t.divider}`}>
                {contracts.map((c: any) => (
                  <tr key={c.id} className={t.tableHover}>
                    <td className={`py-2.5 pr-4 font-medium text-sm ${t.text}`}>{c.name}</td>
                    <td className={`py-2.5 pr-4 font-mono text-xs ${t.textMuted}`}>{c.address?.slice(0, 10)}…{c.address?.slice(-6)}</td>
                    <td className={`py-2.5 pr-4 text-xs ${t.textMuted}`}>{c.chain_id}</td>
                    <td className={`py-2.5 text-xs ${t.textMuted}`}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── Chain Setup ── */
function ChainsSection() {
  const t = useTheme();
  const [chains, setChains] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', chain_id: '', rpc_url: '', explorer_url: '', native_currency: 'ETH', is_testnet: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    adminFetch('/admin/web3/chains').then(setChains).catch(() => {});
  }, []);

  const addChain = async () => {
    setError(''); setSuccess('');
    try {
      await adminFetch('/admin/web3/chains', {
        method: 'POST',
        body: JSON.stringify({ ...form, chain_id: Number(form.chain_id) }),
      });
      setSuccess('Chain added');
      setForm({ name: '', chain_id: '', rpc_url: '', explorer_url: '', native_currency: 'ETH', is_testnet: false });
      const updated = await adminFetch('/admin/web3/chains');
      setChains(updated);
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-5">
      <Card title="Add Chain" icon="⛓">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InputField label="Chain name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Ethereum" />
          <InputField label="Chain ID" value={form.chain_id} onChange={v => setForm(f => ({ ...f, chain_id: v }))} type="number" placeholder="1" />
          <div className="md:col-span-2">
            <InputField label="RPC URL" value={form.rpc_url} onChange={v => setForm(f => ({ ...f, rpc_url: v }))} placeholder="https://mainnet.infura.io/v3/…" />
          </div>
          <InputField label="Explorer URL" value={form.explorer_url} onChange={v => setForm(f => ({ ...f, explorer_url: v }))} placeholder="https://etherscan.io" />
          <InputField label="Native currency" value={form.native_currency} onChange={v => setForm(f => ({ ...f, native_currency: v }))} placeholder="ETH" />
          <div className="flex items-center gap-2">
            <input id="is-testnet" type="checkbox" checked={form.is_testnet} onChange={e => setForm(f => ({ ...f, is_testnet: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-green-500 focus:ring-green-400" />
            <label htmlFor="is-testnet" className="text-sm text-gray-600">Testnet</label>
          </div>
          <div className="md:col-span-2">
            <GreenButton onClick={addChain} disabled={!form.name || !form.chain_id || !form.rpc_url}>Add Chain</GreenButton>
          </div>
        </div>
        {(error || success) && (
          <div className={`mt-3 rounded-lg p-3 text-sm ${error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>{error || success}</div>
        )}
      </Card>

      {chains.length > 0 && (
        <Card title="Configured Chains" icon="📡">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chains.map((c: any) => (
              <div key={c.id} className={`border rounded-xl p-4 hover:border-green-400/50 transition-colors ${t.border} ${t.bgCard}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-semibold text-sm ${t.heading}`}>{c.name}</span>
                  {c.is_testnet && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">testnet</span>}
                </div>
                <div className={`text-xs space-y-1 ${t.textMuted}`}>
                  <div>ID: <span className={`font-mono ${t.text}`}>{c.chain_id}</span></div>
                  <div className="truncate">RPC: <span className={`font-mono ${t.text}`}>{c.rpc_url}</span></div>
                  <div>Currency: <span className={`font-mono ${t.text}`}>{c.native_currency}</span></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── ConnectKit Setup ── */
function ConnectKitSection() {
  const [config, setConfig] = useState({ walletconnect_project_id: '', alchemy_id: '', infura_id: '', app_name: 'OnTrail', app_description: '', app_url: 'https://ontrail.tech', app_icon: '' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/admin/web3/connectkit').then(d => setConfig(c => ({ ...c, ...d }))).catch(() => {});
  }, []);

  const save = async () => {
    setSaved(false); setError('');
    try {
      await adminFetch('/admin/web3/connectkit', { method: 'PUT', body: JSON.stringify(config) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Card title="ConnectKit / WalletConnect Configuration" icon="🔌">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InputField label="WalletConnect Project ID" value={config.walletconnect_project_id} onChange={v => setConfig(c => ({ ...c, walletconnect_project_id: v }))} placeholder="your-wc-project-id" />
        <InputField label="Alchemy API Key" value={config.alchemy_id} onChange={v => setConfig(c => ({ ...c, alchemy_id: v }))} placeholder="alchemy-api-key" />
        <InputField label="Infura Project ID (optional)" value={config.infura_id} onChange={v => setConfig(c => ({ ...c, infura_id: v }))} placeholder="infura-project-id" />
        <InputField label="App Name" value={config.app_name} onChange={v => setConfig(c => ({ ...c, app_name: v }))} placeholder="OnTrail" />
        <div className="md:col-span-2">
          <InputField label="App Description" value={config.app_description} onChange={v => setConfig(c => ({ ...c, app_description: v }))} placeholder="Run. Earn. Own." />
        </div>
        <InputField label="App URL" value={config.app_url} onChange={v => setConfig(c => ({ ...c, app_url: v }))} placeholder="https://ontrail.tech" />
        <InputField label="App Icon URL" value={config.app_icon} onChange={v => setConfig(c => ({ ...c, app_icon: v }))} placeholder="https://ontrail.tech/icon.png" />
        <div className="md:col-span-2 flex items-center gap-3">
          <GreenButton onClick={save}>Save Configuration</GreenButton>
          {saved && <span className="text-sm text-green-600">✓ Saved</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </Card>
  );
}

/* ── RunnerCoin Setup ── */
function RunnerCoinSection() {
  const [config, setConfig] = useState({ token_name: 'RunnerCoin', token_symbol: 'RUN', total_supply: '1000000', bonding_curve_k: '0.0001', base_price: '0.001', tge_threshold: '10', contract_address: '', treasury_address: '' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/admin/web3/runnercoin').then(d => setConfig(c => ({ ...c, ...d }))).catch(() => {});
  }, []);

  const save = async () => {
    setSaved(false); setError('');
    try {
      await adminFetch('/admin/web3/runnercoin', { method: 'PUT', body: JSON.stringify(config) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Card title="RunnerCoin Token Configuration" icon="🏃">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InputField label="Token Name" value={config.token_name} onChange={v => setConfig(c => ({ ...c, token_name: v }))} placeholder="RunnerCoin" />
        <InputField label="Symbol" value={config.token_symbol} onChange={v => setConfig(c => ({ ...c, token_symbol: v }))} placeholder="RUN" />
        <InputField label="Total Supply" value={config.total_supply} onChange={v => setConfig(c => ({ ...c, total_supply: v }))} type="number" placeholder="1000000" />
        <InputField label="TGE Threshold (ETH)" value={config.tge_threshold} onChange={v => setConfig(c => ({ ...c, tge_threshold: v }))} type="number" placeholder="10" />
        <InputField label="Bonding Curve K Factor" value={config.bonding_curve_k} onChange={v => setConfig(c => ({ ...c, bonding_curve_k: v }))} placeholder="0.0001" />
        <InputField label="Base Price (ETH)" value={config.base_price} onChange={v => setConfig(c => ({ ...c, base_price: v }))} placeholder="0.001" />
        <div className="md:col-span-2">
          <InputField label="Contract Address" value={config.contract_address} onChange={v => setConfig(c => ({ ...c, contract_address: v }))} placeholder="0x…" />
        </div>
        <div className="md:col-span-2">
          <InputField label="Treasury Address" value={config.treasury_address} onChange={v => setConfig(c => ({ ...c, treasury_address: v }))} placeholder="0x…" />
        </div>
        <div className="md:col-span-2 flex items-center gap-3">
          <GreenButton onClick={save}>Save Configuration</GreenButton>
          {saved && <span className="text-sm text-green-600">✓ Saved</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </Card>
  );
}

/* ── Shared UI helpers ── */
function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <div className={`border rounded-2xl shadow-sm p-6 ${t.bgCard} ${t.border}`}>
      <h3 className={`text-base font-semibold mb-4 flex items-center gap-2 ${t.heading}`}>
        <span className="text-xl">{icon}</span>{title}
      </h3>
      {children}
    </div>
  );
}

function InputField({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  const t = useTheme();
  return (
    <div>
      <label className={`block text-xs font-medium mb-1.5 ${t.textMuted}`}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 ${t.inputBorder} ${t.inputBg} ${t.inputText}`} />
    </div>
  );
}

function GreenButton({ onClick, disabled, loading, children }: { onClick: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className="px-5 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
      {loading && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
      {children}
    </button>
  );
}
