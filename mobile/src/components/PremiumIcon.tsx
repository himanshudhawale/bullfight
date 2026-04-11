import React from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { colors, wp } from '../theme';

const BULL_LOGO = require('../../assets/game/bull_logo.png');
const GOLD_COIN = require('../../assets/game/gold_coin.png');

/**
 * Icon name → { symbol, color, glowColor }
 * Uses Unicode geometric/dingbat characters styled to match the casino theme.
 * For assets (bull, coin), renders an Image instead.
 */
const ICON_MAP: Record<string, { symbol: string; color: string; glow: string }> = {
  // Tier / rank
  crown:    { symbol: '♛', color: '#FFD700', glow: 'rgba(255,215,0,0.3)' },
  diamond:  { symbol: '◆', color: '#B9F2FF', glow: 'rgba(185,242,255,0.3)' },
  trophy:   { symbol: '★', color: '#FFD700', glow: 'rgba(255,215,0,0.3)' },
  medal1:   { symbol: 'I',  color: '#FFD700', glow: 'rgba(255,215,0,0.3)' },
  medal2:   { symbol: 'II', color: '#C0C0C0', glow: 'rgba(192,192,192,0.3)' },
  medal3:   { symbol: 'III',color: '#CD7F32', glow: 'rgba(205,127,50,0.3)' },
  star:     { symbol: '★', color: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },

  // Game / action
  fire:     { symbol: '✦', color: '#FF6B35', glow: 'rgba(255,107,53,0.3)' },
  bolt:     { symbol: '⚡', color: '#E8C84A', glow: 'rgba(232,200,74,0.3)' },
  target:   { symbol: '◎', color: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },
  play:     { symbol: '▶', color: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },
  chart:    { symbol: '▲', color: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },
  sparkle:  { symbol: '✧', color: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },

  // Cards / casino
  spade:    { symbol: '♠', color: '#FFFFFF', glow: 'rgba(255,255,255,0.15)' },
  card:     { symbol: '♠', color: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },
  house:    { symbol: '⬡', color: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },
  table:    { symbol: '◈', color: '#1DB954', glow: 'rgba(29,185,84,0.3)' },
  frame:    { symbol: '❖', color: '#8A5CFF', glow: 'rgba(138,92,255,0.3)' },
  pair:     { symbol: '⊞', color: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },
  peace:    { symbol: '✌', color: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },

  // Social
  users:    { symbol: '⊡', color: 'rgba(255,255,255,0.7)', glow: 'rgba(255,255,255,0.1)' },
  chat:     { symbol: '◫', color: 'rgba(255,255,255,0.7)', glow: 'rgba(255,255,255,0.1)' },
  add:      { symbol: '+', color: '#1DB954', glow: 'rgba(29,185,84,0.3)' },
  check:    { symbol: '✓', color: '#1DB954', glow: 'rgba(29,185,84,0.3)' },
  cross:    { symbol: '✕', color: '#FF4444', glow: 'rgba(255,68,68,0.3)' },
  eye:      { symbol: '◉', color: 'rgba(255,255,255,0.7)', glow: 'rgba(255,255,255,0.1)' },
  sword:    { symbol: '⚔', color: '#FF6B35', glow: 'rgba(255,107,53,0.3)' },
  search:   { symbol: '⌕', color: 'rgba(255,255,255,0.5)', glow: 'rgba(255,255,255,0.1)' },
  inbox:    { symbol: '▣', color: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },

  // UI
  gift:     { symbol: '✦', color: '#1DB954', glow: 'rgba(29,185,84,0.3)' },
  settings: { symbol: '⚙', color: 'rgba(255,255,255,0.6)', glow: 'rgba(255,255,255,0.1)' },
  lock:     { symbol: '⬢', color: 'rgba(255,255,255,0.4)', glow: 'rgba(255,255,255,0.1)' },
  user:     { symbol: '◉', color: 'rgba(255,255,255,0.5)', glow: 'rgba(255,255,255,0.1)' },
  mail:     { symbol: '◇', color: 'rgba(255,255,255,0.5)', glow: 'rgba(255,255,255,0.1)' },
  sound:    { symbol: '♫', color: '#D4AF37', glow: 'rgba(212,175,55,0.3)' },
  music:    { symbol: '♪', color: '#8A5CFF', glow: 'rgba(138,92,255,0.3)' },
  bell:     { symbol: '◆', color: '#E8C84A', glow: 'rgba(232,200,74,0.3)' },

  // Bonuses
  flame:    { symbol: '✦', color: '#F0883E', glow: 'rgba(240,136,62,0.35)' },
  clock:    { symbol: '⏱', color: '#E8C84A', glow: 'rgba(232,200,74,0.3)' },
  shield:   { symbol: '◆', color: '#26D95C', glow: 'rgba(38,217,92,0.3)' },
  vip_star: { symbol: '★', color: '#BC8CFF', glow: 'rgba(188,140,255,0.35)' },

  // Status
  online:   { symbol: '●', color: '#1DB954', glow: 'rgba(29,185,84,0.4)' },
  away:     { symbol: '●', color: '#E8C84A', glow: 'rgba(232,200,74,0.3)' },
  offline:  { symbol: '●', color: 'rgba(255,255,255,0.3)', glow: 'rgba(255,255,255,0.05)' },
  ingame:   { symbol: '▶', color: '#8A5CFF', glow: 'rgba(138,92,255,0.3)' },
};

// Asset-based icons (render Image instead of Text)
const ASSET_ICONS: Record<string, any> = {
  bull: BULL_LOGO,
  coin: GOLD_COIN,
  chips: GOLD_COIN,
};

interface PremiumIconProps {
  name: string;
  size?: number;
  style?: any;
}

export default function PremiumIcon({ name, size = 18, style }: PremiumIconProps) {
  // Asset-based icon
  if (ASSET_ICONS[name]) {
    return (
      <View style={[s.wrap, { width: size, height: size }, style]}>
        <Image
          source={ASSET_ICONS[name]}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      </View>
    );
  }

  const icon = ICON_MAP[name];
  if (!icon) {
    // Fallback: render the name as-is (for unmapped icons)
    return <Text style={[{ fontSize: size * 0.8, color: '#D4AF37' }, style]}>{name}</Text>;
  }

  return (
    <View style={[s.wrap, { width: size, height: size }, style]}>
      <View style={[s.glow, {
        width: size * 1.4,
        height: size * 1.4,
        borderRadius: size * 0.7,
        backgroundColor: icon.glow,
        ...Platform.select({
          web: { boxShadow: `0 0 ${size * 0.5}px ${size * 0.2}px ${icon.glow}` } as any,
        }),
      }]} />
      <Text
        style={[s.symbol, {
          fontSize: size * 0.75,
          color: icon.color,
          textShadowColor: icon.glow,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 6,
        }]}
      >
        {icon.symbol}
      </Text>
    </View>
  );
}

/** Convenience: get just the symbol string for inline text usage */
export function getIconSymbol(name: string): string {
  if (ICON_MAP[name]) return ICON_MAP[name].symbol;
  return name;
}

/** Convenience: get just the color for inline text styling */
export function getIconColor(name: string): string {
  if (ICON_MAP[name]) return ICON_MAP[name].color;
  return '#D4AF37';
}

const s = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
  },
  symbol: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
