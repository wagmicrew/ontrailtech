import { useState, useCallback } from 'react';
import { useSnapshot } from 'valtio';
import { APP_REGISTRY, type AppDefinition } from '../core/app-registry';
import { openWindow } from '../core/window-manager';
import { windowPrefsStore } from '../core/window-prefs-store';
import { desktopGradient } from '../core/theme-store';

interface ContextMenu {
  x: number;
  y: number;
}

export default function Desktop() {
  const { osTheme } = useSnapshot(windowPrefsStore);
  const isLight = osTheme === 'light';
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  const launch = useCallback((app: AppDefinition) => {
    openWindow(app.id, app.name, app.icon);
    setContextMenu(null);
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      className="absolute inset-0 bottom-10 overflow-hidden"
      onContextMenu={onContextMenu}
      onClick={() => setContextMenu(null)}
      style={{ background: desktopGradient[osTheme] }}
    >
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: `linear-gradient(${isLight ? '#000' : '#fff'} 1px, transparent 1px), linear-gradient(90deg, ${isLight ? '#000' : '#fff'} 1px, transparent 1px)`, backgroundSize: '40px 40px' }}
      />

      {/* App Icons */}
      <div className="relative p-6 grid grid-cols-[repeat(auto-fill,96px)] gap-4 content-start">
        {APP_REGISTRY.map(app => (
          <button
            key={app.id}
            onClick={(e) => { e.stopPropagation(); launch(app); }}
            className={`group flex flex-col items-center gap-1.5 p-2 rounded-xl transition-colors text-center ${isLight ? 'hover:bg-black/8 active:bg-black/12' : 'hover:bg-white/10 active:bg-white/20'}`}
          >
            <div className={`w-14 h-14 rounded-2xl backdrop-blur-sm flex items-center justify-center text-3xl shadow-lg transition-colors ${isLight ? 'bg-black/8 border border-black/10 group-hover:bg-black/12' : 'bg-white/10 border border-white/15 group-hover:bg-white/15'}`}>
              {app.icon}
            </div>
            <span className={`text-xs font-medium leading-tight drop-shadow max-w-[80px] truncate ${isLight ? 'text-gray-800' : 'text-white/90'}`}>{app.name}</span>
          </button>
        ))}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className={`fixed z-[9000] backdrop-blur rounded-xl shadow-2xl py-1.5 min-w-[180px] text-sm border ${isLight ? 'bg-white/95 border-gray-200' : 'bg-gray-900/95 border-gray-700'}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>Apps</div>
          {APP_REGISTRY.map(app => (
            <button
              key={app.id}
              onClick={() => launch(app)}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-2 transition-colors ${isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-white/10'}`}
            >
              <span className="text-base">{app.icon}</span>
              <span>{app.name}</span>
            </button>
          ))}
          <div className={`border-t mt-1 pt-1 ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
            <button
              onClick={() => { window.location.reload(); }}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-2 transition-colors ${isLight ? 'text-gray-400 hover:bg-gray-100' : 'text-gray-400 hover:bg-white/10'}`}
            >
              <span className="text-base">🔄</span>
              <span>Refresh Desktop</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
