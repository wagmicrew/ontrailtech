import { useEffect, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';

async function adminFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('ontrail_token');
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SettingsField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'textarea' | 'color';
  placeholder?: string;
  options?: { label: string; value: string }[];
  description?: string;
  required?: boolean;
}

interface AppRecord {
  id: string;
  app_id: string;
  name: string;
  version: string;
  description: string | null;
  author: string | null;
  icon: string | null;
  status: 'uploaded' | 'installed' | 'disabled';
  settings: Record<string, unknown>;
  settings_schema: SettingsField[];
  tables_created: string[];
  manifest: Record<string, unknown>;
  installed_at: string | null;
  updated_at: string | null;
}

// ── Icons ────────────────────────────────────────────────────────────────────

const PuzzleIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
  </svg>
);

const UploadIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const CogIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AppRecord['status'] }) {
  const map: Record<string, string> = {
    installed: 'bg-green-100 text-green-700',
    uploaded: 'bg-yellow-100 text-yellow-700',
    disabled: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

// ── App Icon ─────────────────────────────────────────────────────────────────

function AppIcon({ icon, name }: { icon: string | null; name: string }) {
  if (icon) {
    return (
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50 overflow-hidden border border-gray-100"
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── Settings Form ─────────────────────────────────────────────────────────────

function SettingsForm({
  schema,
  values,
  onChange,
}: {
  schema: SettingsField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  if (!schema.length) {
    return <p className="text-sm text-gray-400 italic">This app has no configurable settings.</p>;
  }

  return (
    <div className="space-y-4">
      {schema.map((field) => {
        const val = values[field.key] ?? '';
        return (
          <div key={field.key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {field.label}
              {field.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {field.description && (
              <p className="text-xs text-gray-400 mb-1">{field.description}</p>
            )}
            {field.type === 'textarea' ? (
              <textarea
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                value={String(val)}
                placeholder={field.placeholder}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            ) : field.type === 'boolean' ? (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => onChange(field.key, !val)}
                  className={`w-10 h-5 rounded-full transition-colors ${val ? 'bg-violet-500' : 'bg-gray-200'} relative`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${val ? 'translate-x-5' : ''}`} />
                </div>
                <span className="text-sm text-gray-600">{val ? 'Enabled' : 'Disabled'}</span>
              </label>
            ) : field.type === 'select' ? (
              <select
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                value={String(val)}
                onChange={(e) => onChange(field.key, e.target.value)}
              >
                <option value="">— select —</option>
                {(field.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : field.type === 'color' ? (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={String(val) || '#000000'}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  className="w-9 h-9 rounded cursor-pointer border border-gray-200"
                />
                <input
                  type="text"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  value={String(val)}
                  onChange={(e) => onChange(field.key, e.target.value)}
                />
              </div>
            ) : (
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                value={String(val)}
                placeholder={field.placeholder}
                onChange={(e) =>
                  onChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Uninstall Modal ───────────────────────────────────────────────────────────

function UninstallModal({
  app,
  onConfirm,
  onCancel,
  loading,
}: {
  app: AppRecord;
  onConfirm: (keepData: boolean) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [keepData, setKeepData] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500">
            <TrashIcon />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800">Uninstall {app.name}</h2>
            <p className="text-xs text-gray-400">v{app.version}</p>
          </div>
        </div>

        {app.tables_created.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">What to do with app data?</p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="keepData"
                checked={!keepData}
                onChange={() => setKeepData(false)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-red-600">Remove all data</p>
                <p className="text-xs text-gray-500">
                  Drops or truncates tables: {app.tables_created.join(', ')}. This cannot be undone.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="keepData"
                checked={keepData}
                onChange={() => setKeepData(true)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Keep data</p>
                <p className="text-xs text-gray-500">
                  Preserves table rows. You can reinstall the app later and data will still be there.
                </p>
              </div>
            </label>
          </div>
        )}

        <p className="text-sm text-gray-500">
          The app record will be removed from the installer. Any database tables
          {keepData ? ' will be preserved.' : ' and their data will be dropped.'}
        </p>

        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={loading}
            onClick={() => onConfirm(keepData)}
            className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Uninstalling…' : 'Uninstall'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── App Detail Panel ──────────────────────────────────────────────────────────

function AppDetailPanel({
  app,
  onClose,
  onInstall,
  onUninstallRequest,
  onToggleStatus,
  onSettingsSaved,
}: {
  app: AppRecord;
  onClose: () => void;
  onInstall: (app: AppRecord) => void;
  onUninstallRequest: (app: AppRecord) => void;
  onToggleStatus: (app: AppRecord) => void;
  onSettingsSaved: (app: AppRecord, settings: Record<string, unknown>) => Promise<void>;
}) {
  const [settings, setSettings] = useState<Record<string, unknown>>(app.settings ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleChange(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSettingsSaved(app, settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const manifest = app.manifest as Record<string, unknown>;
  const hasInstallSql = manifest._has_install_sql as boolean;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <AppIcon icon={app.icon} name={app.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-gray-800 truncate">{app.name}</h2>
            <StatusBadge status={app.status} />
          </div>
          <p className="text-xs text-gray-400">
            v{app.version}{app.author ? ` · by ${app.author}` : ''}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Info */}
        <div className="px-5 py-4 border-b border-gray-50 space-y-3">
          {app.description && <p className="text-sm text-gray-600">{app.description}</p>}
          {app.tables_created.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Database tables</p>
              <div className="flex flex-wrap gap-1">
                {app.tables_created.map((t) => (
                  <span key={t} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-mono">{t}</span>
                ))}
              </div>
            </div>
          )}
          {app.installed_at && (
            <p className="text-xs text-gray-400">
              Installed {new Date(app.installed_at).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-b border-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Actions</p>
          <div className="flex flex-wrap gap-2">
            {app.status === 'uploaded' && (
              <button
                onClick={() => onInstall(app)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                <CheckIcon />
                Install
              </button>
            )}
            {app.status === 'installed' && (
              <button
                onClick={() => onToggleStatus(app)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
              >
                Disable
              </button>
            )}
            {app.status === 'disabled' && (
              <button
                onClick={() => onToggleStatus(app)}
                className="px-3 py-1.5 text-sm border border-green-200 text-green-700 rounded-lg hover:bg-green-50 transition-colors"
              >
                Enable
              </button>
            )}
            <button
              onClick={() => onUninstallRequest(app)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              <TrashIcon />
              Uninstall
            </button>
          </div>
          {!hasInstallSql && app.status === 'uploaded' && (
            <p className="text-xs text-amber-600 mt-2">
              No install.sql found — install will only register the app without running database migrations.
            </p>
          )}
        </div>

        {/* Settings */}
        <div className="px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Settings</p>
          <SettingsForm
            schema={app.settings_schema ?? []}
            values={settings}
            onChange={handleChange}
          />
          {(app.settings_schema ?? []).length > 0 && (
            <button
              onClick={handleSave}
              disabled={saving}
              className={`mt-4 flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                saved
                  ? 'bg-green-500 text-white'
                  : 'bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50'
              }`}
            >
              {saved ? <><CheckIcon /> Saved</> : saving ? 'Saving…' : 'Save Settings'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Upload Zone ───────────────────────────────────────────────────────────────

function UploadZone({ onUpload, uploading }: { onUpload: (file: File) => void; uploading: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
        dragging ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50'
      }`}
      onClick={() => fileRef.current?.click()}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".app,.zip"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
      />
      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-violet-100 flex items-center justify-center text-violet-500">
        <UploadIcon />
      </div>
      {uploading ? (
        <p className="text-sm text-violet-600 font-medium">Uploading…</p>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-700">Drop a <span className="font-mono">.app</span> file here</p>
          <p className="text-xs text-gray-400 mt-1">or click to browse · max 10 MB</p>
        </>
      )}
    </div>
  );
}

// ── App Row ───────────────────────────────────────────────────────────────────

function AppRow({
  app,
  selected,
  onSelect,
}: {
  app: AppRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
        selected ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-gray-50'
      }`}
    >
      <AppIcon icon={app.icon} name={app.name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800 truncate">{app.name}</span>
          <StatusBadge status={app.status} />
        </div>
        <p className="text-xs text-gray-400 truncate">
          v{app.version}{app.author ? ` · ${app.author}` : ''}{app.description ? ` · ${app.description}` : ''}
        </p>
      </div>
      <ChevronRightIcon />
    </button>
  );
}

// ── App Format Help ───────────────────────────────────────────────────────────

function FormatHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-violet-600 hover:underline"
      >
        {open ? 'Hide' : 'What is a .app file?'}
      </button>
      {open && (
        <div className="mt-3 bg-gray-50 rounded-xl p-4 text-xs text-gray-600 space-y-2 border border-gray-100">
          <p className="font-medium text-gray-700">A <code className="font-mono">.app</code> file is a ZIP archive containing:</p>
          <ul className="space-y-1 pl-3">
            <li><code className="font-mono text-violet-600">manifest.json</code> — required: id, name, version, description, author, tables_created[], settings_schema[]</li>
            <li><code className="font-mono text-violet-600">install.sql</code> — SQL run on install (CREATE TABLE, seed data, etc.)</li>
            <li><code className="font-mono text-violet-600">uninstall.sql</code> — SQL run on full uninstall (DROP TABLE, etc.)</li>
            <li><code className="font-mono text-violet-600">uninstall_keep.sql</code> — SQL run when keeping data (TRUNCATE, etc.)</li>
            <li><code className="font-mono text-violet-600">icon.svg</code> — optional SVG icon</li>
          </ul>
          <div className="mt-2 bg-white rounded-lg p-3 border border-gray-100">
            <p className="font-medium text-gray-700 mb-1">Example manifest.json:</p>
            <pre className="text-[11px] overflow-x-auto">{`{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A sample plugin",
  "author": "Your Name",
  "tables_created": ["my_plugin_data"],
  "settings_schema": [
    {
      "key": "api_key",
      "label": "API Key",
      "type": "text",
      "placeholder": "sk-...",
      "required": true
    },
    {
      "key": "enabled",
      "label": "Enable feature",
      "type": "boolean"
    }
  ]
}`}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AppsPage() {
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<AppRecord | null>(null);
  const [uninstalling, setUninstalling] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const selectedApp = apps.find((a) => a.app_id === selectedId) ?? null;

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function loadApps() {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch<AppRecord[]>('/admin/apps');
      setApps(data);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to load apps');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadApps(); }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const app = await adminFetch<AppRecord>('/admin/apps/upload', {
        method: 'POST',
        body: form,
      });
      setApps((prev) => [app, ...prev]);
      setSelectedId(app.app_id);
      showToast(`"${app.name}" uploaded — click Install to run database migrations.`);
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleInstall(app: AppRecord) {
    setInstallingId(app.app_id);
    try {
      const result = await adminFetch<{ app: AppRecord; statements_executed: number }>(`/admin/apps/${app.app_id}/install`, { method: 'POST' });
      setApps((prev) => prev.map((a) => a.app_id === app.app_id ? result.app : a));
      showToast(`"${app.name}" installed successfully.`);
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Install failed', 'error');
    } finally {
      setInstallingId(null);
    }
  }

  async function handleUninstall(keepData: boolean) {
    if (!uninstallTarget) return;
    setUninstalling(true);
    try {
      await adminFetch(`/admin/apps/${uninstallTarget.app_id}?keep_data=${keepData}`, { method: 'DELETE' });
      const name = uninstallTarget.name;
      setApps((prev) => prev.filter((a) => a.app_id !== uninstallTarget.app_id));
      if (selectedId === uninstallTarget.app_id) setSelectedId(null);
      setUninstallTarget(null);
      showToast(`"${name}" uninstalled${keepData ? ' (data kept)' : ' and data removed'}.`);
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Uninstall failed', 'error');
    } finally {
      setUninstalling(false);
    }
  }

  async function handleToggleStatus(app: AppRecord) {
    const next = app.status === 'installed' ? 'disabled' : 'installed';
    try {
      const updated = await adminFetch<AppRecord>(`/admin/apps/${app.app_id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: next }),
      });
      setApps((prev) => prev.map((a) => a.app_id === app.app_id ? updated : a));
      showToast(`"${app.name}" ${next}.`);
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Status update failed', 'error');
    }
  }

  async function handleSettingsSaved(app: AppRecord, settings: Record<string, unknown>) {
    const updated = await adminFetch<AppRecord>(`/admin/apps/${app.app_id}/settings`, {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
    setApps((prev) => prev.map((a) => a.app_id === app.app_id ? updated : a));
  }

  return (
    <div className="flex h-full gap-0 -m-6 min-h-0" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Left: App List */}
      <div className="flex flex-col w-80 flex-shrink-0 border-r border-gray-100 bg-white overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600">
              <PuzzleIcon />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-gray-800">App Installer</h1>
              <p className="text-xs text-gray-400">{apps.length} app{apps.length !== 1 ? 's' : ''} installed</p>
            </div>
          </div>
          <UploadZone onUpload={handleUpload} uploading={uploading} />
          <FormatHelp />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="m-3 p-3 bg-red-50 rounded-lg text-xs text-red-600">{error}</div>
          )}
          {!loading && !error && apps.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-gray-300 mb-3">
                <PuzzleIcon />
              </div>
              <p className="text-sm text-gray-500 font-medium">No apps installed</p>
              <p className="text-xs text-gray-400 mt-1">Upload a <code className="font-mono">.app</code> file to get started</p>
            </div>
          )}
          {apps.map((app) => (
            <AppRow
              key={app.app_id}
              app={installingId === app.app_id ? { ...app, status: 'uploaded' } : app}
              selected={selectedId === app.app_id}
              onSelect={() => setSelectedId(selectedId === app.app_id ? null : app.app_id)}
            />
          ))}
        </div>
      </div>

      {/* Right: Detail panel */}
      <div className="flex-1 overflow-hidden bg-gray-50">
        {selectedApp ? (
          <AppDetailPanel
            key={selectedApp.app_id}
            app={selectedApp}
            onClose={() => setSelectedId(null)}
            onInstall={handleInstall}
            onUninstallRequest={setUninstallTarget}
            onToggleStatus={handleToggleStatus}
            onSettingsSaved={handleSettingsSaved}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-300 mb-4">
              <PuzzleIcon />
            </div>
            <p className="text-sm font-medium text-gray-500">Select an app to view details</p>
            <p className="text-xs text-gray-400 mt-1">or upload a new <code className="font-mono">.app</code> file</p>
          </div>
        )}
      </div>

      {/* Uninstall modal */}
      {uninstallTarget && (
        <UninstallModal
          app={uninstallTarget}
          loading={uninstalling}
          onConfirm={handleUninstall}
          onCancel={() => setUninstallTarget(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
            toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
