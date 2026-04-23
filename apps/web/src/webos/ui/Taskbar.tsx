import { useSnapshot } from 'valtio';
import { wmStore, focusWindow, openWindow } from '../core/window-manager';
import { systemStore } from '../core/system-store';
import { windowPrefsStore } from '../core/window-prefs-store';
import { taskbarClass, taskbarText } from '../core/theme-store';
import { useState } from 'react';
import TaskbarClock from './TaskbarClock';
import NotificationPopup from './NotificationPopup';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';

export default function Taskbar() {
  const wmSnap = useSnapshot(wmStore);
  const sysSnap = useSnapshot(systemStore);
  const { osTheme } = useSnapshot(windowPrefsStore);
  const { username, isConnected } = useAuth();
  const [showNotifs, setShowNotifs] = useState(false);
  const [activating, setActivating] = useState(false);
  const isLight = osTheme === 'light';

  const handleOpenMyProfile = async () => {
    if (!username) return;
    // Activate runner status first (idempotent), then open profile
    if (!activating) {
      setActivating(true);
      try { await api.activateRunner(); } catch { /* already active */ } finally { setActivating(false); }
    }
    openWindow('runner-profile', 'Runner Profile', '👤', { username });
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 h-10 flex items-center px-2 gap-1 z-[8000] ${taskbarClass[osTheme]}`}>
      {/* Start / Home button */}
      <button
        className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500 hover:bg-green-400 transition-colors flex items-center justify-center"
        title="OnTrail OS"
        onClick={() => openWindow('settings', 'Settings', '⚙')}
      >
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      <div className={`w-px h-5 mx-1 flex-shrink-0 ${isLight ? 'bg-gray-300' : 'bg-white/10'}`} />

      {/* Running app buttons */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none">
        {wmSnap.windows.map(win => {
          const isActive = !win.minimized;
          return (
            <button
              key={win.id}
              onClick={() => {
                const w = wmStore.windows.find(x => x.id === win.id);
                if (w) { w.minimized = false; focusWindow(win.id); }
              }}
              className={`flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium transition-colors max-w-[140px] ${
                isActive
                  ? isLight
                    ? 'bg-black/10 text-gray-900 border border-black/15'
                    : 'bg-white/20 text-white border border-white/20'
                  : isLight
                    ? 'bg-black/5 text-gray-500 border border-black/8 hover:bg-black/10'
                    : 'bg-white/8 text-white/50 border border-white/10 hover:bg-white/15'
              }`}
            >
              <span className="flex-shrink-0">{win.icon}</span>
              <span className="truncate">{win.title}</span>
            </button>
          );
        })}
      </div>

      {/* My Runner Profile quick-launch */}
      {isConnected && username && (
        <button
          onClick={handleOpenMyProfile}
          title={`My Runner Profile (${username})`}
          className={`flex-shrink-0 flex items-center gap-1 px-2 h-7 rounded-md text-xs font-medium transition-colors
            ${isLight ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-purple-900/50 text-purple-300 hover:bg-purple-800/60'}`}
        >
          <span>👤</span>
          <span className="hidden sm:inline max-w-[80px] truncate">{username}</span>
        </button>
      )}

      {/* Kernel status */}
      <div className="flex items-center gap-1 mr-1" title={sysSnap.kernelConnected ? 'Kernel connected' : 'Kernel offline'}>
        <div className={`w-1.5 h-1.5 rounded-full ${sysSnap.kernelConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
      </div>

      {/* Notifications bell */}
      <button
        onClick={() => setShowNotifs(v => !v)}
        className={`relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${taskbarText[osTheme]}`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {sysSnap.notifications.length > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>

      <TaskbarClock />

      {/* Exit OS */}
      <a
        href="/"
        title="Exit to site"
        className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${taskbarText[osTheme]}`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
        </svg>
      </a>

      {showNotifs && <NotificationPopup />}
    </div>
  );
}
