import { useRef, useCallback, Suspense } from 'react';
import { motion } from 'framer-motion';
import { focusWindow, closeWindow, minimizeWindow, maximizeWindow, moveWindow, resizeWindow, type WindowState } from '../core/window-manager';
import { getApp } from '../core/app-registry';

interface ResizeDir { n: boolean; s: boolean; e: boolean; w: boolean; }

function AppLoader({ appId, props }: { appId: string; props?: Record<string, unknown> }) {
  const app = getApp(appId);
  const C = app?.component;
  if (!C) return <div className="p-8 text-center text-gray-400">App not found: {appId}</div>;
  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading…
      </div>
    }>
      <C {...(props || {})} />
    </Suspense>
  );
}

export default function AppWindow({ win }: { win: WindowState }) {
  const dragging = useRef(false);
  const resizing = useRef<ResizeDir | null>(null);
  const startPos = useRef({ mx: 0, my: 0, wx: 0, wy: 0, ww: 0, wh: 0 });

  const captureStart = (e: React.MouseEvent) => {
    startPos.current = { mx: e.clientX, my: e.clientY, wx: win.x, wy: win.y, ww: win.width, wh: win.height };
  };

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (win.maximized) return;
    e.preventDefault();
    dragging.current = true;
    captureStart(e);
    focusWindow(win.id);
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      moveWindow(win.id, Math.max(0, startPos.current.wx + ev.clientX - startPos.current.mx), Math.max(0, startPos.current.wy + ev.clientY - startPos.current.my));
    };
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [win]);

  const onResizeMouseDown = useCallback((dir: ResizeDir) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizing.current = dir;
    captureStart(e);
    focusWindow(win.id);
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const d = resizing.current;
      const dx = ev.clientX - startPos.current.mx;
      const dy = ev.clientY - startPos.current.my;
      let nx = startPos.current.wx, ny = startPos.current.wy;
      let nw = startPos.current.ww, nh = startPos.current.wh;
      if (d.e) nw = Math.max(320, nw + dx);
      if (d.s) nh = Math.max(240, nh + dy);
      if (d.w) { nw = Math.max(320, nw - dx); nx = startPos.current.wx + (startPos.current.ww - nw); }
      if (d.n) { nh = Math.max(240, nh - dy); ny = startPos.current.wy + (startPos.current.wh - nh); }
      moveWindow(win.id, nx, ny);
      resizeWindow(win.id, nw, nh);
    };
    const onUp = () => { resizing.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [win]);

  const style: React.CSSProperties = win.maximized
    ? { position: 'fixed', left: 0, top: 0, right: 0, bottom: 40, zIndex: win.zIndex }
    : { position: 'fixed', left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.zIndex };

  if (win.minimized) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.14 }}
      style={style}
      onMouseDown={() => focusWindow(win.id)}
      className="flex flex-col bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden select-none"
    >
      {/* Title bar */}
      <div onMouseDown={onTitleMouseDown} onDoubleClick={() => maximizeWindow(win.id)}
        className="h-10 flex items-center px-3 gap-2 bg-gray-100 border-b border-gray-200 cursor-default flex-shrink-0">
        <span className="text-base leading-none">{win.icon}</span>
        <span className="text-sm font-medium text-gray-700 flex-1 truncate select-none">{win.title}</span>
        <div className="flex items-center gap-1.5 ml-2">
          {([
            { color: 'yellow', action: () => minimizeWindow(win.id), label: '−', title: 'Minimize' },
            { color: 'green',  action: () => maximizeWindow(win.id), label: '+', title: 'Maximize' },
            { color: 'red',    action: () => closeWindow(win.id),    label: '✕', title: 'Close' },
          ] as const).map(btn => (
            <button key={btn.title} onMouseDown={e => e.stopPropagation()} onClick={btn.action} title={btn.title}
              className={`w-3 h-3 rounded-full bg-${btn.color}-400 hover:bg-${btn.color}-500 transition-colors flex items-center justify-center group`}>
              <span className={`text-${btn.color}-800 opacity-0 group-hover:opacity-100 text-[8px] leading-none font-bold`}>{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* App content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <AppLoader appId={win.appId} props={win.props} />
      </div>

      {/* Resize handles */}
      {!win.maximized && (
        <>
          <div onMouseDown={onResizeMouseDown({ n:false, s:true,  e:false, w:false })} className="absolute bottom-0 left-2 right-2 h-1.5 cursor-s-resize" />
          <div onMouseDown={onResizeMouseDown({ n:true,  s:false, e:false, w:false })} className="absolute top-0    left-2 right-2 h-1.5 cursor-n-resize" />
          <div onMouseDown={onResizeMouseDown({ n:false, s:false, e:true,  w:false })} className="absolute right-0  top-2 bottom-2 w-1.5 cursor-e-resize" />
          <div onMouseDown={onResizeMouseDown({ n:false, s:false, e:false, w:true  })} className="absolute left-0   top-2 bottom-2 w-1.5 cursor-w-resize" />
          <div onMouseDown={onResizeMouseDown({ n:false, s:true,  e:true,  w:false })} className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize" />
          <div onMouseDown={onResizeMouseDown({ n:false, s:true,  e:false, w:true  })} className="absolute bottom-0 left-0  w-3 h-3 cursor-sw-resize" />
          <div onMouseDown={onResizeMouseDown({ n:true,  s:false, e:true,  w:false })} className="absolute top-0    right-0 w-3 h-3 cursor-ne-resize" />
          <div onMouseDown={onResizeMouseDown({ n:true,  s:false, e:false, w:true  })} className="absolute top-0    left-0  w-3 h-3 cursor-nw-resize" />
        </>
      )}
    </motion.div>
  );
}
