import { useSnapshot } from 'valtio';
import { wmStore, focusWindow, openWindow } from '../core/window-manager';
import { systemStore } from '../core/system-store';
import { getApp } from '../core/app-registry';
import { useState } from 'react';
import TaskbarClock from './TaskbarClock';
import NotificationPopup from './NotificationPopup';

export default function Taskbar() {
  const wmSnap = useSnapshot(wmStore);
  const sysSnap = useSnapshot(systemStore);
  const [showNotifs, setShowNotifs] = useState(false);

  return (
    <div className="fixed bottom-0 left-0 right-0 h-10 bg-gray-900/90 backdrop-blur border-t border-white/10 flex items-center px-2 gap-1 z-[8000]">
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

      <div className="w-px h-5 bg-white/10 mx-1 flex-shrink-0" />

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
                  ? 'bg-white/20 text-white border border-white/20'
                  : 'bg-white/8 text-white/50 border border-white/10 hover:bg-white/15'
              }`}
            >
              <span className="flex-shrink-0">{win.icon}</span>
              <span className="truncate">{win.title}</span>
            </button>
          );
        })}
      </div>

      {/* Kernel status */}
      <div className="flex items-center gap-1 mr-1" title={sysSnap.kernelConnected ? 'Kernel connected' : 'Kernel offline'}>
        <div className={`w-1.5 h-1.5 rounded-full ${sysSnap.kernelConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
      </div>

      {/* Notifications bell */}
      <button
        onClick={() => setShowNotifs(v => !v)}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
      >
        <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {sysSnap.notifications.length > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>

      <TaskbarClock />

      {showNotifs && <NotificationPopup />}
    </div>
  );
}
