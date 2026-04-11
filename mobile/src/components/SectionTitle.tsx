import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors, fonts, wp } from '../theme';

interface SectionTitleProps {
  title: string;
  subtitle?: string;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  icon?: React.ReactNode;
}

export default function SectionTitle({
  title,
  subtitle,
  style,
  titleStyle,
  icon,
}: SectionTitleProps) {
  return (
    <View style={[s.container, style]}>
      <View style={s.row}>
        {icon}
        <Text style={[s.title, titleStyle]}>{title}</Text>
      </View>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginBottom: wp(12),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
  },
  title: {
    fontSize: fonts.sizes.xl,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: fonts.sizes.sm,
    color: colors.textSecondary,
    marginTop: wp(4),
  },
});
