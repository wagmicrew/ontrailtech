import { useSnapshot } from 'valtio';
import { systemStore } from '../../core/system-store';
import { useTheme } from '../../core/theme-store';
import WallpaperUpload from '../../ui/WallpaperUpload';
import {
  resetWindowPrefs, windowPrefsStore,
  type CornerRadius, type OsTheme, type TitlebarStyle, type WindowPrefs,
} from '../../core/window-prefs-store';

const OS_THEMES: { id: OsTheme; label: string; preview: string }[] = [
  { id: 'dark',     label: 'Dark',     preview: 'from-gray-950 to-gray-800' },
  { id: 'light',    label: 'Light',    preview: 'from-sky-100 to-slate-200' },
  { id: 'midnight', label: 'Midnight', preview: 'from-indigo-950 to-purple-900' },
];

export default function SettingsApp() {
  const snap = useSnapshot(systemStore);
  const winPrefs = useSnapshot(windowPrefsStore);
  const t = useTheme();

  const handleWallpaperSuccess = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      windowPrefsStore.wallpaperUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const clearWallpaper = () => { windowPrefsStore.wallpaperUrl = ''; };

  const setWin = <K extends keyof WindowPrefs>(key: K, value: WindowPrefs[K]) => {
    windowPrefsStore[key] = value;
  };

  // ── Derived style helpers ──────────────────────────────────────────────────
  const toggleClass = (on: boolean, accent = 'bg-indigo-500') =>
    `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? accent : 'bg-gray-300'}`;
  const toggleKnob = (on: boolean) =>
    `inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`;
  const chip = (active: boolean) =>
    `py-1.5 text-xs font-medium rounded-md border transition-all ${active ? 'bg-indigo-500 border-indigo-500 text-white' : `${t.bgCard} ${t.border} ${t.textMuted} hover:border-indigo-300`}`;
  const sectionBg = `space-y-3 rounded-xl p-4 ${t.bgCard} border ${t.border}`;

  return (
    <div className={`p-6 space-y-6 min-h-full ${t.bg}`}>
      <div>
        <h2 className={`text-2xl font-semibold ${t.heading}`}>Settings</h2>
        <p className={`text-sm mt-1 ${t.textMuted}`}>Appearance, behavior, and system information</p>
      </div>

      {/* Desktop Theme */}
      <section className="space-y-3">
        <h3 className={`text-sm font-semibold uppercase tracking-wide ${t.sectionLabel}`}>Desktop Theme</h3>
        <div className="grid grid-cols-3 gap-3">
          {OS_THEMES.map(theme => (
            <button key={theme.id} onClick={() => setWin('osTheme', theme.id)}
              className={`relative rounded-xl overflow-hidden border-2 transition-all ${winPrefs.osTheme === theme.id ? 'border-green-500 shadow-md' : `${t.border} hover:border-green-400/50`}`}>
              <div className={`h-16 bg-gradient-to-br ${theme.preview}`} />
              <div className={`px-3 py-2 text-xs font-medium text-center ${t.text}`}>{theme.label}</div>
              {winPrefs.osTheme === theme.id && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Wallpaper */}
      <section className="space-y-3">
        <h3 className={`text-sm font-semibold uppercase tracking-wide ${t.sectionLabel}`}>Desktop Wallpaper</h3>
        <WallpaperUpload onUploadSuccess={handleWallpaperSuccess} onFileRemove={clearWallpaper} />
        {winPrefs.wallpaperUrl && (
          <div className="flex items-center gap-3">
            <div className="w-20 h-14 rounded-lg border overflow-hidden flex-shrink-0"
              style={{ backgroundImage: `url(${winPrefs.wallpaperUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div className="flex-1">
              <p className={`text-xs font-medium ${t.text}`}>Wallpaper active</p>
              <button onClick={clearWallpaper} className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2 mt-0.5">
                Remove
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Behavior */}
      <section className="space-y-3">
        <h3 className={`text-sm font-semibold uppercase tracking-wide ${t.sectionLabel}`}>Behavior</h3>
        <div className={sectionBg}>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className={`text-sm font-medium ${t.text}`}>Window animations</p>
              <p className={`text-xs ${t.textMuted}`}>Smooth open/close transitions</p>
            </div>
            <button onClick={() => setWin('animationSpeed', winPrefs.animationSpeed === 'none' ? 'normal' : 'none')}
              className={toggleClass(winPrefs.animationSpeed !== 'none', 'bg-green-500')}>
              <span className={toggleKnob(winPrefs.animationSpeed !== 'none')} />
            </button>
          </label>
        </div>
      </section>

      {/* Window Appearance */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-semibold uppercase tracking-wide ${t.sectionLabel}`}>Window Appearance</h3>
          <button onClick={resetWindowPrefs} className={`text-xs underline underline-offset-2 ${t.textMuted} hover:text-indigo-400`}>Reset to defaults</button>
        </div>

        <div className={`space-y-3 rounded-xl p-4 ${t.bgCard} border ${t.border}`}>

          {/* Glassmorphism toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className={`text-sm font-medium ${t.text}`}>Glassmorphism</p>
              <p className={`text-xs ${t.textMuted}`}>Translucent blurred window frames</p>
            </div>
            <button onClick={() => setWin('glassmorphism', !winPrefs.glassmorphism)}
              className={toggleClass(winPrefs.glassmorphism)}>
              <span className={toggleKnob(winPrefs.glassmorphism)} />
            </button>
          </label>

          {/* Blur amount */}
          {winPrefs.glassmorphism && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${t.text}`}>Blur intensity</p>
                <span className={`text-xs font-mono ${t.textMuted}`}>{winPrefs.blurAmount}px</span>
              </div>
              <input type="range" min={0} max={32} step={2}
                value={winPrefs.blurAmount}
                onChange={e => setWin('blurAmount', Number(e.target.value))}
                className="w-full h-1.5 accent-indigo-500 cursor-pointer" />
            </div>
          )}

          {/* Glass opacity */}
          {winPrefs.glassmorphism && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${t.text}`}>Background opacity</p>
                <span className={`text-xs font-mono ${t.textMuted}`}>{winPrefs.glassOpacity}%</span>
              </div>
              <input type="range" min={20} max={100} step={5}
                value={winPrefs.glassOpacity}
                onChange={e => setWin('glassOpacity', Number(e.target.value))}
                className="w-full h-1.5 accent-indigo-500 cursor-pointer" />
            </div>
          )}

          {/* Window border */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className={`text-sm font-medium ${t.text}`}>Window border</p>
              <p className={`text-xs ${t.textMuted}`}>Subtle border around windows</p>
            </div>
            <button onClick={() => setWin('showBorder', !winPrefs.showBorder)}
              className={toggleClass(winPrefs.showBorder)}>
              <span className={toggleKnob(winPrefs.showBorder)} />
            </button>
          </label>

          {/* Corner radius */}
          <div className="space-y-2">
            <p className={`text-sm font-medium ${t.text}`}>Corner radius</p>
            <div className="grid grid-cols-5 gap-1.5">
              {(['none', 'sm', 'md', 'lg', 'xl'] as CornerRadius[]).map(r => (
                <button key={r} onClick={() => setWin('cornerRadius', r)} className={chip(winPrefs.cornerRadius === r)}>
                  {r === 'none' ? 'Square' : r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Titlebar style */}
          <div className="space-y-2">
            <p className={`text-sm font-medium ${t.text}`}>Titlebar style</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(['glass', 'solid', 'minimal'] as TitlebarStyle[]).map(s => (
                <button key={s} onClick={() => setWin('titlebarcStyle', s)} className={chip(winPrefs.titlebarcStyle === s)}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Shadow level */}
          <div className="space-y-2">
            <p className={`text-sm font-medium ${t.text}`}>Drop shadow</p>
            <div className="grid grid-cols-5 gap-1.5">
              {(['none', 'sm', 'md', 'lg', 'xl'] as WindowPrefs['shadowLevel'][]).map(s => (
                <button key={s} onClick={() => setWin('shadowLevel', s)} className={chip(winPrefs.shadowLevel === s)}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Content padding */}
          <div className="space-y-2">
            <p className={`text-sm font-medium ${t.text}`}>Content padding</p>
            <div className="grid grid-cols-4 gap-1.5">
              {(['none', 'sm', 'md', 'lg'] as WindowPrefs['contentPadding'][]).map(p => (
                <button key={p} onClick={() => setWin('contentPadding', p)} className={chip(winPrefs.contentPadding === p)}>
                  {p === 'none' ? 'None' : p === 'sm' ? 'Small' : p === 'md' ? 'Medium' : 'Large'}
                </button>
              ))}
            </div>
          </div>

          {/* Animation speed */}
          <div className="space-y-2">
            <p className={`text-sm font-medium ${t.text}`}>Animation speed</p>
            <div className="grid grid-cols-4 gap-1.5">
              {(['none', 'fast', 'normal', 'slow'] as WindowPrefs['animationSpeed'][]).map(a => (
                <button key={a} onClick={() => setWin('animationSpeed', a)} className={chip(winPrefs.animationSpeed === a)}>
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* System Info */}
      <section className="space-y-3">
        <h3 className={`text-sm font-semibold uppercase tracking-wide ${t.sectionLabel}`}>System Info</h3>
        <div className={`rounded-xl p-4 space-y-2 text-sm ${t.bgCard} border ${t.border}`}>
          <div className="flex justify-between"><span className={t.textMuted}>OS Version</span><span className={`font-mono ${t.text}`}>OnTrail OS v1.0.0</span></div>
          <div className="flex justify-between"><span className={t.textMuted}>Kernel</span><span className={`font-mono ${snap.kernelConnected ? 'text-green-500' : t.textMuted}`}>{snap.kernelConnected ? `Connected ${snap.kernelVersion ? `(${snap.kernelVersion})` : ''}` : 'Offline'}</span></div>
          <div className="flex justify-between"><span className={t.textMuted}>Build</span><span className={`font-mono ${t.text}`}>{new Date().toISOString().slice(0, 10)}</span></div>
          <div className="flex justify-between"><span className={t.textMuted}>Browser</span><span className={`font-mono ${t.text} text-xs truncate ml-4`}>{navigator.userAgent.slice(0, 40)}…</span></div>
        </div>
      </section>

      {/* About */}
      <section>
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <p className={`font-semibold text-sm ${t.heading}`}>OnTrail OS</p>
              <p className={`text-xs ${t.textMuted}`}>Web-based Admin Operating System</p>
            </div>
          </div>
          <p className={`text-xs leading-relaxed ${t.textMuted}`}>A modular, kernel-driven WebOS built on top of OnTrail's admin platform. Apps are independently installed, event-driven, and communicate through the kernel event bus.</p>
        </div>
      </section>
    </div>
  );
}
