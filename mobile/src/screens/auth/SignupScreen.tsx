import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, Image, Animated, Dimensions, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, fonts, wp, hp, fs } from '../../theme';
import { useAuthStore } from '../../stores/authStore';
import GradientButton from '../../components/GradientButton';
import { getIconSymbol } from '../../components/PremiumIcon';

WebBrowser.maybeCompleteAuthSession();

const BULL_LOGO = require('../../../assets/game/bull_logo.png');
const CHIP_SM = require('../../../assets/store/small_stack.png');
const CHIP_MD = require('../../../assets/store/medium_stack.png');
const CHIP_LG = require('../../../assets/store/large_stack.png');
const { height: SH } = Dimensions.get('window');

// ── Floating Particles ──────────────────────────────────────────────────────
function FloatingParticles() {
  const configs = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    x: 8 + Math.random() * 84, startY: 65 + Math.random() * 30,
    size: 1.5 + Math.random() * 1.5, duration: 12000 + Math.random() * 6000,
    opacity: 0.05 + Math.random() * 0.03, color: i % 2 === 0 ? '#D4AF37' : '#BC8CFF',
  })), []);
  const anims = useRef(configs.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    configs.forEach((c, i) => {
      Animated.loop(
        Animated.timing(anims[i], { toValue: 1, duration: c.duration, useNativeDriver: true }),
      ).start();
    });
  }, []);
  return (
    <>{configs.map((c, i) => (
      <Animated.View key={`fp-${i}`} style={{
        position: 'absolute', left: `${c.x}%` as any, top: `${c.startY}%` as any,
        width: c.size, height: c.size, borderRadius: c.size / 2,
        backgroundColor: c.color, opacity: c.opacity,
        transform: [{ translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, -SH * 0.45] }) }],
      }} />
    ))}</>
  );
}

// ── Gold Sparkles ────────────────────────────────────────────────────────────
function GoldSparkles() {
  const configs = useMemo(() => Array.from({ length: 5 }, () => ({
    x: 5 + Math.random() * 90, y: 5 + Math.random() * 90,
    size: 1 + Math.random(), duration: 2000 + Math.random() * 2000,
  })), []);
  const anims = useRef(configs.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    configs.forEach((c, i) => {
      Animated.loop(Animated.sequence([
        Animated.timing(anims[i], { toValue: 1, duration: c.duration / 2, useNativeDriver: true }),
        Animated.timing(anims[i], { toValue: 0, duration: c.duration / 2, useNativeDriver: true }),
      ])).start();
    });
  }, []);
  return (
    <>{configs.map((c, i) => (
      <Animated.View key={`gs-${i}`} style={{
        position: 'absolute', left: `${c.x}%` as any, top: `${c.y}%` as any,
        width: c.size, height: c.size, borderRadius: c.size / 2, backgroundColor: '#D4AF37',
        opacity: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, 0.2] }),
      }} />
    ))}</>
  );
}

// ── Premium Input ────────────────────────────────────────────────────────────
interface PremiumInputProps {
  placeholder: string; value: string; onChangeText: (t: string) => void;
  secureTextEntry?: boolean; keyboardType?: any; autoCapitalize?: any; icon?: string;
}

function PremiumInput({
  placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, icon,
}: PremiumInputProps) {
  const [focused, setFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const handleFocus = () => {
    setFocused(true);
    Animated.timing(focusAnim, { toValue: 1, duration: 250, useNativeDriver: false }).start();
  };
  const handleBlur = () => {
    setFocused(false);
    Animated.timing(focusAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
  };

  return (
    <Animated.View style={[inputStyles.container, {
      borderColor: focusAnim.interpolate({
        inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.06)', 'rgba(212,175,55,0.4)'],
      }),
      ...Platform.select({
        ios: {
          shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 },
          shadowOpacity: (focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.2] }) as unknown) as number,
          shadowRadius: 14,
        },
        android: { elevation: focused ? 4 : 0 },
      }),
    }]}>
      <LinearGradient colors={['rgba(255,255,255,0.025)', 'transparent'] as [string, string]}
        style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} pointerEvents="none" />
      <LinearGradient colors={['rgba(0,0,0,0.2)', 'transparent'] as [string, string]}
        style={inputStyles.innerShadow} pointerEvents="none" />
      <Animated.View style={[inputStyles.focusGlow,
        { opacity: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]}
        pointerEvents="none" />
      <View style={inputStyles.row}>
        {icon && <Text style={inputStyles.icon}>{icon}</Text>}
        <TextInput style={[inputStyles.input, icon ? { paddingLeft: 0 } : null]}
          placeholder={placeholder} placeholderTextColor="rgba(139,148,158,0.6)"
          keyboardType={keyboardType} autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry} value={value} onChangeText={onChangeText}
          onFocus={handleFocus} onBlur={handleBlur} />
      </View>
    </Animated.View>
  );
}

const inputStyles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(14,18,26,0.8)', borderWidth: 1,
    borderRadius: 14, marginBottom: hp(10), overflow: 'hidden',
  } as any,
  innerShadow: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 5,
    borderTopLeftRadius: 14, borderTopRightRadius: 14,
  },
  focusGlow: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(212,175,55,0.04)', borderRadius: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: wp(14) },
  icon: { fontSize: fs(16), color: 'rgba(212,175,55,0.55)', marginRight: wp(10), width: wp(20), textAlign: 'center' },
  input: { flex: 1, color: colors.text, paddingVertical: hp(15), fontSize: fs(15) },
});

// ── Signup Screen ────────────────────────────────────────────────────────────
interface Props { onSwitchToLogin: () => void }

export default function SignupScreen({ onSwitchToLogin }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { signup, googleSignIn, appleSignIn, isLoading, error, clearError } = useAuthStore();
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
    Animated.parallel([
      Animated.loop(Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2800, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2800, useNativeDriver: false }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(auraAnim, { toValue: 1, duration: 3600, useNativeDriver: false }),
        Animated.timing(auraAnim, { toValue: 0, duration: 3600, useNativeDriver: false }),
      ])),
    ]).start();
  }, []);

  const handleSignup = async () => {
    if (!displayName || !email || !password) return;
    if (password !== confirmPassword) return;
    try { await signup(email, password, displayName); } catch {}
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
    <View style={styles.background}>
      <LinearGradient
        colors={['rgba(10,14,26,1)', 'rgba(20,24,50,0.95)', 'rgba(30,22,55,0.6)',
          'rgba(20,24,50,0.95)', 'rgba(10,14,26,1)'] as [string, string, ...string[]]}
        locations={[0, 0.25, 0.48, 0.72, 1]} style={StyleSheet.absoluteFill} />
      <Image source={BULL_LOGO} style={styles.watermark} resizeMode="contain" blurRadius={2} />
      <FloatingParticles />
      <GoldSparkles />
      <Image source={CHIP_SM} style={styles.chipLeft} resizeMode="contain" blurRadius={3} />
      <Image source={CHIP_MD} style={styles.chipRight} resizeMode="contain" blurRadius={4} />
      <Image source={CHIP_LG} style={styles.chipBottom} resizeMode="contain" blurRadius={3} />
      <View style={styles.purpleGlow} />
      <View style={styles.blueGlow} />

      <LinearGradient
        colors={['transparent', 'rgba(10,14,26,0.4)', 'rgba(10,14,26,0.85)'] as [string, string, ...string[]]}
        locations={[0, 0.5, 1]} style={styles.vignette}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Logo */}
            <View style={styles.logoWrap}>
              <Animated.View style={[styles.logoGlow, {
                opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.35] }),
                transform: [{ scale: auraAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.05] }) }],
              }]} />
              <View style={styles.logoAccentRing} />
              <LinearGradient
                colors={['rgba(212,175,55,0.35)', 'rgba(155,92,255,0.2)'] as [string, string]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logoFrame}>
                <View style={styles.logoInner}>
                  <Image source={BULL_LOGO} style={styles.logoImage} resizeMode="contain" />
                </View>
              </LinearGradient>
            </View>

            <Text style={styles.title}>BULL FIGHT</Text>
            <View style={{ height: hp(6) }} />
            <Text style={styles.subtitle}>Create your account</Text>
            <View style={{ height: hp(14) }} />

            {/* Reward card */}
            <View style={styles.rewardOuter}>
              <Animated.View style={[styles.rewardBloom, {
                opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.1] }),
              }]} />
              <LinearGradient
                colors={['rgba(12,16,24,0.9)', 'rgba(18,14,28,0.85)', 'rgba(12,16,24,0.9)'] as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rewardCard}>
                <Animated.View style={[styles.rewardGlow, {
                  opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.12] }),
                }]} />
                <Text style={styles.rewardLabel}>WELCOME BONUS</Text>
                <Text style={styles.rewardAmount}>100,000</Text>
                <Text style={styles.rewardSub}>FREE CHIPS</Text>
              </LinearGradient>
            </View>
            <View style={{ height: hp(18) }} />

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <PremiumInput icon={getIconSymbol('user')} placeholder="Display Name" autoCapitalize="words"
              value={displayName} onChangeText={(t) => { setDisplayName(t); clearError(); }} />
            <PremiumInput icon={getIconSymbol('mail')} placeholder="Email" keyboardType="email-address"
              autoCapitalize="none" value={email}
              onChangeText={(t) => { setEmail(t); clearError(); }} />
            <PremiumInput icon={getIconSymbol('lock')} placeholder="Password (min 8 characters)" secureTextEntry
              value={password} onChangeText={(t) => { setPassword(t); clearError(); }} />
            <PremiumInput icon={getIconSymbol('lock')} placeholder="Confirm Password" secureTextEntry
              value={confirmPassword} onChangeText={setConfirmPassword} />

            {password && confirmPassword && password !== confirmPassword && (
              <Text style={styles.mismatch}>Passwords don't match</Text>
            )}

            <GradientButton title="CREATE ACCOUNT" onPress={handleSignup} loading={isLoading}
              disabled={isLoading || password !== confirmPassword}
              variant="premium" size="md" style={{ marginBottom: hp(2) }} />

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

            <TouchableOpacity onPress={onSwitchToLogin} style={styles.switchLink}>
              <Text style={styles.switchText}>
                Already have an account? <Text style={styles.switchBold}>Log In</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const SHADOW_ZERO = { width: 0, height: 0 };
const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  vignette: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: wp(24), paddingVertical: hp(24) },
  watermark: { position: 'absolute', width: wp(280), height: wp(280), alignSelf: 'center', top: '30%', opacity: 0.08 },
  chipLeft: {
    position: 'absolute', width: wp(80), height: wp(80), opacity: 0.06,
    left: -wp(10), top: '20%', transform: [{ rotate: '-15deg' }],
  },
  chipRight: {
    position: 'absolute', width: wp(70), height: wp(70), opacity: 0.05,
    right: -wp(5), top: '12%', transform: [{ rotate: '10deg' }],
  },
  chipBottom: {
    position: 'absolute', width: wp(90), height: wp(90), opacity: 0.07,
    right: wp(20), bottom: '8%', transform: [{ rotate: '-8deg' }],
  },
  purpleGlow: {
    position: 'absolute', width: wp(200), height: wp(200), borderRadius: wp(100),
    left: -wp(60), top: '15%', backgroundColor: 'rgba(188,140,255,0.03)',
    ...Platform.select({
      ios: { shadowColor: '#BC8CFF', shadowOffset: SHADOW_ZERO, shadowOpacity: 0.15, shadowRadius: 40 },
      android: {},
    }),
  },
  blueGlow: {
    position: 'absolute', width: wp(180), height: wp(180), borderRadius: wp(90),
    right: -wp(50), bottom: '20%', backgroundColor: 'rgba(88,166,255,0.02)',
    ...Platform.select({
      ios: { shadowColor: '#58A6FF', shadowOffset: SHADOW_ZERO, shadowOpacity: 0.12, shadowRadius: 35 },
      android: {},
    }),
  },
  logoWrap: {
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    width: wp(120), height: wp(120), marginBottom: hp(10),
  },
  logoGlow: {
    position: 'absolute', width: wp(130), height: wp(130), borderRadius: wp(65),
    backgroundColor: 'rgba(212,175,55,0.08)',
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: SHADOW_ZERO, shadowOpacity: 0.4, shadowRadius: 30 },
      android: { elevation: 12 },
    }),
  },
  logoAccentRing: {
    position: 'absolute', width: wp(108), height: wp(108), borderRadius: wp(54),
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(212,175,55,0.15)',
  },
  logoFrame: {
    width: wp(96), height: wp(96), borderRadius: wp(48),
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(212,175,55,0.3)',
  },
  logoInner: {
    width: wp(82), height: wp(82), borderRadius: wp(41), backgroundColor: 'rgba(10,14,26,0.9)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logoImage: { width: wp(58), height: wp(58) },
  title: {
    fontSize: fonts.sizes.title, fontWeight: '900', color: colors.primary, textAlign: 'center',
    letterSpacing: wp(5), textTransform: 'uppercase',
    textShadowColor: 'rgba(212,175,55,0.3)', textShadowOffset: SHADOW_ZERO, textShadowRadius: 10,
  },
  subtitle: { fontSize: fs(14), color: 'rgba(139,148,158,1)', textAlign: 'center' },
  rewardOuter: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  rewardBloom: {
    position: 'absolute', width: wp(300), height: hp(80), borderRadius: wp(150),
    backgroundColor: 'rgba(212,175,55,0.03)',
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: SHADOW_ZERO, shadowOpacity: 0.12, shadowRadius: 25 },
      android: {},
    }),
  },
  rewardCard: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: hp(16), paddingHorizontal: wp(28),
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(212,175,55,0.15)', overflow: 'hidden',
  },
  rewardGlow: {
    position: 'absolute', width: wp(180), height: hp(50), borderRadius: wp(90),
    backgroundColor: 'rgba(212,175,55,0.05)',
  },
  rewardLabel: {
    fontSize: fs(9), fontWeight: '600', color: colors.textSecondary,
    letterSpacing: wp(3), textTransform: 'uppercase', marginBottom: hp(2),
  },
  rewardAmount: {
    fontSize: fs(32), fontWeight: '900', color: colors.primary, letterSpacing: wp(2),
    textShadowColor: 'rgba(212,175,55,0.25)', textShadowOffset: SHADOW_ZERO, textShadowRadius: 6,
  },
  rewardSub: {
    fontSize: fs(10), fontWeight: '700', color: 'rgba(212,175,55,0.6)',
    letterSpacing: wp(4), textTransform: 'uppercase', marginTop: hp(2),
  },
  errorBox: {
    backgroundColor: 'rgba(255,68,68,0.06)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.15)',
    borderRadius: 14, padding: wp(14), marginBottom: hp(14),
  },
  errorText: { color: colors.error, fontSize: fs(13), textAlign: 'center' },
  mismatch: { color: colors.error, fontSize: fs(12), marginBottom: hp(8), marginLeft: wp(4) },
  divider: {
    flexDirection: 'row', alignItems: 'center', marginVertical: hp(14),
  },
  dividerLine: {
    flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dividerText: {
    color: 'rgba(139,148,158,0.6)', fontSize: fs(11), fontWeight: '600',
    letterSpacing: wp(2), marginHorizontal: wp(12),
  },
  switchLink: { marginTop: hp(16), alignItems: 'center' },
  switchText: { color: colors.textSecondary, fontSize: fs(14) },
  switchBold: { color: colors.primary, fontWeight: 'bold' },
});
