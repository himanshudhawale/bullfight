import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, borderRadius, shadows, wp, hp } from '../theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'bright' | 'gold';
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

export default function GlassCard({
  children,
  style,
  variant = 'default',
  padding = 'md',
}: GlassCardProps) {
  const borderColor =
    variant === 'gold'
      ? colors.borderGold
      : variant === 'bright'
        ? 'rgba(212,175,55,0.25)'
        : colors.glassBorder;

  const paddingStyle = PADDING[padding];

  return (
    <View style={[s.outer, shadows.card, style]}>
      <LinearGradient
        colors={gradients.glass as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[s.inner, paddingStyle, { borderColor }]}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const PADDING: Record<string, ViewStyle> = {
  none: {},
  sm: { padding: wp(8) },
  md: { padding: wp(14) },
  lg: { padding: wp(20) },
};

const s = StyleSheet.create({
  outer: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  inner: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
});
