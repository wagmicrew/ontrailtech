import { useState, useEffect } from 'react';
import { useSnapshot } from 'valtio';
import { systemStore } from '../../core/system-store';

type Theme = 'dark-os' | 'light-os' | 'midnight';

const THEMES: { id: Theme; label: string; preview: string }[] = [
  { id: 'dark-os', label: 'Dark OS', preview: 'from-gray-950 to-gray-800' },
  { id: 'light-os', label: 'Light OS', preview: 'from-blue-200 to-indigo-300' },
  { id: 'midnight', label: 'Midnight', preview: 'from-indigo-950 to-purple-900' },
];

const STORAGE_KEY = 'ontrail-os-prefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function savePrefs(prefs: object) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export default function SettingsApp() {
  const snap = useSnapshot(systemStore);
  const [prefs, setPrefs] = useState(() => ({ theme: 'dark-os' as Theme, animations: true, ...loadPrefs() }));

  useEffect(() => { savePrefs(prefs); }, [prefs]);

  const set = (key: string, value: unknown) => setPrefs((p: typeof prefs) => ({ ...p, [key]: value }));

  return (
    <div className="p-6 space-y-6 bg-white min-h-full">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Appearance, behavior, and system information</p>
      </div>

      {/* Desktop Theme */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Desktop Theme</h3>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map(t => (
            <button key={t.id} onClick={() => set('theme', t.id)}
              className={`relative rounded-xl overflow-hidden border-2 transition-all ${prefs.theme === t.id ? 'border-green-500 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className={`h-16 bg-gradient-to-br ${t.preview}`} />
              <div className="px-3 py-2 text-xs font-medium text-gray-700 text-center">{t.label}</div>
              {prefs.theme === t.id && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Behavior */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Behavior</h3>
        <div className="space-y-3 bg-gray-50 rounded-xl p-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-gray-800">Window animations</p>
              <p className="text-xs text-gray-500">Smooth open/close transitions</p>
            </div>
            <button onClick={() => set('animations', !prefs.animations)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${prefs.animations ? 'bg-green-500' : 'bg-gray-200'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${prefs.animations ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </label>
        </div>
      </section>

      {/* System Info */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">System Info</h3>
        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">OS Version</span><span className="font-mono text-gray-700">OnTrail OS v1.0.0</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Kernel</span><span className={`font-mono ${snap.kernelConnected ? 'text-green-600' : 'text-gray-400'}`}>{snap.kernelConnected ? `Connected ${snap.kernelVersion ? `(${snap.kernelVersion})` : ''}` : 'Offline'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Build</span><span className="font-mono text-gray-700">{new Date().toISOString().slice(0, 10)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Browser</span><span className="font-mono text-gray-700 text-xs truncate ml-4">{navigator.userAgent.slice(0, 40)}…</span></div>
        </div>
      </section>

      {/* About */}
      <section>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">OnTrail OS</p>
              <p className="text-xs text-gray-500">Web-based Admin Operating System</p>
            </div>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">A modular, kernel-driven WebOS built on top of OnTrail's admin platform. Apps are independently installed, event-driven, and communicate through the kernel event bus.</p>
        </div>
      </section>
    </div>
  );
}
