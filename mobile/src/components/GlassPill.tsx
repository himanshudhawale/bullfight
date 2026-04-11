import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, borderRadius, fonts, wp } from '../theme';

interface GlassPillProps {
  children?: React.ReactNode;
  label?: string;
  icon?: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'gold' | 'active';
}

export default function GlassPill({
  children,
  label,
  icon,
  style,
  variant = 'default',
}: GlassPillProps) {
  const variantStyle =
    variant === 'gold'
      ? s.gold
      : variant === 'active'
        ? s.active
        : s.default;

  return (
    <View style={[s.pill, variantStyle, style]}>
      {icon}
      {label ? (
        <Text
          style={[
            s.label,
            variant === 'active' && s.activeLabel,
            variant === 'gold' && s.goldLabel,
          ]}
        >
          {label}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
    borderRadius: borderRadius.full,
    paddingHorizontal: wp(14),
    paddingVertical: wp(7),
    borderWidth: 1,
  },
  default: {
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
  },
  gold: {
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderColor: colors.borderGold,
  },
  active: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  label: {
    fontSize: fonts.sizes.sm,
    fontWeight: '700',
    color: colors.text,
  },
  activeLabel: {
    color: colors.background,
  },
  goldLabel: {
    color: colors.primary,
  },
});
