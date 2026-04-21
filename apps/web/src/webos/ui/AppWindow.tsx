import { useRef, useCallback, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useSnapshot } from 'valtio';
import { focusWindow, closeWindow, minimizeWindow, maximizeWindow, moveWindow, resizeWindow, type WindowState } from '../core/window-manager';
import { getApp } from '../core/app-registry';
import { windowPrefsStore, radiusMap, shadowMap, animDuration, paddingMap } from '../core/window-prefs-store';
import { windowGlassColor, windowBorderColor, windowTitleText, windowButtonHover } from '../core/theme-store';

interface ResizeDir { n: boolean; s: boolean; e: boolean; w: boolean; }

// ─── Icons ────────────────────────────────────────────────────────────────────
function MinimizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="1" y="4.5" width="8" height="1.5" rx="0.5" fill="currentColor" />
    </svg>
  );
}
function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="1.5" y="1.5" width="7" height="7" rx="0.75" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="3" y="1" width="6" height="6" rx="0.75" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M1 4v4.25C1 8.66 1.34 9 1.75 9H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AppLoader({ appId, props, padding }: { appId: string; props?: Record<string, unknown>; padding: string }) {
  const app = getApp(appId);
  const C = app?.component;
  if (!C) return (
    <div className="h-full flex items-center justify-center text-sm" style={{ color: 'rgba(150,150,170,0.8)' }}>
      App not found: <code className="ml-1 font-mono">{appId}</code>
    </div>
  );
  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center gap-2 text-sm" style={{ color: 'rgba(150,150,170,0.8)' }}>
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading…
      </div>
    }>
      <div className="h-full w-full overflow-auto" style={{ padding }}>
        <C {...(props || {})} />
      </div>
    </Suspense>
  );
}

export default function AppWindow({ win }: { win: WindowState }) {
  const prefs = useSnapshot(windowPrefsStore);
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

  if (win.minimized) return null;

  // ── Derived styles ─────────────────────────────────────────────────────────
  const radius = radiusMap[prefs.cornerRadius];
  const shadow = shadowMap[prefs.shadowLevel];
  const duration = animDuration[prefs.animationSpeed];
  const padding = paddingMap[prefs.contentPadding];
  const glassAlpha = prefs.glassOpacity / 100;
  const theme = prefs.osTheme;
  const gc = windowGlassColor[theme];
  const bc = windowBorderColor[theme];
  const isLight = theme === 'light';

  const windowStyle: React.CSSProperties = win.maximized
    ? { position: 'fixed', left: 0, top: 0, right: 0, bottom: 40, zIndex: win.zIndex, borderRadius: 0, boxShadow: 'none' }
    : { position: 'fixed', left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.zIndex, borderRadius: radius, boxShadow: shadow };

  const glassStyle: React.CSSProperties = prefs.glassmorphism
    ? {
        backdropFilter: `blur(${prefs.blurAmount}px) saturate(180%)`,
        WebkitBackdropFilter: `blur(${prefs.blurAmount}px) saturate(180%)`,
        backgroundColor: `${gc.dark}${glassAlpha})`,
        border: prefs.showBorder ? bc.on : bc.off,
      }
    : {
        backgroundColor: `${gc.light}${isLight ? '0.97)' : '0.97)'}`,
        border: prefs.showBorder ? bc.on : bc.off,
      };

  const titlebarBorderColor = isLight
    ? 'rgba(0,0,0,0.08)'
    : theme === 'midnight' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.08)';

  const titlebarStyle: React.CSSProperties =
    prefs.titlebarcStyle === 'glass'
      ? { backdropFilter: `blur(${prefs.blurAmount + 4}px)`, WebkitBackdropFilter: `blur(${prefs.blurAmount + 4}px)`,
          backgroundColor: isLight ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.04)',
          borderBottom: `1px solid ${titlebarBorderColor}` }
      : prefs.titlebarcStyle === 'minimal'
      ? { backgroundColor: 'transparent', borderBottom: `1px solid ${titlebarBorderColor}` }
      : { backgroundColor: isLight ? 'rgba(220,225,235,0.9)' : 'rgba(12,14,20,0.6)',
          borderBottom: `1px solid ${titlebarBorderColor}` };

  const titlebarRadius = win.maximized ? '0' : `${radius} ${radius} 0 0`;
  const closeRadius = win.maximized ? '0' : `0 ${radius} 0 0`;
  const titleTextClass = windowTitleText[theme];
  const btnHoverClass = windowButtonHover[theme];
  const btnBase = isLight ? 'text-gray-400/70' : 'text-white/35';
  const btnDivider = isLight ? 'border-black/[0.06]' : 'border-white/[0.06]';

  return (
    <motion.div
      initial={duration > 0 ? { opacity: 0, scale: 0.97, y: 8 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={duration > 0 ? { opacity: 0, scale: 0.96, y: 6 } : undefined}
      transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
      style={{ ...windowStyle, ...glassStyle }}
      onMouseDown={() => focusWindow(win.id)}
      className="flex flex-col overflow-hidden select-none"
    >
      {/* ── Titlebar ──────────────────────────────────────────────────────── */}
      <div
        onMouseDown={onTitleMouseDown}
        onDoubleClick={() => maximizeWindow(win.id)}
        style={{ ...titlebarStyle, borderRadius: titlebarRadius }}
        className="flex items-center h-10 flex-shrink-0 cursor-default"
      >
        {/* Icon + title */}
        <span className="text-base leading-none ml-3 mr-2 flex-shrink-0">{win.icon}</span>
        <span className={`text-xs font-semibold flex-1 truncate tracking-wide ${titleTextClass}`}>{win.title}</span>

        {/* ── Rectangular window controls ───────────────────────────── */}
        <div className="flex items-stretch h-full flex-shrink-0" onMouseDown={e => e.stopPropagation()}>
          <button
            onClick={() => minimizeWindow(win.id)} title="Minimize"
            className={`flex items-center justify-center w-9 h-full transition-colors duration-100 border-l ${btnBase} ${btnHoverClass} ${btnDivider}`}
          >
            <MinimizeIcon />
          </button>
          <button
            onClick={() => maximizeWindow(win.id)} title={win.maximized ? 'Restore' : 'Maximize'}
            className={`flex items-center justify-center w-9 h-full transition-colors duration-100 border-l ${btnBase} ${btnHoverClass} ${btnDivider}`}
          >
            {win.maximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button
            onClick={() => closeWindow(win.id)} title="Close"
            style={{ borderRadius: closeRadius }}
            className={`flex items-center justify-center w-9 h-full transition-colors duration-100 border-l ${btnBase} hover:text-red-500 hover:bg-red-500/15 ${btnDivider}`}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* ── App content ───────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-hidden"
        style={{ background: prefs.glassmorphism
          ? isLight ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.02)'
          : isLight ? 'rgba(248,250,252,1)' : 'rgba(255,255,255,0.01)' }}
      >
        <AppLoader appId={win.appId} props={win.props} padding={padding} />
      </div>

      {/* ── Resize handles ────────────────────────────────────────────────── */}
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
