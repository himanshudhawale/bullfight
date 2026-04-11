import React, { useRef, useEffect, useState } from 'react';
import {
  TouchableOpacity,
  Animated,
  Pressable,
  Text,
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, colors, shadows, borderRadius, fonts, wp, hp } from '../theme';

const BTN_ASSET = require('../../assets/game/btn_bet_option_base.png');
const BTN_ASSET_ACTIVE = require('../../assets/game/btn_bet_option_selected.png');

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'premium' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export default function GradientButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'md',
  style,
  textStyle,
  icon,
}: GradientButtonProps) {
  const sizeStyle = SIZE_STYLES[size];

  const [assetPressed, setAssetPressed] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.15)).current;
  const pressGlow = useRef(new Animated.Value(0)).current;
  const shineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (variant !== 'primary' && variant !== 'premium') return;
    const glowRange = variant === 'premium' ? { from: 0.25, to: 0.55 } : { from: 0.15, to: 0.3 };
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: glowRange.to,
          duration: variant === 'premium' ? 1800 : 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: glowRange.from,
          duration: variant === 'premium' ? 1800 : 1500,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [variant, glowAnim]);

  // Animated shine sweep for primary & premium
  useEffect(() => {
    if (variant !== 'premium' && variant !== 'primary') return;
    const delay = variant === 'premium' ? 2500 : 4000;
    const dur = variant === 'premium' ? 800 : 1000;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(shineAnim, {
          toValue: 1,
          duration: dur,
          useNativeDriver: true,
        }),
        Animated.timing(shineAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [variant, shineAnim]);

  // Combined glow: idle breathing + press boost
  const combinedGlow = Animated.add(glowAnim, pressGlow);

  const onPressIn = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(pressGlow, {
        toValue: 0.35,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const onPressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(pressGlow, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  if (variant === 'premium') {
    // Asset is 1536×1024 (1.5:1) — use full width, derive height from ratio
    const btnWidth = wp(224);
    const btnHeight = btnWidth / 4.5;

    return (
      <Animated.View style={[{ transform: [{ scale: scaleAnim }], alignItems: 'center' as const, alignSelf: 'center' as const, width: btnWidth, marginTop: -btnHeight * 0.2 + hp(2) }, disabled && s.disabled, style]}>
        <Animated.View
          style={{
            position: 'absolute',
            width: btnWidth * 0.85,
            height: btnHeight * 0.5,
            borderRadius: btnHeight * 0.25,
            top: btnHeight * 0.25,
            opacity: combinedGlow as any,
            ...Platform.select({
              ios: {
                shadowColor: '#D4AF37',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 1,
                shadowRadius: 20,
              },
              android: {
                elevation: 14,
                backgroundColor: '#D4AF37',
              },
              web: {
                boxShadow: '0 0 24px 6px rgba(212,175,55,0.35)',
              } as any,
            }),
          }}
        />
          <View style={{ width: btnWidth, height: btnHeight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <Pressable
              onPress={onPress}
              onPressIn={() => {
                setAssetPressed(true);
                onPressIn();
              }}
              onPressOut={() => {
                setTimeout(() => setAssetPressed(false), 120);
                onPressOut();
              }}
              disabled={disabled || loading}
              style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
            >
              {/* Button asset fills container */}
              <Image
                source={assetPressed ? BTN_ASSET_ACTIVE : BTN_ASSET}
                resizeMode="contain"
                style={{ position: 'absolute', width: wp(272), height: btnHeight * 1.8, top: '-30%' }}
              />
              <LinearGradient
                colors={['rgba(212,175,55,0.06)', 'transparent', 'rgba(212,175,55,0.04)'] as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: 'absolute', width: '80%', height: '55%', borderRadius: 16 }}
                pointerEvents="none"
              />
              {/* Animated shine sweep */}
              <Animated.View
                style={[
                  s.premiumShine,
                  {
                    height: btnHeight * 0.55,
                    opacity: shineAnim.interpolate({
                      inputRange: [0, 0.3, 0.7, 1],
                      outputRange: [0, 0.2, 0.2, 0],
                    }),
                    transform: [{
                      translateX: shineAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-wp(80), btnWidth],
                      }),
                    }],
                  },
                ]}
                pointerEvents="none"
              />
              {icon}
              {loading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={[s.premiumText, sizeStyle.text, textStyle]}>{title}</Text>
              )}
            </Pressable>
          </View>
      </Animated.View>
    );
  }

  if (variant === 'outline') {
    return (
      <TouchableOpacity
        style={[s.outline, sizeStyle.container, disabled && s.disabled, style]}
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.7}
      >
        {icon}
        {loading ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Text style={[s.outlineText, sizeStyle.text, textStyle]}>{title}</Text>
        )}
      </TouchableOpacity>
    );
  }

  if (variant === 'secondary') {
    return (
      <TouchableOpacity
        style={[s.secondary, sizeStyle.container, disabled && s.disabled, style]}
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.7}
      >
        {icon}
        {loading ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Text style={[s.secondaryText, sizeStyle.text, textStyle]}>{title}</Text>
        )}
      </TouchableOpacity>
    );
  }

  // Primary variant — asset-based, same as premium but slightly smaller
  const primaryWidth = size === 'lg' ? wp(134) : size === 'md' ? wp(115) : wp(86);
  const primaryHeight = wp(224) / 4.5;

  return (
      <Animated.View style={[{ transform: [{ scale: scaleAnim }], alignItems: 'center' as const, alignSelf: 'center' as const, width: primaryWidth, marginTop: -primaryHeight * 0.2 + hp(2) }, disabled && s.disabled, style]}>
      <Animated.View
        style={{
          position: 'absolute',
          width: primaryWidth * 0.85,
          height: primaryHeight * 0.5,
          borderRadius: primaryHeight * 0.25,
          top: primaryHeight * 0.25,
          opacity: combinedGlow as any,
          ...Platform.select({
            ios: {
              shadowColor: '#E8C84A',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 18,
            },
            android: {
              elevation: 12,
              backgroundColor: '#D4AF37',
            },
            web: {
              boxShadow: '0 0 20px 4px rgba(232,200,74,0.4)',
            } as any,
          }),
        }}
      />
      <View style={{ width: primaryWidth, height: primaryHeight, alignItems: 'center', justifyContent: 'center', paddingBottom: primaryHeight * 0.06, overflow: 'hidden' }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => {
            setAssetPressed(true);
            onPressIn();
          }}
          onPressOut={() => {
            setTimeout(() => setAssetPressed(false), 120);
            onPressOut();
          }}
          disabled={disabled || loading}
          style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
        >
          <Image
            source={assetPressed ? BTN_ASSET_ACTIVE : BTN_ASSET}
            resizeMode="contain"
            style={{ position: 'absolute', width: wp(163), height: primaryHeight * 1.8, top: '-30%' }}
          />
          {/* Subtle shine sweep */}
          <Animated.View
            style={[
              s.primaryShine,
              {
                height: primaryHeight * 0.55,
                opacity: shineAnim.interpolate({
                  inputRange: [0, 0.3, 0.7, 1],
                  outputRange: [0, 0.15, 0.15, 0],
                }),
                transform: [{
                  translateX: shineAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-wp(60), primaryWidth],
                  }),
                }],
              },
            ]}
            pointerEvents="none"
          />
          {icon}
          {loading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={[s.premiumText, sizeStyle.text, textStyle]}>{title}</Text>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const SIZE_STYLES = {
  sm: {
    container: { paddingVertical: hp(8), paddingHorizontal: wp(16), borderRadius: borderRadius.sm } as ViewStyle,
    text: { fontSize: fonts.sizes.sm } as TextStyle,
  },
  md: {
    container: { paddingVertical: hp(14), paddingHorizontal: wp(24), borderRadius: borderRadius.md } as ViewStyle,
    text: { fontSize: fonts.sizes.md } as TextStyle,
  },
  lg: {
    container: { paddingVertical: hp(20), paddingHorizontal: wp(40), borderRadius: borderRadius.full } as ViewStyle,
    text: { fontSize: fonts.sizes.lg } as TextStyle,
  },
};

const s = StyleSheet.create({
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(8),
  },
  primaryText: {
    color: '#1A1000',
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(255,255,255,0.25)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1,
  },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(8),
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  secondaryText: {
    color: 'rgba(255,255,255,0.50)',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  outline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(8),
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  outlineText: {
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  disabled: {
    opacity: 0.5,
  },
  premiumShine: {
    position: 'absolute' as const,
    width: wp(50),
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: wp(25),
  },
  premiumText: {
    color: colors.primary,
    fontWeight: '900' as const,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    textShadowColor: 'rgba(212,175,55,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  primaryShine: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: wp(40),
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
