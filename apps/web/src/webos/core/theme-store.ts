/**
 * OS-wide theme token system.
 * All Tailwind class strings here must be STATIC (no template literals) so JIT can include them.
 * Usage: const t = useTheme();  then: className={t.bg}
 */
import { useSnapshot } from 'valtio';
import { windowPrefsStore, type OsTheme } from './window-prefs-store';

export interface ThemeTokens {
  /** Root shell background */
  shell: string;
  /** App/page background */
  bg: string;
  /** Card / section background */
  bgCard: string;
  /** Subtle hover background */
  bgHover: string;
  /** Active/selected item bg */
  bgActive: string;
  /** Primary text */
  text: string;
  /** Muted/secondary text */
  textMuted: string;
  /** Section heading text */
  heading: string;
  /** Border color */
  border: string;
  /** Divider (lighter than border) */
  divider: string;
  /** Input background */
  inputBg: string;
  /** Input border */
  inputBorder: string;
  /** Input text */
  inputText: string;
  /** Input placeholder */
  inputPlaceholder: string;
  /** Table row hover */
  tableHover: string;
  /** Badge background + text (space-separated) */
  badge: string;
  /** Danger badge */
  badgeDanger: string;
  /** Success badge */
  badgeSuccess: string;
  /** Info badge */
  badgeInfo: string;
  /** Section header label */
  sectionLabel: string;
  /** Scrollbar style: 'dark' | 'light' */
  scrollbar: 'dark' | 'light';
}

const tokens: Record<OsTheme, ThemeTokens> = {
  dark: {
    shell:            'bg-gray-950',
    bg:               'bg-[#12141c]',
    bgCard:           'bg-white/5',
    bgHover:          'hover:bg-white/8',
    bgActive:         'bg-white/10',
    text:             'text-white/90',
    textMuted:        'text-white/50',
    heading:          'text-white',
    border:           'border-white/10',
    divider:          'border-white/6',
    inputBg:          'bg-white/8',
    inputBorder:      'border-white/15',
    inputText:        'text-white/90',
    inputPlaceholder: 'placeholder-white/30',
    tableHover:       'hover:bg-white/5',
    badge:            'bg-white/10 text-white/70',
    badgeDanger:      'bg-red-500/20 text-red-300',
    badgeSuccess:     'bg-green-500/20 text-green-300',
    badgeInfo:        'bg-blue-500/20 text-blue-300',
    sectionLabel:     'text-white/40',
    scrollbar:        'dark',
  },
  light: {
    shell:            'bg-slate-100',
    bg:               'bg-white',
    bgCard:           'bg-gray-50',
    bgHover:          'hover:bg-gray-100',
    bgActive:         'bg-gray-100',
    text:             'text-gray-900',
    textMuted:        'text-gray-500',
    heading:          'text-gray-900',
    border:           'border-gray-200',
    divider:          'border-gray-100',
    inputBg:          'bg-white',
    inputBorder:      'border-gray-300',
    inputText:        'text-gray-900',
    inputPlaceholder: 'placeholder-gray-400',
    tableHover:       'hover:bg-gray-50',
    badge:            'bg-gray-100 text-gray-600',
    badgeDanger:      'bg-red-50 text-red-600',
    badgeSuccess:     'bg-green-50 text-green-700',
    badgeInfo:        'bg-blue-50 text-blue-700',
    sectionLabel:     'text-gray-400',
    scrollbar:        'light',
  },
  midnight: {
    shell:            'bg-indigo-950',
    bg:               'bg-[#0d0f1e]',
    bgCard:           'bg-indigo-900/25',
    bgHover:          'hover:bg-indigo-800/30',
    bgActive:         'bg-indigo-700/30',
    text:             'text-indigo-50',
    textMuted:        'text-indigo-300/60',
    heading:          'text-white',
    border:           'border-indigo-500/20',
    divider:          'border-indigo-500/10',
    inputBg:          'bg-indigo-900/40',
    inputBorder:      'border-indigo-500/30',
    inputText:        'text-indigo-50',
    inputPlaceholder: 'placeholder-indigo-400/50',
    tableHover:       'hover:bg-indigo-800/25',
    badge:            'bg-indigo-800/40 text-indigo-200',
    badgeDanger:      'bg-red-900/30 text-red-300',
    badgeSuccess:     'bg-emerald-900/30 text-emerald-300',
    badgeInfo:        'bg-blue-900/30 text-blue-300',
    sectionLabel:     'text-indigo-400/50',
    scrollbar:        'dark',
  },
};

/** React hook — use inside components */
export function useTheme(): ThemeTokens {
  const snap = useSnapshot(windowPrefsStore);
  return tokens[snap.osTheme];
}

/** Non-reactive helper (for use outside components) */
export function getTheme(osTheme: OsTheme): ThemeTokens {
  return tokens[osTheme];
}

/** Desktop wallpaper gradients per theme */
export const desktopGradient: Record<OsTheme, string> = {
  dark:     'radial-gradient(ellipse at 30% 60%, #0f2027 0%, #203a43 50%, #0f2027 100%)',
  light:    'radial-gradient(ellipse at 30% 60%, #dbeafe 0%, #e0f2fe 50%, #bfdbfe 100%)',
  midnight: 'radial-gradient(ellipse at 30% 60%, #1e1b4b 0%, #312e81 50%, #0f0f2e 100%)',
};

/** Taskbar appearance per theme */
export const taskbarClass: Record<OsTheme, string> = {
  dark:     'bg-gray-900/90 backdrop-blur border-t border-white/10',
  light:    'bg-white/90 backdrop-blur border-t border-gray-200',
  midnight: 'bg-indigo-950/90 backdrop-blur border-t border-indigo-500/20',
};

/** Taskbar text color per theme */
export const taskbarText: Record<OsTheme, string> = {
  dark:     'text-white/70 hover:text-white hover:bg-white/10',
  light:    'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
  midnight: 'text-indigo-200/70 hover:text-white hover:bg-indigo-800/50',
};

/** AppWindow glass colors per theme */
export const windowGlassColor: Record<OsTheme, { dark: string; light: string }> = {
  dark:     { dark: 'rgba(18, 20, 28,',    light: 'rgba(24, 26, 36,' },
  light:    { dark: 'rgba(240, 242, 248,', light: 'rgba(248, 250, 252,' },
  midnight: { dark: 'rgba(15, 15, 46,',   light: 'rgba(20, 18, 64,' },
};

export const windowBorderColor: Record<OsTheme, { on: string; off: string }> = {
  dark:     { on: '1px solid rgba(255,255,255,0.10)', off: 'none' },
  light:    { on: '1px solid rgba(0,0,0,0.10)',       off: 'none' },
  midnight: { on: '1px solid rgba(99,102,241,0.25)',  off: 'none' },
};

export const windowTitleText: Record<OsTheme, string> = {
  dark:     'text-white/60',
  light:    'text-gray-600',
  midnight: 'text-indigo-200/70',
};

export const windowButtonHover: Record<OsTheme, string> = {
  dark:     'hover:bg-white/10 hover:text-white/80',
  light:    'hover:bg-black/8 hover:text-gray-900',
  midnight: 'hover:bg-indigo-700/30 hover:text-white',
};
