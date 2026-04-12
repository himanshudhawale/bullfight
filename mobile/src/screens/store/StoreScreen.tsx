import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { colors, wp, hp, fs } from '../../theme';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';
import PremiumIcon from '../../components/PremiumIcon';
import { VIP_LEVELS, VipLevel, getVipConfig } from '../../../../shared/types';

const BULL_LOGO = require('../../../assets/game/bull_logo.png');

const STACK_ASSETS = {
  small: require('../../../assets/store/small_stack.png'),
  medium: require('../../../assets/store/medium_stack.png'),
  large: require('../../../assets/store/large_stack.png'),
  xl: require('../../../assets/store/xl_stack.png'),
  xxl: require('../../../assets/store/xxl_stack.png'),
};

/* ── Bonus constants ─────────────────────────────────────────────── */
const STREAK_REWARDS = [5_000, 8_000, 12_000, 18_000, 25_000, 35_000, 50_000];
const HOURLY_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const BROKE_THRESHOLD = 1_000;
const BROKE_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/* ── Chip Package definitions ──────────────────────────────────── */
const CHIP_PACKAGES = [
  { id: 'starter', name: 'Starter Pack', chips: 10_000, requirement: 'Play 5 games', target: 5, stackAsset: 'small' as const, statKey: 'gamesPlayed' as const },
  { id: 'winner', name: 'Winner Pack', chips: 25_000, requirement: 'Win 3 games', target: 3, stackAsset: 'medium' as const, statKey: 'gamesWon' as const },
  { id: 'streak', name: 'Streak Pack', chips: 50_000, requirement: '7-day login streak', target: 7, stackAsset: 'large' as const, statKey: 'loginStreak' as const },
  { id: 'highroller', name: 'High Roller', chips: 100_000, requirement: 'Win 50K in one game', target: 50_000, stackAsset: 'xl' as const, statKey: 'biggestWin' as const },
];

/* ── Helpers ─────────────────────────────────────────────────────── */

function formatChips(n: number): string {
  if (n >= 1e6) {
    const m = n / 1e6;
    return m % 1 === 0 ? `${m.toFixed(0)}M` : `${m.toFixed(1)}M`;
  }
  return `${(n / 1e3).toFixed(0)}K`;
}

/* ── SectionHeader ────────────────────────────────────────────────── */

function SectionHeader({ title, icon }: { title: string; icon?: string }) {
  return (
    <View style={st.sectionHeader}>
      <View style={st.sectionHeaderInner}>
        {icon && <PremiumIcon name={icon} size={18} />}
        <Text style={st.sectionTitle}>{title}</Text>
      </View>
      <View style={st.sectionUnderline} />
    </View>
  );
}

/* ── Date helpers ─────────────────────────────────────────────────── */

function todayUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function msUntilCooldown(lastAt: string | undefined, cooldownMs: number): number {
  if (!lastAt) return 0;
  const elapsed = Date.now() - new Date(lastAt).getTime();
  return Math.max(0, cooldownMs - elapsed);
}

function fmtCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ── Claim Celebration Overlay ─────────────────────────────────────── */

const GOLD_COIN = require('../../../assets/game/gold_coin.png');
const { width: SW, height: SH } = Dimensions.get('window');
const PARTICLE_COUNT = 8;

function ClaimCelebration({ amount, visible, onDone }: {
  amount: number;
  visible: boolean;
  onDone: () => void;
}) {
  const glowScale = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const textScale = useRef(new Animated.Value(0.4)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  // Chip particles — pre-computed random trajectories
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.6),
      angle: (Math.random() - 0.5) * 120,
      distance: 60 + Math.random() * 80,
      delay: Math.floor(Math.random() * 150),
    })),
  ).current;

  useEffect(() => {
    if (!visible) return;

    // Reset
    glowScale.setValue(0);
    glowOpacity.setValue(0);
    textScale.setValue(0.4);
    textOpacity.setValue(0);
    particles.forEach(p => {
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(0);
      p.scale.setValue(0.6);
    });

    // 1) Gold glow burst
    Animated.parallel([
      Animated.timing(glowOpacity, { toValue: 0.7, duration: 200, useNativeDriver: true }),
      Animated.spring(glowScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
    ]).start();

    // 2) Reward text pop
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(textScale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
    ]).start();

    // 3) Chip particles fly upward and outward
    particles.forEach(p => {
      const rad = (p.angle * Math.PI) / 180;
      const dx = Math.sin(rad) * p.distance;
      const dy = -Math.abs(Math.cos(rad)) * p.distance - 20;

      Animated.sequence([
        Animated.delay(p.delay),
        Animated.parallel([
          Animated.timing(p.opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.timing(p.x, { toValue: dx, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(p.y, { toValue: dy, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(p.scale, { toValue: 0.3, duration: 600, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.timing(p.opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });

    // 4) Fade everything out
    const fadeTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(glowOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => onDone());
    }, 1400);

    return () => clearTimeout(fadeTimer);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={celebSt.overlay} pointerEvents="none">
      {/* Gold radial glow */}
      <Animated.View
        style={[
          celebSt.glow,
          { opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
      />

      {/* Chip particles */}
      {particles.map((p, i) => (
        <Animated.Image
          key={i}
          source={GOLD_COIN}
          style={[
            celebSt.particle,
            {
              opacity: p.opacity,
              transform: [
                { translateX: p.x },
                { translateY: p.y },
                { scale: p.scale },
              ],
            },
          ]}
        />
      ))}

      {/* Reward text */}
      <Animated.View
        style={[
          celebSt.textWrap,
          { opacity: textOpacity, transform: [{ scale: textScale }] },
        ]}
      >
        <Text style={celebSt.plus}>+</Text>
        <Image source={GOLD_COIN} style={celebSt.textCoin} />
        <Text style={celebSt.amount}>{formatChips(amount)}</Text>
      </Animated.View>
    </View>
  );
}

const celebSt = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  } as any,
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(212,175,55,0.15)',
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 40 },
      web: { boxShadow: '0 0 60px 30px rgba(212,175,55,0.25)' } as any,
    }),
  } as any,
  particle: {
    position: 'absolute',
    width: 22,
    height: 22,
  },
  textWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,14,26,0.85)',
    paddingHorizontal: wp(20),
    paddingVertical: hp(10),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
  },
  plus: {
    fontSize: fs(24),
    fontWeight: '900',
    color: '#26D95C',
    marginRight: 4,
  },
  textCoin: {
    width: 24,
    height: 24,
    marginRight: 6,
  },
  amount: {
    fontSize: fs(22),
    fontWeight: '900',
    color: '#E8C84A',
  },
});

/* ── useCooldownTimer hook ───────────────────────────────────────── */

function useCooldownTimer(lastAt: string | undefined, cooldownMs: number): number {
  const [remaining, setRemaining] = useState(() => msUntilCooldown(lastAt, cooldownMs));

  useEffect(() => {
    setRemaining(msUntilCooldown(lastAt, cooldownMs));
    const id = setInterval(() => {
      const r = msUntilCooldown(lastAt, cooldownMs);
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [lastAt, cooldownMs]);

  return remaining;
}

/* ── Shared card wrapper ──────────────────────────────────────────── */

type CardState = 'available' | 'cooldown' | 'claimed';

type BonusPriority = 'high' | 'medium' | 'low';

function BonusCardShell({
  state,
  vipLevel,
  priority = 'medium',
  children,
}: {
  state: CardState;
  vipLevel?: number;
  priority?: BonusPriority;
  children: React.ReactNode;
}) {
  const baseOpacity =
    state === 'claimed' ? 0.5
    : state === 'cooldown' ? (priority === 'low' ? 0.4 : 0.7)
    : 1;
  const borderColor =
    state === 'available'
      ? 'rgba(212,175,55,0.35)'
      : 'rgba(255,255,255,0.08)';

  const bonusMult = vipLevel && vipLevel > 1 ? getVipConfig(vipLevel as VipLevel).dailyBonusMultiplier : 0;

  // Pulsing gold border for available state
  const borderPulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (state !== 'available') { borderPulse.setValue(0.35); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(borderPulse, { toValue: 0.6, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(borderPulse, { toValue: 0.35, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, borderPulse]);

  const animatedBorderColor = state === 'available'
    ? borderPulse.interpolate({ inputRange: [0.35, 0.6], outputRange: ['rgba(212,175,55,0.35)', 'rgba(212,175,55,0.6)'] })
    : borderColor;

  const priorityWidth = priority === 'high' ? wp(230) : wp(210);
  const priorityShadow = priority === 'high'
    ? Platform.select({
        ios: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 18 },
        android: { elevation: 14 },
        web: { boxShadow: '0 0 22px 6px rgba(212,175,55,0.28)' } as any,
      })
    : state === 'available'
      ? Platform.select({
          ios: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 10 },
          android: { elevation: 10 },
          web: { boxShadow: '0 0 14px 2px rgba(212,175,55,0.18)' } as any,
        })
      : {};

  return (
    <Animated.View
      style={[
        st.offerCard,
        {
          opacity: baseOpacity,
          borderColor: animatedBorderColor,
          width: priorityWidth,
          ...priorityShadow,
        },
      ] as any}
    >
      {/* Decorative bg chip stack */}
      <Image source={STACK_ASSETS.small} style={st.cardBgDecor} resizeMode="contain" />

      {/* VIP multiplier badge */}
      {bonusMult > 0 && (
        <View style={st.vipBadge}>
          <PremiumIcon name="crown" size={10} />
          <Text style={st.vipBadgeText}>{'\u00D7'}{bonusMult.toFixed(1)}</Text>
        </View>
      )}

      {children}
    </Animated.View>
  );
}

/* ── CTA button ───────────────────────────────────────────────────── */

function BonusCTA({
  label,
  disabled,
  countdownText,
  onPress,
}: {
  label: string;
  disabled: boolean;
  countdownText?: string;
  onPress: () => void;
}) {
  if (disabled && countdownText) {
    return (
      <View style={st.ctaDisabled}>
        <Text style={st.ctaDisabledText}>{countdownText}</Text>
      </View>
    );
  }
  if (disabled) {
    return (
      <View style={st.ctaDisabled}>
        <Text style={st.ctaDisabledText}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [pressed && { transform: [{ scale: 0.97 }] }]}
      onPress={onPress}
    >
      <LinearGradient
        colors={['#E8C84A', '#D4AF37', '#B8941F'] as [string, string, ...string[]]}
        style={st.priceBtn}
      >
        <Text style={st.priceText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/* ── VIP upsell footer ────────────────────────────────────────────── */

function VipUpsellFooter({ vipLevel, bonusMult }: { vipLevel: number; bonusMult: number }) {
  if (vipLevel <= 1) return null;
  return (
    <View style={st.upsellWrap}>
      <Text style={st.upsellVip}>
        VIP {vipLevel}: +{Math.round((bonusMult - 1) * 100)}% bonus
      </Text>
    </View>
  );
}

/* ── Login Streak Card ────────────────────────────────────────────── */

function LoginStreakCard({
  user,
  claiming,
  onClaim,
}: {
  user: any;
  claiming: boolean;
  onClaim: () => void;
}) {
  const streak = user?.loginStreak ?? 0;
  const lastClaim = user?.lastStreakClaimDate;
  const today = todayUTC();
  const yesterday = yesterdayUTC();

  const claimedToday = lastClaim === today;
  let effectiveDay: number;
  if (claimedToday) {
    effectiveDay = Math.min(streak, 7);
  } else if (lastClaim === yesterday) {
    effectiveDay = Math.min(streak + 1, 7);
  } else {
    effectiveDay = 1;
  }

  const cardState: CardState = claimedToday ? 'claimed' : 'available';
  const reward = STREAK_REWARDS[effectiveDay - 1] ?? STREAK_REWARDS[0];

  const vipLevel = (user?.vipLevel || 1) as VipLevel;
  const bonusMult = getVipConfig(vipLevel).dailyBonusMultiplier;

  // Pulsing animation for current day dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (claimedToday) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [claimedToday, pulseAnim]);

  return (
    <BonusCardShell state={cardState} vipLevel={vipLevel} priority="medium">
      {/* Header */}
      <View style={st.cardHeader}>
        <PremiumIcon name="flame" size={28} />
        <View style={{ marginLeft: wp(8), flex: 1 }}>
          <Text style={st.cardTitle}>Login Streak</Text>
          <Text style={st.cardSubtitle}>
            {claimedToday
              ? 'Claimed \u2713 Come back tomorrow'
              : `Day ${effectiveDay} of 7`}
          </Text>
        </View>
        {claimedToday && <PremiumIcon name="check" size={22} />}
      </View>

      {/* Chip stack */}
      <View style={st.offerImageWrap}>
        <Image source={STACK_ASSETS.small} style={st.offerImage} resizeMode="contain" />
      </View>
      <Text style={st.offerChipsLine}>
        {formatChips(reward)}{' '}
        <Text style={st.offerBonusInline}>FREE</Text>
      </Text>

      {/* 7-dot progress bar */}
      <View style={st.dotsRow}>
        {STREAK_REWARDS.map((r, i) => {
          const dayNum = i + 1;
          const isCompleted = claimedToday ? dayNum <= effectiveDay : dayNum < effectiveDay;
          const isCurrent = !claimedToday && dayNum === effectiveDay;
          const isDay7 = dayNum === 7;

          const dotStyle = [
            st.dot,
            isCompleted && st.dotCompleted,
            !isCompleted && !isCurrent && st.dotUpcoming,
            isDay7 && !isCompleted && !isCurrent && st.dotDay7Upcoming,
            isDay7 && isCompleted && st.dotDay7Completed,
          ];

          const dot = (
            <View key={dayNum} style={st.dotCol}>
              {isCurrent ? (
                <Animated.View
                  style={[
                    st.dot,
                    st.dotCurrent,
                    isDay7 && st.dotDay7Current,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                />
              ) : (
                <View style={dotStyle} />
              )}
              <Text
                style={[
                  st.dotLabel,
                  isCompleted && st.dotLabelCompleted,
                  isCurrent && st.dotLabelCurrent,
                  isDay7 && st.dotLabelDay7,
                ]}
              >
                {formatChips(r)}
              </Text>
            </View>
          );
          return dot;
        })}
      </View>

      {/* CTA */}
      <BonusCTA
        label={claiming ? '...' : claimedToday ? 'CLAIMED \u2713' : `CLAIM DAY ${effectiveDay}`}
        disabled={claimedToday || claiming}
        onPress={onClaim}
      />

      <VipUpsellFooter vipLevel={vipLevel} bonusMult={bonusMult} />
    </BonusCardShell>
  );
}

/* ── Hourly Bonus Card ────────────────────────────────────────────── */

function HourlyBonusCard({
  user,
  claiming,
  onClaim,
}: {
  user: any;
  claiming: boolean;
  onClaim: () => void;
}) {
  const remaining = useCooldownTimer(user?.lastHourlyBonusAt, HOURLY_COOLDOWN_MS);
  const isAvailable = remaining <= 0;
  const cardState: CardState = isAvailable ? 'available' : 'cooldown';

  const vipLevel = (user?.vipLevel || 1) as VipLevel;
  const bonusMult = getVipConfig(vipLevel).dailyBonusMultiplier;

  return (
    <BonusCardShell state={cardState} vipLevel={vipLevel} priority="high">
      <View style={st.cardHeader}>
        <PremiumIcon name="clock" size={28} />
        <View style={{ marginLeft: wp(8), flex: 1 }}>
          <Text style={st.cardTitle}>Hourly Bonus</Text>
          <Text style={st.cardSubtitle}>
            {isAvailable ? 'Ready to claim!' : 'Next claim in'}
          </Text>
        </View>
      </View>

      {!isAvailable && (
        <Text style={st.countdownText}>{fmtCountdown(remaining)}</Text>
      )}

      <View style={st.offerImageWrap}>
        <Image source={STACK_ASSETS.small} style={st.offerImage} resizeMode="contain" />
      </View>
      <Text style={st.offerChipsLine}>
        2K{' '}
        <Text style={st.offerBonusInline}>FREE</Text>
      </Text>

      <BonusCTA
        label={claiming ? '...' : 'CLAIM NOW'}
        disabled={!isAvailable || claiming}
        countdownText={!isAvailable ? fmtCountdown(remaining) : undefined}
        onPress={onClaim}
      />

      <VipUpsellFooter vipLevel={vipLevel} bonusMult={bonusMult} />
    </BonusCardShell>
  );
}

/* ── Rescue Chips Card ────────────────────────────────────────────── */

function RescueChipsCard({
  user,
  claiming,
  onClaim,
}: {
  user: any;
  claiming: boolean;
  onClaim: () => void;
}) {
  const chips = user?.chips ?? 0;
  const isBroke = chips < BROKE_THRESHOLD;
  const remaining = useCooldownTimer(user?.lastBrokeBonusAt, BROKE_COOLDOWN_MS);
  const cooldownDone = remaining <= 0;

  const isAvailable = isBroke && cooldownDone;
  const cardState: CardState = isAvailable ? 'available' : 'cooldown';

  const vipLevel = (user?.vipLevel || 1) as VipLevel;
  const bonusMult = getVipConfig(vipLevel).dailyBonusMultiplier;

  // Balance threshold bar (0 -> 1K range)
  const barProgress = Math.min(1, chips / BROKE_THRESHOLD);

  return (
    <BonusCardShell state={cardState} vipLevel={vipLevel} priority="low">
      <View style={st.cardHeader}>
        <PremiumIcon name="shield" size={28} />
        <View style={{ marginLeft: wp(8), flex: 1 }}>
          <Text style={st.cardTitle}>Rescue Chips</Text>
          <Text style={st.cardSubtitle}>
            {isAvailable
              ? 'You qualify! Claim now'
              : isBroke && !cooldownDone
              ? 'On cooldown'
              : 'Available when balance < 1K'}
          </Text>
        </View>
      </View>

      {isBroke && !cooldownDone && (
        <Text style={st.countdownText}>{fmtCountdown(remaining)}</Text>
      )}

      <View style={st.offerImageWrap}>
        <Image source={STACK_ASSETS.medium} style={st.offerImage} resizeMode="contain" />
      </View>
      <Text style={st.offerChipsLine}>
        50K{' '}
        <Text style={st.offerBonusInline}>FREE</Text>
      </Text>

      {/* Balance threshold bar */}
      <View style={st.thresholdWrap}>
        <View style={st.thresholdBarBg}>
          <View
            style={[
              st.thresholdBarFill,
              {
                width: `${Math.max(2, barProgress * 100)}%` as any,
                backgroundColor: isBroke ? '#26D95C' : 'rgba(255,255,255,0.2)',
              },
            ]}
          />
        </View>
        <Text style={st.thresholdLabel}>
          {chips.toLocaleString()} / {BROKE_THRESHOLD.toLocaleString()}
        </Text>
      </View>

      <BonusCTA
        label={claiming ? '...' : isAvailable ? 'CLAIM NOW' : isBroke && !cooldownDone ? fmtCountdown(remaining) : 'NOT ELIGIBLE'}
        disabled={!isAvailable || claiming}
        countdownText={isBroke && !cooldownDone ? fmtCountdown(remaining) : undefined}
        onPress={onClaim}
      />

      <VipUpsellFooter vipLevel={vipLevel} bonusMult={bonusMult} />
    </BonusCardShell>
  );
}

/* ── Featured Deal Banner ──────────────────────────────────────── */

function FeaturedDealBanner({
  claimedToday,
  todayReward,
  effectiveDay,
  onClaim,
  claiming,
}: {
  claimedToday: boolean;
  todayReward: number;
  effectiveDay: number;
  onClaim: () => void;
  claiming: boolean;
}) {
  // Countdown to next UTC midnight
  const [resetMs, setResetMs] = useState(0);
  useEffect(() => {
    if (!claimedToday) return;
    const compute = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCDate(midnight.getUTCDate() + 1);
      midnight.setUTCHours(0, 0, 0, 0);
      return midnight.getTime() - now.getTime();
    };
    setResetMs(compute());
    const id = setInterval(() => setResetMs(compute()), 1000);
    return () => clearInterval(id);
  }, [claimedToday]);

  // Pulse animation for claim button
  const btnPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (claimedToday) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(btnPulse, { toValue: 1.04, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(btnPulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [claimedToday, btnPulse]);

  // Banner pulse animation when unclaimed
  const bannerPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (claimedToday) { bannerPulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bannerPulse, { toValue: 1.015, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bannerPulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [claimedToday, bannerPulse]);

  // Sparkle particles around icon
  const SPARKLE_COUNT = 5;
  const sparkles = useRef(
    Array.from({ length: SPARKLE_COUNT }, () => ({
      opacity: new Animated.Value(0),
    })),
  ).current;
  useEffect(() => {
    const anims = sparkles.map((s, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 400),
          Animated.timing(s.opacity, { toValue: 0.9, duration: 600, useNativeDriver: true }),
          Animated.timing(s.opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
          Animated.delay((SPARKLE_COUNT - 1 - i) * 400),
        ]),
      ),
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [sparkles]);

  // Sparkle dot positions in a ring around the icon
  const sparklePositions = useMemo(() => {
    const radius = wp(32);
    return sparkles.map((_, i) => {
      const angle = (i / SPARKLE_COUNT) * 2 * Math.PI - Math.PI / 2;
      return { top: Math.sin(angle) * radius, left: Math.cos(angle) * radius };
    });
  }, [sparkles]);

  return (
    <Animated.View style={[st.dealBanner, { transform: [{ scale: bannerPulse }] }] as any}>
      <LinearGradient
        colors={['rgba(212,175,55,0.12)', 'rgba(10,14,26,0.95)', 'rgba(212,175,55,0.06)'] as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject as any}
      />
      <Image source={STACK_ASSETS.large} style={st.dealBannerBgStack} resizeMode="contain" />

      {/* Emoji with glow wrapper + sparkles */}
      <View style={st.dealBannerEmojiWrap}>
        {sparklePositions.map((pos, i) => (
          <Animated.View
            key={i}
            style={[
              st.sparkleDot,
              { opacity: sparkles[i].opacity, top: pos.top + wp(20), left: pos.left + wp(20) },
            ] as any}
          />
        ))}
        <Text style={st.dealBannerEmoji}>{'\uD83C\uDF81'}</Text>
      </View>
      <Text style={st.dealBannerTitle}>FREE DAILY BONUS</Text>
      <Text style={st.dealBannerSub}>
        {claimedToday
          ? `Claimed! Day ${effectiveDay} streak \uD83D\uDD25`
          : `Claim ${formatChips(todayReward)} chips \u2014 Day ${effectiveDay}!`}
      </Text>

      {claimedToday ? (
        <View style={st.dealClaimedWrap}>
          <Text style={st.dealClaimedText}>{'\u2705'} Claimed Today</Text>
          <Text style={st.dealResetText}>Resets in {fmtCountdown(resetMs)}</Text>
        </View>
      ) : (
        <Animated.View style={{ transform: [{ scale: btnPulse }] }}>
          <Pressable onPress={onClaim} disabled={claiming}>
            <LinearGradient
              colors={['#E8C84A', '#D4AF37', '#B8941F'] as [string, string, ...string[]]}
              style={st.dealClaimBtn}
            >
              <Text style={st.dealClaimBtnText}>{claiming ? '...' : 'CLAIM NOW'}</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/* ── Chip Package Card ──────────────────────────────────────────── */

function ChipPackageCard({ pack, onClaim }: {
  pack: {
    id: string;
    name: string;
    chips: number;
    requirement: string;
    target: number;
    stackAsset: keyof typeof STACK_ASSETS;
    current: number;
    progress: number;
    claimable: boolean;
  };
  onClaim: (id: string) => void;
}) {
  const claimed = (useAuthStore.getState().user as any)?.claimedPackages?.includes(pack.id);
  return (
    <View style={[st.packageCard, pack.claimable && !claimed && st.packageCardClaimable]}>
      <Image source={STACK_ASSETS[pack.stackAsset]} style={st.packageImage} resizeMode="contain" />
      <Text style={st.packageChips}>{formatChips(pack.chips)}</Text>
      <Text style={st.packageName}>{pack.name}</Text>
      <Text style={st.packageReq}>{pack.requirement}</Text>

      {/* Progress bar */}
      <View style={st.packageBarBg}>
        <LinearGradient
          colors={pack.claimable ? ['#26D95C', '#1db84e'] as [string, string] : ['#D4AF37', '#B8941F'] as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[st.packageBarFill, { width: `${Math.max(2, pack.progress * 100)}%` }] as any}
        />
      </View>
      <Text style={st.packageProgress}>
        {Math.min(pack.current, pack.target).toLocaleString()} / {pack.target.toLocaleString()}
      </Text>

      {claimed ? (
        <View style={st.packageLockedBtn}>
          <Text style={[st.packageLockedText, { color: '#26D95C' }]}>CLAIMED ✓</Text>
        </View>
      ) : pack.claimable ? (
        <Pressable onPress={() => onClaim(pack.id)}>
          <LinearGradient
            colors={['#E8C84A', '#D4AF37', '#B8941F'] as [string, string, ...string[]]}
            style={st.packageClaimBtn}
          >
            <Text style={st.packageClaimText}>CLAIM</Text>
          </LinearGradient>
        </Pressable>
      ) : (
        <View style={st.packageLockedBtn}>
          <Text style={st.packageLockedText}>{Math.round(pack.progress * 100)}%</Text>
        </View>
      )}
    </View>
  );
}

/* ── StoreScreen ──────────────────────────────────────────────────── */

export default function StoreScreen() {
  const nav = useNavigation();
  const [tab, setTab] = useState<'chips'>('chips');
  const [claiming, setClaiming] = useState<string | null>(null);
  const { user, loadUser } = useAuthStore();
  const scrollRef = useRef<ScrollView>(null);

  // Celebration state
  const [celebVisible, setCelebVisible] = useState(false);
  const [celebAmount, setCelebAmount] = useState(0);

  const triggerCelebration = useCallback((amount: number) => {
    setCelebAmount(amount);
    setCelebVisible(true);
  }, []);

  const handleClaimStreak = useCallback(async () => {
    try {
      setClaiming('bonus_streak');
      const result = await api.claimStreakBonus();
      const awarded = (result as any).reward || STREAK_REWARDS[0];
      await loadUser();
      triggerCelebration(awarded);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Could not claim bonus right now.';
      Alert.alert('Oops', msg);
    } finally {
      setClaiming(null);
    }
  }, [loadUser, triggerCelebration]);

  const handleClaimHourly = useCallback(async () => {
    try {
      setClaiming('bonus_hourly');
      const result = await api.claimHourlyBonus();
      const awarded = (result as any).reward || 2000;
      await loadUser();
      triggerCelebration(awarded);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Could not claim bonus right now.';
      Alert.alert('Oops', msg);
    } finally {
      setClaiming(null);
    }
  }, [loadUser, triggerCelebration]);

  const handleClaimBroke = useCallback(async () => {
    try {
      setClaiming('bonus_broke');
      const result = await api.claimBrokeBonus();
      const awarded = (result as any).reward || 50000;
      await loadUser();
      triggerCelebration(awarded);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Could not claim bonus right now.';
      Alert.alert('Oops', msg);
    } finally {
      setClaiming(null);
    }
  }, [loadUser, triggerCelebration]);

  const handleClaimPackage = useCallback(async (packageId: string) => {
    try {
      setClaiming(`package_${packageId}`);
      const result = await api.claimPackageBonus(packageId);
      const awarded = (result as any).reward || 0;
      await loadUser();
      triggerCelebration(awarded);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Could not claim package right now.';
      Alert.alert('Oops', msg);
    } finally {
      setClaiming(null);
    }
  }, [loadUser, triggerCelebration]);
  const userLevel = (user?.vipLevel || 1) as VipLevel;
  const userXp = user?.vipXp || 0;
  const currentCfg = getVipConfig(userLevel);
  const nextCfg = VIP_LEVELS.find(c => c.level === userLevel + 1);
  const xpProgress = nextCfg
    ? Math.min(1, (userXp - currentCfg.xpRequired) / (nextCfg.xpRequired - currentCfg.xpRequired))
    : 1;

  // Featured deal state
  const lastClaim = user?.lastStreakClaimDate;
  const today = todayUTC();
  const claimedToday = lastClaim === today;
  const streak = user?.loginStreak ?? 0;
  const effectiveDay = claimedToday
    ? Math.min(streak, 7)
    : (lastClaim === yesterdayUTC() ? Math.min(streak + 1, 7) : 1);
  const todayReward = STREAK_REWARDS[effectiveDay - 1] ?? STREAK_REWARDS[0];

  // Pulsing + button animation
  const plusPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(plusPulse, { toValue: 1.2, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(plusPulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [plusPulse]);

  // Chip package progress
  const chipPackageProgress = useMemo(() => {
    return CHIP_PACKAGES.map(pack => {
      let current = 0;
      if (pack.statKey === 'gamesPlayed') current = user?.gamesPlayed ?? 0;
      else if (pack.statKey === 'gamesWon') current = user?.gamesWon ?? 0;
      else if (pack.statKey === 'loginStreak') current = user?.loginStreak ?? 0;
      else if (pack.statKey === 'biggestWin') current = (user as any)?.biggestWin ?? 0;
      return {
        ...pack,
        current,
        progress: Math.min(1, current / pack.target),
        claimable: current >= pack.target,
      };
    });
  }, [user]);

  return (
    <View style={st.container}>
      {/* Claim celebration overlay */}
      <ClaimCelebration
        amount={celebAmount}
        visible={celebVisible}
        onDone={() => setCelebVisible(false)}
      />

      {/* Background decorations */}
      <Image source={BULL_LOGO} style={st.bgWatermark} resizeMode="contain" blurRadius={2} />
      <Image source={STACK_ASSETS.small} style={st.bgChipLeft} resizeMode="contain" blurRadius={3} />
      <Image source={STACK_ASSETS.xxl} style={st.bgChipRight} resizeMode="contain" blurRadius={3} />

      {/* ── Premium Header ── */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={st.backBtn}>
          <Text style={st.backBtnText}>{'\u2039'}</Text>
        </TouchableOpacity>
        <View style={st.headerCenter}>
          <Text style={st.headerTitle}>STORE</Text>
          <View style={st.headerGlow} />
        </View>
        <View style={st.backBtn} />
      </View>

      {/* Chip Balance Row */}
      <View style={st.chipBalanceRow}>
        <Image source={GOLD_COIN} style={st.chipBalanceIcon} />
        <Text style={st.chipBalanceText}>{(user?.chips ?? 0).toLocaleString()}</Text>
        <Animated.View style={{ transform: [{ scale: plusPulse }] }}>
          <Pressable
            style={st.chipPlusBtn}
            onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          >
            <Text style={st.chipPlusText}>+</Text>
          </Pressable>
        </Animated.View>
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={st.scrollContent}>
          <View>
            {/* Featured Deal Banner */}
            <FeaturedDealBanner
              claimedToday={claimedToday}
              todayReward={todayReward}
              effectiveDay={effectiveDay}
              onClaim={handleClaimStreak}
              claiming={claiming === 'bonus_streak'}
            />

            {/* Free Bonuses */}
            <SectionHeader title="FREE BONUSES" icon="gift" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.offersRow}
            >
              <LoginStreakCard
                user={user}
                claiming={claiming === 'bonus_streak'}
                onClaim={handleClaimStreak}
              />
              <HourlyBonusCard
                user={user}
                claiming={claiming === 'bonus_hourly'}
                onClaim={handleClaimHourly}
              />
              <RescueChipsCard
                user={user}
                claiming={claiming === 'bonus_broke'}
                onClaim={handleClaimBroke}
              />
            </ScrollView>

            {/* Chip Packages */}
            <SectionHeader title="CHIP PACKAGES" icon="star" />
            <View style={st.packagesGrid}>
              {chipPackageProgress.map(pack => (
                <ChipPackageCard key={pack.id} pack={pack} onClaim={handleClaimPackage} />
              ))}
            </View>
          </View>

        <View style={{ height: hp(40) }} />
      </ScrollView>
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────────────── */

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: wp(16),
  },

  /* ── Background decorations ── */
  bgWatermark: {
    position: 'absolute',
    width: wp(200),
    height: wp(200),
    alignSelf: 'center',
    top: '35%',
    left: '50%',
    marginLeft: -wp(100),
    opacity: 0.08,
  } as any,
  bgChipLeft: {
    position: 'absolute', top: hp(80), left: -wp(30),
    width: wp(120), height: wp(120), opacity: 0.05,
  } as any,
  bgChipRight: {
    position: 'absolute', bottom: hp(100), right: -wp(20),
    width: wp(140), height: wp(140), opacity: 0.06,
  } as any,

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: hp(16),
    marginBottom: hp(8),
  } as any,
  backBtn: {
    width: wp(36),
    height: wp(36),
    borderRadius: wp(18),
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  } as any,
  backBtnText: {
    color: '#fff',
    fontSize: fs(22),
    fontWeight: '600',
    marginTop: -2,
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  } as any,
  headerTitle: {
    fontSize: fs(28),
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 4,
    ...Platform.select({
      web: { textShadow: '0 0 20px rgba(212,175,55,0.4)' } as any,
    }),
  } as any,
  headerGlow: {
    position: 'absolute',
    width: wp(120),
    height: hp(40),
    borderRadius: wp(60),
    backgroundColor: 'rgba(212,175,55,0.08)',
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 30 },
      web: { boxShadow: '0 0 40px 20px rgba(212,175,55,0.08)' } as any,
    }),
  } as any,

  /* ── Chip Balance Row ── */
  chipBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,18,26,0.7)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
    paddingVertical: hp(6),
    paddingHorizontal: wp(16),
    marginBottom: hp(12),
    alignSelf: 'center',
  } as any,
  chipBalanceIcon: {
    width: 20,
    height: 20,
    marginRight: wp(6),
  },
  chipBalanceText: {
    fontSize: fs(16),
    fontWeight: '800',
    color: '#E8C84A',
    marginRight: wp(8),
  },
  chipPlusBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(212,175,55,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
  } as any,
  chipPlusText: {
    color: '#E8C84A',
    fontSize: fs(16),
    fontWeight: '800',
    marginTop: -1,
  },

  /* ── Tabs ── */
  tabRow: {
    flexDirection: 'row',
    gap: wp(8),
    marginBottom: hp(14),
  } as any,
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(6),
    paddingVertical: hp(10),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  } as any,
  tabActive: {
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderColor: 'rgba(212,175,55,0.3)',
  },
  tabText: {
    fontSize: fs(13),
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },

  scrollContent: {
    paddingBottom: hp(80),
  },

  /* ── Section Header ── */
  sectionHeader: {
    alignItems: 'center',
    marginBottom: hp(14),
    marginTop: hp(8),
  } as any,
  sectionHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    marginBottom: hp(6),
  } as any,
  sectionTitle: {
    fontSize: fs(15),
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 3,
  },
  sectionUnderline: {
    width: wp(40),
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(212,175,55,0.4)',
  },

  /* ── Featured Deal Banner ── */
  dealBanner: {
    backgroundColor: 'rgba(14,18,26,0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.35)',
    borderRadius: 18,
    padding: wp(24),
    alignItems: 'center',
    marginBottom: hp(20),
    overflow: 'hidden' as const,
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 16 },
      android: { elevation: 12 },
      web: { boxShadow: '0 0 20px 4px rgba(212,175,55,0.15)' } as any,
    }),
  } as any,
  dealBannerBgStack: {
    position: 'absolute',
    right: -wp(20),
    bottom: -hp(10),
    width: wp(120),
    height: wp(100),
    opacity: 0.08,
  } as any,
  dealBannerEmojiWrap: {
    position: 'relative',
    width: wp(52),
    height: wp(52),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(6),
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 18 },
      web: { boxShadow: '0 0 24px 10px rgba(212,175,55,0.3)' } as any,
    }),
  } as any,
  sparkleDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFD700',
  } as any,
  dealBannerEmoji: {
    fontSize: fs(40),
  },
  dealBannerTitle: {
    fontSize: fs(24),
    fontWeight: '900',
    color: '#E8C84A',
    letterSpacing: 3,
    marginBottom: hp(4),
    ...Platform.select({
      web: { textShadow: '0 0 12px rgba(212,175,55,0.3)' } as any,
    }),
  } as any,
  dealBannerSub: {
    fontSize: fs(13),
    color: colors.textSecondary,
    marginBottom: hp(14),
    textAlign: 'center' as const,
  },
  dealClaimedWrap: {
    alignItems: 'center',
  } as any,
  dealClaimedText: {
    fontSize: fs(14),
    fontWeight: '700',
    color: '#26D95C',
    marginBottom: hp(4),
    ...Platform.select({
      ios: { shadowColor: '#26D95C', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 8 } as any,
      web: { textShadow: '0 0 10px rgba(38,217,92,0.5), 0 0 20px rgba(38,217,92,0.25)' } as any,
    }),
  } as any,
  dealResetText: {
    fontSize: fs(13),
    color: '#E8C84A',
    fontWeight: '600',
    fontVariant: ['tabular-nums'] as any,
  },
  dealClaimBtn: {
    paddingVertical: hp(12),
    paddingHorizontal: wp(40),
    borderRadius: 12,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  dealClaimBtnText: {
    color: colors.background,
    fontSize: fs(16),
    fontWeight: '900',
    letterSpacing: 2,
  },

  /* ── Free Bonuses ── */
  offersRow: {
    paddingHorizontal: wp(4),
    gap: wp(10),
    paddingBottom: hp(8),
    alignItems: 'stretch',
  } as any,
  offerCard: {
    width: wp(210),
    minHeight: hp(280),
    backgroundColor: 'rgba(14,18,26,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingHorizontal: wp(14),
    paddingTop: hp(14),
    paddingBottom: hp(14),
    overflow: 'hidden' as const,
    justifyContent: 'space-between' as const,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
      web: { boxShadow: '0 6px 20px 4px rgba(0,0,0,0.35)' } as any,
    }),
  } as any,

  /* Decorative bg chip in cards */
  cardBgDecor: {
    position: 'absolute',
    right: -wp(10),
    bottom: -hp(5),
    width: wp(60),
    height: wp(50),
    opacity: 0.06,
  } as any,

  /* VIP badge on cards */
  vipBadge: {
    position: 'absolute',
    top: hp(8),
    right: wp(8),
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(3),
    backgroundColor: 'rgba(188,140,255,0.2)',
    borderRadius: 8,
    paddingVertical: hp(2),
    paddingHorizontal: wp(6),
    borderWidth: 1,
    borderColor: 'rgba(188,140,255,0.3)',
    zIndex: 10,
  } as any,
  vipBadgeText: {
    fontSize: fs(8),
    fontWeight: '800',
    color: '#BC8CFF',
  },

  /* Card header */
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: hp(8),
  } as any,
  cardTitle: {
    fontSize: fs(14),
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  cardSubtitle: {
    fontSize: fs(10),
    color: colors.textMuted,
    marginTop: hp(1),
  },

  /* Chip stack image */
  offerImageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(6),
  } as any,
  offerImage: {
    width: wp(100),
    height: wp(70),
  } as any,
  offerChipsLine: {
    fontSize: fs(16),
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: hp(8),
  } as any,
  offerBonusInline: {
    color: '#26D95C',
    fontWeight: '700',
  },

  /* Countdown */
  countdownText: {
    fontSize: fs(22),
    fontWeight: '800',
    color: '#E8C84A',
    textAlign: 'center' as const,
    marginBottom: hp(4),
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: 2,
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6 } as any,
      web: { textShadow: '0 0 8px rgba(212,175,55,0.4), 0 0 16px rgba(212,175,55,0.2)' } as any,
    }),
  } as any,

  /* 7-dot streak progress */
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: hp(10),
    paddingHorizontal: wp(2),
  } as any,
  dotCol: {
    alignItems: 'center',
    width: wp(22),
  } as any,
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'transparent',
  },
  dotCompleted: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  dotCurrent: {
    borderColor: '#E8C84A',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  dotUpcoming: {
    borderColor: 'rgba(255,255,255,0.12)',
  },
  dotDay7Upcoming: {
    borderColor: 'rgba(212,175,55,0.3)',
  },
  dotDay7Completed: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
    ...Platform.select({
      ios: { shadowColor: '#FFD700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 4 },
      android: { elevation: 4 },
      web: { boxShadow: '0 0 6px 2px rgba(255,215,0,0.4)' } as any,
    }),
  } as any,
  dotDay7Current: {
    borderColor: '#FFD700',
  },
  dotLabel: {
    fontSize: fs(7),
    color: colors.textMuted,
    marginTop: hp(2),
  },
  dotLabelCompleted: {
    color: '#D4AF37',
  },
  dotLabelCurrent: {
    color: '#E8C84A',
    fontWeight: '700',
  },
  dotLabelDay7: {
    color: '#FFD700',
    fontWeight: '700',
    ...Platform.select({
      web: { textShadow: '0 0 4px rgba(255,215,0,0.5)' } as any,
    }),
  } as any,

  /* Threshold bar (rescue chips) */
  thresholdWrap: {
    marginBottom: hp(8),
    alignItems: 'center',
  } as any,
  thresholdBarBg: {
    width: '100%',
    height: hp(6),
    borderRadius: hp(3),
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden' as const,
  } as any,
  thresholdBarFill: {
    height: '100%',
    borderRadius: hp(3),
  },
  thresholdLabel: {
    fontSize: fs(9),
    color: colors.textMuted,
    marginTop: hp(2),
  },

  /* CTA buttons */
  ctaDisabled: {
    backgroundColor: 'rgba(40,40,60,0.8)',
    borderRadius: 10,
    paddingVertical: hp(9),
    alignItems: 'center' as const,
  },
  ctaDisabledText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: fs(13),
    fontWeight: '800',
    fontVariant: ['tabular-nums'] as any,
  },

  /* VIP upsell footer */
  upsellWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: hp(8),
    gap: wp(8),
  } as any,
  upsellVip: {
    fontSize: fs(9),
    color: '#BC8CFF',
    fontWeight: '600',
  },

  /* Store link */
  storeLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: wp(6),
    marginTop: hp(4),
    marginBottom: hp(8),
  } as any,
  storeLinkText: {
    fontSize: fs(11),
    color: colors.textMuted,
    fontWeight: '600',
  },

  /* ── Shared ── */
  priceBtn: {
    borderRadius: 10,
    paddingVertical: hp(9),
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  priceText: {
    color: colors.background,
    fontSize: fs(13),
    fontWeight: '800',
  },

  /* ── Chip Packages Grid ── */
  packagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: hp(16),
  } as any,
  packageCard: {
    width: (SW - wp(42)) / 2,
    backgroundColor: 'rgba(14,18,26,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: hp(14),
    paddingHorizontal: wp(10),
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
    marginBottom: hp(10),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 6 },
      web: { boxShadow: '0 4px 12px 2px rgba(0,0,0,0.3)' } as any,
    }),
  } as any,
  packageCardClaimable: {
    borderColor: 'rgba(212,175,55,0.35)',
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 8 },
      web: { boxShadow: '0 0 10px 2px rgba(212,175,55,0.15)' } as any,
    }),
  } as any,
  packageImage: {
    width: wp(50),
    height: wp(40),
    marginBottom: hp(4),
  },
  packageChips: {
    fontSize: fs(18),
    fontWeight: '900',
    color: '#E8C84A',
    marginBottom: hp(2),
  },
  packageName: {
    fontSize: fs(11),
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: hp(2),
  },
  packageReq: {
    fontSize: fs(9),
    color: colors.textMuted,
    marginBottom: hp(8),
    textAlign: 'center' as const,
  },
  packageBarBg: {
    width: '100%',
    height: hp(5),
    borderRadius: hp(3),
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden' as const,
    marginBottom: hp(4),
  } as any,
  packageBarFill: {
    height: '100%',
    borderRadius: hp(3),
  },
  packageProgress: {
    fontSize: fs(9),
    color: colors.textMuted,
    marginBottom: hp(8),
  },
  packageClaimBtn: {
    paddingVertical: hp(6),
    paddingHorizontal: wp(20),
    borderRadius: 8,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  packageClaimText: {
    color: colors.background,
    fontSize: fs(11),
    fontWeight: '800',
  },
  packageLockedBtn: {
    paddingVertical: hp(6),
    paddingHorizontal: wp(20),
    borderRadius: 8,
    backgroundColor: 'rgba(40,40,60,0.6)',
    alignItems: 'center' as const,
  },
  packageLockedText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: fs(11),
    fontWeight: '700',
  },

  /* ── VIP Tab ── */
  vipHero: {
    backgroundColor: 'rgba(14,18,26,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: wp(20),
    alignItems: 'center' as const,
    marginBottom: hp(20),
    overflow: 'hidden' as const,
  } as any,
  vipEmoji: { fontSize: fs(48), marginBottom: hp(6) },
  vipName: { fontSize: fs(24), fontWeight: '900', letterSpacing: 2 },
  vipLevelLabel: {
    fontSize: fs(11), fontWeight: '700', color: colors.textMuted,
    letterSpacing: 2, marginTop: hp(2), marginBottom: hp(14),
  },
  xpBarWrap: { width: '100%', alignItems: 'center' as const, marginBottom: hp(8) } as any,
  xpBarBg: {
    width: '100%', height: hp(8), borderRadius: hp(4),
    backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' as const,
  } as any,
  xpBarFill: {
    height: '100%', borderRadius: hp(4),
  },
  xpText: {
    fontSize: fs(10), fontWeight: '600', color: colors.textSecondary,
    marginTop: hp(4),
  },
  xpHint: {
    fontSize: fs(10), color: colors.textMuted, textAlign: 'center' as const,
    marginTop: hp(6), marginBottom: hp(14),
  },
  perksList: { width: '100%' } as any,
  perkRow: {
    flexDirection: 'row', alignItems: 'center', gap: wp(8),
    marginBottom: hp(4),
  } as any,
  perkCheck: { color: '#26D95C', fontSize: fs(12), fontWeight: '700' },
  perkText: { color: colors.textSecondary, fontSize: fs(12), fontWeight: '500' },

  /* ── VIP Tier Scroll ── */
  roadmapTitle: {
    fontSize: fs(12), fontWeight: '800', color: colors.textMuted,
    letterSpacing: 2, marginBottom: hp(12),
  },
  tierScrollContent: {
    paddingHorizontal: wp(4),
    paddingBottom: hp(12),
    gap: wp(10),
  } as any,
  tierCard: {
    width: wp(120),
    height: hp(150),
    backgroundColor: 'rgba(14,18,26,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: hp(12),
    paddingHorizontal: wp(8),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  } as any,
  tierCardCurrent: {
    borderColor: 'rgba(212,175,55,0.5)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  tierCardLocked: {
    opacity: 0.5,
  },
  tierEmoji: {
    fontSize: fs(28),
    marginBottom: hp(6),
  },
  tierName: {
    fontSize: fs(12),
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: hp(4),
  },
  tierPerk: {
    fontSize: fs(9),
    color: colors.textMuted,
    textAlign: 'center' as const,
    marginBottom: hp(6),
  },
  tierCurrentBadge: {
    paddingVertical: hp(2),
    paddingHorizontal: wp(8),
    borderRadius: 6,
  },
  tierCurrentText: {
    fontSize: fs(8),
    fontWeight: '800',
    color: colors.background,
    letterSpacing: 1,
  },
  tierLock: {
    fontSize: fs(14),
    marginTop: hp(2),
  },
  tierUnlocked: {
    fontSize: fs(14),
    color: '#26D95C',
    fontWeight: '700',
    marginTop: hp(2),
  },
});
