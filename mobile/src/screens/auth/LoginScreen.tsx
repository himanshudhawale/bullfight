import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, fonts, gradients, glassStyle, shadows, borderRadius, wp, hp, fs } from '../../theme';
import { useAuthStore } from '../../stores/authStore';
import GradientButton from '../../components/GradientButton';

WebBrowser.maybeCompleteAuthSession();

const BULL_LOGO = require('../../../assets/game/bull_logo.png');
const CHIP_SM = require('../../../assets/store/small_stack.png');
const CHIP_MD = require('../../../assets/store/medium_stack.png');
const CHIP_LG = require('../../../assets/store/large_stack.png');
const { width: SW, height: SH } = Dimensions.get('window');

// ── Floating particles ──────────────────────────────────────────────────────
const PARTICLE_COUNT = 7;
interface ParticleConfig {
  x: number; startY: number; size: number; dur: number; delay: number;
  color: string; opacity: number;
}

function FloatingParticles() {
  const configs = useMemo<ParticleConfig[]>(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: Math.random() * SW,
      startY: SH + 10,
      size: 1.5 + Math.random() * 1.5,
      dur: 10000 + Math.random() * 10000,
      delay: Math.random() * 8000,
      color: i % 2 === 0 ? 'rgba(212,175,55,0.5)' : 'rgba(188,140,255,0.45)',
      opacity: 0.05 + Math.random() * 0.05,
    })), []);

  const anims = useRef(configs.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    configs.forEach((c, i) => {
      const run = () => {
        anims[i].setValue(0);
        Animated.timing(anims[i], {
          toValue: 1, duration: c.dur, useNativeDriver: true, delay: c.delay,
        }).start(run);
      };
      run();
    });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {configs.map((c, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: c.x,
            width: c.size,
            height: c.size,
            borderRadius: c.size / 2,
            backgroundColor: c.color,
            opacity: c.opacity,
            transform: [{
              translateY: anims[i].interpolate({
                inputRange: [0, 1],
                outputRange: [c.startY, -30],
              }),
            }],
          }}
        />
      ))}
    </View>
  );
}

// ── Gold sparkles ────────────────────────────────────────────────────────────
const SPARKLE_COUNT = 6;

function GoldSparkles() {
  const configs = useMemo(() =>
    Array.from({ length: SPARKLE_COUNT }, () => ({
      x: 15 + Math.random() * 70,
      y: 10 + Math.random() * 80,
      size: 1 + Math.random() * 2,
      dur: 1500 + Math.random() * 2500,
      delay: Math.random() * 4000,
    })), []);

  const anims = useRef(configs.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    configs.forEach((c, i) => {
      const run = () => {
        anims[i].setValue(0);
        Animated.timing(anims[i], {
          toValue: 1, duration: c.dur, useNativeDriver: true, delay: c.delay,
        }).start(run);
      };
      run();
    });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {configs.map((c, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: `${c.x}%` as any,
            top: `${c.y}%` as any,
            width: c.size,
            height: c.size,
            borderRadius: c.size / 2,
            backgroundColor: 'rgba(212,175,55,0.6)',
            opacity: anims[i].interpolate({
              inputRange: [0, 0.3, 0.5, 0.7, 1],
              outputRange: [0, 0.15, 0.35, 0.15, 0],
            }),
          }}
        />
      ))}
    </View>
  );
}

// ── Light streaks ────────────────────────────────────────────────────────────
const STREAK_COUNT = 3;
interface StreakConfig {
  left: number; width: number; rotate: string; dur: number; color: string;
}

function LightStreaks() {
  const configs = useMemo<StreakConfig[]>(() => [
    { left: SW * 0.15, width: 1.5, rotate: '-25deg', dur: 10000, color: 'rgba(188,140,255,0.06)' },
    { left: SW * 0.55, width: 1,   rotate: '-18deg', dur: 13000, color: 'rgba(88,166,255,0.05)' },
    { left: SW * 0.80, width: 1.2, rotate: '-30deg', dur: 11000, color: 'rgba(212,175,55,0.04)' },
  ], []);

  const anims = useRef(configs.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    configs.forEach((c, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anims[i], { toValue: 1, duration: c.dur, useNativeDriver: true }),
          Animated.timing(anims[i], { toValue: 0, duration: c.dur, useNativeDriver: true }),
        ]),
      ).start();
    });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {configs.map((c, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: c.left,
            top: -SH * 0.1,
            width: c.width,
            height: SH * 1.3,
            backgroundColor: c.color,
            transform: [
              { rotate: c.rotate },
              {
                translateX: anims[i].interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 20],
                }),
              },
            ],
            opacity: anims[i].interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0.4, 1, 0.4],
            }),
          }}
        />
      ))}
    </View>
  );
}

// ── Premium Input ────────────────────────────────────────────────────────────
interface PremiumInputProps {
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  placeholderTextColor?: string;
}

function PremiumInput({
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  placeholderTextColor,
}: PremiumInputProps) {
  const [focused, setFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = () => {
    setFocused(true);
    Animated.timing(focusAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const handleBlur = () => {
    setFocused(false);
    Animated.timing(focusAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const animatedBorderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.08)', 'rgba(212,175,55,0.35)'],
  });

  const animatedShadowOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.15],
  });

  return (
    <Animated.View
      style={[
        premiumStyles.container,
        {
          borderColor: animatedBorderColor,
          ...Platform.select({
            ios: {
              shadowColor: '#D4AF37',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: animatedShadowOpacity as unknown as number,
              shadowRadius: 10,
            },
            android: {
              elevation: focused ? 4 : 0,
            },
          }),
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.15)', 'transparent'] as [string, string]}
        style={premiumStyles.innerShadow}
        pointerEvents="none"
      />
      <TextInput
        style={premiumStyles.input}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        value={value}
        onChangeText={onChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </Animated.View>
  );
}

const premiumStyles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(22,27,34,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    marginBottom: hp(12),
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any
      : {}),
  },
  innerShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  input: {
    color: colors.text,
    paddingVertical: hp(14),
    paddingHorizontal: wp(16),
    fontSize: fs(15),
  },
});

interface Props {
  onSwitchToSignup: () => void;
}

export default function LoginScreen({ onSwitchToSignup }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, guestLogin, googleSignIn, appleSignIn, isLoading, error, clearError } = useAuthStore();
  const glowAnim = useRef(new Animated.Value(0)).current;
  const auraAnim = useRef(new Animated.Value(0)).current;

  // Google OAuth
  const [_googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    // TODO: Replace with your actual Google OAuth client ID
    clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.authentication?.idToken;
      if (idToken) {
        googleSignIn(idToken).catch(() => {
          Alert.alert('Sign-In Failed', 'Google sign-in failed. Please try again.');
        });
      }
    } else if (googleResponse?.type === 'error') {
      Alert.alert('Sign-In Error', googleResponse.error?.message ?? 'Google sign-in encountered an error.');
    }
  }, [googleResponse]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2400, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2400, useNativeDriver: false }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(auraAnim, { toValue: 1, duration: 3600, useNativeDriver: false }),
        Animated.timing(auraAnim, { toValue: 0, duration: 3600, useNativeDriver: false }),
      ]),
    ).start();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) return;
    try {
      await login(email, password);
    } catch {}
  };

  const handleGoogleSignIn = async () => {
    try {
      await promptGoogleAsync();
    } catch {
      Alert.alert('Sign-In Error', 'Could not start Google sign-in. Please try again.');
    }
  };

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        await appleSignIn(credential.identityToken);
      } else {
        Alert.alert('Sign-In Failed', 'No identity token received from Apple.');
      }
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign-In Error', 'Apple sign-in failed. Please try again.');
      }
    }
  };

  return (
    <View
      style={[styles.background, { backgroundColor: colors.background }]}
    >
      {/* Depth gradient — top/bottom dark, center slightly brighter */}
      <LinearGradient
        colors={[
          'rgba(10,14,26,1)',
          'rgba(20,24,50,0.95)',
          'rgba(30,22,55,0.6)',
          'rgba(20,24,50,0.95)',
          'rgba(10,14,26,1)',
        ] as [string, string, ...string[]]}
        locations={[0, 0.25, 0.48, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Ambient purple/blue glow spots */}
      <View style={styles.ambientPurple} />
      <View style={styles.ambientBlue} />

      {/* Floating particles */}
      <FloatingParticles />

      {/* Light streaks */}
      <LightStreaks />

      {/* Gold sparkles */}
      <GoldSparkles />

      {/* Faint background chip stacks */}
      <Image source={CHIP_SM} style={styles.bgChip1} resizeMode="contain" blurRadius={3} />
      <Image source={CHIP_MD} style={styles.bgChip2} resizeMode="contain" blurRadius={4} />
      <Image source={CHIP_LG} style={styles.bgChip3} resizeMode="contain" blurRadius={3} />

      {/* Faint bull watermark — centered behind everything */}
      <Image
        source={BULL_LOGO}
        style={styles.watermark}
        resizeMode="contain"
        blurRadius={2}
      />

      {/* Content overlay gradient */}
      <LinearGradient
        colors={['rgba(10,14,26,0.15)', 'rgba(10,14,26,0.6)', 'rgba(10,14,26,0.9)'] as [string, string, ...string[]]}
        locations={[0, 0.55, 1]}
        style={styles.overlay}
      >
        {/* Soft radial glow behind central content */}
        <View style={styles.centerGlow} />

        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
           <View style={styles.contentColumn}>
            {/* Bull Logo — glowing circular frame */}
            <View style={styles.logoWrap}>
              {/* Faint light aura — larger, slower, behind everything */}
              <Animated.View
                style={[
                  styles.logoAura,
                  {
                    opacity: auraAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.08, 0.18],
                    }),
                    transform: [{
                      scale: auraAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.95, 1.05],
                      }),
                    }],
                  },
                ]}
              />
              {/* Outer soft glow ring */}
              <Animated.View
                style={[
                  styles.logoGlowOuter,
                  {
                    opacity: glowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.25, 0.5],
                    }),
                    transform: [{
                      scale: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.08],
                      }),
                    }],
                  },
                ]}
              />
              {/* Glass circle frame with pulsing border */}
              <Animated.View
                style={[
                  styles.logoFrameGlow,
                  {
                    borderColor: glowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['rgba(212,175,55,0.2)', 'rgba(212,175,55,0.45)'],
                    }),
                    transform: [{
                      scale: auraAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.02],
                      }),
                    }],
                  },
                ]}
              >
                <LinearGradient
                  colors={['rgba(212,175,55,0.25)', 'rgba(212,175,55,0.08)', 'rgba(188,140,255,0.12)'] as [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoFrameInnerGrad}
                >
                  <View style={styles.logoInner}>
                    <Image source={BULL_LOGO} style={styles.logoImage} resizeMode="contain" />
                  </View>
                </LinearGradient>
              </Animated.View>
            </View>
            {/* Title with radial bloom */}
            <View style={styles.titleWrap}>
              <Animated.View
                style={[
                  styles.titleBloom,
                  {
                    opacity: glowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.06, 0.14],
                    }),
                  },
                ]}
              />
              <Text style={styles.title}>BULL FIGHT</Text>
            </View>
            <Text style={styles.subtitle}>Sign in to play</Text>

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Email */}
            <PremiumInput
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(t) => { setEmail(t); clearError(); }}
            />

            {/* Password */}
            <PremiumInput
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={(t) => { setPassword(t); clearError(); }}
            />

            {/* Play as Guest */}
            <TouchableOpacity onPress={guestLogin} style={styles.guestBtn}>
              <Text style={styles.guestText}>Play as Guest</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <GradientButton
              title="LOG IN"
              onPress={handleLogin}
              loading={isLoading}
              size="lg"
              style={{ marginTop: hp(6), marginBottom: hp(6) }}
            />

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google */}
            <GradientButton
              title="Continue with Google"
              onPress={handleGoogleSignIn}
              variant="secondary"
              size="md"
              style={{ marginBottom: hp(10) }}
            />

            {/* Apple */}
            {Platform.OS === 'ios' && (
              <GradientButton
                title="Continue with Apple"
                onPress={handleAppleSignIn}
                variant="outline"
                size="md"
                style={{ marginBottom: hp(10) }}
              />
            )}

            {/* Switch to Signup */}
            <TouchableOpacity onPress={onSwitchToSignup} style={styles.switchLink}>
              <Text style={styles.switchText}>
                Don't have an account? <Text style={styles.switchBold}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
           </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: colors.background,
  },
  watermark: {
    position: 'absolute',
    width: wp(280),
    height: wp(280),
    alignSelf: 'center',
    top: '30%',
    opacity: 0.1,
  },
  centerGlow: {
    position: 'absolute',
    alignSelf: 'center',
    top: '28%',
    width: SW * 0.85,
    height: SW * 0.85,
    borderRadius: SW * 0.425,
    backgroundColor: 'rgba(188,140,255,0.04)',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 0 80px 40px rgba(212,175,55,0.03)' } as any
      : Platform.OS === 'ios'
        ? { shadowColor: 'rgba(212,175,55,0.15)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 60 }
        : {}),
  } as any,
  ambientPurple: {
    position: 'absolute',
    width: wp(200),
    height: wp(200),
    borderRadius: wp(100),
    backgroundColor: 'rgba(188, 140, 255, 0.06)',
    top: '15%',
    left: '-10%',
    ...Platform.select({
      ios: { shadowColor: '#BC8CFF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 40 },
      android: { elevation: 0 },
    }),
  },
  ambientBlue: {
    position: 'absolute',
    width: wp(180),
    height: wp(180),
    borderRadius: wp(90),
    backgroundColor: 'rgba(88, 166, 255, 0.05)',
    bottom: '20%',
    right: '-8%',
    ...Platform.select({
      ios: { shadowColor: '#58A6FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 35 },
      android: { elevation: 0 },
    }),
  },
  overlay: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: hp(16),
  },
  contentColumn: {
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: wp(24),
  },
  logoWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    width: wp(140),
    height: wp(140),
    marginBottom: hp(8),
  },
  logoAura: {
    position: 'absolute',
    width: wp(160),
    height: wp(160),
    borderRadius: wp(80),
    backgroundColor: 'rgba(212, 175, 55, 0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 50,
      },
      android: { elevation: 0 },
    }),
  },
  logoGlowOuter: {
    position: 'absolute',
    width: wp(130),
    height: wp(130),
    borderRadius: wp(65),
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 28,
      },
      android: { elevation: 12 },
    }),
  },
  logoFrameGlow: {
    width: wp(115),
    height: wp(115),
    borderRadius: wp(58),
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  logoFrameInnerGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: wp(58),
  },
  logoInner: {
    width: wp(102),
    height: wp(102),
    borderRadius: wp(51),
    backgroundColor: 'rgba(10, 14, 26, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: wp(74),
    height: wp(74),
  },
  titleWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(2),
  },
  titleBloom: {
    position: 'absolute',
    width: wp(220),
    height: hp(50),
    borderRadius: wp(110),
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 30,
      },
      android: { elevation: 0 },
    }),
  },
  title: {
    fontSize: fonts.sizes.hero,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: wp(6),
    textTransform: 'uppercase',
    textShadowColor: 'rgba(212,175,55,0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  subtitle: {
    fontSize: fs(15),
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: hp(4),
  },
  rewardHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(18),
    gap: wp(6),
  },
  rewardCoinIcon: {
    width: wp(14),
    height: wp(14),
    opacity: 0.8,
  },
  rewardHintText: {
    fontSize: fs(11),
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 2,
    textShadowColor: 'rgba(212,175,55,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  bgChip1: {
    position: 'absolute',
    width: wp(45), height: wp(45), opacity: 0.06,
    top: '12%',
    left: '8%',
    transform: [{ rotate: '-15deg' }],
  },
  bgChip2: {
    position: 'absolute',
    width: wp(35), height: wp(35), opacity: 0.05,
    top: '65%',
    right: '6%',
    transform: [{ rotate: '25deg' }],
  },
  bgChip3: {
    position: 'absolute',
    width: wp(40), height: wp(40), opacity: 0.07,
    bottom: '18%',
    left: '15%',
    transform: [{ rotate: '10deg' }],
  },
  errorBox: {
    backgroundColor: 'rgba(255,68,68,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,68,68,0.20)',
    borderRadius: 14,
    padding: wp(14),
    marginBottom: hp(16),
    ...(Platform.OS === 'web'
      ? { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as any
      : {}),
  } as any,
  errorText: {
    color: colors.error,
    fontSize: fs(13),
    textAlign: 'center',
  },
  divider:{
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: hp(2),
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dividerText: {
    color: colors.textMuted,
    marginHorizontal: wp(12),
    fontSize: fs(12),
    letterSpacing: wp(2),
  },
  switchLink: {
    marginTop: hp(20),
    alignItems: 'center',
  },
  switchText: {
    color: colors.textSecondary,
    fontSize: fs(14),
  },
  switchBold: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  guestBtn: {
    alignSelf: 'center',
    paddingVertical: hp(10),
    paddingHorizontal: wp(28),
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(22,27,34,0.10)',
    marginBottom: 0,
    ...(Platform.OS === 'web'
      ? { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as any
      : {}),
  } as any,
  guestText: {
    color: colors.textSecondary,
    fontSize: fs(14),
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
