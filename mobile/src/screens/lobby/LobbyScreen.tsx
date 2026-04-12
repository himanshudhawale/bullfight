import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Platform,
  StyleSheet,
  Image,
  ImageBackground,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import {
  colors,
  spacing,
  borderRadius,
  shadows,
  wp,
  hp,
  fs,
  screen,
} from '../../theme';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';
import PremiumIcon from '../../components/PremiumIcon';
import { getVipConfig, VIP_LEVELS, VipLevel } from '../../../../shared/types';

const { width: SW, height: SH } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
const A = {
  bg: require('../../../assets/game/bg_lobby_main.png'),
  fx: require('../../../assets/game/fx_particles_overlay.png'),
  bullLogo: require('../../../assets/game/bull_logo.png'),
  bullHero: require('../../../assets/game/bullfight_hero.png'),
  pokerTile: require('../../../assets/game/poker_tile.png'),
  champTile: require('../../../assets/game/champ_tile.png'),
  panelS: require('../../../assets/game/panel_small.png'),
  panelM: require('../../../assets/game/panel_medium.png'),
  panelL: require('../../../assets/game/panel_large.png'),
  goldCoin: require('../../../assets/game/gold_coin.png'),
  iconSettings: require('../../../assets/icons/settings.png'),
  iconFriends: require('../../../assets/icons/friends.png'),
  iconStore: require('../../../assets/icons/store.png'),
  iconProfile: require('../../../assets/icons/profile.png'),
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ---------------------------------------------------------------------------
// Design tokens — neon purple / blue / gold palette
// ---------------------------------------------------------------------------
const C = {
  bg: '#080B16',
  surface: 'rgba(14,17,34,0.65)',
  glass: 'rgba(20,24,50,0.55)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassHighlight: 'rgba(255,255,255,0.04)',
  gold: '#D4AF37',
  goldSoft: 'rgba(212,175,55,0.15)',
  purple: '#9B5CFF',
  purpleSoft: 'rgba(155,92,255,0.12)',
  blue: '#58A6FF',
  blueSoft: 'rgba(88,166,255,0.12)',
  neonGreen: '#26D95C',
  neonRed: '#FF4455',
  txt: '#E8ECF4',
  muted: '#6B7394',
  dim: '#3D4260',
};

// ---------------------------------------------------------------------------
// Micro-animations
// ---------------------------------------------------------------------------
function PulseDot() {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.2, duration: 900, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 900, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={[$.dot, { opacity: o }]} />;
}

function TilePulseDot({ color = '#BC8CFF' }: { color?: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.8, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
      ]),
    ])).start();
  }, []);
  return (
    <View style={{ width: 6, height: 6 }}>
      <Animated.View style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity, transform: [{ scale }] }} />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

function GentleFloat({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(v, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true })).start();
  }, []);
  const ty = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -6, 0] });
  return <Animated.View style={{ transform: [{ translateY: ty }] }}>{children}</Animated.View>;
}

function GlowPulse({ children, color }: { children: React.ReactNode; color: string }) {
  const o = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.8, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.4, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <Animated.View style={{ opacity: o }}>
      {children}
    </Animated.View>
  );
}

/** Floating particles — gold, purple, blue specks drifting slowly */
function FloatingParticles() {
  const COUNT = 18;
  const particles = useRef(
    Array.from({ length: COUNT }, () => ({
      anim: new Animated.Value(0),
      x: Math.random() * 100,
      size: 1.5 + Math.random() * 4,
      duration: 6000 + Math.random() * 8000,
      delay: Math.random() * 5000,
      drift: (Math.random() - 0.5) * 30,
      color: ['rgba(212,175,55,0.3)', 'rgba(155,92,255,0.25)', 'rgba(88,166,255,0.2)', 'rgba(255,255,255,0.15)'][Math.floor(Math.random() * 4)],
    })),
  ).current;

  useEffect(() => {
    particles.forEach((p) => {
      const run = () => {
        p.anim.setValue(0);
        Animated.timing(p.anim, {
          toValue: 1, duration: p.duration, delay: p.delay, useNativeDriver: true,
        }).start(() => { p.delay = 0; run(); });
      };
      run();
    });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: `${p.x}%` as any,
            width: p.size,
            height: p.size,
            borderRadius: p.size / 2,
            backgroundColor: p.color,
            opacity: p.anim.interpolate({
              inputRange: [0, 0.2, 0.6, 1],
              outputRange: [0, 0.7, 0.5, 0],
            }),
            transform: [
              { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [SH + 20, -40] }) },
              { translateX: p.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.drift, p.drift * 0.5] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

/** Slow gradient color shift overlay */
function GradientShift() {
  const shift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(shift, {
      toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true,
    })).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Purple zone — drifts slowly */}
      <Animated.View style={{
        position: 'absolute', top: '10%', left: '5%', width: '50%', height: '40%',
        borderRadius: 200, backgroundColor: 'rgba(155,92,255,0.04)',
        transform: [{
          translateY: shift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 20, 0] }),
        }, {
          translateX: shift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 15, 0] }),
        }],
      } as any} />
      {/* Blue zone — drifts opposite */}
      <Animated.View style={{
        position: 'absolute', bottom: '15%', right: '5%', width: '45%', height: '35%',
        borderRadius: 180, backgroundColor: 'rgba(88,166,255,0.03)',
        transform: [{
          translateY: shift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -15, 0] }),
        }, {
          translateX: shift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -10, 0] }),
        }],
      } as any} />
    </View>
  );
}

/** Faint light streaks moving diagonally */
function LightStreaks() {
  const COUNT = 3;
  const streaks = useRef(
    Array.from({ length: COUNT }, (_, i) => ({
      anim: new Animated.Value(0),
      delay: i * 4000 + Math.random() * 2000,
      duration: 3000 + Math.random() * 2000,
      top: 15 + Math.random() * 60,
      opacity: 0.03 + Math.random() * 0.04,
      width: 1 + Math.random() * 1.5,
    })),
  ).current;

  useEffect(() => {
    streaks.forEach((s) => {
      const run = () => {
        s.anim.setValue(0);
        Animated.timing(s.anim, {
          toValue: 1, duration: s.duration, delay: s.delay,
          easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }).start(() => { s.delay = 3000 + Math.random() * 5000; run(); });
      };
      run();
    });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {streaks.map((s, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            top: `${s.top}%` as any,
            width: SW * 0.7,
            height: s.width,
            backgroundColor: `rgba(255,255,255,${s.opacity})`,
            borderRadius: 1,
            transform: [
              { rotate: '-25deg' },
              { translateX: s.anim.interpolate({ inputRange: [0, 1], outputRange: [-SW * 0.5, SW * 1.5] }) },
            ],
            opacity: s.anim.interpolate({
              inputRange: [0, 0.15, 0.5, 0.85, 1],
              outputRange: [0, 1, 1, 1, 0],
            }),
          } as any}
        />
      ))}
    </View>
  );
}

/** Glassmorphism panel — blurred bg + translucent surface + inner glow */
function GlassPanel({ children, style, intensity = 25, glowColor }: {
  children: React.ReactNode;
  style?: any;
  intensity?: number;
  glowColor?: string;
}) {
  return (
    <View style={[$.glassOuter, style]}>
      <BlurView intensity={intensity} tint="dark" style={$.glassBlur}>
        <View style={$.glassSurface}>
          {glowColor && (
            <LinearGradient
              colors={[glowColor, 'transparent'] as [string, string]}
              style={$.glassInnerGlow}
            />
          )}
          {children}
        </View>
      </BlurView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Panel components — using glass-style PNG assets as containers
// ---------------------------------------------------------------------------
function PanelSmall({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <ImageBackground source={A.panelS} resizeMode="stretch" style={[$.panelBase, style]} imageStyle={$.panelImg}>
      {children}
    </ImageBackground>
  );
}

function PanelMedium({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <ImageBackground source={A.panelM} resizeMode="stretch" style={[$.panelBase, style]} imageStyle={$.panelImg}>
      {children}
    </ImageBackground>
  );
}

function PanelLarge({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <ImageBackground source={A.panelL} resizeMode="stretch" style={[$.panelBase, style]} imageStyle={$.panelImg}>
      {children}
    </ImageBackground>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function chipStr(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
}

// ---------------------------------------------------------------------------
// Game Tile — interactive card with press feedback + inner lighting
// ---------------------------------------------------------------------------
function GameTile({ onPress, gradColors, gradLocations, style, children }: {
  onPress: () => void;
  gradColors: [string, string, ...string[]];
  gradLocations?: readonly [number, number, ...number[]];
  style?: any;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const idleGlow = useRef(new Animated.Value(0.3)).current;

  // Subtle idle glow pulse
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(idleGlow, { toValue: 0.6, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(idleGlow, { toValue: 0.3, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const pressIn = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.97, speed: 50, bounciness: 4, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  };
  const pressOut = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 50, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Animated.View style={[$.gameTile, style, { transform: [{ scale }] }]}>
      {/* Idle ambient glow */}
      <Animated.View style={[$.tileOuterGlow, { opacity: idleGlow }]} pointerEvents="none" />
      {/* Press glow boost */}
      <Animated.View style={[$.tileOuterGlow, { opacity: glowOpacity }]} pointerEvents="none" />
      <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={{ flex: 1 }}>
        <LinearGradient
          colors={gradColors}
          locations={gradLocations}
          style={$.gameTileGrad}
        >
          {/* Top edge highlight */}
          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'transparent'] as [string, string]}
            style={$.tileTopHighlight}
            pointerEvents="none"
          />
          {children}
          {/* Bottom shadow */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.3)'] as [string, string]}
            style={$.tileBottomShadow}
            pointerEvents="none"
          />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Bottom Tab Bar config
// ---------------------------------------------------------------------------
const BOTTOM_TABS = [
  { key: 'play', label: 'Play', emoji: '🎮', screen: null, active: true },
  { key: 'social', label: 'Social', emoji: '👥', screen: 'Friends' },
  { key: 'shop', label: 'Free Chips', emoji: '🎁', screen: 'Store' },
  { key: 'club', label: 'Club', emoji: '🏛️', screen: 'Clubs' },
  { key: 'more', label: 'More', emoji: '☰', screen: 'Profile' },
] as const;

// ---------------------------------------------------------------------------
// Quick Access Shortcuts
// ---------------------------------------------------------------------------
const QUICK_ACCESS = [
  { key: 'tournaments', label: 'Tourneys', emoji: '🏆', screen: 'Tournaments' },
  { key: 'private', label: 'Private', emoji: '🏠', screen: 'PrivateRooms' },
  { key: 'leaderboard', label: 'Leaders', emoji: '📊', screen: null },
] as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function LobbyScreen() {
  const { user, loadUser } = useAuthStore();
  const nav = useNavigation<Nav>();

  // Orientation-aware dimensions
  const [dims, setDims] = useState(() => Dimensions.get('window'));
  const isLandscape = dims.width > dims.height;

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setDims(window);
    });
    return () => sub.remove();
  }, []);

  // FX overlay subtle drift animation
  const fxDrift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(fxDrift, {
      toValue: 1, duration: 20000, easing: Easing.linear, useNativeDriver: true,
    })).start();
  }, []);
  const fxTranslateY = fxDrift.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });

  // Entrance stagger animations
  const enterTop = useRef(new Animated.Value(0)).current;
  const enterHero = useRef(new Animated.Value(0)).current;
  const enterBottom = useRef(new Animated.Value(0)).current;

  // Ambient arena color wash
  const ambientPulse = useRef(new Animated.Value(0)).current;

  // Bull icon breathing
  const bullBreath = useRef(new Animated.Value(0.7)).current;

  // Title glow pulse
  const titleGlow = useRef(new Animated.Value(0.3)).current;

  useFocusEffect(
    React.useCallback(() => {
      loadUser().catch(() => {});
    }, []),
  );

  // Entrance stagger + ambient loops
  useEffect(() => {
    Animated.stagger(150, [
      Animated.timing(enterTop, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(enterHero, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(enterBottom, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    Animated.loop(Animated.sequence([
      Animated.timing(ambientPulse, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(ambientPulse, { toValue: 0, duration: 6000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();

    Animated.loop(Animated.sequence([
      Animated.timing(bullBreath, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(bullBreath, { toValue: 0.7, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();

    Animated.loop(Animated.sequence([
      Animated.timing(titleGlow, { toValue: 0.7, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(titleGlow, { toValue: 0.3, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  // Pulsing glow for main CTA
  const ctaGlow = useRef(new Animated.Value(0.3)).current;
  const ctaSweep = useRef(new Animated.Value(-1)).current;
  const ctaShift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(ctaGlow, { toValue: 0.55, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(ctaGlow, { toValue: 0.2, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();

    Animated.loop(Animated.sequence([
      Animated.delay(3500),
      Animated.timing(ctaSweep, { toValue: 2, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(ctaSweep, { toValue: -1, duration: 0, useNativeDriver: true }),
    ])).start();

    Animated.loop(Animated.sequence([
      Animated.timing(ctaShift, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(ctaShift, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  // Pulsing scale for the (+) button
  const plusPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(plusPulse, { toValue: 1.15, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(plusPulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  // Press scale for main button
  const scaleHero = useRef(new Animated.Value(1)).current;
  const heroIn = () => Animated.spring(scaleHero, { toValue: 0.96, useNativeDriver: true }).start();
  const heroOut = () => Animated.spring(scaleHero, { toValue: 1, friction: 4, useNativeDriver: true }).start();

  const winRate = user && user.gamesPlayed > 0 ? Math.round((user.gamesWon / user.gamesPlayed) * 100) : 0;

  // VIP progress
  const vipLevel = (user?.vipLevel || 1) as VipLevel;
  const vipXp = (user as any)?.vipXp ?? 0;
  const currentVipCfg = getVipConfig(vipLevel);
  const nextVipIdx = VIP_LEVELS.findIndex(c => c.level === vipLevel) + 1;
  const nextVipCfg = nextVipIdx < VIP_LEVELS.length ? VIP_LEVELS[nextVipIdx] : null;
  const vipXpInLevel = vipXp - currentVipCfg.xpRequired;
  const vipXpNeeded = nextVipCfg ? nextVipCfg.xpRequired - currentVipCfg.xpRequired : 1;
  const vipProgress = nextVipCfg ? Math.min(1, Math.max(0, vipXpInLevel / vipXpNeeded)) : 1;

  // ── Task 2: Live activity tickers ──
  const [livePlayers, setLivePlayers] = useState(247);
  const [activePot, setActivePot] = useState(125.4);
  const playerTickScale = useRef(new Animated.Value(1)).current;
  const potTickScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const playerInterval = setInterval(() => {
      setLivePlayers(Math.floor(127 + Math.random() * 257));
      Animated.sequence([
        Animated.spring(playerTickScale, { toValue: 1.15, useNativeDriver: true }),
        Animated.spring(playerTickScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      ]).start();
    }, 3500);

    const potInterval = setInterval(() => {
      setActivePot(Math.round((45 + Math.random() * 135) * 10) / 10);
      Animated.sequence([
        Animated.spring(potTickScale, { toValue: 1.15, useNativeDriver: true }),
        Animated.spring(potTickScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      ]).start();
    }, 4000);

    return () => {
      clearInterval(playerInterval);
      clearInterval(potInterval);
    };
  }, []);

  const livePlayerCount = livePlayers;

  return (
    <View style={$.root}>
      {/* ═══ LAYER 1: Full-screen background ═══ */}
      <Image source={A.bg} style={$.bgImage} resizeMode="cover" />

      {/* ═══ LAYER 1.5: Darken + desaturate overlay ═══ */}
      <View style={$.bgDimOverlay} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(8,11,22,0.45)', 'rgba(8,11,22,0.15)', 'rgba(8,11,22,0.45)'] as [string, string, ...string[]]}
        style={$.bgRadialDim}
        pointerEvents="none"
      />

      {/* ═══ LAYER 2: FX particles overlay ═══ */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.Image
          source={A.fx}
          style={[$.fxOverlay, { transform: [{ translateY: fxTranslateY }] }]}
          resizeMode="cover"
        />
      </View>

      {/* ═══ LAYER 2.5: Animated background effects ═══ */}
      <GradientShift />
      <FloatingParticles />
      <LightStreaks />

      {/* ═══ LAYER 3: Ambient glow zones ═══ */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['rgba(155,92,255,0.04)', 'transparent'] as [string, string]}
          style={$.ambientTop}
        />
        <LinearGradient
          colors={['transparent', 'rgba(88,166,255,0.025)'] as [string, string]}
          style={$.ambientBottom}
        />
        <View style={$.centerGlow} />
      </View>

      {/* ═══ LAYER 4: Dark vignette edges ═══ */}
      <View style={$.vignetteWrap} pointerEvents="none">
        <LinearGradient colors={['rgba(8,11,22,0.7)', 'transparent'] as [string, string]} style={$.vignetteTop} />
        <LinearGradient colors={['transparent', 'rgba(8,11,22,0.75)'] as [string, string]} style={$.vignetteBottom} />
        <LinearGradient colors={['rgba(8,11,22,0.5)', 'transparent'] as [string, string]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={$.vignetteLeft} />
        <LinearGradient colors={['transparent', 'rgba(8,11,22,0.5)'] as [string, string]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={$.vignetteRight} />
      </View>

      {/* ═══ LAYER 4.5: Ambient arena color wash ═══ */}
      <Animated.View
        style={[$.ambientWash, { opacity: ambientPulse.interpolate({ inputRange: [0, 1], outputRange: [0.015, 0.04] }) }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['rgba(155,92,255,0.08)', 'transparent', 'rgba(88,166,255,0.05)'] as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* ═══ LAYER 5: UI content ═══ */}
      <View style={$.content}>

        {/* ═══ TOP BAR — DH Texas Poker style ═══ */}
        <Animated.View style={[$.topBar, { opacity: enterTop, transform: [{ translateY: enterTop.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
          <LinearGradient
            colors={['rgba(10,12,28,0.85)', 'rgba(14,16,32,0.75)'] as [string, string]}
            style={$.topBarGrad}
          >
            {/* Left: Avatar + Name */}
            <TouchableOpacity style={$.topBarLeft} activeOpacity={0.7} onPress={() => nav.navigate('Profile' as any)}>
              <View style={$.topBarAvatarWrap}>
                <LinearGradient colors={[C.purple, C.blue] as [string, string]} style={$.topBarAvatarGrad}>
                  <View style={$.topBarAvatarInner}>
                    <Text style={$.topBarAvatarText}>{(user?.displayName || 'P')[0].toUpperCase()}</Text>
                  </View>
                </LinearGradient>
                {/* VIP badge overlay */}
                <View style={[$.topBarVipBadge, { backgroundColor: currentVipCfg.color }]}>
                  <Text style={$.topBarVipBadgeText}>{vipLevel}</Text>
                </View>
              </View>
              <View style={$.topBarNameCol}>
                <Text style={$.topBarUsername} numberOfLines={1}>{user?.displayName || 'Player'}</Text>
                <Text style={[$.topBarVipName, { color: currentVipCfg.color }]}>{currentVipCfg.emoji} {currentVipCfg.name}</Text>
              </View>
            </TouchableOpacity>

            {/* Center: Chip count */}
            <TouchableOpacity style={$.topBarChips} activeOpacity={0.7} onPress={() => nav.navigate('Store' as any)}>
              <Image source={A.goldCoin} style={$.topBarCoinIcon} />
              <Text style={$.topBarChipText}>{chipStr(user?.chips || 0)}</Text>
              <Animated.View style={[$.topBarAddBtn, { transform: [{ scale: plusPulse }] }]}>
                <Text style={$.topBarAddBtnText}>+</Text>
              </Animated.View>
            </TouchableOpacity>

            {/* Right: Icon buttons row */}
            <View style={$.topBarRight}>
              <TouchableOpacity style={$.topBarIconBtn} activeOpacity={0.7}>
                <View style={$.iconPlaceholder}>
                  <Text style={$.iconEmoji}>🎰</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={$.topBarIconBtn} activeOpacity={0.7}>
                <View style={$.iconPlaceholder}>
                  <Text style={$.iconEmoji}>🎯</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={$.topBarIconBtn} activeOpacity={0.7} onPress={() => nav.navigate('Settings' as any)}>
                <Image source={A.iconSettings} style={$.topBarIconImg} resizeMode="contain" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ═══ ZONE 1: Game Mode Buttons (KEPT AS-IS) ═══ */}
        <Animated.View style={{ opacity: enterHero, transform: [{ translateY: enterHero.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={$.gameModeStrip}
            style={$.gameModeStripWrap}
          >
            {/* Bull Fight — Hero CTA */}
            <GameTile
              onPress={() => nav.navigate('Game', { tier: 'bullfight' })}
              gradColors={['rgba(20,14,30,0.95)', 'rgba(12,8,20,0.98)'] as [string, string]}
              style={$.bullBtn}
            >
              <Image source={A.bullHero} style={$.tileBgImage} resizeMode="cover" />
              <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.7)'] as [string, string, ...string[]]}
                locations={[0, 0.35, 1]}
                style={StyleSheet.absoluteFill as any}
                pointerEvents="none"
              />
              <LinearGradient
                colors={['rgba(212,175,55,0.18)', 'transparent'] as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.7, y: 0.7 }}
                style={$.tileRimLight}
                pointerEvents="none"
              />
              <View style={$.tileEdgeHighlight} />
              <View style={$.tileContentBottom}>
                <View style={$.tileLiveRow}>
                  <PulseDot />
                  <Text style={$.tileLiveText}>LIVE</Text>
                  <Animated.View style={{ transform: [{ scale: playerTickScale }] }}>
                    <Text style={$.tileSubText}>• {livePlayers} playing</Text>
                  </Animated.View>
                </View>
              </View>
            </GameTile>

            {/* Poker */}
            <GameTile
              onPress={() => nav.navigate('PokerTableSelect' as any)}
              gradColors={['rgba(8,20,12,0.95)', 'rgba(4,12,6,0.98)'] as [string, string]}
              style={$.pokerBtn}
            >
              <Image source={A.pokerTile} style={$.tileBgImage} resizeMode="cover" />
              <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.7)'] as [string, string, ...string[]]}
                locations={[0, 0.35, 1]}
                style={StyleSheet.absoluteFill as any}
                pointerEvents="none"
              />
              <LinearGradient
                colors={['rgba(212,175,55,0.18)', 'transparent'] as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.7, y: 0.7 }}
                style={$.tileRimLight}
                pointerEvents="none"
              />
              <View style={$.tileEdgeHighlight} />
              <View style={$.tileContentBottom}>
                <Text style={$.tileTitleMed}>Poker</Text>
                <Text style={$.tileSubText}>Texas Hold'em</Text>
              </View>
            </GameTile>

            {/* Tournament */}
            <GameTile
              onPress={() => {}}
              gradColors={['rgba(25,14,42,0.95)', 'rgba(15,8,28,0.98)'] as [string, string]}
              style={$.tournamentBtn}
            >
              <Image source={A.champTile} style={$.tileBgImage} resizeMode="cover" />
              <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.7)'] as [string, string, ...string[]]}
                locations={[0, 0.35, 1]}
                style={StyleSheet.absoluteFill as any}
                pointerEvents="none"
              />
              <LinearGradient
                colors={['rgba(212,175,55,0.14)', 'transparent'] as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.7, y: 0.7 }}
                style={$.tileRimLight}
                pointerEvents="none"
              />
              <View style={$.tileEdgeHighlight} />
              <View style={[$.tileContentBottom, { opacity: 0.7 }]}>
                <Text style={$.tileTitleMed}>Tournament</Text>
                <Text style={$.tileSubText}>Coming Soon</Text>
              </View>
            </GameTile>
          </ScrollView>
        </Animated.View>

        {/* ═══ QUICK ACCESS ROW ═══ */}
        <Animated.View style={[$.quickAccessRow, { opacity: enterHero, transform: [{ translateY: enterHero.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          {QUICK_ACCESS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={$.quickAccessItem}
              activeOpacity={0.7}
              onPress={() => {
                if (item.screen) {
                  nav.navigate(item.screen as any);
                }
              }}
            >
              <View style={$.quickAccessCircle}>
                <Text style={$.quickAccessEmoji}>{item.emoji}</Text>
              </View>
              <Text style={$.quickAccessLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* Spacer to push bottom bar down */}
        <View style={{ flex: 1 }} />

      </View>

      {/* ═══ BOTTOM TAB BAR — fixed at bottom ═══ */}
      <Animated.View style={[$.bottomTabBar, { opacity: enterBottom, transform: [{ translateY: enterBottom.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
        <LinearGradient
          colors={['rgba(10,12,28,0.92)', 'rgba(8,10,24,0.96)'] as [string, string]}
          style={$.bottomTabBarGrad}
        >
          <View style={$.bottomTabBarTopBorder} />
          <View style={$.bottomTabBarRow}>
            {BOTTOM_TABS.map((tab) => {
              const isActive = tab.key === 'play';
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={$.bottomTabItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (tab.screen) {
                      nav.navigate(tab.screen as any);
                    }
                  }}
                >
                  {isActive && <View style={$.bottomTabGlow} />}
                  <View style={[$.bottomTabIconWrap, isActive && $.bottomTabIconWrapActive]}>
                    <Text style={[$.bottomTabEmoji, isActive && $.bottomTabEmojiActive]}>{tab.emoji}</Text>
                  </View>
                  <Text style={[$.bottomTabLabel, isActive && $.bottomTabLabelActive]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════════════════ */
const $ = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  /* ── Layer 1: Background ── */
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: SW,
    height: SH,
  },
  bgDimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,11,22,0.55)',
  },
  bgRadialDim: {
    ...StyleSheet.absoluteFillObject,
  },

  /* ── Layer 2: FX overlay ── */
  fxOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: SW,
    height: SH + 30,
    opacity: 0.2,
  },

  /* ── Layer 3: Ambient glow ── */
  ambientTop: {
    position: 'absolute',
    top: -SH * 0.08,
    left: '5%',
    width: '90%',
    height: SH * 0.5,
    borderBottomLeftRadius: SH * 0.4,
    borderBottomRightRadius: SH * 0.4,
    opacity: 0.4,
  } as any,
  ambientBottom: {
    position: 'absolute',
    bottom: -SH * 0.06,
    left: '10%',
    width: '80%',
    height: SH * 0.35,
    borderTopLeftRadius: SH * 0.3,
    borderTopRightRadius: SH * 0.3,
    opacity: 0.35,
  } as any,
  centerGlow: {
    position: 'absolute',
    top: '22%',
    left: '15%',
    width: '70%',
    height: '40%',
    borderRadius: SH * 0.3,
    backgroundColor: 'rgba(155,92,255,0.02)',
  } as any,

  /* ── Layer 4: Vignette ── */
  vignetteWrap: { ...StyleSheet.absoluteFillObject },
  vignetteTop: { position: 'absolute', top: 0, left: 0, right: 0, height: SH * 0.3 },
  vignetteBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: SH * 0.35 },
  vignetteLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: SW * 0.2 },
  vignetteRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: SW * 0.2 },
  ambientWash: { ...StyleSheet.absoluteFillObject },

  /* ── Layer 5: Content ── */
  content: {
    flex: 1,
    paddingHorizontal: wp(20),
    paddingTop: hp(44),
  },

  /* ── Panel base ── */
  panelBase: { overflow: 'hidden' },
  panelImg: { borderRadius: wp(14) },

  /* ── PulseDot ── */
  dot: {
    width: wp(6),
    height: wp(6),
    borderRadius: wp(3),
    backgroundColor: C.neonRed,
    marginRight: wp(5),
  },

  /* ═══ TOP BAR — DH Texas Poker style ═══ */
  topBar: {
    marginHorizontal: -wp(20),
    marginBottom: hp(8),
  },
  topBarGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    height: hp(56),
    paddingHorizontal: wp(12),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,175,55,0.15)',
  } as any,
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  } as any,
  topBarAvatarWrap: {
    width: wp(40),
    height: wp(40),
    borderRadius: wp(20),
    overflow: 'visible',
    ...Platform.select({
      ios: { shadowColor: 'rgba(155,92,255,0.5)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  } as any,
  topBarAvatarGrad: {
    flex: 1,
    borderRadius: wp(20),
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  topBarAvatarInner: {
    flex: 1,
    width: '100%',
    borderRadius: wp(18),
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  } as any,
  topBarAvatarText: {
    color: C.txt,
    fontSize: fs(16),
    fontWeight: '900',
  },
  topBarVipBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: wp(16),
    height: wp(16),
    borderRadius: wp(8),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.bg,
  },
  topBarVipBadgeText: {
    color: '#FFFFFF',
    fontSize: fs(7),
    fontWeight: '900',
  },
  topBarNameCol: {
    marginLeft: wp(8),
    flex: 1,
    minWidth: 0,
  },
  topBarUsername: {
    color: C.txt,
    fontSize: fs(13),
    fontWeight: '800',
  },
  topBarVipName: {
    fontSize: fs(9),
    fontWeight: '700',
    marginTop: 1,
  },

  /* Top Bar: Chip count */
  topBarChips: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderRadius: 16,
    paddingLeft: wp(6),
    paddingRight: wp(4),
    paddingVertical: hp(4),
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
    marginHorizontal: wp(8),
  } as any,
  topBarCoinIcon: {
    width: wp(18),
    height: wp(18),
  },
  topBarChipText: {
    color: C.gold,
    fontSize: fs(13),
    fontWeight: '900',
    marginLeft: wp(4),
    textShadowColor: 'rgba(212,175,55,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  topBarAddBtn: {
    width: wp(20),
    height: wp(20),
    borderRadius: wp(10),
    backgroundColor: C.neonGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: wp(4),
  },
  topBarAddBtnText: {
    color: '#FFFFFF',
    fontSize: fs(14),
    fontWeight: '900',
    marginTop: -1,
  },

  /* Top Bar: Right icon buttons */
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
  } as any,
  topBarIconBtn: {
    width: wp(32),
    height: wp(32),
    borderRadius: wp(10),
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  topBarIconImg: {
    width: wp(18),
    height: wp(18),
    tintColor: C.muted,
  } as any,

  /* Icon placeholder for missing assets */
  iconPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: fs(14),
  },

  /* ═══ ZONE 1: Game Mode Buttons ═══ */
  gameModeStripWrap: {
    marginHorizontal: -wp(20),
    flexGrow: 0,
  },
  gameModeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(20),
    gap: wp(10),
    paddingVertical: hp(6),
  },

  /* ── Shared tile base ── */
  bullBtn: {
    width: wp(260),
    height: SH * 0.28,
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.35)',
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: -2, height: 4 }, shadowOpacity: 0.35, shadowRadius: 14 },
      android: { elevation: 10 },
      web: { boxShadow: '-2px 4px 20px 3px rgba(212,175,55,0.25)' } as any,
    }),
  } as any,
  pokerBtn: {
    width: wp(220),
    height: SH * 0.28,
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.25)',
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: -2, height: 4 }, shadowOpacity: 0.3, shadowRadius: 14 },
      android: { elevation: 10 },
      web: { boxShadow: '-2px 4px 20px 3px rgba(212,175,55,0.2)' } as any,
    }),
  } as any,
  tournamentBtn: {
    width: wp(180),
    height: SH * 0.28,
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.2)',
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: -2, height: 4 }, shadowOpacity: 0.25, shadowRadius: 14 },
      android: { elevation: 10 },
      web: { boxShadow: '-2px 4px 20px 3px rgba(212,175,55,0.15)' } as any,
    }),
  } as any,

  /* ── Shared tile inner elements ── */
  tileBgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    borderRadius: 16,
  } as any,
  tileRimLight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  tileEdgeHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '60%',
    height: 1.5,
    backgroundColor: 'rgba(212,175,55,0.4)',
    borderTopLeftRadius: 16,
  } as any,
  tileContentBottom: {
    position: 'absolute',
    bottom: hp(12),
    left: wp(12),
    right: wp(12),
    alignItems: 'flex-start',
  },
  tileTitleLarge: {
    color: '#FFFFFF',
    fontSize: fs(24),
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  tileTitleMed: {
    color: '#FFFFFF',
    fontSize: fs(20),
    fontWeight: '900',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  tileLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: hp(3),
  },
  tileLiveText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fs(9),
    fontWeight: '800',
    letterSpacing: 1,
    marginRight: wp(4),
  },
  tileSubText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: fs(10),
    fontWeight: '600',
    marginTop: hp(1),
  },

  /* ── Poker tile premium elements ── */
  pokerFelt: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,82,40,0.15)',
    borderRadius: 16,
  },
  pokerCardGlow: {
    position: 'absolute',
    top: '5%',
    width: wp(70),
    height: wp(50),
    borderRadius: wp(25),
    backgroundColor: 'rgba(38,217,92,0.14)',
    alignSelf: 'center',
    ...Platform.select({
      ios: { shadowColor: 'rgba(38,217,92,0.3)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 20 },
      web: { boxShadow: '0 0 30px 10px rgba(38,217,92,0.06)' } as any,
    }),
  } as any,
  pokerCards: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: hp(4),
    zIndex: 2,
  },
  pokerCardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.5)' } as any,
    }),
  } as any,
  pokerCard: {
    width: wp(28),
    height: wp(38),
    backgroundColor: '#FAFBFC',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  pokerCardOverlap: {
    marginLeft: -wp(5),
    transform: [{ rotate: '8deg' }],
  },
  pokerCardText: {
    fontSize: fs(14),
    fontWeight: '900',
    color: '#1a1a2e',
  },

  /* ═══ QUICK ACCESS ROW ═══ */
  quickAccessRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: wp(20),
    marginTop: hp(16),
    paddingVertical: hp(8),
  } as any,
  quickAccessItem: {
    alignItems: 'center',
  },
  quickAccessCircle: {
    width: wp(52),
    height: wp(52),
    borderRadius: wp(26),
    backgroundColor: 'rgba(14,17,34,0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: 'rgba(212,175,55,0.15)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  quickAccessEmoji: {
    fontSize: fs(20),
  },
  quickAccessLabel: {
    color: C.muted,
    fontSize: fs(9),
    fontWeight: '700',
    marginTop: hp(4),
    textAlign: 'center',
  },

  /* ═══ BOTTOM TAB BAR ═══ */
  bottomTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomTabBarGrad: {
    paddingBottom: hp(24),
    paddingTop: hp(6),
  },
  bottomTabBarTopBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(212,175,55,0.2)',
  },
  bottomTabBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: wp(8),
  } as any,
  bottomTabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp(4),
    minWidth: wp(52),
    position: 'relative',
  } as any,
  bottomTabGlow: {
    position: 'absolute',
    top: -hp(4),
    width: wp(40),
    height: wp(40),
    borderRadius: wp(20),
    backgroundColor: 'rgba(212,175,55,0.08)',
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  } as any,
  bottomTabIconWrap: {
    width: wp(28),
    height: wp(28),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomTabIconWrapActive: {
    // active state — gold tint applied via text style
  },
  bottomTabEmoji: {
    fontSize: fs(18),
    opacity: 0.5,
  },
  bottomTabEmojiActive: {
    opacity: 1,
  },
  bottomTabLabel: {
    color: C.muted,
    fontSize: fs(9),
    fontWeight: '700',
    marginTop: hp(2),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bottomTabLabelActive: {
    color: C.gold,
    textShadowColor: 'rgba(212,175,55,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },

  /* ── Glassmorphism ── */
  glassOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: 'rgba(155,92,255,0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  glassBlur: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 16,
  },
  glassSurface: {
    flex: 1,
    backgroundColor: 'rgba(20,24,50,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  glassInnerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    opacity: 0.5,
  } as any,

  /* ── GameTile (reusable) ── */
  gameTile: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    ...shadows.card,
  },
  gameTileGrad: {
    flex: 1,
    paddingVertical: hp(16),
    paddingHorizontal: wp(14),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  tileOuterGlow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 20,
    backgroundColor: 'rgba(212,175,55,0.08)',
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  tileTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '35%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  tileBottomShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '25%',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
});
