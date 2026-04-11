import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { fs, wp } from '../theme';

interface BrandTitleProps {
  /** Font size override — defaults to fs(44) */
  size?: number;
  /** Extra letter spacing — defaults to 10 */
  spacing?: number;
}

/**
 * Premium "BULL FIGHT" brand title with layered glow and
 * CSS gradient text on web for a cinematic identity feel.
 */
export default function BrandTitle({ size, spacing }: BrandTitleProps) {
  const fontSize = size ?? fs(44);
  const letterSpacing = spacing ?? 10;

  const base = {
    fontSize,
    fontWeight: '900' as const,
    letterSpacing,
    textTransform: 'uppercase' as const,
  };

  /* ── Web: CSS gradient text ── */
  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        {/* Diffuse back-glow layer */}
        <Text
          style={[
            base,
            styles.webGlow,
            { fontSize },
          ]}
        >
          BULL FIGHT
        </Text>
        {/* Main gradient text */}
        <Text
          style={[
            base,
            styles.webGradient,
            {
              fontSize,
              // @ts-ignore — web-only CSS
              backgroundImage: 'linear-gradient(180deg, #FFFFFF 0%, #F0E6C0 35%, #D4AF37 75%, #B8941F 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.5))',
            } as any,
          ]}
        >
          BULL FIGHT
        </Text>
      </View>
    );
  }

  /* ── Native: layered text shadows ── */
  return (
    <View style={styles.wrap}>
      {/* Layer 1 — wide diffuse purple glow */}
      <Text
        style={[
          base,
          styles.nativeGlow1,
          { fontSize },
        ]}
      >
        BULL FIGHT
      </Text>
      {/* Layer 2 — warm gold mid-glow */}
      <Text
        style={[
          base,
          styles.nativeGlow2,
          { fontSize },
        ]}
      >
        BULL FIGHT
      </Text>
      {/* Layer 3 — crisp front text */}
      <Text
        style={[
          base,
          styles.nativeFront,
          { fontSize },
        ]}
      >
        BULL FIGHT
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Web layers ── */
  webGlow: {
    position: 'absolute',
    color: 'rgba(212,175,55,0.35)',
    textShadowColor: 'rgba(155,92,255,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 40,
  },
  webGradient: {
    color: '#FFFFFF', // fallback
  },

  /* ── Native layers ── */
  nativeGlow1: {
    position: 'absolute',
    color: 'transparent',
    textShadowColor: 'rgba(155,92,255,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 35,
  },
  nativeGlow2: {
    position: 'absolute',
    color: 'transparent',
    textShadowColor: 'rgba(212,175,55,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 18,
  },
  nativeFront: {
    color: '#F5E6B8',
    textShadowColor: 'rgba(212,175,55,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
