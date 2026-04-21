import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSnapshot } from 'valtio';
import { systemStore, markBootComplete } from '../core/system-store';
import { windowPrefsStore } from '../core/window-prefs-store';
import { connectKernel } from '../core/kernel-client';
import BootScreen from './BootScreen';
import Desktop from './Desktop';
import Taskbar from './Taskbar';
import WindowManager from './WindowManager';

export default function WebOSShell() {
  const snap = useSnapshot(systemStore);
  const { osTheme } = useSnapshot(windowPrefsStore);

  useEffect(() => {
    connectKernel();
  }, []);

  const handleBootComplete = () => {
    markBootComplete();
  };

  return (
    <div className={`fixed inset-0 overflow-hidden ${osTheme === 'light' ? 'bg-slate-100' : osTheme === 'midnight' ? 'bg-indigo-950' : 'bg-gray-950'}`}>
      <AnimatePresence>
        {!snap.bootComplete && !snap.sessionBooted && (
          <BootScreen key="boot" onComplete={handleBootComplete} />
        )}
      </AnimatePresence>

      {(snap.bootComplete || snap.sessionBooted) && (
        <>
          <Desktop />
          <WindowManager />
          <Taskbar />
        </>
      )}

      {/* If session was already booted (navigated back), skip boot screen */}
      {snap.sessionBooted && !snap.bootComplete && (() => {
        // Mark immediately on mount if session was already booted
        setTimeout(() => markBootComplete(), 0);
        return null;
      })()}
    </div>
  );
}
