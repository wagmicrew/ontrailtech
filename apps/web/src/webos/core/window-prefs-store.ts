import { proxy, subscribe } from 'valtio';

export type TitlebarStyle = 'glass' | 'solid' | 'minimal';
export type CornerRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';

export interface WindowPrefs {
  /** Enable glassmorphism (backdrop-blur + translucent bg) */
  glassmorphism: boolean;
  /** Glass blur intensity: 0–20 */
  blurAmount: number;
  /** Glass background opacity: 0–100 */
  glassOpacity: number;
  /** Window corner radius */
  cornerRadius: CornerRadius;
  /** Titlebar visual style */
  titlebarcStyle: TitlebarStyle;
  /** Show window border */
  showBorder: boolean;
  /** Drop shadow intensity: 'none' | 'sm' | 'md' | 'lg' | 'xl' */
  shadowLevel: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /** Content padding inside windows */
  contentPadding: 'none' | 'sm' | 'md' | 'lg';
  /** Window animation speed: 'fast' | 'normal' | 'slow' | 'none' */
  animationSpeed: 'none' | 'fast' | 'normal' | 'slow';
}

const STORAGE_KEY = 'ontrail-window-prefs';

function loadSaved(): Partial<WindowPrefs> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

const defaults: WindowPrefs = {
  glassmorphism: true,
  blurAmount: 16,
  glassOpacity: 80,
  cornerRadius: 'lg',
  titlebarcStyle: 'glass',
  showBorder: true,
  shadowLevel: 'xl',
  contentPadding: 'md',
  animationSpeed: 'normal',
};

export const windowPrefsStore = proxy<WindowPrefs>({ ...defaults, ...loadSaved() });

// Persist to localStorage on any change
subscribe(windowPrefsStore, () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...windowPrefsStore }));
  } catch {
    // ignore
  }
});

export function resetWindowPrefs() {
  Object.assign(windowPrefsStore, defaults);
}

// Helper maps used by AppWindow
export const radiusMap: Record<CornerRadius, string> = {
  none: '0px',
  sm:   '4px',
  md:   '8px',
  lg:   '12px',
  xl:   '20px',
};

export const shadowMap: Record<WindowPrefs['shadowLevel'], string> = {
  none: 'none',
  sm:   '0 1px 3px rgba(0,0,0,0.2)',
  md:   '0 4px 16px rgba(0,0,0,0.25)',
  lg:   '0 8px 32px rgba(0,0,0,0.3)',
  xl:   '0 16px 64px rgba(0,0,0,0.4)',
};

export const animDuration: Record<WindowPrefs['animationSpeed'], number> = {
  none:   0,
  fast:   0.08,
  normal: 0.15,
  slow:   0.3,
};

export const paddingMap: Record<WindowPrefs['contentPadding'], string> = {
  none: '0px',
  sm:   '8px',
  md:   '16px',
  lg:   '24px',
};
