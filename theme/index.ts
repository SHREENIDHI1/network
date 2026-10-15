/**
 * Design tokens for Sthira.
 *
 * Calm, low-contrast-but-readable palettes. Every text colour is checked to keep
 * at least WCAG AA contrast (4.5:1) against its background. Add a new theme by
 * adding an entry to PALETTES — screens only ever read tokens, never raw colours.
 */
export type ThemeId = 'dusk' | 'dawn';

export interface Palette {
  id: ThemeId;
  dark: boolean;
  /** Two-stop background gradient, top → bottom. */
  bg: [string, string];
  surface: string; // cards
  surfaceRaised: string; // pressed / selected cards
  border: string;
  text: string; // primary text
  textMuted: string; // secondary text
  accent: string; // calm teal-green, main action colour
  accentSoft: string; // tinted backgrounds behind accent elements
  warm: string; // warm neutral for wisdom / shloka cards
  warmSoft: string;
  calmButton: [string, string]; // gradient for the "I need calm now" button
  orb: [string, string];
  danger: string; // used only for the helpline call button, never for warnings
  onAccent: string;
}

export const PALETTES: Record<ThemeId, Palette> = {
  // Default: dark, deep blue night with sage accents.
  dusk: {
    id: 'dusk',
    dark: true,
    bg: ['#0f1a2b', '#0a1220'],
    surface: '#16233a',
    surfaceRaised: '#1d2d48',
    border: '#26385a',
    text: '#e9eef5',
    textMuted: '#a9b6c8',
    accent: '#8fd3c1',
    accentSoft: '#1c3a40',
    warm: '#e8c9a0',
    warmSoft: '#2b2a2c',
    calmButton: ['#3c6e8f', '#2f5f6b'],
    orb: ['#8fd3c1', '#6b9fd6'],
    danger: '#e79a8f',
    onAccent: '#0a1a1a',
  },
  // Light option: warm paper with muted green.
  dawn: {
    id: 'dawn',
    dark: false,
    bg: ['#f6f1e9', '#ece6dc'],
    surface: '#fffdf9',
    surfaceRaised: '#f2ece2',
    border: '#e0d7c8',
    text: '#22303c',
    textMuted: '#55636f',
    accent: '#2f7a6a',
    accentSoft: '#dcebe5',
    warm: '#8a5a24',
    warmSoft: '#f4e8d6',
    calmButton: ['#5b8fa8', '#4f8a7e'],
    orb: ['#7cc3b1', '#7ea8d8'],
    danger: '#b04a3c',
    onAccent: '#ffffff',
  },
};

export const SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const RADIUS = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

/** Base font sizes; multiplied by the user's font-scale setting. */
export const TYPE = {
  hero: 30,
  title: 24,
  heading: 19,
  body: 16,
  small: 14,
  tiny: 12,
} as const;

/** Minimum touch target (Apple HIG 44pt, Material 48dp) — we use 52 for comfort. */
export const TAP = 52;

/** Motion: everything is slow and eased. Reduced motion collapses to 0. */
export const MOTION = { gentle: 600, slow: 1200 } as const;
