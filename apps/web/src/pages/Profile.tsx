import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type AuthUser } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const PROFILE_CROP_SIZE = 320;
const MINTED_POSTS_STORAGE_PREFIX = 'ontrail_minted_posts_v2';

type CropPosition = {
  x: number;
  y: number;
};

type ProfileImageDraft = {
  file: File;
  previewUrl: string;
};

type RunnerProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  headerImageUrl?: string | null;
  bio?: string | null;
  wallet_address?: string | null;
  reputationScore: number;
  rank: number;
  tokenStatus: string;
  route_count?: number;
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

type ProfileFormState = {
  username: string;
  email: string;
  bio: string;
  location: string;
  preferred_reward_wallet: string;
};

type MintedPost = {
  id: string;
  ownerKey: string;
  tokenId: string;
  hash: string;
  author: string;
  text: string;
  mintedAt: string;
  trailName: string;
  tipsEth: string;
  likes: number;
  metadata: {
    text: string;
    charCount: number;
    location: string;
  };
};

type AvatarPreset = {
  id: string;
  label: string;
  gradient: [string, string, string];
  accent: string;
};

type LinkedWallet = {
  id: string;
  wallet_address: string;
  wallet_type: string;
  created_at: string | null;
};

type ColorOverlay = {
  id: string;
  label: string;
  from: string;
  to: string;
  angle: number;
};

type TabKey = 'overview' | 'edit' | 'social' | 'store' | 'wallets';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'edit', label: 'Edit Profile' },
  { key: 'social', label: 'Minted Posts' },
  { key: 'store', label: 'Store' },
  { key: 'wallets', label: 'Wallets' },
];

const COLOR_OVERLAYS: ColorOverlay[] = [
  { id: 'none',    label: 'Original', from: 'rgba(0,0,0,0)',         to: 'rgba(0,0,0,0)',          angle: 135 },
  { id: 'sunset',  label: 'Sunset',   from: 'rgba(255,80,0,0.42)',   to: 'rgba(220,0,100,0.38)',   angle: 135 },
  { id: 'ocean',   label: 'Ocean',    from: 'rgba(0,100,220,0.42)',  to: 'rgba(0,210,200,0.35)',   angle: 135 },
  { id: 'forest',  label: 'Forest',   from: 'rgba(0,155,70,0.40)',   to: 'rgba(0,50,20,0.32)',     angle: 135 },
  { id: 'neon',    label: 'Neon',     from: 'rgba(110,0,255,0.38)',  to: 'rgba(0,255,190,0.32)',   angle: 135 },
  { id: 'ember',   label: 'Ember',    from: 'rgba(255,50,0,0.44)',   to: 'rgba(255,210,0,0.28)',   angle: 135 },
  { id: 'silver',  label: 'Silver',   from: 'rgba(180,210,240,0.38)', to: 'rgba(80,100,130,0.32)',  angle: 135 },
  { id: 'rose',    label: 'Rose',     from: 'rgba(240,30,130,0.38)', to: 'rgba(255,150,80,0.30)',  angle: 135 },
];

const IPFS_JWT_KEY = 'ontrail_ipfs_jwt';

const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'aurora', label: 'Aurora', gradient: ['#0f172a', '#0ea5e9', '#34d399'], accent: 'from-sky-500 to-emerald-400' },
  { id: 'sunrise', label: 'Sunrise', gradient: ['#7c2d12', '#f97316', '#fde047'], accent: 'from-orange-500 to-amber-300' },
  { id: 'violet', label: 'Violet', gradient: ['#312e81', '#8b5cf6', '#ec4899'], accent: 'from-violet-500 to-fuchsia-400' },
  { id: 'midnight', label: 'Midnight', gradient: ['#111827', '#1d4ed8', '#22c55e'], accent: 'from-slate-700 to-emerald-400' },
];

function centerCropPosition(width: number, height: number) {
  return {
    x: (PROFILE_CROP_SIZE - width) / 2,
    y: (PROFILE_CROP_SIZE - height) / 2,
  };
}

function clampCropPosition(position: CropPosition, width: number, height: number): CropPosition {
  const minX = width > PROFILE_CROP_SIZE ? PROFILE_CROP_SIZE - width : (PROFILE_CROP_SIZE - width) / 2;
  const maxX = width > PROFILE_CROP_SIZE ? 0 : (PROFILE_CROP_SIZE - width) / 2;
  const minY = height > PROFILE_CROP_SIZE ? PROFILE_CROP_SIZE - height : (PROFILE_CROP_SIZE - height) / 2;
  const maxY = height > PROFILE_CROP_SIZE ? 0 : (PROFILE_CROP_SIZE - height) / 2;

  return {
    x: Math.min(maxX, Math.max(minX, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y)),
  };
}

function toSafeNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatEth(value: string | number) {
  return `${toSafeNumber(value).toFixed(3)} ETH`;
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function createOwnerKey(input: { id?: string | null; username?: string | null; email?: string | null } | null, fallback = 'guest') {
  return input?.id || input?.username || input?.email || fallback;
}

function createMintHash(text: string) {
  const source = `${text}-${Date.now()}-${Math.random()}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `0x${hash.toString(16).padStart(8, '0')}${Date.now().toString(16).slice(-8)}`;
}

function createAvatarDataUri(preset: AvatarPreset, username: string) {
  const initials = username.trim().slice(0, 2).toUpperCase() || 'OT';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${preset.gradient[0]}" />
          <stop offset="50%" stop-color="${preset.gradient[1]}" />
          <stop offset="100%" stop-color="${preset.gradient[2]}" />
        </linearGradient>
      </defs>
      <rect width="480" height="480" rx="120" fill="url(#g)" />
      <circle cx="370" cy="110" r="64" fill="rgba(255,255,255,0.24)" />
      <circle cx="120" cy="390" r="92" fill="rgba(255,255,255,0.16)" />
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="160" font-weight="700" fill="white">${initials}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadMintedPosts(ownerKey: string) {
  try {
    const raw = localStorage.getItem(`${MINTED_POSTS_STORAGE_PREFIX}:${ownerKey}`);
    if (!raw) return [] as MintedPost[];
    const parsed = JSON.parse(raw) as MintedPost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as MintedPost[];
  }
}

function persistMintedPosts(ownerKey: string, posts: MintedPost[]) {
  localStorage.setItem(`${MINTED_POSTS_STORAGE_PREFIX}:${ownerKey}`, JSON.stringify(posts));
}

export default function Profile() {
  const { isConnected, username, refreshMe, login } = useAuth();
  const [searchParams] = useSearchParams();
  const runnerParam = searchParams.get('runner')?.trim().toLowerCase() || '';
  const viewingPublicRunner = !!runnerParam && runnerParam !== (username || '').toLowerCase();

  const [tab, setTab] = useState<TabKey>('overview');
  const [me, setMe] = useState<AuthUser | null>(null);
  const [runner, setRunner] = useState<RunnerProfile | null>(null);
  const [catalog, setCatalog] = useState<StoreCatalog | null>(null);
  const [form, setForm] = useState<ProfileFormState>({
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
  const [profileImageDraft, setProfileImageDraft] = useState<ProfileImageDraft | null>(null);
  const [purchasingSlug, setPurchasingSlug] = useState<string | null>(null);
  const [mintedPosts, setMintedPosts] = useState<MintedPost[]>([]);
  const [mintingText, setMintingText] = useState('');
  const [mintingPost, setMintingPost] = useState(false);
  const [fiatAmount, setFiatAmount] = useState(120);
  const [tipAmount, setTipAmount] = useState('0.015');
  const [selectingAvatarId, setSelectingAvatarId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wallets, setWallets] = useState<LinkedWallet[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [removingAvatarLoading, setRemovingAvatarLoading] = useState(false);

  const publicDomain = useMemo(() => {
    const currentUsername = viewingPublicRunner ? runner?.username : me?.username;
    return currentUsername ? `https://${currentUsername}.ontrail.tech` : null;
  }, [me?.username, runner?.username, viewingPublicRunner]);

  const profileOwnerKey = useMemo(() => {
    if (viewingPublicRunner) {
      return createOwnerKey({ id: runner?.id, username: runner?.username }, runnerParam || 'public-runner');
    }
    return createOwnerKey({ id: me?.id, username: me?.username, email: me?.email }, 'my-profile');
  }, [me?.email, me?.id, me?.username, runner?.id, runner?.username, runnerParam, viewingPublicRunner]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (viewingPublicRunner) {
          const publicRunner = await api.getRunner(runnerParam);
          if (!cancelled) {
            setRunner(publicRunner as RunnerProfile);
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

  useEffect(() => {
    setMintedPosts(loadMintedPosts(profileOwnerKey));
  }, [profileOwnerKey]);

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

  async function handleAvatarPresetSelect(preset: AvatarPreset) {
    if (!me) return;

    setError(null);
    setNotice(null);
    setSelectingAvatarId(preset.id);
    try {
      const avatarUrl = createAvatarDataUri(preset, form.username || me.username || me.email || 'OT');
      await api.updateAvatar(avatarUrl);
      await reloadOwnProfile('Avatar updated');
    } catch (avatarError) {
      setError(avatarError instanceof Error ? avatarError.message : 'Could not update avatar');
    } finally {
      setSelectingAvatarId(null);
    }
  }

  function closeProfileImageDraft() {
    setProfileImageDraft((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  }

  function handleProfileImageSelected(file: File | null) {
    if (!file) return;

    setError(null);
    setNotice(null);
    setProfileImageDraft((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }

      return {
        file,
        previewUrl: URL.createObjectURL(file),
      };
    });
  }

  async function handleProfileCropConfirm(file: File) {
    await handleUpload(file, 'profile');
    closeProfileImageDraft();
  }

  useEffect(() => {
    return () => {
      if (profileImageDraft) {
        URL.revokeObjectURL(profileImageDraft.previewUrl);
      }
    };
  }, [profileImageDraft]);

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

  async function handleRemoveAvatar() {
    setRemovingAvatarLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api.removeAvatar();
      await reloadOwnProfile('Avatar removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove avatar');
    } finally {
      setRemovingAvatarLoading(false);
    }
  }

  async function loadWallets() {
    setWalletsLoading(true);
    try {
      const list = await api.getMyWallets();
      setWallets(list);
    } catch {
      // silently ignore; wallets panel will show empty state
    } finally {
      setWalletsLoading(false);
    }
  }

  async function handleRemoveWallet(walletId: string) {
    try {
      await api.removeWallet(walletId);
      setWallets((prev) => prev.filter((w) => w.id !== walletId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove wallet');
    }
  }

  async function handleAddWallet(address: string, signature: string, message: string) {
    try {
      await api.authConnectWallet(address, signature, message);
      await loadWallets();
      setNotice('Wallet verified and linked to your account');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link wallet');
    }
  }

  useEffect(() => {
    if (isConnected && tab === 'wallets') {
      loadWallets();
    }
  }, [isConnected, tab]);

  async function handleMintPost() {
    if (!me) return;

    const text = mintingText.trim();
    if (!text) {
      setError('Write something before minting your post');
      return;
    }

    setMintingPost(true);
    setError(null);
    setNotice(null);
    try {
      const nextPost: MintedPost = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `post-${Date.now()}`,
        ownerKey: profileOwnerKey,
        tokenId: `POST-${Date.now().toString().slice(-6)}`,
        hash: createMintHash(text),
        author: me.username || me.email || 'runner',
        text,
        mintedAt: new Date().toISOString(),
        trailName: form.location || me.location || 'Open Trail',
        tipsEth: tipAmount,
        likes: Math.max(12, mintedPosts.length * 8 + 12),
        metadata: {
          text,
          charCount: text.length,
          location: form.location || me.location || 'Unknown',
        },
      };

      const nextPosts = [nextPost, ...mintedPosts];
      setMintedPosts(nextPosts);
      persistMintedPosts(profileOwnerKey, nextPosts);
      setMintingText('');
      setNotice('Post minted and stored on your profile feed');
    } catch (mintError) {
      setError(mintError instanceof Error ? mintError.message : 'Could not mint post');
    } finally {
      setMintingPost(false);
    }
  }

  function stageMoneyAction(mode: 'tip' | 'onramp', profileName: string) {
    setError(null);
    setNotice(
      mode === 'tip'
        ? `Support flow prepared for ${profileName} at ${formatEth(tipAmount)}`
        : `Fiat onramp preview prepared for ${profileName} with $${fiatAmount}`,
    );
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
        <div className="space-y-6">
          <ProfileHero me={null} runner={runner} publicDomain={publicDomain} isOwner={false} onPrimaryAction={() => stageMoneyAction('tip', runner.username)} />
          <OverviewPanel
            me={null}
            runner={runner}
            mintedPosts={mintedPosts}
            isOwner={false}
            fiatAmount={fiatAmount}
            tipAmount={tipAmount}
            onFiatAmountChange={setFiatAmount}
            onTipAmountChange={setTipAmount}
            onStageMoneyAction={stageMoneyAction}
          />
          <SocialMintPanel
            showComposer={false}
            mintingText={mintingText}
            setMintingText={setMintingText}
            mintingPost={false}
            onMintPost={handleMintPost}
            posts={mintedPosts}
            profileName={runner.username}
          />
        </div>
      </SectionShell>
    );
  }

  if (!isConnected || !me) {
    return (
      <SectionShell>
        <EmptyState
          title="Runner profile"
          description="Connect your account to build your profile, mint social updates, and make FriendFi support easy."
          action={<button onClick={login} className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-600">Open sign in</button>}
        />
      </SectionShell>
    );
  }

  return (
    <SectionShell>
      <div className="space-y-6">
        <ProfileHero me={me} runner={runner} publicDomain={publicDomain} isOwner onPrimaryAction={() => setTab('social')} onSecondaryAction={() => setTab('edit')} />

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

        {tab === 'overview' && (
          <OverviewPanel
            me={me}
            runner={runner}
            mintedPosts={mintedPosts}
            isOwner
            fiatAmount={fiatAmount}
            tipAmount={tipAmount}
            onFiatAmountChange={setFiatAmount}
            onTipAmountChange={setTipAmount}
            onStageMoneyAction={stageMoneyAction}
          />
        )}

        {tab === 'edit' && (
          <EditPanel
            form={form}
            me={me}
            saving={saving}
            uploadingProfile={uploadingProfile}
            uploadingHeader={uploadingHeader}
            selectingAvatarId={selectingAvatarId}
            removingAvatar={removingAvatarLoading}
            onChange={setForm}
            onSave={handleSaveProfile}
            onProfileImageSelect={handleProfileImageSelected}
            onUpload={handleUpload}
            onSelectAvatar={handleAvatarPresetSelect}
            onRemoveAvatar={handleRemoveAvatar}
          />
        )}

        {tab === 'social' && (
          <SocialMintPanel
            showComposer
            mintingText={mintingText}
            setMintingText={setMintingText}
            mintingPost={mintingPost}
            onMintPost={handleMintPost}
            posts={mintedPosts}
            profileName={me.username || 'runner'}
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

        {tab === 'wallets' && (
          <WalletManagerPanel
            wallets={wallets}
            loading={walletsLoading}
            onAdd={handleAddWallet}
            onRemove={handleRemoveWallet}
          />
        )}
      </div>

      {profileImageDraft && (
        <ProfileImageCropModal
          draft={profileImageDraft}
          loading={uploadingProfile}
          onCancel={closeProfileImageDraft}
          onConfirm={handleProfileCropConfirm}
        />
      )}
    </SectionShell>
  );
}

function SectionShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-7xl">{children}</div>;
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
    <div className="overflow-hidden rounded-[32px] border border-white/70 bg-white/70 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="relative bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,249,255,0.92),rgba(236,253,245,0.9))] px-8 py-12 text-center text-slate-900">
        <BackgroundPaths />
        <div className="relative z-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">OnTrail profile studio</p>
          <h1 className="mb-3 text-3xl font-black text-slate-900">{title}</h1>
          <p className="mx-auto mb-8 max-w-2xl text-sm text-slate-600">{description}</p>
          {action}
        </div>
      </div>
    </div>
  );
}

function ProfileHero({
  me,
  runner,
  publicDomain,
  isOwner,
  onPrimaryAction,
  onSecondaryAction,
}: {
  me: AuthUser | null;
  runner: RunnerProfile | null;
  publicDomain: string | null;
  isOwner: boolean;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
}) {
  const headerImage = me?.header_image_url || runner?.headerImageUrl || '';
  const avatar = me?.avatar_url || runner?.avatarUrl || '';
  const profileName = me?.username || runner?.username || me?.email || 'Runner';
  const description = me?.bio || runner?.bio || 'Build a colorful, professional runner identity with trail stats, supporter access, and minted updates.';
  const stepBalance = me?.step_balance || 0;
  const totalTips = formatEth(runner?.stats?.totalTips || 0);
  const reputation = Math.round(runner?.reputationScore || me?.reputation_score || 0);

  return (
    <div className="overflow-hidden rounded-[36px] border border-white/70 bg-white/70 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
      <div
        className="relative min-h-[280px] overflow-hidden bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,249,255,0.94),rgba(236,253,245,0.88))]"
        style={headerImage ? { backgroundImage: `linear-gradient(rgba(255,255,255,0.78), rgba(236,253,245,0.58)), url(${headerImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.18),transparent_20%)]" />
        <BackgroundPaths />

        <div className="relative z-10 flex flex-col gap-6 px-6 py-7 md:px-8 md:py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-5 md:flex-row md:items-end">
            <Avatar avatar={avatar} username={profileName} size="lg" />

            <div className="max-w-3xl text-slate-900">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-white/80 bg-white/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700 backdrop-blur">
                  {isOwner ? 'Owner view' : 'Public runner'}
                </span>
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-700 backdrop-blur">
                  {runner?.tokenStatus || 'FriendFi ready'}
                </span>
              </div>

              <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{profileName}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">{description}</p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full border border-white/80 bg-white/60 px-3 py-1 backdrop-blur">{publicDomain?.replace('https://', '') || 'claim your public domain'}</span>
                <span className="rounded-full border border-white/80 bg-white/60 px-3 py-1 backdrop-blur">{runner?.auraLevel || 'Aura pending'}</span>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={onPrimaryAction} className="rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:opacity-95">
                  {isOwner ? 'Mint a post' : 'Tip this runner'}
                </button>
                {isOwner ? (
                  <button onClick={onSecondaryAction} className="rounded-2xl border border-white/80 bg-white/60 px-5 py-3 text-sm font-semibold text-slate-700 backdrop-blur transition hover:bg-white/80">
                    Edit profile
                  </button>
                ) : (
                  <a href="/tokens" className="rounded-2xl border border-white/80 bg-white/60 px-5 py-3 text-sm font-semibold text-slate-700 backdrop-blur transition hover:bg-white/80">
                    Get FriendPass
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="grid min-w-[280px] gap-3 rounded-[28px] border border-white/80 bg-white/55 p-4 text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl">
            <Metric label="Steps available" value={formatCompact(stepBalance)} />
            <Metric label="Collected tips" value={totalTips} />
            <Metric label="Runner reputation" value={`${reputation}`} />
            <Metric label="Supporters" value={`${runner?.stats?.totalSupporters || 0}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewPanel({
  me,
  runner,
  mintedPosts,
  isOwner,
  fiatAmount,
  tipAmount,
  onFiatAmountChange,
  onTipAmountChange,
  onStageMoneyAction,
}: {
  me: AuthUser | null;
  runner: RunnerProfile | null;
  mintedPosts: MintedPost[];
  isOwner: boolean;
  fiatAmount: number;
  tipAmount: string;
  onFiatAmountChange: (value: number) => void;
  onTipAmountChange: (value: string) => void;
  onStageMoneyAction: (mode: 'tip' | 'onramp', profileName: string) => void;
}) {
  const profileName = me?.username || runner?.username || 'runner';
  const stepBalance = me?.step_balance || 0;
  const totalTips = toSafeNumber(runner?.stats?.totalTips || 0);
  const reputation = Math.round(runner?.reputationScore || me?.reputation_score || 0);
  const friendPass = runner?.friendPass || {
    sold: 0,
    maxSupply: 100,
    currentPrice: '0.0010',
    currentPriceFiat: '$3.10',
    nextPrice: '0.0012',
  };
  const routeCount = runner?.route_count || 0;

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <ActivityRingsCard steps={stepBalance} tips={totalTips} reputation={reputation} />
          {isOwner ? (
            <OnrampPanel
              profileName={profileName}
              fiatAmount={fiatAmount}
              tipAmount={tipAmount}
              onFiatAmountChange={onFiatAmountChange}
              onTipAmountChange={onTipAmountChange}
              onAction={onStageMoneyAction}
            />
          ) : (
            <EthTipPanel
              profileName={profileName}
              tipAmount={tipAmount}
              recipientWallet={runner?.wallet_address ?? undefined}
              onTipAmountChange={onTipAmountChange}
              onAction={onStageMoneyAction}
            />
          )}
        </div>

        <BentoGridStats
          stepBalance={stepBalance}
          mintedPosts={mintedPosts.length}
          routeCount={routeCount}
          totalSupporters={runner?.stats?.totalSupporters || 0}
          reputation={reputation}
          currentPrice={friendPass.currentPrice}
        />

        <SpotlightCards profileName={profileName} friendPass={friendPass} isOwner={isOwner} />

        <TrailsPanel
          routeCount={routeCount}
          mintedPosts={mintedPosts.length}
          location={me?.location || 'Local trail'}
          profileName={profileName}
          reputation={reputation}
          tipTotal={totalTips}
          studioHref={runner?.username ? `/routes?runner=${runner.username}` : '/routes'}
        />
      </div>

      <div className="space-y-6 xl:col-span-4">
        <SupportStackCard profileName={profileName} runner={runner} isOwner={isOwner} />
        <MiniFeedPanel posts={mintedPosts} profileName={profileName} />
        <WalletCard me={me} publicDomain={publicDomainForProfile(me, runner)} />
      </div>
    </div>
  );
}

function publicDomainForProfile(me: AuthUser | null, runner: RunnerProfile | null) {
  const name = me?.username || runner?.username;
  return name ? `${name}.ontrail.tech` : 'Claim username to unlock domain';
}

function EditPanel({
  form,
  me,
  saving,
  uploadingProfile,
  uploadingHeader,
  selectingAvatarId,
  removingAvatar,
  onChange,
  onSave,
  onProfileImageSelect,
  onUpload,
  onSelectAvatar,
  onRemoveAvatar,
}: {
  form: ProfileFormState;
  me: AuthUser;
  saving: boolean;
  uploadingProfile: boolean;
  uploadingHeader: boolean;
  selectingAvatarId: string | null;
  removingAvatar: boolean;
  onChange: Dispatch<SetStateAction<ProfileFormState>>;
  onSave: () => Promise<void>;
  onProfileImageSelect: (file: File | null) => void;
  onUpload: (file: File | null, type: 'profile' | 'header') => Promise<void>;
  onSelectAvatar: (preset: AvatarPreset) => Promise<void>;
  onRemoveAvatar: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <Panel title="Avatar maker" eyebrow="Kokonut-style picker for a polished first impression">
        <div className="grid gap-4 md:grid-cols-4">
          {AVATAR_PRESETS.map((preset) => {
            const previewUrl = createAvatarDataUri(preset, form.username || me.username || me.email || 'OT');
            return (
              <button
                key={preset.id}
                onClick={() => onSelectAvatar(preset)}
                disabled={selectingAvatarId === preset.id}
                className="group rounded-[28px] border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="mb-3 overflow-hidden rounded-3xl bg-white shadow-sm">
                  <img src={previewUrl} alt={preset.label} className="h-28 w-full object-cover" />
                </div>
                <p className="text-sm font-semibold text-slate-900">{preset.label}</p>
                <p className="mt-1 text-xs text-slate-500">{selectingAvatarId === preset.id ? 'Updating...' : 'Use this avatar'}</p>
                <div className={`mt-3 h-2 rounded-full bg-gradient-to-r ${preset.accent}`} />
              </button>
            );
          })}
        </div>
      </Panel>

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

        <Panel title="Profile visuals" eyebrow="Avatar picker first, custom uploads whenever needed">
          <div className="space-y-6">
            <UploadCard
              title="Profile image"
              description={`Square crop before upload. Color overlays available in the editor. Remaining paid changes: ${me.profile_image_upload_credits || 0}`}
              imageUrl={me.avatar_url || null}
              loading={uploadingProfile || removingAvatar}
              onFile={onProfileImageSelect}
              onRemove={me.avatar_url ? onRemoveAvatar : undefined}
            />

            <UploadCard
              title="Header image"
              description={`Remaining paid changes: ${me.header_image_upload_credits || 0}`}
              imageUrl={me.header_image_url || null}
              loading={uploadingHeader}
              onFile={(file) => onUpload(file, 'header')}
              banner
            />

            <IpfsSettingsSection avatarUrl={me.avatar_url} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SocialMintPanel({
  showComposer,
  mintingText,
  setMintingText,
  mintingPost,
  onMintPost,
  posts,
  profileName,
}: {
  showComposer: boolean;
  mintingText: string;
  setMintingText: (value: string) => void;
  mintingPost: boolean;
  onMintPost: () => Promise<void>;
  posts: MintedPost[];
  profileName: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <Panel title="Minted social posts" eyebrow="Tweet-card inspired feed stored in the mint metadata">
        {showComposer ? (
          <div className="space-y-4">
            <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="h-11 w-11 overflow-hidden rounded-2xl bg-slate-900 text-white">
                  <Avatar avatar={null} username={profileName} size="md" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{profileName}</p>
                  <p className="text-xs text-slate-500">Text is stored directly in the minted post record</p>
                </div>
              </div>
              <textarea
                value={mintingText}
                onChange={(event) => setMintingText(event.target.value)}
                placeholder="Share a route win, a supporter milestone, or a new trail drop..."
                className="min-h-[160px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">{mintingText.length}/280 characters</p>
                <button onClick={onMintPost} disabled={mintingPost || mintingText.trim().length === 0} className="rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60">
                  {mintingPost ? 'Minting...' : 'Mint post'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">This profile showcases only posts that have been minted by the owner.</p>
        )}
      </Panel>

      <div className="space-y-4">
        {posts.length === 0 ? (
          <Panel title="No minted posts yet" eyebrow="Start the social layer">
            <p className="text-sm text-slate-500">Mint the first trail post to turn this profile into a living social feed.</p>
          </Panel>
        ) : (
          posts.map((post) => <MintedTweetCard key={post.id} post={post} />)
        )}
      </div>
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
                      <div key={item.slug} className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50 p-5">
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

        <Panel title="Wallet delivery" eyebrow="For giveaways, mintspots, tokens, FriendPass, and TGE access">
          <p className="text-sm text-slate-500">{me.preferred_reward_wallet || me.wallet_address || 'Save a wallet in Edit Profile before buying web3 items.'}</p>
        </Panel>
      </div>
    </div>
  );
}

function ActivityRingsCard({ steps, tips, reputation }: { steps: number; tips: number; reputation: number }) {
  return (
    <div className="rounded-[32px] border border-white/70 bg-white/70 p-6 text-slate-900 shadow-[0_16px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Activity rings</p>
      <h2 className="mt-2 text-2xl font-black text-slate-900">Live profile momentum</h2>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <RingMeter label="Steps" value={steps} goal={10000} color="#22c55e" helper={`${formatCompact(steps)} / 10k`} />
        <RingMeter label="Tips" value={tips} goal={1} color="#f97316" helper={`${tips.toFixed(3)} ETH`} />
        <RingMeter label="Rep" value={reputation} goal={100} color="#a855f7" helper={`${reputation}/100`} />
      </div>
    </div>
  );
}

function RingMeter({ label, value, goal, color, helper }: { label: string; value: number; goal: number; color: string; helper: string }) {
  const pct = percent(value, goal);
  return (
    <div className="text-center">
      <div
        className="mx-auto flex h-24 w-24 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, rgba(15,23,42,0.08) 0deg)` }}
      >
        <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full border border-white/80 bg-white/80 text-slate-900 backdrop-blur">
          <span className="text-base font-bold">{Math.round(pct)}%</span>
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800">{label}</p>
      <p className="text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function OnrampPanel({
  profileName,
  fiatAmount,
  tipAmount,
  onFiatAmountChange,
  onTipAmountChange,
  onAction,
}: {
  profileName: string;
  fiatAmount: number;
  tipAmount: string;
  onFiatAmountChange: (value: number) => void;
  onTipAmountChange: (value: string) => void;
  onAction: (mode: 'tip' | 'onramp', profileName: string) => void;
}) {
  return (
    <div className="rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(240,249,255,0.86),rgba(236,253,245,0.84))] p-6 text-slate-900 shadow-[0_16px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Wallet funding</p>
      <h2 className="mt-2 text-2xl font-black text-slate-900">Add funds</h2>

      <div className="mt-5 space-y-4 rounded-[28px] border border-white/70 bg-white/60 p-4 backdrop-blur">
        <TransferRow label="From" value={`$${fiatAmount.toFixed(0)} USD`} sublabel="Bank card •••• 4589" />
        <TransferRow label="To" value={formatEth(fiatAmount * 0.85 / 3200)} sublabel={`${profileName} wallet`} />
      </div>

      <div className="mt-4">
        <label className="text-sm text-slate-700">
          <span className="mb-2 block">Amount (USD)</span>
          <input type="range" min="25" max="500" step="5" value={fiatAmount} onChange={(event) => onFiatAmountChange(Number(event.target.value))} className="w-full accent-emerald-500" />
          <span className="mt-1 block text-xs text-slate-500">≈ {formatEth(fiatAmount * 0.85 / 3200)} ETH after fees</span>
        </label>
      </div>

      <div className="mt-5">
        <button onClick={() => onAction('onramp', profileName)} className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95">
          Preview onramp
        </button>
      </div>
    </div>
  );
}

function EthTipPanel({
  profileName,
  tipAmount,
  recipientWallet,
  onTipAmountChange,
  onAction,
}: {
  profileName: string;
  tipAmount: string;
  recipientWallet?: string;
  onTipAmountChange: (value: string) => void;
  onAction: (mode: 'tip' | 'onramp', profileName: string) => void;
}) {
  const ethAmt = parseFloat(tipAmount) || 0;
  const presets = ['0.005', '0.01', '0.025', '0.05'];

  return (
    <div className="rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(240,249,255,0.86),rgba(236,253,245,0.84))] p-6 text-slate-900 shadow-[0_16px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">Tip in ETH</p>
      <h2 className="mt-2 text-2xl font-black text-slate-900">Tip {profileName}</h2>

      <div className="mt-5 space-y-4 rounded-[28px] border border-white/70 bg-white/60 p-4 backdrop-blur">
        <TransferRow label="To" value={`${profileName}`} sublabel={recipientWallet ? `${recipientWallet.slice(0, 6)}…${recipientWallet.slice(-4)}` : 'wallet on file'} />
        <TransferRow label="Amount" value={`${ethAmt > 0 ? ethAmt.toFixed(4) : '—'} ETH`} sublabel="ETH balance only" />
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex gap-2">
          {presets.map(p => (
            <button key={p} onClick={() => onTipAmountChange(p)}
              className={`flex-1 rounded-2xl py-2 text-xs font-semibold border transition-colors ${
                tipAmount === p
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'border-white/80 bg-white/65 text-slate-700 hover:bg-white/85'
              }`}>
              {p} ETH
            </button>
          ))}
        </div>
        <input
          value={tipAmount}
          onChange={(event) => onTipAmountChange(event.target.value)}
          className="w-full rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-violet-400/40"
          placeholder="Custom amount in ETH"
        />
      </div>

      <div className="mt-5">
        <button onClick={() => onAction('tip', profileName)} disabled={ethAmt <= 0}
          className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40">
          Send {ethAmt > 0 ? `${ethAmt} ETH` : 'tip'} to {profileName}
        </button>
      </div>
    </div>
  );
}

function TransferRow({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/70 px-4 py-3 text-sm shadow-sm backdrop-blur">
      <div>
        <p className="text-slate-500">{label}</p>
        <p className="mt-1 font-semibold text-slate-900">{value}</p>
      </div>
      <p className="text-right text-xs text-slate-500">{sublabel}</p>
    </div>
  );
}

function BentoGridStats({
  stepBalance,
  mintedPosts,
  routeCount,
  totalSupporters,
  reputation,
  currentPrice,
}: {
  stepBalance: number;
  mintedPosts: number;
  routeCount: number;
  totalSupporters: number;
  reputation: number;
  currentPrice: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <BentoCard title="Created trails" value={`${routeCount}`} note="routes ready for discovery" accent="from-emerald-500/20 to-teal-500/5" />
      <BentoCard title="Minted posts" value={`${mintedPosts}`} note="stored social updates" accent="from-sky-500/20 to-cyan-500/5" />
      <BentoCard title="Runner reputation" value={`${reputation}`} note="trust and consistency" accent="from-violet-500/20 to-fuchsia-500/5" />
      <BentoCard title="FriendFi entry" value={`${currentPrice} ETH`} note={`${formatCompact(stepBalance)} steps · ${totalSupporters} supporters`} accent="from-amber-400/20 to-orange-500/5" />
    </div>
  );
}

function BentoCard({ title, value, note, accent }: { title: string; value: string; note: string; accent: string }) {
  return (
    <div className={`rounded-[28px] border border-slate-200 bg-gradient-to-br ${accent} p-5 shadow-sm`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <p className="mt-3 text-2xl font-black text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{note}</p>
    </div>
  );
}

function SpotlightCards({ profileName, friendPass, isOwner }: { profileName: string; friendPass: RunnerProfile['friendPass']; isOwner: boolean }) {
  const cards = [
    {
      title: isOwner ? 'Grow FriendFi demand' : `Back ${profileName} early`,
      desc: `${friendPass.sold}/${friendPass.maxSupply} passes are already taken. Price is ${friendPass.currentPrice} ETH and moves with demand.`,
      accent: 'from-emerald-200/80 to-transparent',
    },
    {
      title: 'Keep the page alive',
      desc: 'Mint posts after major runs, trail drops, or supporter moments so the profile always feels current.',
      accent: 'from-sky-200/80 to-transparent',
    },
    {
      title: 'Turn support into action',
      desc: 'Give fans clear options to tip, join the FriendFi layer, or follow your next minted trail release.',
      accent: 'from-violet-200/80 to-transparent',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <div key={card.title} className="group relative overflow-hidden rounded-[28px] border border-white/70 bg-white/70 p-5 text-slate-900 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <div className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-90`} />
          <div className="relative z-10">
            <p className="text-lg font-bold text-slate-900">{card.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrailsPanel({
  routeCount,
  mintedPosts,
  location,
  profileName,
  reputation,
  tipTotal,
  studioHref,
}: {
  routeCount: number;
  mintedPosts: number;
  location: string;
  profileName: string;
  reputation: number;
  tipTotal: number;
  studioHref: string;
}) {
  const trailCards = [
    { name: `${profileName} Signature Loop`, meta: `${Math.max(4, Math.round(reputation / 10))} km · Mint-ready`, badge: `${routeCount} created` },
    { name: `${location} Tempo Trail`, meta: `${Math.max(3, mintedPosts + 3)} checkpoints · Community route`, badge: `${mintedPosts} posts` },
    { name: 'Supporter Sprint', meta: `${Math.max(2, Math.round(tipTotal * 10) + 2)} km · Tip-powered unlock`, badge: `${tipTotal.toFixed(3)} ETH` },
  ];

  return (
    <Panel title="Created and minted trails" eyebrow="Bento-style route showcase">
      <div className="grid gap-4 md:grid-cols-3">
        {trailCards.map((trail) => (
          <div key={trail.name} className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
            <div className="mb-3 inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{trail.badge}</div>
            <h3 className="text-lg font-bold text-slate-900">{trail.name}</h3>
            <p className="mt-2 text-sm text-slate-600">{trail.meta}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <a href={studioHref} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Open Trail Lab</a>
        <span className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">Perfect for public trail drops and minted route stories</span>
      </div>
    </Panel>
  );
}

function SupportStackCard({ profileName, runner, isOwner }: { profileName: string; runner: RunnerProfile | null; isOwner: boolean }) {
  const friendPass = runner?.friendPass;
  return (
    <Panel title={isOwner ? 'FriendFi readiness' : `Support ${profileName}`} eyebrow="Make being a friend and tipping easy">
      <div className="space-y-4">
        <div className="rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(224,242,254,0.92))] p-4 text-slate-900 shadow-sm backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Current pass price</p>
          <p className="mt-2 text-2xl font-black text-slate-900">{friendPass?.currentPrice || '0.0010'} ETH</p>
          <p className="mt-1 text-sm text-slate-600">{friendPass?.sold || 0}/{friendPass?.maxSupply || 100} passes sold</p>
        </div>

        <div className="grid gap-3">
          <a href="/tokens" className="rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 px-4 py-3 text-center text-sm font-semibold text-white hover:opacity-95">
            {isOwner ? 'Review token page' : 'Get FriendPass'}
          </a>
          <button className="rounded-2xl border border-white/80 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 backdrop-blur hover:bg-white/85">
            {isOwner ? 'Share profile link' : 'Send a tip'}
          </button>
        </div>
      </div>
    </Panel>
  );
}

function MiniFeedPanel({ posts, profileName }: { posts: MintedPost[]; profileName: string }) {
  return (
    <Panel title="Social pulse" eyebrow="Latest minted notes">
      <div className="space-y-3">
        {posts.slice(0, 3).map((post) => (
          <div key={post.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{profileName}</p>
            <p className="mt-1 text-sm text-slate-600">{post.text}</p>
            <p className="mt-2 text-xs text-slate-400">{post.tokenId} · {new Date(post.mintedAt).toLocaleDateString()}</p>
          </div>
        ))}
        {posts.length === 0 && <p className="text-sm text-slate-500">No posts minted yet.</p>}
      </div>
    </Panel>
  );
}

function IpfsSettingsSection({ avatarUrl }: { avatarUrl: string | null }) {
  const [jwt, setJwt] = useState(() => localStorage.getItem(IPFS_JWT_KEY) || '');
  const [editing, setEditing] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [cid, setCid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function saveJwt() {
    const trimmed = jwt.trim();
    if (trimmed) {
      localStorage.setItem(IPFS_JWT_KEY, trimmed);
    } else {
      localStorage.removeItem(IPFS_JWT_KEY);
    }
    setEditing(false);
  }

  async function pinToIpfs() {
    const storedJwt = localStorage.getItem(IPFS_JWT_KEY);
    if (!storedJwt) { setEditing(true); return; }
    if (!avatarUrl) { setErr('No avatar uploaded yet'); return; }

    setPinning(true);
    setErr(null);
    setCid(null);
    try {
      const resp = await fetch(avatarUrl);
      if (!resp.ok) throw new Error('Could not fetch avatar image');
      const blob = await resp.blob();
      const fd = new FormData();
      fd.append('file', new File([blob], 'avatar.png', { type: blob.type || 'image/png' }));
      fd.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

      const pinResp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: { Authorization: `Bearer ${storedJwt}` },
        body: fd,
      });
      if (!pinResp.ok) {
        const detail = await pinResp.json().catch(() => ({ error: pinResp.statusText }));
        throw new Error(detail?.error || 'Pinata error');
      }
      const data = await pinResp.json();
      setCid(data.IpfsHash as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'IPFS pin failed');
    } finally {
      setPinning(false);
    }
  }

  const storedJwt = typeof window !== 'undefined' ? localStorage.getItem(IPFS_JWT_KEY) : null;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/80 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">IPFS settings</h4>
          <p className="mt-0.5 text-xs text-slate-500">
            {storedJwt ? 'Pinata JWT saved — pin your avatar to IPFS for permanent hosting.' : 'Add a free Pinata JWT to enable IPFS avatar pinning.'}
          </p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          {editing ? 'Close' : storedJwt ? 'Update key' : 'Set up'}
        </button>
      </div>

      {editing && (
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            value={jwt}
            onChange={(e) => setJwt(e.target.value)}
            placeholder="Pinata JWT (eyJ…)"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
          <button onClick={saveJwt} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">Save</button>
        </div>
      )}

      {storedJwt && avatarUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={pinToIpfs}
            disabled={pinning}
            className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {pinning ? 'Pinning…' : 'Pin avatar to IPFS'}
          </button>
          {cid && (
            <a
              href={`https://gateway.pinata.cloud/ipfs/${cid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              {cid.slice(0, 12)}… (view)
            </a>
          )}
          {err && <span className="text-xs text-rose-600">{err}</span>}
        </div>
      )}
    </div>
  );
}

function WalletCard({ me, publicDomain }: { me: AuthUser | null; publicDomain: string }) {
  return (
    <Panel title="Identity and wallet" eyebrow="Owner status and delivery path">
      <div className="space-y-3 text-sm">
        <StatTile label="Public domain" value={publicDomain} />
        <StatTile label="Reward wallet" value={me?.preferred_reward_wallet || me?.wallet_address || 'Not saved yet'} mono />
        <StatTile label="AI avatar credits" value={`${me?.ai_avatar_credits || 0}`} />
      </div>
    </Panel>
  );
}

function WalletManagerPanel({
  wallets,
  loading,
  onAdd,
  onRemove,
}: {
  wallets: LinkedWallet[];
  loading: boolean;
  onAdd: (address: string, signature: string, message: string) => Promise<void>;
  onRemove: (walletId: string) => Promise<void>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [inputAddress, setInputAddress] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function detectMetaMaskAddress() {
    const eth = (window as any).ethereum;
    if (!eth) { setAddError('MetaMask not found. Install it or enter an address manually.'); return; }
    try {
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts[0]) setInputAddress(accounts[0]);
    } catch {
      setAddError('MetaMask request cancelled');
    }
  }

  async function handleSignAndAdd() {
    const address = inputAddress.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      setAddError('Enter a valid 0x Ethereum address');
      return;
    }
    const eth = (window as any).ethereum;
    if (!eth) {
      setAddError('MetaMask is required to sign the ownership proof. Install MetaMask and try again.');
      return;
    }

    setAdding(true);
    setAddError(null);
    try {
      const timestamp = new Date().toISOString();
      const message = `I own this wallet on OnTrail\nAddress: ${address}\nTimestamp: ${timestamp}`;

      let accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      if (!accounts.length) throw new Error('No accounts in MetaMask');

      const checksumAddress = accounts.find((a) => a.toLowerCase() === address) ?? accounts[0];
      if (checksumAddress.toLowerCase() !== address) {
        throw new Error(`Switch to ${address} in MetaMask and try again`);
      }

      const signature: string = await eth.request({
        method: 'personal_sign',
        params: [message, checksumAddress],
      });

      await onAdd(address, signature, message);
      setInputAddress('');
      setShowAddForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not sign message');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(walletId: string) {
    if (!window.confirm('Remove this wallet from your account?')) return;
    setRemovingId(walletId);
    try {
      await onRemove(walletId);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Panel title="Linked wallets" eyebrow="Your verified on-chain identities">
        {loading ? (
          <div className="flex items-center gap-3 text-slate-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <span className="text-sm">Loading wallets…</span>
          </div>
        ) : wallets.length === 0 ? (
          <p className="text-sm text-slate-500">No wallets linked yet. Add one below to prove ownership with a signature.</p>
        ) : (
          <div className="space-y-3">
            {wallets.map((w) => (
              <div key={w.id} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="truncate font-mono text-sm font-semibold text-slate-900">{w.wallet_address}</p>
                  <p className="mt-0.5 text-xs text-slate-500 uppercase tracking-wide">{w.wallet_type} {w.created_at ? `· added ${new Date(w.created_at).toLocaleDateString()}` : ''}</p>
                </div>
                <button
                  onClick={() => handleRemove(w.id)}
                  disabled={removingId === w.id}
                  className="flex-shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-60"
                >
                  {removingId === w.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5">
          {!showAddForm ? (
            <button
              onClick={() => { setShowAddForm(true); setAddError(null); }}
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
            >
              + Add wallet
            </button>
          ) : (
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Add and verify a wallet</p>
                <p className="mt-1 text-xs text-slate-500">You must sign a message in MetaMask to prove ownership. The message and signature are verified server-side.</p>
              </div>

              <div className="flex gap-2">
                <input
                  value={inputAddress}
                  onChange={(e) => setInputAddress(e.target.value)}
                  placeholder="0x wallet address"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  onClick={detectMetaMaskAddress}
                  className="flex-shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  title="Use MetaMask address"
                >
                  Use MetaMask
                </button>
              </div>

              {addError && <p className="text-xs text-rose-600">{addError}</p>}

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <strong>Ownership message you'll sign:</strong><br />
                <span className="font-mono">I own this wallet on OnTrail<br />Address: {inputAddress || '0x…'}<br />Timestamp: {new Date().toISOString().slice(0, 19)}Z</span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowAddForm(false); setAddError(null); setInputAddress(''); }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignAndAdd}
                  disabled={adding || !inputAddress.trim()}
                  className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {adding ? 'Signing…' : 'Sign & verify ownership'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="What are linked wallets?" eyebrow="How it works">
        <div className="space-y-3 text-sm text-slate-600">
          <p>Linking a wallet to your account proves you control that address without giving OnTrail access to your funds or private key.</p>
          <p>When you click <strong>Sign &amp; verify ownership</strong>, MetaMask will show you a plain-text message to sign. The signature is verified on our server — it's cryptographically impossible to fake.</p>
          <p>Linked wallets appear as your verified on-chain identities and can be used for reward delivery, FriendPass access, and future NFT claims.</p>
        </div>
      </Panel>
    </div>
  );
}

function MintedTweetCard({ post }: { post: MintedPost }) {
  return (
    <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5">
      <div className="bg-gradient-to-r from-sky-500 via-violet-500 to-emerald-400 p-[1px]">
        <div className="rounded-[29px] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">{post.author}</p>
              <p className="text-xs text-slate-500">{post.tokenId} · {new Date(post.mintedAt).toLocaleString()}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Minted</span>
          </div>

          <p className="mt-4 text-sm leading-7 text-slate-700">{post.text}</p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1">Trail: {post.trailName}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Tips: {post.tipsEth} ETH</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Hash: {post.hash.slice(0, 10)}…</span>
          </div>

          <div className="mt-4 flex items-center gap-5 text-sm text-slate-500">
            <span>❤ {post.likes}</span>
            <span>↺ {Math.max(3, Math.floor(post.likes / 4))}</span>
            <span>◎ {post.metadata.charCount} chars in mint</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <div className="rounded-[32px] border border-white/70 bg-white/70 p-6 shadow-[0_16px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">{eyebrow}</p>
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

function UploadCard({ title, description, imageUrl, loading, onFile, onRemove, banner }: { title: string; description: string; imageUrl: string | null; loading: boolean; onFile: (file: File | null) => void; onRemove?: () => void; banner?: boolean }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/70 p-4 backdrop-blur">
      <div className="mb-3">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <div className={`mb-4 overflow-hidden rounded-2xl bg-slate-100 ${banner ? 'aspect-[16/5]' : 'aspect-square max-w-[180px]'}`}>
        {imageUrl ? <img src={imageUrl} alt={title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-slate-500">No image uploaded</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer rounded-2xl border border-white/80 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white">
          {loading ? 'Uploading...' : 'Choose image'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              onFile(file);
              event.target.value = '';
            }}
            disabled={loading}
          />
        </label>
        {onRemove && imageUrl && (
          <button
            onClick={onRemove}
            disabled={loading}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '...' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  );
}

function ProfileImageCropModal({
  draft,
  loading,
  onCancel,
  onConfirm,
}: {
  draft: ProfileImageDraft;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void>;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; startPosition: CropPosition } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState<CropPosition>({ x: 0, y: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [overlayId, setOverlayId] = useState<string>('none');

  const selectedOverlay = COLOR_OVERLAYS.find((o) => o.id === overlayId) ?? COLOR_OVERLAYS[0];

  const baseScale = useMemo(() => {
    if (!naturalSize) return 1;
    return Math.max(PROFILE_CROP_SIZE / naturalSize.width, PROFILE_CROP_SIZE / naturalSize.height);
  }, [naturalSize]);

  const renderedWidth = naturalSize ? naturalSize.width * baseScale * zoom : PROFILE_CROP_SIZE;
  const renderedHeight = naturalSize ? naturalSize.height * baseScale * zoom : PROFILE_CROP_SIZE;

  useEffect(() => {
    if (!naturalSize) return;
    setPosition(centerCropPosition(renderedWidth, renderedHeight));
  }, [draft.previewUrl, naturalSize?.width, naturalSize?.height]);

  useEffect(() => {
    if (!naturalSize) return;
    setPosition((current) => clampCropPosition(current, renderedWidth, renderedHeight));
  }, [renderedWidth, renderedHeight, naturalSize]);

  async function handleConfirm() {
    if (!imageRef.current || !naturalSize) return;

    setSubmitting(true);
    try {
      const sourceScaleX = naturalSize.width / renderedWidth;
      const sourceScaleY = naturalSize.height / renderedHeight;
      const sourceX = Math.max(0, Math.round(-position.x * sourceScaleX));
      const sourceY = Math.max(0, Math.round(-position.y * sourceScaleY));
      const sourceWidth = Math.min(
        naturalSize.width - sourceX,
        Math.round(PROFILE_CROP_SIZE * sourceScaleX),
      );
      const sourceHeight = Math.min(
        naturalSize.height - sourceY,
        Math.round(PROFILE_CROP_SIZE * sourceScaleY),
      );
      const outputSize = Math.max(
        256,
        Math.min(1024, Math.floor(Math.min(sourceWidth, sourceHeight))),
      );

      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not prepare image crop');
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        imageRef.current,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      // Apply color overlay if one is selected
      if (selectedOverlay.id !== 'none') {
        const rad = (selectedOverlay.angle * Math.PI) / 180;
        const gx = Math.cos(rad);
        const gy = Math.sin(rad);
        const grad = context.createLinearGradient(
          (1 - gx) * outputSize / 2,
          (1 - gy) * outputSize / 2,
          (1 + gx) * outputSize / 2,
          (1 + gy) * outputSize / 2,
        );
        grad.addColorStop(0, selectedOverlay.from);
        grad.addColorStop(1, selectedOverlay.to);
        context.globalCompositeOperation = 'source-over';
        context.fillStyle = grad;
        context.fillRect(0, 0, outputSize, outputSize);
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png', 0.92);
      });

      if (!blob) {
        throw new Error('Could not export cropped image');
      }

      const croppedFile = new File(
        [blob],
        `${draft.file.name.replace(/\.[^.]+$/, '') || 'profile-image'}-cropped.png`,
        { type: 'image/png' },
      );

      await onConfirm(croppedFile);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[32px] bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">Profile image crop</p>
            <h2 className="text-2xl font-black text-slate-900">Crop your avatar before upload</h2>
            <p className="mt-2 text-sm text-slate-500">Drag to reposition and use zoom to frame the part of the image that should become your public avatar.</p>

            <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-950/95 p-5 text-white">
              <div
                className="relative mx-auto overflow-hidden rounded-[28px] bg-slate-900"
                style={{ width: PROFILE_CROP_SIZE, height: PROFILE_CROP_SIZE, touchAction: 'none' }}
                onPointerDown={(event) => {
                  dragStateRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startPosition: position,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;

                  const nextPosition = clampCropPosition(
                    {
                      x: dragStateRef.current.startPosition.x + (event.clientX - dragStateRef.current.startX),
                      y: dragStateRef.current.startPosition.y + (event.clientY - dragStateRef.current.startY),
                    },
                    renderedWidth,
                    renderedHeight,
                  );

                  setPosition(nextPosition);
                }}
                onPointerUp={(event) => {
                  if (dragStateRef.current?.pointerId === event.pointerId) {
                    dragStateRef.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                }}
                onPointerLeave={(event) => {
                  if (dragStateRef.current?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
                    dragStateRef.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                }}
              >
                <img
                  ref={imageRef}
                  src={draft.previewUrl}
                  alt="Crop preview"
                  className="absolute select-none object-cover"
                  draggable={false}
                  style={{
                    left: position.x,
                    top: position.y,
                    width: renderedWidth,
                    height: renderedHeight,
                    maxWidth: 'none',
                  }}
                  onLoad={(event) => {
                    setNaturalSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    });
                  }}
                />
                <div className="pointer-events-none absolute inset-0 rounded-[28px] border border-white/15" />
                <div className="pointer-events-none absolute inset-5 rounded-full border-2 border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]" />
              </div>

              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/70">
                  <span>Zoom</span>
                  <span>{zoom.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="w-full accent-emerald-400"
                />
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm rounded-[28px] bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Preview</p>
            <div className="mt-4 flex justify-center">
              <div className="relative h-32 w-32 overflow-hidden rounded-full ring-4 ring-white shadow-lg">
                <img
                  src={draft.previewUrl}
                  alt="Avatar preview"
                  className="select-none object-cover"
                  draggable={false}
                  style={{
                    width: renderedWidth,
                    height: renderedHeight,
                    maxWidth: 'none',
                    transform: `translate(${position.x}px, ${position.y}px)`,
                  }}
                />
                {selectedOverlay.id !== 'none' && (
                  <div
                    className="pointer-events-none absolute inset-0 rounded-full"
                    style={{ background: `linear-gradient(${selectedOverlay.angle}deg, ${selectedOverlay.from}, ${selectedOverlay.to})` }}
                  />
                )}
              </div>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Color overlay</p>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_OVERLAYS.map((ov) => (
                  <button
                    key={ov.id}
                    title={ov.label}
                    onClick={() => setOverlayId(ov.id)}
                    className={`relative h-9 overflow-hidden rounded-xl border-2 transition ${overlayId === ov.id ? 'border-emerald-500 ring-2 ring-emerald-300' : 'border-transparent hover:border-slate-300'}`}
                    style={{ background: ov.id === 'none' ? 'repeating-conic-gradient(#e2e8f0 0% 25%, white 0% 50%) 0 0 / 10px 10px' : `linear-gradient(${ov.angle}deg, ${ov.from.replace(/,[\d.]+\)$/, ',0.9)')}, ${ov.to.replace(/,[\d.]+\)$/, ',0.8)')})` }}
                  >
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/30 px-1 py-0.5 text-center text-[9px] font-semibold text-white">{ov.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-2 text-sm text-slate-500">
              <p>Drag to reposition. Overlay is baked into the exported PNG.</p>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={onCancel}
                disabled={loading || submitting}
                className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || submitting || !naturalSize}
                className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading || submitting ? 'Uploading...' : 'Crop and upload'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackgroundPaths() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-70">
      <svg viewBox="0 0 1200 320" className="absolute inset-0 h-full w-full" fill="none" preserveAspectRatio="none">
        <path d="M-40 220C140 60 300 40 470 145C620 235 770 250 980 110C1070 50 1150 30 1240 80" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
        <path d="M-20 280C130 170 290 120 470 180C670 245 800 230 980 150C1100 95 1180 110 1240 150" stroke="rgba(56,189,248,0.35)" strokeWidth="2" />
        <path d="M70 10C180 80 250 140 330 210C410 280 520 300 640 230C740 170 860 120 1010 135C1090 145 1160 170 1230 210" stroke="rgba(52,211,153,0.28)" strokeWidth="2" />
      </svg>
    </div>
  );
}

function Avatar({ avatar, username, size }: { avatar: string | null; username: string; size: 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-28 w-28 text-4xl' : 'h-14 w-14 text-xl';
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-full bg-slate-900 font-black text-white ring-4 ring-white/30 ${sizeClass}`}>
      {username[0]?.toUpperCase() || '?'}
      {avatar && <img src={avatar} alt={`${username} avatar`} className="absolute inset-0 h-full w-full object-cover" onError={(e) => e.currentTarget.remove()} />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 pb-2 text-sm last:border-b-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function StatTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/65 px-4 py-4 shadow-sm backdrop-blur">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className={`text-sm font-semibold text-slate-900 ${mono ? 'break-all font-mono text-xs' : ''}`}>{value}</p>
    </div>
  );
}