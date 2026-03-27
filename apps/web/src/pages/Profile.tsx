import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type AuthUser } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type RunnerProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  headerImageUrl?: string | null;
  bio?: string | null;
  reputationScore: number;
  rank: number;
  tokenStatus: string;
  friendPass: {
    sold: number;
    maxSupply: number;
    currentPrice: string;
    currentPriceFiat: string;
    nextPrice: string;
  };
  stats: {
    totalSupporters: number;
    totalTips: string;
    tokenProgress: number;
  };
  activityFeed: Array<{
    type: string;
    username: string | null;
    amount: string | null;
    timeAgo: string;
  }>;
  auraLevel?: string;
  ancientSupporterCount?: number;
  totalAura?: string;
};

type StoreCatalog = {
  step_balance: number;
  items: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    item_type: string;
    step_cost: number;
    fulfillment_type: string;
    metadata: Record<string, unknown>;
  }>;
  purchases: Array<{
    id: string;
    item_slug: string;
    item_name: string;
    step_cost: number;
    status: string;
    fulfillment_wallet: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
};

type TabKey = 'overview' | 'edit' | 'store';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'edit', label: 'Edit Profile' },
  { key: 'store', label: 'Store' },
];

export default function Profile() {
  const { isConnected, username, refreshMe, login } = useAuth();
  const [searchParams] = useSearchParams();
  const runnerParam = searchParams.get('runner')?.trim().toLowerCase() || '';
  const viewingPublicRunner = !!runnerParam && runnerParam !== (username || '').toLowerCase();

  const [tab, setTab] = useState<TabKey>('overview');
  const [me, setMe] = useState<AuthUser | null>(null);
  const [runner, setRunner] = useState<RunnerProfile | null>(null);
  const [catalog, setCatalog] = useState<StoreCatalog | null>(null);
  const [form, setForm] = useState({
    username: '',
    email: '',
    bio: '',
    location: '',
    preferred_reward_wallet: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [purchasingSlug, setPurchasingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const publicDomain = useMemo(() => {
    const currentUsername = viewingPublicRunner ? runner?.username : me?.username;
    return currentUsername ? `https://${currentUsername}.ontrail.tech` : null;
  }, [me?.username, runner?.username, viewingPublicRunner]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (viewingPublicRunner) {
          const publicRunner = await api.getRunner(runnerParam);
          if (!cancelled) {
            setRunner(publicRunner);
            setMe(null);
            setCatalog(null);
          }
          return;
        }

        if (!isConnected) {
          if (!cancelled) {
            setMe(null);
            setRunner(null);
            setCatalog(null);
          }
          return;
        }

        const currentMe = await api.getMe();
        const requests: Array<Promise<unknown>> = [Promise.resolve(currentMe)];
        if (currentMe.username) {
          requests.push(api.getRunner(currentMe.username));
        } else {
          requests.push(Promise.resolve(null));
        }
        requests.push(api.getStoreCatalog());

        const [resolvedMe, resolvedRunner, resolvedCatalog] = await Promise.all(requests);

        if (!cancelled) {
          const typedMe = resolvedMe as AuthUser;
          setMe(typedMe);
          setRunner((resolvedRunner as RunnerProfile | null) || null);
          setCatalog(resolvedCatalog as StoreCatalog);
          setForm({
            username: typedMe.username || '',
            email: typedMe.email || '',
            bio: typedMe.bio || '',
            location: typedMe.location || '',
            preferred_reward_wallet: typedMe.preferred_reward_wallet || '',
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load profile');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isConnected, runnerParam, viewingPublicRunner]);

  async function reloadOwnProfile(message?: string) {
    const currentMe = await api.getMe();
    setMe(currentMe);
    setForm({
      username: currentMe.username || '',
      email: currentMe.email || '',
      bio: currentMe.bio || '',
      location: currentMe.location || '',
      preferred_reward_wallet: currentMe.preferred_reward_wallet || '',
    });

    const [nextRunner, nextCatalog] = await Promise.all([
      currentMe.username ? api.getRunner(currentMe.username) : Promise.resolve(null),
      api.getStoreCatalog(),
    ]);

    setRunner((nextRunner as RunnerProfile | null) || null);
    setCatalog(nextCatalog as StoreCatalog);
    await refreshMe();
    if (message) setNotice(message);
  }

  async function handleSaveProfile() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.updateMyProfile(form);
      await reloadOwnProfile('Profile updated');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File | null, type: 'profile' | 'header') {
    if (!file) return;
    setError(null);
    setNotice(null);

    try {
      if (type === 'profile') {
        setUploadingProfile(true);
        await api.uploadProfileImage(file);
        await reloadOwnProfile('Profile image updated');
      } else {
        setUploadingHeader(true);
        await api.uploadHeaderImage(file);
        await reloadOwnProfile('Header image updated');
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setUploadingProfile(false);
      setUploadingHeader(false);
    }
  }

  async function handlePurchase(itemSlug: string) {
    if (!catalog) return;
    setPurchasingSlug(itemSlug);
    setError(null);
    setNotice(null);
    try {
      const fulfillmentWallet = form.preferred_reward_wallet || me?.preferred_reward_wallet || me?.wallet_address || undefined;
      await api.purchaseStoreItem(itemSlug, fulfillmentWallet);
      await reloadOwnProfile('Store purchase completed');
    } catch (purchaseError) {
      setError(purchaseError instanceof Error ? purchaseError.message : 'Purchase failed');
    } finally {
      setPurchasingSlug(null);
    }
  }

  if (loading) {
    return <SectionShell><LoadingPanel label="Loading profile" /></SectionShell>;
  }

  if (viewingPublicRunner) {
    if (!runner) {
      return <SectionShell><EmptyState title="Runner not found" description="That runner profile is not available." /></SectionShell>;
    }

    return (
      <SectionShell>
        <PublicRunnerPanel runner={runner} publicDomain={publicDomain} />
      </SectionShell>
    );
  }

  if (!isConnected || !me) {
    return (
      <SectionShell>
        <EmptyState
          title="Runner profile"
          description="Connect your account to edit your runner profile, upload images, and spend your steps in the store."
          action={<button onClick={login} className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-600">Open sign in</button>}
        />
      </SectionShell>
    );
  }

  return (
    <SectionShell>
      <div className="space-y-6">
        <ProfileHero me={me} runner={runner} publicDomain={publicDomain} />

        {(error || notice) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {error || notice}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              onClick={() => setTab(entry.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${tab === entry.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewPanel me={me} runner={runner} />}

        {tab === 'edit' && (
          <EditPanel
            form={form}
            me={me}
            saving={saving}
            uploadingProfile={uploadingProfile}
            uploadingHeader={uploadingHeader}
            onChange={setForm}
            onSave={handleSaveProfile}
            onUpload={handleUpload}
          />
        )}

        {tab === 'store' && (
          <StorePanel
            me={me}
            catalog={catalog}
            purchasingSlug={purchasingSlug}
            onPurchase={handlePurchase}
          />
        )}
      </div>
    </SectionShell>
  );
}

function SectionShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl">{children}</div>;
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-[32px] border border-slate-200 bg-white">
      <div className="flex items-center gap-3 text-slate-500">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        <span>{label}...</span>
      </div>
    </div>
  );
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-white px-8 py-16 text-center shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">OnTrail</p>
      <h1 className="mb-3 text-3xl font-black text-slate-900">{title}</h1>
      <p className="mx-auto mb-8 max-w-2xl text-sm text-slate-500">{description}</p>
      {action}
    </div>
  );
}

function ProfileHero({ me, runner, publicDomain }: { me: AuthUser; runner: RunnerProfile | null; publicDomain: string | null }) {
  const headerImage = me.header_image_url || runner?.headerImageUrl || '';
  const avatar = me.avatar_url || runner?.avatarUrl || '';

  return (
    <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
      <div
        className="relative min-h-[220px] bg-gradient-to-br from-slate-950 via-emerald-900 to-amber-500"
        style={headerImage ? { backgroundImage: `linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55)), url(${headerImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.2),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.16),transparent_22%)]" />
        <div className="relative flex flex-col gap-6 px-8 py-8 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-5">
            <Avatar avatar={avatar} username={me.username || me.email || 'runner'} size="lg" />
            <div className="pb-1 text-white">
              <p className="mb-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/85 backdrop-blur">Runner control panel</p>
              <h1 className="text-3xl font-black tracking-tight">{me.username || 'Claim your runnername'}</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/80">
                {me.bio || 'Set your public profile, upload your visuals, and spend collected steps on premium profile and web3 items.'}
              </p>
            </div>
          </div>

          <div className="grid gap-3 rounded-[28px] bg-white/12 p-4 text-white backdrop-blur md:min-w-[280px]">
            <Metric label="Steps available" value={(me.step_balance || 0).toLocaleString()} />
            <Metric label="Profile image changes" value={String(me.profile_image_upload_credits || 0)} />
            <Metric label="Header uploads" value={String(me.header_image_upload_credits || 0)} />
            <Metric label="Premium visibility" value={me.profile_visibility_boost_until ? 'Active' : 'Inactive'} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-8 py-6 md:grid-cols-4">
        <StatTile label="Email" value={me.email || 'Not set'} />
        <StatTile label="Reward wallet" value={me.preferred_reward_wallet || me.wallet_address || 'Not set'} mono />
        <StatTile label="Runner domain" value={publicDomain?.replace('https://', '') || 'No username yet'} />
        <StatTile label="Aura" value={runner?.auraLevel || 'None'} />
      </div>
    </div>
  );
}

function OverviewPanel({ me, runner }: { me: AuthUser; runner: RunnerProfile | null }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <Panel title="Public runner preview" eyebrow="Live profile data">
          {runner ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <Avatar avatar={runner.avatarUrl} username={runner.username} size="md" />
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">{runner.username}</h2>
                    <p className="text-sm text-slate-500">{runner.bio || 'No public bio added yet.'}</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                  <div>Rank #{runner.rank}</div>
                  <div>{runner.reputationScore.toFixed(1)} rep</div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <StatTile label="FriendPass sold" value={`${runner.friendPass.sold}/${runner.friendPass.maxSupply}`} />
                <StatTile label="Current price" value={`${runner.friendPass.currentPrice} ETH`} />
                <StatTile label="Supporters" value={String(runner.stats.totalSupporters)} />
                <StatTile label="Token progress" value={`${runner.stats.tokenProgress}%`} />
              </div>

              <div className="rounded-3xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
                  <span>Next FriendPass price</span>
                  <span>{runner.friendPass.nextPrice} ETH</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400" style={{ width: `${Math.min((runner.friendPass.sold / runner.friendPass.maxSupply) * 100, 100)}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Claim a username to create your public runner profile.</p>
          )}
        </Panel>

        <Panel title="Activity pulse" eyebrow="Recent public signals">
          <div className="space-y-3">
            {(runner?.activityFeed || []).slice(0, 6).map((item, index) => (
              <div key={`${item.type}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{item.username || 'Someone'} · {item.type.replace('_', ' ')}</p>
                  <p className="text-slate-500">{item.amount ? `${item.amount} ETH` : 'Network activity'}</p>
                </div>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{item.timeAgo}</span>
              </div>
            ))}
            {(!runner || runner.activityFeed.length === 0) && <p className="text-sm text-slate-500">No activity has been indexed yet.</p>}
          </div>
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel title="Store-ready credits" eyebrow="What you can use right now">
          <div className="grid gap-3">
            <CreditRow label="Profile image changes" value={me.profile_image_upload_credits || 0} />
            <CreditRow label="Header uploads" value={me.header_image_upload_credits || 0} />
            <CreditRow label="AI avatar slots" value={me.ai_avatar_credits || 0} />
          </div>
        </Panel>

        <Panel title="Delivery wallet" eyebrow="Used for giveaways, mintspots, TGE access">
          <p className="text-sm text-slate-500">{me.preferred_reward_wallet || me.wallet_address || 'No reward wallet saved yet.'}</p>
        </Panel>
      </div>
    </div>
  );
}

function EditPanel({
  form,
  me,
  saving,
  uploadingProfile,
  uploadingHeader,
  onChange,
  onSave,
  onUpload,
}: {
  form: { username: string; email: string; bio: string; location: string; preferred_reward_wallet: string };
  me: AuthUser;
  saving: boolean;
  uploadingProfile: boolean;
  uploadingHeader: boolean;
  onChange: Dispatch<SetStateAction<{ username: string; email: string; bio: string; location: string; preferred_reward_wallet: string }>>;
  onSave: () => Promise<void>;
  onUpload: (file: File | null, type: 'profile' | 'header') => Promise<void>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Edit your runner profile" eyebrow="Saved to your account">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Runner username">
            <input value={form.username} onChange={(event) => onChange((current) => ({ ...current, username: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" placeholder="hansen" />
          </Field>
          <Field label="Email">
            <input value={form.email} onChange={(event) => onChange((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" placeholder="runner@ontrail.tech" />
          </Field>
          <Field label="Location">
            <input value={form.location} onChange={(event) => onChange((current) => ({ ...current, location: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" placeholder="Gothenburg" />
          </Field>
          <Field label="Preferred reward wallet">
            <input value={form.preferred_reward_wallet} onChange={(event) => onChange((current) => ({ ...current, preferred_reward_wallet: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" placeholder="0x..." />
          </Field>
          <div className="md:col-span-2">
            <Field label="Bio">
              <textarea value={form.bio} onChange={(event) => onChange((current) => ({ ...current, bio: event.target.value }))} className="min-h-[140px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" placeholder="What should people know when they land on your runner profile?" />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onSave} disabled={saving} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </Panel>

      <Panel title="Profile visuals" eyebrow="First custom upload works immediately. Later changes use store credits.">
        <div className="space-y-6">
          <UploadCard
            title="Profile image"
            description={`Remaining paid changes: ${me.profile_image_upload_credits || 0}`}
            imageUrl={me.avatar_url || null}
            loading={uploadingProfile}
            onFile={(file) => onUpload(file, 'profile')}
          />

          <UploadCard
            title="Header image"
            description={`Remaining paid changes: ${me.header_image_upload_credits || 0}`}
            imageUrl={me.header_image_url || null}
            loading={uploadingHeader}
            onFile={(file) => onUpload(file, 'header')}
            banner
          />
        </div>
      </Panel>
    </div>
  );
}

function StorePanel({ me, catalog, purchasingSlug, onPurchase }: { me: AuthUser; catalog: StoreCatalog | null; purchasingSlug: string | null; onPurchase: (itemSlug: string) => Promise<void> }) {
  if (!catalog) {
    return <Panel title="Store" eyebrow="Spend collected steps"><p className="text-sm text-slate-500">Store data is not available right now.</p></Panel>;
  }

  const categories: Array<{ key: string; label: string }> = [
    { key: 'profile', label: 'Profile items' },
    { key: 'web3', label: 'Web3 items' },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <Panel title="Step store" eyebrow={`${catalog.step_balance.toLocaleString()} steps available`}>
        <div className="space-y-8">
          {categories.map((category) => {
            const items = catalog.items.filter((item) => item.category === category.key);
            return (
              <div key={category.key}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{category.label}</h3>
                <div className="grid gap-4">
                  {items.map((item) => {
                    const needsWallet = item.fulfillment_type === 'wallet_required';
                    const disabled = catalog.step_balance < item.step_cost || (needsWallet && !(me.preferred_reward_wallet || me.wallet_address));
                    return (
                      <div key={item.slug} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                        <div className="mb-3 flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-lg font-bold text-slate-900">{item.name}</h4>
                            <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                          </div>
                          <div className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">{item.step_cost.toLocaleString()} steps</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                          <span>{item.item_type.replace('_', ' ')}</span>
                          <span>{item.fulfillment_type.replace('_', ' ')}</span>
                        </div>
                        <div className="mt-4 flex justify-end">
                          <button
                            onClick={() => onPurchase(item.slug)}
                            disabled={disabled || purchasingSlug === item.slug}
                            className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            {purchasingSlug === item.slug ? 'Purchasing...' : needsWallet ? 'Buy to saved wallet' : 'Buy item'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel title="Purchase history" eyebrow="Latest store activity">
          <div className="space-y-3">
            {catalog.purchases.map((purchase) => (
              <div key={purchase.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800">{purchase.item_name}</p>
                    <p className="text-slate-500">{new Date(purchase.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{purchase.step_cost.toLocaleString()} steps</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{purchase.status.replace('_', ' ')}</p>
                  </div>
                </div>
              </div>
            ))}
            {catalog.purchases.length === 0 && <p className="text-sm text-slate-500">No store purchases yet.</p>}
          </div>
        </Panel>

        <Panel title="Wallet delivery" eyebrow="For giveaways, mintspots, tokens, Friendspass, and TGE access">
          <p className="text-sm text-slate-500">{me.preferred_reward_wallet || me.wallet_address || 'Save a wallet in Edit Profile before buying web3 items.'}</p>
        </Panel>
      </div>
    </div>
  );
}

function PublicRunnerPanel({ runner, publicDomain }: { runner: RunnerProfile; publicDomain: string | null }) {
  return (
    <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
      <div
        className="min-h-[220px] bg-gradient-to-br from-slate-950 via-emerald-900 to-amber-500 px-8 py-8 text-white"
        style={runner.headerImageUrl ? { backgroundImage: `linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55)), url(${runner.headerImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-5">
            <Avatar avatar={runner.avatarUrl} username={runner.username} size="lg" />
            <div>
              <p className="mb-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/85 backdrop-blur">Public runner view</p>
              <h1 className="text-3xl font-black">{runner.username}</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/80">{runner.bio || 'This runner has not added a public bio yet.'}</p>
            </div>
          </div>
          <div className="rounded-[28px] bg-white/12 px-5 py-4 text-sm backdrop-blur">
            <div>Rank #{runner.rank}</div>
            <div>{runner.reputationScore.toFixed(1)} reputation</div>
            <div>{runner.auraLevel || 'None'} aura</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-8 py-6 md:grid-cols-4">
        <StatTile label="FriendPass sold" value={`${runner.friendPass.sold}/${runner.friendPass.maxSupply}`} />
        <StatTile label="Current price" value={`${runner.friendPass.currentPrice} ETH`} />
        <StatTile label="Supporters" value={String(runner.stats.totalSupporters)} />
        <StatTile label="Public domain" value={publicDomain?.replace('https://', '') || `${runner.username}.ontrail.tech`} />
      </div>
    </div>
  );
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">{eyebrow}</p>
      <h2 className="mb-5 text-2xl font-black text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}

function UploadCard({ title, description, imageUrl, loading, onFile, banner }: { title: string; description: string; imageUrl: string | null; loading: boolean; onFile: (file: File | null) => void; banner?: boolean }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <div className={`mb-4 overflow-hidden rounded-2xl bg-slate-200 ${banner ? 'aspect-[16/5]' : 'aspect-square max-w-[180px]'}`}>
        {imageUrl ? <img src={imageUrl} alt={title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-slate-500">No image uploaded</div>}
      </div>
      <label className="inline-flex cursor-pointer rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
        {loading ? 'Uploading...' : 'Choose image'}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => onFile(event.target.files?.[0] || null)} disabled={loading} />
      </label>
    </div>
  );
}

function Avatar({ avatar, username, size }: { avatar: string | null; username: string; size: 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-28 w-28 text-4xl' : 'h-20 w-20 text-3xl';
  return (
    <div className={`overflow-hidden rounded-full bg-slate-900 ${sizeClass} flex items-center justify-center font-black text-white ring-4 ring-white/30`}>
      {avatar ? <img src={avatar} alt={`${username} avatar`} className="h-full w-full object-cover" /> : username[0]?.toUpperCase() || '?'}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2 text-sm last:border-b-0 last:pb-0">
      <span className="text-white/75">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function StatTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-3xl bg-slate-50 px-4 py-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className={`text-sm font-semibold text-slate-900 ${mono ? 'font-mono break-all text-xs' : ''}`}>{value}</p>
    </div>
  );
}

function CreditRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}