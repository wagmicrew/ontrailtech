import { proxy } from 'valtio';
import type { ComponentType } from 'react';

export interface WindowState {
  id: string;
  appId: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  /** props passed to the app component */
  props?: Record<string, unknown>;
}

interface WindowManagerState {
  windows: WindowState[];
  nextZIndex: number;
}

export const wmStore = proxy<WindowManagerState>({
  windows: [],
  nextZIndex: 100,
});

function nextZ(): number {
  return ++wmStore.nextZIndex;
}

export function openWindow(appId: string, title: string, icon: string, props?: Record<string, unknown>): string {
  const id = `win-${appId}-${Date.now()}`;
  const existing = wmStore.windows.find(w => w.appId === appId);
  if (existing) {
    focusWindow(existing.id);
    if (existing.minimized) existing.minimized = false;
    return existing.id;
  }
  const offset = wmStore.windows.length * 28;
  wmStore.windows.push({
    id,
    appId,
    title,
    icon,
    x: 80 + offset,
    y: 60 + offset,
    width: 960,
    height: 640,
    zIndex: nextZ(),
    minimized: false,
    maximized: false,
    props,
  });
  return id;
}

export function closeWindow(id: string) {
  const idx = wmStore.windows.findIndex(w => w.id === id);
  if (idx !== -1) wmStore.windows.splice(idx, 1);
}

export function focusWindow(id: string) {
  const win = wmStore.windows.find(w => w.id === id);
  if (win) win.zIndex = nextZ();
}

export function minimizeWindow(id: string) {
  const win = wmStore.windows.find(w => w.id === id);
  if (win) win.minimized = true;
}

export function maximizeWindow(id: string) {
  const win = wmStore.windows.find(w => w.id === id);
  if (win) win.maximized = !win.maximized;
}

export function moveWindow(id: string, x: number, y: number) {
  const win = wmStore.windows.find(w => w.id === id);
  if (win) { win.x = x; win.y = y; }
}

export function resizeWindow(id: string, width: number, height: number) {
  const win = wmStore.windows.find(w => w.id === id);
  if (win) {
    win.width = Math.max(320, width);
    win.height = Math.max(240, height);
  }
}
