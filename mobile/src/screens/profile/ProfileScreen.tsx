import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { colors, gradients, shadows, wp, hp, fs, borderRadius } from '../../theme';
import { useAuthStore } from '../../stores/authStore';
import GradientButton from '../../components/GradientButton';
import PremiumIcon from '../../components/PremiumIcon';

const BG_LOBBY = require('../../../assets/game/bg_lobby_main.png');
const GOLD_COIN = require('../../../assets/game/gold_coin.png');
const { width: SW } = Dimensions.get('window');

// ─── VIP Tiers ───
const VIP_TIERS = [
  { level: 1, name: 'Bronze', color: '#CD7F32', icon: 'medal3', xp: 0 },
  { level: 2, name: 'Silver', color: '#C0C0C0', icon: 'medal2', xp: 5_000 },
  { level: 3, name: 'Gold', color: '#FFD700', icon: 'medal1', xp: 25_000 },
  { level: 4, name: 'Platinum', color: '#E5E4E2', icon: 'diamond', xp: 100_000 },
  { level: 5, name: 'Diamond', color: '#B9F2FF', icon: 'crown', xp: 500_000 },
];

// ─── VIP Next-tier perks preview ───
const NEXT_TIER_PERKS: Record<number, string> = {
  2: 'Unlock Silver badge & 1.2x bonus',
  3: 'Unlock Gold badge & priority tables',
  4: 'Unlock Platinum badge & 1.6x bonus',
  5: 'Unlock Diamond badge & 1.8x bonus',
};

// ─── Format helpers ───
function fmtChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString();
}

// ─── Animated pulsing ring for avatar ───
function PulsingRing({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={[
        s.pulsingRing,
        {
          borderColor: color,
          opacity: pulse,
          transform: [{ scale: pulse.interpolate({ inputRange: [0.4, 0.85], outputRange: [1, 1.12] }) }],
        },
      ]}
    />
  );
}

// ─── Horizontal stat card ───
function StatCard({ value, label, icon }: { value: string | number; label: string; icon: string }) {
  return (
    <View style={s.statCard}>
      <LinearGradient
        colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)'] as [string, string]}
        style={s.statCardGrad}
      >
        <View style={s.statIconWrap}>
          <PremiumIcon name={icon} size={20} />
        </View>
        <Text style={s.statValue}>{value}</Text>
        <Text style={s.statLabel}>{label}</Text>
      </LinearGradient>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE SCREEN — Premium Casino Design
// ═══════════════════════════════════════════════════════════════════════════════
export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const nav = useNavigation<any>();

  const vipLevel = user?.vipLevel || 1;
  const tier = VIP_TIERS[Math.min(vipLevel, 5) - 1];
  const nextTier = vipLevel < 5 ? VIP_TIERS[vipLevel] : null;
  const xpProgress = nextTier ? Math.min((user?.vipXp || 0) / nextTier.xp, 1) : 1;
  const winRate = user?.gamesPlayed ? Math.round((user.gamesWon / user.gamesPlayed) * 100) : 0;
  const chips = user?.chips || 0;
  const biggestWin = (user as any)?.biggestWin || 0;
  const loginStreak = (user as any)?.loginStreak || 0;

  // Staggered entrance animations
  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(40)).current;
  const statsFade = useRef(new Animated.Value(0)).current;
  const statsSlide = useRef(new Animated.Value(30)).current;
  const careerFade = useRef(new Animated.Value(0)).current;
  const careerSlide = useRef(new Animated.Value(30)).current;
  const vipFade = useRef(new Animated.Value(0)).current;
  const vipSlide = useRef(new Animated.Value(30)).current;
  const actionsFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const stagger = (fade: Animated.Value, slide: Animated.Value, delay: number) =>
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 500, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 500, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]);
    Animated.parallel([
      stagger(heroFade, heroSlide, 0),
      stagger(statsFade, statsSlide, 120),
      stagger(careerFade, careerSlide, 240),
      stagger(vipFade, vipSlide, 360),
      Animated.timing(actionsFade, { toValue: 1, duration: 400, delay: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={s.root}>
      {/* Background image (faint) */}
      <Image source={BG_LOBBY} style={s.bgImage} resizeMode="cover" />
      <LinearGradient
        colors={['rgba(10,14,26,0.88)', 'rgba(10,14,26,0.95)', '#0A0E1A'] as [string, string, string]}
        style={s.bgOverlay}
      />

      {/* Ambient glow effects */}
      <View style={s.bgGlowTop} />
      <View style={s.bgGlowCenter} />

      {/* Back button */}
      <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} activeOpacity={0.7}>
        <Text style={s.backBtnText}>‹</Text>
      </TouchableOpacity>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══════════════════════════════════════════════════════
            1. HERO HEADER — Cinematic identity zone
        ═══════════════════════════════════════════════════════ */}
        <Animated.View style={[s.heroSection, { opacity: heroFade, transform: [{ translateY: heroSlide }] }]}>
          <LinearGradient
            colors={['rgba(15,10,40,0.6)', 'rgba(80,40,120,0.15)', 'transparent'] as [string, string, string]}
            style={s.heroGradient}
          />

          {/* Avatar glow backdrop */}
          <View style={[s.avatarGlow, { backgroundColor: `${tier.color}10` }]} />

          {/* Avatar with pulsing ring */}
          <View style={s.avatarWrap}>
            <PulsingRing color={tier.color} />
            <LinearGradient
              colors={[`${tier.color}60`, `${tier.color}20`] as [string, string]}
              style={s.avatarGradRing}
            >
              <View style={s.avatarInner}>
                <Text style={s.avatarLetter}>
                  {user?.displayName?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
            </LinearGradient>
            {/* VIP badge on avatar */}
            <View style={[s.vipBadge, { backgroundColor: tier.color }]}>
              <PremiumIcon name={tier.icon} size={16} />
            </View>
          </View>

          {/* Username with gold shadow */}
          <Text style={s.playerName}>{user?.displayName || 'Player'}</Text>

          {/* VIP tier pill */}
          <View style={[s.tierPill, { borderColor: `${tier.color}40`, backgroundColor: `${tier.color}10` }]}>
            <PremiumIcon name={tier.icon} size={13} />
            <Text style={[s.tierPillText, { color: tier.color }]}>{tier.name.toUpperCase()}</Text>
            <View style={[s.tierPillDot, { backgroundColor: `${tier.color}60` }]} />
            <Text style={[s.tierPillLevel, { color: `${tier.color}BB` }]}>LVL {tier.level}</Text>
          </View>

          {/* Chip balance row */}
          <View style={s.chipRow}>
            <Image source={GOLD_COIN} style={s.chipIcon} />
            <Text style={s.chipValue}>{fmtChips(chips)}</Text>
            <TouchableOpacity
              style={s.chipAddBtn}
              activeOpacity={0.7}
              onPress={() => nav.navigate('Store' as any)}
            >
              <Text style={s.chipAddText}>+</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════
            2. STATS STRIP — Horizontal scroll
        ═══════════════════════════════════════════════════════ */}
        <Animated.View style={{ opacity: statsFade, transform: [{ translateY: statsSlide }] }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.statsStrip}
          >
            <StatCard value={user?.gamesWon || 0} label="Wins" icon="crown" />
            <StatCard value={fmtChips(biggestWin)} label="Biggest Win" icon="coin" />
            <StatCard value={`${winRate}%`} label="Win Rate" icon="star" />
            <StatCard value={user?.gamesPlayed || 0} label="Played" icon="diamond" />
          </ScrollView>
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════
            3. CAREER HIGHLIGHTS
        ═══════════════════════════════════════════════════════ */}
        <Animated.View style={{ opacity: careerFade, transform: [{ translateY: careerSlide }] }}>
          <View style={s.sectionHeader}>
            <View style={s.sectionAccent} />
            <PremiumIcon name="trophy" size={14} />
            <Text style={s.sectionTitle}>CAREER HIGHLIGHTS</Text>
          </View>

          <View style={s.careerRow}>
            {/* Best Hand card */}
            <View style={s.careerCard}>
              <LinearGradient
                colors={['rgba(26,92,46,0.5)', 'rgba(15,50,25,0.8)'] as [string, string]}
                style={s.careerCardGrad}
              >
                <Text style={s.careerCardTitle}>Best Hand</Text>
                <View style={s.pokerCardsRow}>
                  <View style={s.pokerCard}>
                    <Text style={s.pokerCardText}>A♠</Text>
                  </View>
                  <View style={s.pokerCard}>
                    <Text style={s.pokerCardText}>K♠</Text>
                  </View>
                  <View style={s.pokerCard}>
                    <Text style={s.pokerCardText}>Q♠</Text>
                  </View>
                </View>
                <Text style={s.careerCardValue}>Coming Soon</Text>
              </LinearGradient>
            </View>

            {/* Best Streak card */}
            <View style={s.careerCard}>
              <LinearGradient
                colors={['rgba(212,175,55,0.15)', 'rgba(184,148,31,0.08)'] as [string, string]}
                style={s.careerCardGrad}
              >
                <Text style={s.careerCardTitle}>Best Streak</Text>
                <View style={s.streakIconWrap}>
                  <PremiumIcon name="fire" size={28} />
                </View>
                <Text style={[s.careerCardValue, { color: '#E8C84A', fontSize: fs(26) }]}>
                  {loginStreak > 0 ? loginStreak : 0}
                </Text>
                <Text style={s.careerCardSub}>consecutive wins</Text>
              </LinearGradient>
            </View>
          </View>
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════
            4. VIP PROGRESS — Enhanced
        ═══════════════════════════════════════════════════════ */}
        <Animated.View style={{ opacity: vipFade, transform: [{ translateY: vipSlide }] }}>
          <View style={s.sectionHeader}>
            <View style={s.sectionAccent} />
            <PremiumIcon name={tier.icon} size={14} />
            <Text style={s.sectionTitle}>VIP PROGRESS</Text>
          </View>

          <View style={[s.vipCard, { borderColor: `${tier.color}18` }]}>
            <LinearGradient
              colors={['rgba(22,27,34,0.92)', 'rgba(13,17,23,0.96)'] as [string, string]}
              style={s.vipCardInner}
            >
              {/* Current → Next tier row */}
              <View style={s.vipTierRow}>
                <View style={[s.vipTierBadge, { backgroundColor: `${tier.color}20`, borderColor: `${tier.color}40` }]}>
                  <PremiumIcon name={tier.icon} size={24} />
                </View>
                <View style={s.vipTierInfo}>
                  <Text style={[s.vipCurrentName, { color: tier.color }]}>{tier.name}</Text>
                  {nextTier ? (
                    <Text style={s.vipNextLabel}>
                      Next: <Text style={{ color: `${nextTier.color}90` }}>{nextTier.name}</Text>
                    </Text>
                  ) : (
                    <Text style={s.vipNextLabel}>Maximum Tier Reached</Text>
                  )}
                </View>
              </View>

              {/* Progress bar with gradient fill */}
              <View style={s.progressBg}>
                <LinearGradient
                  colors={[tier.color, nextTier ? nextTier.color : tier.color] as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[s.progressFill, { width: `${xpProgress * 100}%` } as any]}
                />
              </View>

              {/* XP text row */}
              <View style={s.xpRow}>
                <Text style={s.xpText}>{(user?.vipXp || 0).toLocaleString()} XP</Text>
                <Text style={s.xpTarget}>{nextTier ? `${nextTier.xp.toLocaleString()} XP` : 'MAX'}</Text>
              </View>

              {/* Next tier perk preview */}
              {nextTier && NEXT_TIER_PERKS[nextTier.level] && (
                <View style={s.perkPreview}>
                  <PremiumIcon name="gift" size={12} />
                  <Text style={s.perkPreviewText}>{NEXT_TIER_PERKS[nextTier.level]}</Text>
                </View>
              )}

              {/* View All Tiers link */}
              <TouchableOpacity
                style={s.viewTiersLink}
                activeOpacity={0.6}
                onPress={() => nav.navigate('Store' as any, { tab: 'vip' })}
              >
                <Text style={s.viewTiersText}>View All Tiers →</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════
            5. ACTIONS
        ═══════════════════════════════════════════════════════ */}
        <Animated.View style={[s.actionsSection, { opacity: actionsFade }]}>
          <View style={s.actionsRow}>
            <GradientButton
              title="EDIT PROFILE"
              variant="outline"
              size="md"
              style={s.actionBtnFlex}
              icon={<PremiumIcon name="edit" size={16} />}
              onPress={() => nav.navigate('Settings' as any)}
            />
            <GradientButton
              title="BUY CHIPS"
              variant="primary"
              size="md"
              style={s.actionBtnFlex}
              icon={<PremiumIcon name="coin" size={16} />}
              onPress={() => nav.navigate('Store' as any)}
            />
          </View>

          <TouchableOpacity style={s.logoutLink} onPress={logout} activeOpacity={0.5}>
            <Text style={s.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={{ height: hp(80) }} />
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const STAT_CARD_W = wp(100);

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0E1A',
  },

  /* ── Background layers ── */
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.15,
  } as any,
  bgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  } as any,
  bgGlowTop: {
    position: 'absolute',
    top: -SW * 0.3,
    left: '10%',
    width: '80%',
    height: SW * 0.8,
    borderRadius: SW * 0.4,
    backgroundColor: 'rgba(155,92,255,0.06)',
  } as any,
  bgGlowCenter: {
    position: 'absolute',
    top: '35%',
    left: '20%',
    width: '60%',
    height: SW * 0.5,
    borderRadius: SW * 0.25,
    backgroundColor: 'rgba(212,175,55,0.03)',
  } as any,

  /* ── Back button ── */
  backBtn: {
    position: 'absolute',
    top: hp(48),
    left: wp(16),
    zIndex: 20,
    width: wp(36),
    height: wp(36),
    borderRadius: wp(18),
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  backBtnText: { color: '#fff', fontSize: fs(22), fontWeight: '600', marginTop: -2 },

  /* ── Scroll ── */
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: hp(50),
  },

  /* ══════════════════════════════════════════════════════════
     1. HERO HEADER
  ══════════════════════════════════════════════════════════ */
  heroSection: {
    alignItems: 'center',
    paddingTop: hp(20),
    paddingBottom: hp(24),
    position: 'relative',
    overflow: 'hidden',
  },
  heroGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  avatarGlow: {
    position: 'absolute',
    top: hp(10),
    width: wp(160),
    height: wp(160),
    borderRadius: wp(80),
  },
  avatarWrap: {
    width: wp(120),
    height: wp(120),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(16),
  },
  pulsingRing: {
    position: 'absolute',
    width: wp(120),
    height: wp(120),
    borderRadius: wp(60),
    borderWidth: 2.5,
  },
  avatarGradRing: {
    width: wp(100),
    height: wp(100),
    borderRadius: wp(50),
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInner: {
    width: wp(92),
    height: wp(92),
    borderRadius: wp(46),
    backgroundColor: 'rgba(14,18,28,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontSize: fs(38),
    fontWeight: '900',
    color: '#D4AF37',
  },
  vipBadge: {
    position: 'absolute',
    bottom: 0,
    right: wp(4),
    width: wp(34),
    height: wp(34),
    borderRadius: wp(17),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0A0E1A',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
      android: { elevation: 6 },
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.4)' } as any,
    }),
  },
  playerName: {
    fontSize: fs(24),
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
    textShadowColor: 'rgba(212,175,55,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    marginBottom: hp(8),
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: wp(14),
    paddingVertical: hp(5),
    marginBottom: hp(14),
  },
  tierPillText: {
    fontSize: fs(11),
    fontWeight: '900',
    letterSpacing: 2,
  },
  tierPillDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  tierPillLevel: {
    fontSize: fs(10),
    fontWeight: '700',
    letterSpacing: 1,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
  },
  chipIcon: {
    width: wp(22),
    height: wp(22),
  },
  chipValue: {
    fontSize: fs(22),
    fontWeight: '900',
    color: '#D4AF37',
    letterSpacing: 0.5,
  },
  chipAddBtn: {
    width: wp(24),
    height: wp(24),
    borderRadius: wp(12),
    backgroundColor: 'rgba(212,175,55,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: wp(2),
  },
  chipAddText: {
    color: '#D4AF37',
    fontSize: fs(16),
    fontWeight: '800',
    marginTop: -1,
  },

  /* ══════════════════════════════════════════════════════════
     2. STATS STRIP (horizontal scroll)
  ══════════════════════════════════════════════════════════ */
  statsStrip: {
    paddingHorizontal: wp(20),
    gap: wp(12),
    paddingBottom: hp(4),
    marginBottom: hp(24),
  },
  statCard: {
    width: STAT_CARD_W,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...Platform.select({
      ios: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
      web: { boxShadow: '0 0 12px rgba(212,175,55,0.06)' } as any,
    }),
  },
  statCardGrad: {
    alignItems: 'center',
    paddingVertical: hp(16),
    paddingHorizontal: wp(10),
    borderRadius: borderRadius.lg,
  },
  statIconWrap: {
    marginBottom: hp(8),
  },
  statValue: {
    fontSize: fs(20),
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: hp(2),
  },
  statLabel: {
    fontSize: fs(10),
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  } as any,

  /* ══════════════════════════════════════════════════════════
     SECTION HEADERS
  ══════════════════════════════════════════════════════════ */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    marginBottom: hp(14),
    paddingHorizontal: wp(20),
  },
  sectionAccent: {
    width: 3,
    height: hp(14),
    borderRadius: 2,
    backgroundColor: '#D4AF37',
  },
  sectionTitle: {
    fontSize: fs(12),
    fontWeight: '800',
    color: '#D4AF37',
    letterSpacing: 2.5,
  },

  /* ══════════════════════════════════════════════════════════
     3. CAREER HIGHLIGHTS
  ══════════════════════════════════════════════════════════ */
  careerRow: {
    flexDirection: 'row',
    gap: wp(12),
    marginBottom: hp(24),
    paddingHorizontal: wp(20),
  },
  careerCard: {
    flex: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  careerCardGrad: {
    alignItems: 'center',
    paddingVertical: hp(18),
    paddingHorizontal: wp(10),
    borderRadius: borderRadius.lg,
    minHeight: hp(160),
    justifyContent: 'center',
  },
  careerCardTitle: {
    fontSize: fs(11),
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: hp(10),
  } as any,
  pokerCardsRow: {
    flexDirection: 'row',
    gap: wp(4),
    marginBottom: hp(10),
  },
  pokerCard: {
    width: wp(32),
    height: wp(42),
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3 },
      android: { elevation: 3 },
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.3)' } as any,
    }),
  },
  pokerCardText: {
    fontSize: fs(14),
    fontWeight: '900',
    color: '#1a1a1a',
  },
  careerCardValue: {
    fontSize: fs(13),
    fontWeight: '700',
    color: colors.textSecondary,
  },
  careerCardSub: {
    fontSize: fs(9),
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: hp(2),
  },
  streakIconWrap: {
    marginBottom: hp(6),
  },

  /* ══════════════════════════════════════════════════════════
     4. VIP PROGRESS
  ══════════════════════════════════════════════════════════ */
  vipCard: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: hp(28),
    marginHorizontal: wp(20),
  },
  vipCardInner: {
    padding: wp(20),
    borderRadius: borderRadius.lg,
  },
  vipTierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: hp(18),
    gap: wp(14),
  },
  vipTierBadge: {
    width: wp(52),
    height: wp(52),
    borderRadius: wp(26),
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vipTierInfo: {
    flex: 1,
    gap: hp(2),
  },
  vipCurrentName: {
    fontSize: fs(18),
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  vipNextLabel: {
    fontSize: fs(12),
    fontWeight: '600',
    color: colors.textMuted,
  },
  progressBg: {
    height: hp(8),
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: hp(10),
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp(10),
  },
  xpText: {
    fontSize: fs(12),
    fontWeight: '700',
    color: colors.textSecondary,
  },
  xpTarget: {
    fontSize: fs(11),
    fontWeight: '600',
    color: colors.textMuted,
  },
  perkPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
    backgroundColor: 'rgba(212,175,55,0.06)',
    borderRadius: borderRadius.md,
    paddingHorizontal: wp(10),
    paddingVertical: hp(6),
    marginBottom: hp(10),
  },
  perkPreviewText: {
    fontSize: fs(11),
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  viewTiersLink: {
    alignSelf: 'flex-end',
  },
  viewTiersText: {
    fontSize: fs(12),
    fontWeight: '700',
    color: '#D4AF37',
    letterSpacing: 0.3,
  },

  /* ══════════════════════════════════════════════════════════
     5. ACTIONS
  ══════════════════════════════════════════════════════════ */
  actionsSection: {
    paddingHorizontal: wp(20),
  },
  actionsRow: {
    flexDirection: 'row',
    gap: wp(12),
    marginBottom: hp(20),
  },
  actionBtnFlex: {
    flex: 1,
  },
  logoutLink: {
    alignItems: 'center',
    paddingVertical: hp(12),
  },
  logoutText: {
    color: 'rgba(255,68,68,0.5)',
    fontSize: fs(13),
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
