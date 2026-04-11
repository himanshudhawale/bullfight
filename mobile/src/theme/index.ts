import { Dimensions, PixelRatio, Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Responsive scaling — design base is 390×844 (iPhone 14 / typical Android)
// Capped to prevent over-scaling on large screens (tablets, web)
// ---------------------------------------------------------------------------
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BASE_W = 390;
const BASE_H = 844;
const MAX_SCALE = 1.15;

const rawScaleW = SCREEN_W / BASE_W;
const rawScaleH = SCREEN_H / BASE_H;
const scaleW = Math.min(rawScaleW, MAX_SCALE);
const scaleH = Math.min(rawScaleH, MAX_SCALE);

/** Scale a value horizontally — capped to avoid zoom on large screens */
export function wp(size: number): number {
  return PixelRatio.roundToNearestPixel(size * scaleW);
}

/** Scale a value vertically — capped */
export function hp(size: number): number {
  return PixelRatio.roundToNearestPixel(size * scaleH);
}

/** Moderate scale — blends scaled + fixed (factor 0–1, default 0.5) */
export function ms(size: number, factor = 0.5): number {
  return PixelRatio.roundToNearestPixel(size + (wp(size) - size) * factor);
}

/** Font scale — uses moderate scaling to prevent oversized text */
export function fs(size: number): number {
  const scale = Math.min(rawScaleW, MAX_SCALE);
  return Math.round(size + (size * scale - size) * 0.5);
}

/** Screen dimensions helper */
export const screen = {
  width: SCREEN_W,
  height: SCREEN_H,
  isSmall: SCREEN_W < 360,
  isMedium: SCREEN_W >= 360 && SCREEN_W < 414,
  isLarge: SCREEN_W >= 414,
};

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
export const colors = {
  // Primary — Gold
  primary: '#D4AF37',
  primaryDark: '#B8941F',
  primaryLight: '#E8C84A',

  // Background
  background: '#0A0E1A',
  backgroundAlt: '#0D1117',
  surface: '#161B22',
  surfaceLight: '#21262D',

  // Glass surfaces
  glass: 'rgba(22, 27, 34, 0.75)',
  glassBorder: 'rgba(212, 175, 55, 0.15)',
  glassLight: 'rgba(33, 38, 45, 0.6)',

  // Casino greens
  felt: '#1A5C2E',
  feltLight: '#237A3C',

  // Text
  text: '#F0F6FC',
  textSecondary: '#8B949E',
  textMuted: '#484F58',

  // Accents
  red: '#FF4444',
  green: '#26D95C',
  blue: '#58A6FF',
  orange: '#F0883E',
  purple: '#BC8CFF',

  // VIP colors
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#E5E4E2',
  diamond: '#B9F2FF',

  // Status
  success: '#26D95C',
  error: '#FF4444',
  warning: '#F0883E',
  info: '#58A6FF',

  // Borders
  border: '#30363D',
  borderLight: '#484F58',
  borderGold: 'rgba(212, 175, 55, 0.3)',

  // Overlay
  overlay: 'rgba(0,0,0,0.7)',
  overlayLight: 'rgba(0,0,0,0.4)',
};

// ---------------------------------------------------------------------------
// Gradients — use with <LinearGradient colors={gradients.xxx} />
// ---------------------------------------------------------------------------
export const gradients = {
  goldButton: ['#E8C84A', '#D4AF37', '#B8941F'],
  goldShine: ['#FFD700', '#D4AF37'],
  goldSubtle: ['rgba(212,175,55,0.2)', 'rgba(212,175,55,0.05)'],
  surface: ['#161B22', '#0D1117'],
  background: ['#0A0E1A', '#0D1117', '#0A0E1A'],
  glass: ['rgba(22,27,34,0.8)', 'rgba(13,17,23,0.9)'],
  hero: ['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.7)'],
  tabBar: ['rgba(10,14,26,0.95)', 'rgba(10,14,26,0.98)'],
};

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------
export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
    },
    android: { elevation: 6 },
  }) as object,

  button: Platform.select({
    ios: {
      shadowColor: '#D4AF37',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
    },
    android: { elevation: 4 },
  }) as object,

  glow: Platform.select({
    ios: {
      shadowColor: '#D4AF37',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
    },
    android: { elevation: 8 },
  }) as object,

  subtle: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
    android: { elevation: 2 },
  }) as object,
};

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
export const fonts = {
  regular: 'System',
  bold: 'System',
  sizes: {
    xs: fs(10),
    sm: fs(12),
    md: fs(14),
    lg: fs(16),
    xl: fs(20),
    xxl: fs(24),
    hero: fs(32),
    title: fs(28),
  },
};

// ---------------------------------------------------------------------------
// Spacing (responsive)
// ---------------------------------------------------------------------------
export const spacing = {
  xs: ms(4),
  sm: ms(8),
  md: ms(12),
  lg: ms(16),
  xl: ms(24),
  xxl: ms(32),
};

// ---------------------------------------------------------------------------
// Border radii
// ---------------------------------------------------------------------------
export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
};

// ---------------------------------------------------------------------------
// Glass card style presets
// ---------------------------------------------------------------------------
export const glassStyle = {
  card: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: borderRadius.lg,
  },
  cardBright: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.borderGold,
    borderRadius: borderRadius.lg,
  },
  pill: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: borderRadius.full,
  },
  input: {
    backgroundColor: 'rgba(22, 27, 34, 0.6)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    color: colors.text,
  },
};
