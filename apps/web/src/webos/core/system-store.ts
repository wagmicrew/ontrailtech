import { proxy } from 'valtio';

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  timestamp: number;
}

interface SystemState {
  bootComplete: boolean;
  kernelConnected: boolean;
  kernelVersion: string | null;
  notifications: Notification[];
  sessionBooted: boolean;
}

export const systemStore = proxy<SystemState>({
  bootComplete: false,
  kernelConnected: false,
  kernelVersion: null,
  notifications: [],
  sessionBooted: false,
});

export function markBootComplete() {
  systemStore.bootComplete = true;
  systemStore.sessionBooted = true;
}

export function setKernelConnected(connected: boolean, version?: string) {
  systemStore.kernelConnected = connected;
  if (version) systemStore.kernelVersion = version;
}

let _notifCounter = 0;
export function pushNotification(message: string, type: Notification['type'] = 'info') {
  const id = `notif-${++_notifCounter}`;
  systemStore.notifications.push({ id, message, type, timestamp: Date.now() });
  setTimeout(() => dismissNotification(id), 5000);
}

export function dismissNotification(id: string) {
  const idx = systemStore.notifications.findIndex(n => n.id === id);
  if (idx !== -1) systemStore.notifications.splice(idx, 1);
}
