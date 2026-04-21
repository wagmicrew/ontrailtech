import { useSnapshot } from 'valtio';
import { AnimatePresence } from 'framer-motion';
import { wmStore, type WindowState } from '../core/window-manager';
import AppWindow from './AppWindow';

export default function WindowManager() {
  const snap = useSnapshot(wmStore);
  return (
    <AnimatePresence>
      {snap.windows.map(win => (
        <AppWindow key={win.id} win={win as WindowState} />
      ))}
    </AnimatePresence>
  );
}

