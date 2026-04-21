import { useSnapshot } from 'valtio';
import { wmStore, type WindowState } from '../core/window-manager';
import AppWindow from './AppWindow';

export default function WindowManager() {
  const snap = useSnapshot(wmStore);
  return (
    <>
      {snap.windows.map(win => (
        <AppWindow key={win.id} win={win as WindowState} />
      ))}
    </>
  );
}

