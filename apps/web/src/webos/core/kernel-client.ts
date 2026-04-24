import { eventBus } from './event-bus';
import { setKernelConnected, pushNotification } from './system-store';

const WS_BASE = (() => {
  const apiUrl = import.meta.env.VITE_API_URL || 'https://api.ontrail.tech';
  return apiUrl.replace(/^http/, 'ws');
})();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalClose = false;

export function connectKernel() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  const token = localStorage.getItem('ontrail_token');
  if (!token) return;

  intentionalClose = false;
  const url = `${WS_BASE}/ws/kernel?token=${encodeURIComponent(token)}`;
  socket = new WebSocket(url);

  socket.onopen = () => {
    setKernelConnected(true);
    eventBus.emit('kernel:connected', null);
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  };

  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data) as { event: string; payload: unknown };
      eventBus.emit(msg.event, msg.payload);
      eventBus.emit('kernel:message', msg);
    } catch {}
  };

  socket.onerror = () => {
    setKernelConnected(false);
  };

  socket.onclose = (ev) => {
    setKernelConnected(false);
    socket = null;
    if (!intentionalClose && ev.code !== 4001 && ev.code !== 4003) {
      reconnectTimer = setTimeout(connectKernel, 4000);
    }
  };
}

export function disconnectKernel() {
  intentionalClose = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  socket?.close();
  socket = null;
}

export function sendKernelMessage(event: string, payload: unknown = null) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ event, payload }));
  }
}
