/**
 * Aura Feedback System — lightweight toast/notification utility
 * for aura-related events across the app.
 */

type AuraToast = {
  id: string;
  message: string;
  icon: string;
  pulse?: boolean;
  duration: number;
};

type Listener = (toasts: AuraToast[]) => void;

let toasts: AuraToast[] = [];
let listeners: Listener[] = [];
let nextId = 0;

function notify() {
  listeners.forEach((l) => l([...toasts]));
}

function addToast(toast: Omit<AuraToast, 'id'>) {
  const id = `aura-toast-${++nextId}`;
  toasts = [...toasts, { ...toast, id }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, toast.duration);
}

export const auraFeedback = {
  /** Show "⚡ Aura Boost Applied" when supporting an aura-backed runner */
  boostApplied() {
    addToast({ message: 'Aura Boost Applied', icon: '⚡', duration: 3000 });
  },

  /** Show "🔥 This runner is gaining momentum" on significant aura increase */
  momentum() {
    addToast({ message: 'This runner is gaining momentum', icon: '🔥', duration: 3500 });
  },

  /** Show pulse + notification on aura level threshold crossing */
  levelUp(newLevel: string) {
    addToast({
      message: `Aura level reached: ${newLevel}`,
      icon: '✨',
      pulse: true,
      duration: 4000,
    });
  },

  /** Subscribe to toast changes */
  subscribe(listener: Listener) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },

  /** Get current toasts */
  getToasts() {
    return [...toasts];
  },
};

export type { AuraToast };
