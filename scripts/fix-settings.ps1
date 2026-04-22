$target = "c:\Eget\Ontrail\apps\web\src\webos\apps\settings\SettingsApp.tsx"

# Keep only the first 11 lines (imports) then append the new body
$lines = Get-Content $target
# find last import line
$lastImport = 0
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match "^import ") { $lastImport = $i }
}
Write-Host "Last import line: $lastImport"
$imports = ($lines[0..$lastImport]) -join "`n"

$newBody = @'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SettingsField {
  key: string; label: string; type: string;
  placeholder?: string; options?: { label: string; value: string }[];
  description?: string;
}

interface AppRecord {
  id: string; app_id: string; name: string; version: string;
  description: string | null; author: string | null; icon: string | null;
  status: 'uploaded' | 'installed' | 'disabled';
  settings: Record<string, unknown>;
  settings_schema: SettingsField[];
  tables_created: string[];
  manifest: Record<string, unknown>;
  installed_at: string | null;
}

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = 'theme' | 'windows' | 'kernel' | 'apps';
interface SidebarTab { id: TabId; label: string; icon: React.ReactNode }

const TABS: SidebarTab[] = [
  {
    id: 'theme', label: 'Theme',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
      </svg>
    ),
  },
  {
    id: 'windows', label: 'Windows',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    id: 'kernel', label: 'Kernel',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    id: 'apps', label: 'App Installer',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
      </svg>
    ),
  },
];

const OS_THEMES: { id: OsTheme; label: string; preview: string }[] = [
  { id: 'dark',     label: 'Dark',     preview: 'from-gray-950 to-gray-800' },
  { id: 'light',    label: 'Light',    preview: 'from-sky-100 to-slate-200' },
  { id: 'midnight', label: 'Midnight', preview: 'from-indigo-950 to-purple-900' },
];

// ── Shared helpers ────────────────────────────────────────────────────────────

function AppIcon({ icon, name }: { icon: string | null; name: string }) {
  if (icon) {
    return (
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden border border-white/10 flex-shrink-0 bg-white/5"
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function StatusDot({ status }: { status: AppRecord['status'] }) {
  const c: Record<string, string> = { installed: 'bg-green-400', uploaded: 'bg-yellow-400', disabled: 'bg-gray-400' };
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c[status] ?? 'bg-gray-400'}`} />;
}

// ── Smooth Vertical Sidebar ───────────────────────────────────────────────────

function SettingsSidebar({ active, onChange, t }: {
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
      <motion.div
        className="absolute left-2 right-2 rounded-lg bg-indigo-500/15 z-0"
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
            className={`relative z-10 flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors w-full text-left ${isActive ? 'text-indigo-400' : `${t.textMuted} hover:${t.text}`}`}
          >
            <span className={`flex-shrink-0 ${isActive ? 'text-indigo-400' : ''}`}>{tab.icon}</span>
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Smooth Drawer ─────────────────────────────────────────────────────────────

const drawerVariants = {
  hidden: { x: '100%', opacity: 0, transition: { type: 'spring' as const, stiffness: 320, damping: 34 } },
  visible: { x: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 320, damping: 34, mass: 0.8, staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemV = {
  hidden: { y: 14, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 28 } },
};

function AppDrawer({
  app, onClose, onInstall, onUninstall, onToggle, onSaveSettings, t,
}: {
  app: AppRecord;
  onClose: () => void;
  onInstall: (app: AppRecord) => Promise<void>;
  onUninstall: (app: AppRecord, keepData: boolean) => Promise<void>;
  onToggle: (app: AppRecord) => Promise<void>;
  onSaveSettings: (app: AppRecord, s: Record<string, unknown>) => Promise<void>;
  t: ReturnType<typeof useTheme>;
}) {
  const [settings, setSettings] = useState<Record<string, unknown>>(app.settings ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [keepData, setKeepData] = useState(false);

  const statusColor: Record<string, string> = { installed: 'text-green-400', uploaded: 'text-yellow-400', disabled: 'text-gray-400' };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  async function doSave() {
    setSaving(true);
    try { await onSaveSettings(app, settings); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setSaving(false); }
  }

  return (
    <motion.div
      variants={drawerVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      className={`absolute inset-y-0 right-0 w-72 flex flex-col z-20 ${t.bgCard} border-l ${t.border} shadow-2xl overflow-hidden`}
    >
      <motion.div variants={itemV} className={`flex items-center gap-3 px-4 py-4 border-b ${t.border} flex-shrink-0`}>
        <AppIcon icon={app.icon} name={app.name} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${t.heading}`}>{app.name}</p>
          <p className={`text-xs ${statusColor[app.status] ?? t.textMuted}`}>v{app.version} · {app.status}</p>
        </div>
        <button onClick={onClose} className={`p-1.5 rounded-lg ${t.textMuted} hover:${t.bgHover} transition-colors flex-shrink-0`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </motion.div>

      <div className="flex-1 overflow-y-auto">
        {(app.description || app.tables_created.length > 0) && (
          <motion.div variants={itemV} className={`px-4 py-3 border-b ${t.border} space-y-2`}>
            {app.description && <p className={`text-xs leading-relaxed ${t.textMuted}`}>{app.description}</p>}
            {app.tables_created.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {app.tables_created.map(tbl => (
                  <span key={tbl} className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded">{tbl}</span>
                ))}
              </div>
            )}
          </motion.div>
        )}

        <motion.div variants={itemV} className={`px-4 py-3 border-b ${t.border} space-y-3`}>
          <p className={`text-[10px] font-semibold uppercase tracking-widest ${t.textMuted}`}>Actions</p>
          <div className="flex flex-wrap gap-2">
            {app.status === 'uploaded' && (
              <button disabled={busy} onClick={() => run(() => onInstall(app))}
                className="px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors">
                {busy ? 'Installing…' : '↓ Install'}
              </button>
            )}
            {app.status === 'installed' && (
              <button disabled={busy} onClick={() => run(() => onToggle(app))}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${t.border} ${t.textMuted} disabled:opacity-50 transition-colors`}>
                Disable
              </button>
            )}
            {app.status === 'disabled' && (
              <button disabled={busy} onClick={() => run(() => onToggle(app))}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-green-500/40 text-green-400 hover:bg-green-500/10 disabled:opacity-50 transition-colors">
                Enable
              </button>
            )}
            {!uninstalling && (
              <button onClick={() => setUninstalling(true)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                Uninstall
              </button>
            )}
          </div>

          <AnimatePresence>
            {uninstalling && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className={`rounded-xl p-3 border ${t.border} ${t.bg} space-y-2`}>
                <p className={`text-xs font-medium ${t.text}`}>What to do with data?</p>
                {[
                  { val: false, label: 'Remove all data', sub: app.tables_created.length > 0 ? `Drops: ${app.tables_created.join(', ')}` : 'Drops tables', color: 'text-red-400' },
                  { val: true,  label: 'Keep data',       sub: 'Truncates rows, keeps tables',  color: t.text },
                ].map(opt => (
                  <label key={String(opt.val)} className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="kd" checked={keepData === opt.val} onChange={() => setKeepData(opt.val)} className="mt-0.5" />
                    <div>
                      <p className={`text-xs font-medium ${opt.color}`}>{opt.label}</p>
                      <p className={`text-[10px] ${t.textMuted}`}>{opt.sub}</p>
                    </div>
                  </label>
                ))}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setUninstalling(false)} className={`flex-1 py-1.5 text-xs rounded-lg border ${t.border} ${t.textMuted}`}>Cancel</button>
                  <button disabled={busy} onClick={() => run(async () => { await onUninstall(app, keepData); onClose(); })}
                    className="flex-1 py-1.5 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                    {busy ? '…' : 'Confirm'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div variants={itemV} className="px-4 py-3">
          <p className={`text-[10px] font-semibold uppercase tracking-widest ${t.textMuted} mb-3`}>Settings</p>
          {app.settings_schema.length === 0
            ? <p className={`text-xs italic ${t.textMuted}`}>No configurable settings.</p>
            : (
              <div className="space-y-3">
                {app.settings_schema.map(field => {
                  const val = settings[field.key] ?? '';
                  return (
                    <div key={field.key}>
                      <label className={`block text-xs font-medium ${t.text} mb-1`}>{field.label}</label>
                      {field.description && <p className={`text-[10px] ${t.textMuted} mb-1`}>{field.description}</p>}
                      {field.type === 'boolean' ? (
                        <button onClick={() => setSettings(p => ({ ...p, [field.key]: !val }))}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${val ? 'bg-indigo-500' : 'bg-gray-500'}`}>
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${val ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      ) : field.type === 'select' ? (
                        <select value={String(val)} onChange={e => setSettings(p => ({ ...p, [field.key]: e.target.value }))}
                          className={`w-full text-xs border ${t.border} ${t.bgCard} ${t.text} rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500`}>
                          <option value="">— select —</option>
                          {(field.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : field.type === 'textarea' ? (
                        <textarea rows={2} value={String(val)} placeholder={field.placeholder}
                          onChange={e => setSettings(p => ({ ...p, [field.key]: e.target.value }))}
                          className={`w-full text-xs border ${t.border} ${t.bgCard} ${t.text} rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none`} />
                      ) : (
                        <input type={field.type === 'number' ? 'number' : 'text'} value={String(val)} placeholder={field.placeholder}
                          onChange={e => setSettings(p => ({ ...p, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value }))}
                          className={`w-full text-xs border ${t.border} ${t.bgCard} ${t.text} rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500`} />
                      )}
                    </div>
                  );
                })}
                <button onClick={doSave} disabled={saving}
                  className={`w-full py-2 rounded-lg text-xs font-medium transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50'}`}>
                  {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            )
          }
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── Upload Zone ───────────────────────────────────────────────────────────────

function UploadZone({ onUpload, uploading, t }: {
  onUpload: (f: File) => void; uploading: boolean; t: ReturnType<typeof useTheme>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onUpload(f); }}
      onClick={() => ref.current?.click()}
      className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer ${dragging ? 'border-indigo-400 bg-indigo-500/10' : `${t.border} hover:border-indigo-400/50`}`}
    >
      <input ref={ref} type="file" accept=".app,.zip" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
      <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      </div>
      {uploading
        ? <p className="text-xs text-indigo-400 font-medium">Uploading…</p>
        : <><p className={`text-xs font-medium ${t.text}`}>Drop a <code className="font-mono">.app</code> file</p><p className={`text-[10px] ${t.textMuted} mt-0.5`}>or click to browse · max 10 MB</p></>
      }
    </div>
  );
}

// ── Tab Panels ────────────────────────────────────────────────────────────────

function ThemePanel({ t, winPrefs, setWin }: {
  t: ReturnType<typeof useTheme>; winPrefs: WindowPrefs;
  setWin: <K extends keyof WindowPrefs>(k: K, v: WindowPrefs[K]) => void;
}) {
  const handleWallpaperSuccess = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => { windowPrefsStore.wallpaperUrl = reader.result as string; };
    reader.readAsDataURL(file);
  };
  return (
    <div className="space-y-5">
      <div>
        <p className={`text-sm font-semibold ${t.heading} mb-1`}>Desktop Theme</p>
        <p className={`text-xs ${t.textMuted} mb-4`}>Choose the OS colour scheme</p>
        <div className="grid grid-cols-3 gap-3">
          {OS_THEMES.map(theme => (
            <button key={theme.id} onClick={() => setWin('osTheme', theme.id)}
              className={`relative rounded-xl overflow-hidden border-2 transition-all ${winPrefs.osTheme === theme.id ? 'border-green-500 shadow-md' : `${t.border} hover:border-green-400/50`}`}>
              <div className={`h-14 bg-gradient-to-br ${theme.preview}`} />
              <div className={`px-2 py-1.5 text-xs font-medium text-center ${t.text}`}>{theme.label}</div>
              {winPrefs.osTheme === theme.id && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className={`text-sm font-semibold ${t.heading} mb-1`}>Wallpaper</p>
        <WallpaperUpload onUploadSuccess={handleWallpaperSuccess} onFileRemove={() => { windowPrefsStore.wallpaperUrl = ''; }} />
        {winPrefs.wallpaperUrl && (
          <div className="flex items-center gap-3 mt-3">
            <div className="w-20 h-14 rounded-lg border overflow-hidden flex-shrink-0"
              style={{ backgroundImage: `url(${winPrefs.wallpaperUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div>
              <p className={`text-xs font-medium ${t.text}`}>Wallpaper active</p>
              <button onClick={() => { windowPrefsStore.wallpaperUrl = ''; }} className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2 mt-0.5">Remove</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WindowsPanel({ t, winPrefs, setWin }: {
  t: ReturnType<typeof useTheme>; winPrefs: WindowPrefs;
  setWin: <K extends keyof WindowPrefs>(k: K, v: WindowPrefs[K]) => void;
}) {
  const chip = (active: boolean) =>
    `py-1.5 text-xs font-medium rounded-lg border transition-all ${active ? 'bg-indigo-500 border-indigo-500 text-white' : `${t.bgCard} ${t.border} ${t.textMuted} hover:border-indigo-300`}`;
  const toggle = (on: boolean) =>
    `relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-indigo-500' : 'bg-gray-500'}`;
  const knob = (on: boolean) =>
    `inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-semibold ${t.heading}`}>Window Appearance</p>
          <p className={`text-xs ${t.textMuted}`}>Glass, borders, shadows and corners</p>
        </div>
        <button onClick={resetWindowPrefs} className={`text-xs underline underline-offset-2 ${t.textMuted} hover:text-indigo-400`}>Reset</button>
      </div>
      <div className={`rounded-xl border ${t.border} ${t.bgCard} divide-y ${t.divider} px-4`}>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className={`text-xs font-medium ${t.text}`}>Glassmorphism</p>
            <p className={`text-[10px] ${t.textMuted}`}>Translucent blurred windows</p>
          </div>
          <button onClick={() => setWin('glassmorphism', !winPrefs.glassmorphism)} className={toggle(winPrefs.glassmorphism)}>
            <span className={knob(winPrefs.glassmorphism)} />
          </button>
        </div>
        {winPrefs.glassmorphism && (<>
          <div className="py-3 space-y-1.5">
            <div className="flex justify-between"><p className={`text-xs font-medium ${t.text}`}>Blur</p><span className={`text-xs font-mono ${t.textMuted}`}>{winPrefs.blurAmount}px</span></div>
            <input type="range" min={0} max={32} step={2} value={winPrefs.blurAmount} onChange={e => setWin('blurAmount', Number(e.target.value))} className="w-full h-1.5 accent-indigo-500" />
          </div>
          <div className="py-3 space-y-1.5">
            <div className="flex justify-between"><p className={`text-xs font-medium ${t.text}`}>Opacity</p><span className={`text-xs font-mono ${t.textMuted}`}>{winPrefs.glassOpacity}%</span></div>
            <input type="range" min={20} max={100} step={5} value={winPrefs.glassOpacity} onChange={e => setWin('glassOpacity', Number(e.target.value))} className="w-full h-1.5 accent-indigo-500" />
          </div>
        </>)}
        <div className="flex items-center justify-between py-3">
          <p className={`text-xs font-medium ${t.text}`}>Window border</p>
          <button onClick={() => setWin('showBorder', !winPrefs.showBorder)} className={toggle(winPrefs.showBorder)}>
            <span className={knob(winPrefs.showBorder)} />
          </button>
        </div>
      </div>
      {[
        { label: 'Corner radius', key: 'cornerRadius'   as const, opts: ['none','sm','md','lg','xl'],    labels: { none:'Square',sm:'SM',md:'MD',lg:'LG',xl:'XL' } },
        { label: 'Titlebar style',key: 'titlebarcStyle' as const, opts: ['glass','solid','minimal'],     labels: { glass:'Glass',solid:'Solid',minimal:'Minimal' } },
        { label: 'Drop shadow',   key: 'shadowLevel'    as const, opts: ['none','sm','md','lg','xl'],    labels: { none:'None',sm:'SM',md:'MD',lg:'LG',xl:'XL' } },
        { label: 'Padding',       key: 'contentPadding' as const, opts: ['none','sm','md','lg'],         labels: { none:'None',sm:'Small',md:'Medium',lg:'Large' } },
        { label: 'Animation',     key: 'animationSpeed' as const, opts: ['none','fast','normal','slow'], labels: { none:'None',fast:'Fast',normal:'Normal',slow:'Slow' } },
      ].map(row => (
        <div key={row.key}>
          <p className={`text-xs font-medium ${t.text} mb-1.5`}>{row.label}</p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${row.opts.length}, 1fr)` }}>
            {row.opts.map(o => (
              <button key={o} onClick={() => (setWin as (k: string, v: string) => void)(row.key, o)} className={chip(winPrefs[row.key] === o)}>
                {(row.labels as Record<string, string>)[o]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function KernelPanel({ snap, t }: {
  snap: ReturnType<typeof useSnapshot<typeof systemStore>>;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className={`text-sm font-semibold ${t.heading} mb-1`}>Kernel & System</p>
        <p className={`text-xs ${t.textMuted} mb-4`}>Runtime information and OS metadata</p>
      </div>
      <div className={`rounded-xl border ${t.border} ${t.bgCard} divide-y ${t.divider} px-4`}>
        {[
          { label: 'OS Version', value: 'OnTrail OS v1.0.0', cls: t.text },
          { label: 'Kernel',     value: snap.kernelConnected ? `Connected${snap.kernelVersion ? ` (${snap.kernelVersion})` : ''}` : 'Offline', cls: snap.kernelConnected ? 'text-green-400' : t.textMuted },
          { label: 'Build Date', value: new Date().toISOString().slice(0, 10), cls: t.text },
          { label: 'Browser',    value: navigator.userAgent.slice(0, 36) + '…', cls: t.text },
        ].map(row => (
          <div key={row.label} className="flex justify-between py-2.5">
            <span className={`text-xs ${t.textMuted}`}>{row.label}</span>
            <span className={`text-xs font-mono truncate ml-4 max-w-[180px] ${row.cls}`}>{row.value}</span>
          </div>
        ))}
      </div>
      <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div>
            <p className={`font-semibold text-sm ${t.heading}`}>OnTrail OS</p>
            <p className={`text-xs ${t.textMuted}`}>Modular WebOS Admin Platform</p>
          </div>
        </div>
        <p className={`text-xs leading-relaxed ${t.textMuted}`}>Apps are independently installed, event-driven, and communicate through the kernel event bus.</p>
      </div>
    </div>
  );
}

function AppsPanel({ t }: { t: ReturnType<typeof useTheme> }) {
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<AppRecord | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    try { setApps(await adminFetch<AppRecord[]>('/admin/apps')); }
    catch { /* silent */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (selected) {
      const fresh = apps.find(a => a.app_id === selected.app_id);
      if (fresh && fresh !== selected) setSelected(fresh);
    }
  }, [apps]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const app = await adminFetch<AppRecord>('/admin/apps/upload', { method: 'POST', body: form });
      setApps(p => [app, ...p]);
      setSelected(app);
      showToast(`"${app.name}" uploaded — click Install.`);
    } catch (e: unknown) { showToast((e as Error).message ?? 'Upload failed', false); }
    finally { setUploading(false); }
  }

  async function handleInstall(app: AppRecord) {
    const r = await adminFetch<{ app: AppRecord }>(`/admin/apps/${app.app_id}/install`, { method: 'POST' });
    setApps(p => p.map(a => a.app_id === app.app_id ? r.app : a));
    setSelected(r.app);
    showToast(`"${app.name}" installed!`);
  }

  async function handleToggle(app: AppRecord) {
    const next = app.status === 'installed' ? 'disabled' : 'installed';
    const updated = await adminFetch<AppRecord>(`/admin/apps/${app.app_id}/status`, { method: 'PUT', body: JSON.stringify({ status: next }) });
    setApps(p => p.map(a => a.app_id === app.app_id ? updated : a));
    setSelected(updated);
  }

  async function handleUninstall(app: AppRecord, keepData: boolean) {
    await adminFetch(`/admin/apps/${app.app_id}?keep_data=${keepData}`, { method: 'DELETE' });
    setApps(p => p.filter(a => a.app_id !== app.app_id));
    showToast(`"${app.name}" uninstalled${keepData ? ' (data kept)' : ''}.`);
  }

  async function handleSaveSettings(app: AppRecord, settings: Record<string, unknown>) {
    const updated = await adminFetch<AppRecord>(`/admin/apps/${app.app_id}/settings`, { method: 'PUT', body: JSON.stringify({ settings }) });
    setApps(p => p.map(a => a.app_id === app.app_id ? updated : a));
    setSelected(updated);
  }

  return (
    <div className="relative space-y-4">
      <div>
        <p className={`text-sm font-semibold ${t.heading} mb-1`}>App Installer</p>
        <p className={`text-xs ${t.textMuted} mb-4`}>Upload, install and configure <code className="font-mono">.app</code> packages</p>
        <UploadZone onUpload={handleUpload} uploading={uploading} t={t} />
      </div>
      <div className="space-y-1">
        {loading && <div className="flex justify-center py-6"><div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>}
        {!loading && apps.length === 0 && (
          <div className={`rounded-xl border ${t.border} ${t.bgCard} p-6 text-center`}>
            <p className={`text-xs ${t.textMuted}`}>No apps installed yet.</p>
          </div>
        )}
        {apps.map(app => (
          <button key={app.app_id} onClick={() => setSelected(selected?.app_id === app.app_id ? null : app)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${selected?.app_id === app.app_id ? `${t.bgActive} ring-1 ring-indigo-500/40` : `hover:${t.bgHover}`}`}>
            <AppIcon icon={app.icon} name={app.name} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${t.text}`}>{app.name}</p>
              <p className={`text-[10px] ${t.textMuted} truncate`}>v{app.version}{app.author ? ` · ${app.author}` : ''}</p>
            </div>
            <StatusDot status={app.status} />
          </button>
        ))}
      </div>
      <AnimatePresence>
        {selected && (
          <AppDrawer
            key={selected.app_id}
            app={selected}
            onClose={() => setSelected(null)}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
            onToggle={handleToggle}
            onSaveSettings={handleSaveSettings}
            t={t}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium text-white ${toast.ok ? 'bg-green-500' : 'bg-red-500'}`}>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Content slide transition ──────────────────────────────────────────────────

const contentV = {
  enter: (dir: number) => ({ x: dir > 0 ? 36 : -36, opacity: 0, filter: 'blur(5px)', position: 'absolute' as const }),
  center: { x: 0, opacity: 1, filter: 'blur(0px)', position: 'absolute' as const },
  exit:  (dir: number) => ({ x: dir < 0 ? 36 : -36, opacity: 0, filter: 'blur(5px)', position: 'absolute' as const }),
};

// ── Root ──────────────────────────────────────────────────────────────────────

export default function SettingsApp() {
  const snap = useSnapshot(systemStore);
  const winPrefs = useSnapshot(windowPrefsStore) as WindowPrefs;
  const t = useTheme();

  const [activeTab, setActiveTab] = useState<TabId>('theme');
  const [dir, setDir] = useState(0);

  function handleTab(id: TabId) {
    const cur = TABS.findIndex(tab => tab.id === activeTab);
    const nxt = TABS.findIndex(tab => tab.id === id);
    setDir(nxt > cur ? 1 : -1);
    setActiveTab(id);
  }

  const setWin = <K extends keyof WindowPrefs>(key: K, value: WindowPrefs[K]) => {
    windowPrefsStore[key] = value;
  };

  return (
    <div className={`flex h-full overflow-hidden ${t.bg}`}>
      <SettingsSidebar active={activeTab} onChange={handleTab} t={t} />
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence custom={dir} initial={false} mode="wait">
          <motion.div
            key={activeTab}
            custom={dir}
            variants={contentV}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 overflow-y-auto px-5 py-5"
          >
            {activeTab === 'theme'   && <ThemePanel   t={t} winPrefs={winPrefs} setWin={setWin} />}
            {activeTab === 'windows' && <WindowsPanel t={t} winPrefs={winPrefs} setWin={setWin} />}
            {activeTab === 'kernel'  && <KernelPanel  snap={snap} t={t} />}
            {activeTab === 'apps'    && <AppsPanel    t={t} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
'@

$result = $imports + $newBody
[IO.File]::WriteAllText($target, $result, [System.Text.Encoding]::UTF8)
Write-Host "Done. Written $($result.Length) chars to $target"
