import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSnapshot } from 'valtio';
import { systemStore, markBootComplete } from '../core/system-store';
import { connectKernel } from '../core/kernel-client';
import BootScreen from './BootScreen';
import Desktop from './Desktop';
import Taskbar from './Taskbar';
import WindowManager from './WindowManager';

export default function WebOSShell() {
  const snap = useSnapshot(systemStore);

  useEffect(() => {
    connectKernel();
  }, []);

  const handleBootComplete = () => {
    markBootComplete();
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-gray-950">
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
