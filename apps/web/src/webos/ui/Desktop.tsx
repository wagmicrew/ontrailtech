import { useState, useCallback } from 'react';
import { APP_REGISTRY, type AppDefinition } from '../core/app-registry';
import { openWindow } from '../core/window-manager';

interface ContextMenu {
  x: number;
  y: number;
}

export default function Desktop() {
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
      style={{
        background: 'radial-gradient(ellipse at 30% 60%, #0f2027 0%, #203a43 50%, #0f2027 100%)',
      }}
    >
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />

      {/* App Icons */}
      <div className="relative p-6 grid grid-cols-[repeat(auto-fill,96px)] gap-4 content-start">
        {APP_REGISTRY.map(app => (
          <button
            key={app.id}
            onClick={(e) => { e.stopPropagation(); launch(app); }}
            className="group flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/10 active:bg-white/20 transition-colors text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-3xl shadow-lg group-hover:bg-white/15 transition-colors">
              {app.icon}
            </div>
            <span className="text-xs text-white/90 font-medium leading-tight drop-shadow max-w-[80px] truncate">{app.name}</span>
          </button>
        ))}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-[9000] bg-gray-900/95 backdrop-blur border border-gray-700 rounded-xl shadow-2xl py-1.5 min-w-[180px] text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs text-gray-500 font-semibold uppercase tracking-wider">Apps</div>
          {APP_REGISTRY.map(app => (
            <button
              key={app.id}
              onClick={() => launch(app)}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-gray-200 hover:bg-white/10 transition-colors"
            >
              <span className="text-base">{app.icon}</span>
              <span>{app.name}</span>
            </button>
          ))}
          <div className="border-t border-gray-700 mt-1 pt-1">
            <button
              onClick={() => { window.location.reload(); }}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-gray-400 hover:bg-white/10 transition-colors"
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
