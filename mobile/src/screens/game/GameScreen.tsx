// NOTE: requires `npx expo install expo-screen-orientation` if not already installed
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
  Animated,
  StatusBar,
  Dimensions,
  Platform,
  Image,
  ImageBackground,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, spacing, borderRadius, wp, hp, screen } from '../../theme';
import { socketService } from '../../services/socket';
import PlayingCard from '../../components/PlayingCard';
import PremiumIcon, { getIconSymbol, getIconColor } from '../../components/PremiumIcon';

// ---------------------------------------------------------------------------
// Image Assets
// ---------------------------------------------------------------------------
// Assets
const ASSETS = {
  tableBg: require('../../../assets/game/bg_arena.png'),
  fxOverlay: require('../../../assets/game/fx_particles_overlay.png'),
  panelS: require('../../../assets/game/panel_small.png'),
  panelM: require('../../../assets/game/panel_medium.png'),
  panelL: require('../../../assets/game/panel_large.png'),
  playerA: require('../../../assets/game/male_player.png'),
  playerB: require('../../../assets/game/female_player.png'),
  vsBadge: null as any,
  chipIcon: null as any,
  backButton: null as any,
  leaderboardPanel: null as any,
  trophyCrown: null as any,
  winBtnLeft: null as any,
  winBtnRight: null as any,
  betCellBg: null as any,
  btnBetBase: require('../../../assets/game/btn_bet_option_base.png'),
  btnBetSelected: require('../../../assets/game/btn_bet_option_selected.png'),
  loadingScreen: null as any,
  confettiParticle: null as any,
  timerRing: null as any,
  emotePickerBg: null as any,
  emotes: {} as Record<string, any>,
};

// ---------------------------------------------------------------------------
// Cross-platform background image
// Web: raw HTML <div> with CSS backgroundImage (bypasses RN Web completely)
// Native: standard ImageBackground with PNG assets
// ---------------------------------------------------------------------------
function getAssetUri(source: any): string | undefined {
  if (typeof source === 'string') return source;
  if (typeof source === 'object' && source?.uri) return source.uri;
  try {
    const resolved = Image.resolveAssetSource(source);
    if (resolved?.uri) return resolved.uri;
  } catch { /* ignore */ }
  try {
    const { Asset } = require('expo-asset');
    const asset = Asset.fromModule(source);
    return asset.localUri || asset.uri;
  } catch { /* ignore */ }
  return undefined;
}

function BgImage({
  source,
  style,
  imageStyle,
  children,
}: {
  source: any;
  style?: any;
  imageStyle?: any;
  children?: React.ReactNode;
}) {
  const uri = useMemo(() => getAssetUri(source), [source]);

  if (Platform.OS === 'web') {
    // Render an absolutely-positioned raw HTML <div> as background layer
    // React DOM applies CSS properties directly — no RN Web interference
    const bgLayer = React.createElement('div', {
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: uri ? `url("${uri}")` : 'linear-gradient(180deg, #1F2937 0%, #161B26 40%, #111720 100%)',
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        border: '1px solid rgba(218, 165, 32, 0.4)',
        borderRadius: 8,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      },
    } as any);

    return (
      <View style={[style, { position: 'relative' as any, overflow: 'hidden' as any }]}>
        {bgLayer}
        {children}
      </View>
    );
  }

  return (
    <ImageBackground source={source} style={style} imageStyle={imageStyle} resizeMode="stretch">
      {children}
    </ImageBackground>
  );
}

// ---------------------------------------------------------------------------
// Server URL — TODO: move to env/config
// ---------------------------------------------------------------------------
const SERVER_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3000'  // Android emulator → host localhost
  : 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
import { EMOTE_LIST, type Card, type Suit, type Rank, type EmoteId } from '../../../../shared/types';

interface GameState {
  tierId: string;
  roundNumber: number;
  stage: 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'paused';
  countdown: number;
  playerA: { name: string; emoji: string; cards: Card[] };
  playerB: { name: string; emoji: string; cards: Card[] };
  community: Card[];
  bets: Record<string, { total: number; count: number }>;
  resultA: { name: string; rank: number } | null;
  resultB: { name: string; rank: number } | null;
  winner: 'a' | 'b' | 'tie' | null;
  lastResults: {
    roundNumber: number;
    winner: string;
    resultA: any;
    resultB: any;
    payouts: any[];
  } | null;
  multipliers: Record<string, number>;
  winnerProbs: { a: number; b: number };
  handNames: Record<number, string>;
  minBet: number;
  roundTotalBets: number;
  chips: number;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  chips: number;
}

interface PayoutInfo {
  betType: string;
  amount: number;
  payout: number;
  won: boolean;
}

type GameRouteParams = { Game: { tier: string } };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STAGE_LABELS: Record<string, string> = {
  idle: 'WAITING',
  preflop: 'PREFLOP',
  flop: 'FLOP',
  turn: 'TURN',
  river: 'RIVER',
  showdown: 'SHOWDOWN',
  paused: 'PAUSED',
};

const HAND_GRID = [
  [
    { key: 'hand_9', label: 'Royal Straight Flush', icon: 'crown' },
    { key: 'hand_8', label: 'Straight Flush', icon: 'fire' },
    { key: 'hand_7', label: 'Four of a Kind', icon: 'diamond' },
    { key: 'hand_6', label: 'Full House', icon: 'house' },
    { key: 'hand_5', label: 'Flush', icon: 'spade' },
  ],
  [
    { key: 'hand_4', label: 'Straight', icon: 'chart' },
    { key: 'hand_3', label: 'Three of a Kind', icon: 'target' },
    { key: 'hand_2', label: 'Two Pair', icon: 'peace' },
    { key: 'hand_1', label: 'Pair', icon: 'card' },
    { key: 'hand_0', label: 'High Card', icon: 'star' },
  ],
];

const ALL_HAND_KEYS = HAND_GRID.flat().map((h) => h.key);
const HAND_ICON_MAP: Record<string, string> = {};
for (const h of HAND_GRID.flat()) HAND_ICON_MAP[h.key] = h.icon;

const PRESET_CHIPS = [100, 500, 1_000, 5_000, 10_000, 50_000];

const STAGE_MAX_COUNTDOWN = 15; // seconds, used to compute progress ring %

const EMOTE_EMOJI: Record<string, string> = {
  rose: '🌹', lips: '💋', tomato: '🍅', bomb: '💣', firework: '🎆',
  eraser: '🧽', hammer: '🔨', egg: '🥚', horn: '📯', pie: '🥧',
  beer: '🍺', thumbsup: '👍',
};

const CONFETTI_COLORS = ['#DAA520', '#26D95C', '#E74C3C', '#FF69B4', '#00BFFF', '#FF8C00', '#9B59B6'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Abbreviate large numbers: 1200 → "$1.2K" */
function formatChips(n: number): string {
  if (n == null) return '$0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Animated rolling number — smoothly interpolates between values */
function AnimatedNumber({
  value,
  style,
  formatFn = formatChips,
  duration = 600,
}: {
  value: number;
  style?: any;
  formatFn?: (n: number) => string;
  duration?: number;
}) {
  const animVal = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(formatFn(value));
  const prevRef = useRef(value);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (value === prevRef.current) return;
    const from = prevRef.current;
    prevRef.current = value;

    // Animate the number counting
    animVal.setValue(0);
    const listener = animVal.addListener(({ value: progress }) => {
      const current = Math.round(from + (value - from) * progress);
      setDisplay(formatFn(current));
    });

    // Scale pop effect
    scaleAnim.setValue(1);
    Animated.parallel([
      Animated.timing(animVal, {
        toValue: 1,
        duration,
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.15,
          duration: duration * 0.3,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: duration * 0.7,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      animVal.removeListener(listener);
      setDisplay(formatFn(value));
    });
  }, [value]);

  return (
    <Animated.Text style={[style, { transform: [{ scale: scaleAnim }] }]}>
      {display}
    </Animated.Text>
  );
}

/** Animated card wrapper — fades in with slight upward slide */
function AnimatedCard({
  card,
  index,
  highlight,
  size = 'sm',
}: {
  card?: Card;
  index: number;
  highlight?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      delay: index * 120,
      useNativeDriver: true,
    }).start();
  }, [card?.rank, card?.suit]);

  return (
    <Animated.View
      style={[
        highlight && s.cardHighlight,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            },
          ],
        },
      ]}
    >
      {card ? (
        <PlayingCard card={card} size={size} />
      ) : (
        <PlayingCard faceDown size={size} />
      )}
    </Animated.View>
  );
}

/** Circular countdown — simple text + colored ring border */
function CountdownRing({
  countdown,
  maxCountdown,
  size = 54,
}: {
  countdown: number;
  maxCountdown: number;
  size?: number;
}) {
  const progress = maxCountdown > 0 ? clamp(countdown / maxCountdown, 0, 1) : 0;
  const half = size / 2;
  const strokeWidth = 4;
  const innerSize = size - strokeWidth * 2;
  const isLow = countdown <= 5 && countdown > 0;
  const ringColor = isLow ? C.red : C.gold;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Full ring — opacity based on progress */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: half,
          borderWidth: strokeWidth,
          borderColor: ringColor,
          opacity: progress > 0 ? 0.3 + progress * 0.7 : 0.15,
        }}
      />
      {/* Center circle with countdown number */}
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          backgroundColor: C.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: isLow ? C.red : C.gold, fontWeight: '800', fontSize: 16 }}>
          {countdown > 0 ? countdown : '—'}
        </Text>
      </View>
    </View>
  );
}

/** Leaderboard sidebar panel — premium with rank medals + glow */
function LeaderboardPanel({
  entries,
  period,
  onTogglePeriod,
}: {
  entries: LeaderboardEntry[];
  period: '24h' | '7d';
  onTogglePeriod: () => void;
}) {
  const RANK_ICONS = ['medal1', 'medal2', 'medal3'];
  const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <View style={s.sidebar}>
      {/* Title with decorative line */}
      <View style={s.sidebarTitleWrap}>
        <View style={s.sidebarTitleLine} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <PremiumIcon name="crown" size={12} />
          <Text style={[s.sidebarTitle, { marginLeft: 4 }]}>TOP PLAYERS</Text>
        </View>
        <View style={s.sidebarTitleLine} />
      </View>

      {/* Period toggle */}
      <View style={s.periodToggle}>
        <TouchableOpacity
          style={[s.periodBtn, period === '24h' && s.periodBtnActive]}
          onPress={onTogglePeriod}
        >
          <Text style={[s.periodBtnText, period === '24h' && s.periodBtnTextActive]}>24H</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.periodBtn, period === '7d' && s.periodBtnActive]}
          onPress={onTogglePeriod}
        >
          <Text style={[s.periodBtnText, period === '7d' && s.periodBtnTextActive]}>7D</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {entries.length === 0 && <Text style={s.sidebarEmpty}>No players yet</Text>}
        {entries.map((e, i) => {
          const isTop3 = i < 3;
          return (
            <View key={i} style={[s.leaderRow, isTop3 && s.leaderRowTop, i === 0 && s.leaderRowFirst]}>
              {/* Rank medal or number */}
              {isTop3 ? (
                <View style={[s.leaderRankBadge, { backgroundColor: RANK_COLORS[i] }]}>
                  <PremiumIcon name={RANK_ICONS[i]} size={14} />
                </View>
              ) : (
                <View style={s.leaderRankBadge}>
                  <Text style={s.leaderRankText}>{e.rank}</Text>
                </View>
              )}
              {/* Avatar placeholder */}
              <View style={[s.leaderAvatar, isTop3 && { borderColor: RANK_COLORS[i] }]}>
                <Text style={s.leaderAvatarText}>
                  {(e.name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              {/* Name + chips */}
              <View style={{ flex: 1, marginLeft: 4 }}>
                <Text style={[s.leaderName, isTop3 && { color: RANK_COLORS[i], fontWeight: '800' }]} numberOfLines={1}>
                  {e.name}
                </Text>
                <Text style={[s.leaderChips, i === 0 && { color: C.gold }]}>{formatChips(e.chips)}</Text>
              </View>
              {isTop3 && <Text style={s.leaderTrophy}>···</Text>}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Hand‐type aggregate bets sidebar — LIVE with delta arrows */
function HandBetsSidebar({
  bets,
  handNames,
  multipliers: _multipliers,
}: {
  bets: Record<string, { total: number; count: number }>;
  handNames: Record<number, string>;
  multipliers?: Record<string, number>;
}) {
  const prevBetsRef = useRef<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  useEffect(() => {
    const prev = prevBetsRef.current;
    const newDeltas: Record<string, number> = {};
    let changed = false;
    for (const key of ALL_HAND_KEYS) {
      const cur = bets[key]?.total ?? 0;
      const old = prev[key] ?? 0;
      if (cur !== old) {
        newDeltas[key] = cur - old;
        changed = true;
      }
      prev[key] = cur;
    }
    if (changed) {
      setDeltas(newDeltas);
      const t = setTimeout(() => setDeltas({}), 2000);
      return () => clearTimeout(t);
    }
  }, [bets]);

  // Sort by total descending so active hands float to top
  const sorted = [...ALL_HAND_KEYS].sort((a, b) => (bets[b]?.total ?? 0) - (bets[a]?.total ?? 0));

  return (
    <View style={s.sidebar}>
      <Text style={s.sidebarTitle}>LIVE BETS</Text>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {sorted.map((key) => {
          const idx = parseInt(key.replace('hand_', ''), 10);
          const name = handNames[idx] ?? `Hand ${idx}`;
          const icon = HAND_ICON_MAP[key] ?? 'card';
          const total = bets[key]?.total ?? 0;
          const count = bets[key]?.count ?? 0;
          const delta = deltas[key];
          const isUp = delta !== undefined && delta > 0;
          const isDown = delta !== undefined && delta < 0;
          const isActive = total > 0;
          return (
            <View
              key={key}
              style={[
                s.handBetRow,
                isActive && s.handBetRowActive,
                isUp && s.handBetRowFlashGreen,
                isDown && s.handBetRowFlashRed,
              ]}
            >
              <View style={s.handBetIconWrap}>
                <PremiumIcon name={icon} size={14} />
              </View>
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={[s.handBetName, isActive && s.handBetNameActive]} numberOfLines={1}>{name}</Text>
                {count > 0 && (
                  <Text style={s.handBetCount}>{count} bet{count > 1 ? 's' : ''}</Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <AnimatedNumber
                  value={total}
                  style={[s.handBetAmount, isActive && s.handBetAmountActive]}
                  duration={400}
                />
                {isUp && (
                  <Text style={s.handBetDeltaUp}>+{formatChips(delta)}</Text>
                )}
                {isDown && (
                  <Text style={s.handBetDeltaDown}>−{formatChips(Math.abs(delta))}</Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Bet amount popup modal — premium casino glass */
function BetModal({
  visible,
  betType,
  label,
  minBet,
  maxChips,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  betType: string;
  label: string;
  minBet: number;
  maxChips: number;
  onConfirm: (amount: number) => void;
  onClose: () => void;
}) {
  const safeMax = Math.max(minBet, maxChips);
  const [amount, setAmount] = useState(minBet);
  const [selectedChip, setSelectedChip] = useState<number | null>(null);
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const okGlow = useRef(new Animated.Value(0)).current;
  const chipScales = useRef(PRESET_CHIPS.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    if (visible) {
      setAmount(minBet);
      setSelectedChip(null);
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, minBet]);

  // Place Bet button glow pulse
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(okGlow, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(okGlow, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  const handlePreset = (val: number, index: number) => {
    setAmount(clamp(val, minBet, safeMax));
    setSelectedChip(val);
    // Tactile press animation
    Animated.sequence([
      Animated.timing(chipScales[index], { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.spring(chipScales[index], { toValue: 1, friction: 3, tension: 120, useNativeDriver: true }),
    ]).start();
  };

  const step = Math.max(100, Math.floor(safeMax / 20));
  const adjustSlider = (direction: 'up' | 'down') => {
    setSelectedChip(null);
    setAmount((prev) => clamp(direction === 'up' ? prev + step : prev - step, minBet, safeMax));
  };

  const pct = safeMax > minBet ? ((amount - minBet) / (safeMax - minBet)) * 100 : 100;
  const tooExpensive = amount > safeMax;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
        <Animated.View style={[s.modalCard, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
          {/* Ambient glow behind card */}
          <View style={s.modalGlowTop} pointerEvents="none" />
          <View style={s.modalGlowBottom} pointerEvents="none" />

          {/* Header */}
          <View style={s.modalHeader}>
            <Text style={s.modalSubtitle}>PLACE YOUR BET</Text>
            <Text style={s.modalTitle}>{label.toUpperCase()}</Text>
          </View>

          {/* Amount display */}
          <View style={s.modalAmountWrap}>
            <PremiumIcon name="coin" size={22} />
            <Text style={s.modalAmount}>{formatChips(amount)}</Text>
          </View>

          {/* Divider */}
          <View style={s.modalDivider} />

          {/* Preset chips — casino chip style */}
          <View style={s.presetGrid}>
            {(() => {
              const available = PRESET_CHIPS.filter((v) => v <= safeMax);
              const items = available.length > 0 ? available : [minBet];
              const mid = Math.ceil(items.length / 2);
              const rows = [items.slice(0, mid), items.slice(mid)];
              return rows.map((row, ri) => (
                <View key={ri} style={s.presetGridRow}>
                  {row.map((val) => {
                    const chipIdx = PRESET_CHIPS.indexOf(val);
                    const isActive = selectedChip === val;
                    return (
                      <Animated.View key={val} style={{ transform: [{ scale: chipScales[chipIdx >= 0 ? chipIdx : 0] }] }}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={[s.chipBtn, isActive && s.chipBtnActive]}
                          onPress={() => handlePreset(val, chipIdx >= 0 ? chipIdx : 0)}
                        >
                          {/* Inner gradient ring */}
                          <View style={[s.chipRing, isActive && s.chipRingActive]} />
                          <Text style={[s.chipSelectText, isActive && s.chipTextActive]}>
                            {formatChips(val)}
                          </Text>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}
                </View>
              ));
            })()}
          </View>

          {/* Slider */}
          <View style={s.sliderRow}>
            <TouchableOpacity style={s.sliderBtn} onPress={() => adjustSlider('down')}>
              <Text style={s.sliderBtnText}>−</Text>
            </TouchableOpacity>
            <View style={s.sliderTrackWrap}>
              <View
                style={s.sliderTrack}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => {
                  setSelectedChip(null);
                  const p = Math.max(0, Math.min(1, e.nativeEvent.locationX / 200));
                  setAmount(clamp(Math.round(minBet + p * (safeMax - minBet)), minBet, safeMax));
                }}
                onResponderMove={(e) => {
                  const p = Math.max(0, Math.min(1, e.nativeEvent.locationX / 200));
                  setAmount(clamp(Math.round(minBet + p * (safeMax - minBet)), minBet, safeMax));
                }}
              >
                {/* Track glow under fill */}
                <View style={[s.sliderFillGlow, { width: `${pct}%` }]} />
                <View style={[s.sliderFill, { width: `${pct}%` }]} />
                {/* Premium knob */}
                <View style={[s.sliderThumb, { left: `${pct}%` }]}>
                  <View style={s.sliderThumbInner} />
                </View>
              </View>
            </View>
            <TouchableOpacity style={s.sliderBtn} onPress={() => adjustSlider('up')}>
              <Text style={s.sliderBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Min / Max labels */}
          <View style={s.sliderLabels}>
            <Text style={s.sliderLabel}>{formatChips(minBet)}</Text>
            <Text style={s.sliderLabel}>{formatChips(safeMax)}</Text>
          </View>

          {/* Actions */}
          <View style={s.modalActions}>
            <TouchableOpacity style={s.modalCancelBtn} onPress={onClose}>
              <Text style={s.modalCancelText}>CANCEL</Text>
            </TouchableOpacity>
            <Pressable
              style={[s.modalOkBtn, tooExpensive && s.modalOkBtnDisabled]}
              disabled={tooExpensive}
              onPressIn={() => {}}
              onPress={() => {
                onConfirm(amount);
                onClose();
              }}
            >
              {({ pressed }: any) => (
                <Animated.View style={[
                  s.modalOkInner,
                  {
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}>
                  {/* Glow pulse behind */}
                  <Animated.View
                    style={[s.modalOkGlow, {
                      opacity: okGlow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.2, 0.5],
                      }),
                    }]}
                    pointerEvents="none"
                  />
                  <Text style={[s.modalOkText, tooExpensive && { color: 'rgba(255,255,255,0.3)' }]}>
                    {tooExpensive ? 'NOT ENOUGH' : `${getIconSymbol('diamond')}  PLACE BET`}
                  </Text>
                </Animated.View>
              )}
            </Pressable>
          </View>
        </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Ambient floating particles — gold + purple specks drifting upward */
function AmbientParticles() {
  const PARTICLE_COUNT = 12;
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      anim: new Animated.Value(0),
      x: Math.random() * 100,
      size: 2 + Math.random() * 3,
      duration: 4000 + Math.random() * 4000,
      delay: Math.random() * 3000,
      color: Math.random() > 0.5 ? 'rgba(212,175,55,0.4)' : 'rgba(138,92,255,0.3)',
    })),
  ).current;

  useEffect(() => {
    particles.forEach((p) => {
      const animate = () => {
        p.anim.setValue(0);
        Animated.timing(p.anim, {
          toValue: 1,
          duration: p.duration,
          delay: p.delay,
          useNativeDriver: true,
        }).start(() => {
          p.delay = 0; // no delay on repeat
          animate();
        });
      };
      animate();
    });
  }, []);

  return (
    <View style={s.ambientParticles} pointerEvents="none">
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
              inputRange: [0, 0.3, 0.7, 1],
              outputRange: [0, 0.8, 0.6, 0],
            }),
            transform: [{
              translateY: p.anim.interpolate({
                inputRange: [0, 1],
                outputRange: [200, -50],
              }),
            }],
          }}
        />
      ))}
    </View>
  );
}

/** Confetti animation overlay for winner celebration */
function ConfettiOverlay({ side }: { side: 'left' | 'right' }) {
  const pieces = useRef(
    Array.from({ length: 18 }, (_, i) => ({
      anim: new Animated.Value(0),
      x: Math.random() * 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 600,
      drift: (Math.random() - 0.5) * 40,
    })),
  ).current;

  useEffect(() => {
    pieces.forEach((p) => {
      p.anim.setValue(0);
      Animated.timing(p.anim, {
        toValue: 1,
        duration: 1800 + Math.random() * 600,
        delay: p.delay,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  return (
    <View
      style={[
        s.confettiContainer,
        side === 'left' ? s.confettiContainerLeft : s.confettiContainerRight,
      ]}
    >
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            s.confettiPiece,
            {
              backgroundColor: p.color,
              left: `${p.x}%` as any,
              opacity: p.anim.interpolate({
                inputRange: [0, 0.3, 0.8, 1],
                outputRange: [0, 1, 0.8, 0],
              }),
              transform: [
                {
                  translateY: p.anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 250],
                  }),
                },
                {
                  translateX: p.anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, p.drift],
                  }),
                },
                {
                  rotate: p.anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${180 + Math.random() * 360}deg`],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

/** Animated bet cell — asset-based premium button */
function AnimatedBetCell({
  hand,
  mult,
  disabled,
  selected,
  onPress,
}: {
  hand: { key: string; label: string; icon: string };
  mult: number;
  disabled: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: selected ? 1.03 : 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  };

  const btnSource = ASSETS.btnBetBase;
  const selectedOverlay = selected;

  return (
    <TouchableOpacity
      style={[s.handCell, disabled && s.handCellDisabled]}
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.85}
    >
      <Animated.View style={[s.handCellOuter, { transform: [{ scale: scaleAnim }] }]}>
        {/* Button asset as absolute background */}
        <Image
          source={btnSource}
          style={s.handCellBgImg}
          resizeMode="stretch"
        />
        {/* Gold tint overlay when selected */}
        {selectedOverlay && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(212,175,55,0.2)', borderRadius: 8 }} />
        )}
        {/* Content — horizontal row: icon | label | multiplier */}
        <View style={s.handCellContent}>
          <PremiumIcon name={hand.icon} size={16} />
          <View style={s.handCellLabels}>
            <Text style={[s.handCellName, disabled && s.handCellNameDisabled, selected && s.handCellNameSelected]} numberOfLines={1}>
              {hand.label}
            </Text>
          </View>
          <Text style={[s.handCellMult, disabled && s.handCellMultDisabled]}>
            ×{mult > 0 ? mult.toFixed(mult >= 100 ? 0 : 1) : '—  '}
          </Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

/** Pulsing winner text during showdown */
function PulsingText({ style, children }: { style: any; children: React.ReactNode }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.Text style={[style, { transform: [{ scale: pulseAnim }] }]}>
      {children}
    </Animated.Text>
  );
}

/** Animated winner bet button — gentle pulse when betting is active */
function AnimatedWinnerBtn({
  source,
  label,
  disabled,
  onPress,
  btnStyle,
}: {
  source: any;
  label: string;
  disabled: boolean;
  onPress: () => void;
  btnStyle: any;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (disabled) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [disabled]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.93, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  };

  return (
    <TouchableOpacity
      style={[s.winnerBtn, btnStyle]}
      onPress={onPress}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.9}
    >
      <Animated.View style={{ transform: [{ scale: Animated.multiply(scaleAnim, pulseAnim) }], width: '100%' }}>
        <View style={s.winnerBtnBg}>
          <Text style={s.winnerBtnText}>{label}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

/** History modal — last 15 plays */
function HistoryModal({ visible, entries, onClose }: { visible: boolean; entries: any[]; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalCard, { width: wp(390), maxHeight: '80%' as any }]}>
          <Text style={s.modalTitle}>Last 15 Plays</Text>
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator>
            {entries.length === 0 && (
              <Text style={{ color: C.textMuted, textAlign: 'center', marginVertical: 20 }}>No plays yet</Text>
            )}
            {entries.map((e, i) => (
              <View key={i} style={s.historyRow}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.historyRound}>R#{e.roundNumber}</Text>
                  <Text style={[s.historyResult, e.won && s.historyResultWon]}>
                    {e.won ? `+${formatChips(e.payout)}` : `-${formatChips(e.amount)}`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                  <Text style={s.historyBetType}>{e.betType} ×{e.multiplier?.toFixed(2)}</Text>
                  <Text style={s.historyHand}>{e.winnerHand}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={[s.modalOkBtn, { marginTop: 12 }]} onPress={onClose}>
            <Text style={s.modalOkText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** Emote picker modal */
function EmotePickerModal({
  visible,
  onSelect,
  onClose,
  chips,
}: {
  visible: boolean;
  onSelect: (emoteId: string) => void;
  onClose: () => void;
  chips: number;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalCard, { width: wp(340) }]}>
          <Text style={s.modalTitle}>Send Emote</Text>
          <View style={s.emoteGrid}>
            {EMOTE_LIST.map((emote) => {
              const canAfford = chips >= emote.cost;
              return (
                <TouchableOpacity
                  key={emote.id}
                  style={[s.emoteCell, !canAfford && emote.cost > 0 && { opacity: 0.4 }]}
                  disabled={!canAfford && emote.cost > 0}
                  onPress={() => onSelect(emote.id)}
                >
                  {ASSETS.emotes[emote.id] ? (
                    <Image source={ASSETS.emotes[emote.id]} style={s.emoteImg} />
                  ) : (
                    <Text style={s.emoteEmoji}>{EMOTE_EMOJI[emote.id] ?? '❓'}</Text>
                  )}
                  <Text style={s.emoteLabel}>{emote.label}</Text>
                  {emote.cost > 0 && (
                    <Text style={s.emoteCost}>{formatChips(emote.cost)}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={[s.modalCancelBtn, { marginTop: 12 }]} onPress={onClose}>
            <Text style={s.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toast helper
// ---------------------------------------------------------------------------
function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const [toastColor, setToastColor] = useState(C.green);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((text: string, color: string = C.green, duration = 2500) => {
    setMsg(text);
    setToastColor(color);
    opacity.setValue(1);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() =>
        setMsg(null),
      );
    }, duration);
  }, []);

  const component = msg ? (
    <Animated.View style={[s.toast, { opacity, borderColor: toastColor }]} pointerEvents="none">
      <Text style={[s.toastText, { color: toastColor }]}>{msg}</Text>
    </Animated.View>
  ) : null;

  return { show, component };
}

// ---------------------------------------------------------------------------
// Flash overlay for payout feedback
// ---------------------------------------------------------------------------
function useFlashOverlay() {
  const opacity = useRef(new Animated.Value(0)).current;
  const [color, setColor] = useState('transparent');

  const flash = useCallback((c: string) => {
    setColor(c);
    opacity.setValue(0.35);
    Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }).start();
  }, []);

  const component = (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity, zIndex: 999 }]}
      pointerEvents="none"
    />
  );

  return { flash, component };
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export default function GameScreen() {
  // Navigation
  const navigation = useNavigation();
  const route = useRoute<RouteProp<GameRouteParams, 'Game'>>();
  const tier = route.params.tier;

  // Game state from server
  const [gs, setGs] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbPeriod, setLbPeriod] = useState<'24h' | '7d'>('24h');

  // Hand bets sidebar
  const [hbPeriod, setHbPeriod] = useState<'24h' | '7d'>('24h');

  // Bet modal
  const [betModal, setBetModal] = useState<{ visible: boolean; betType: string; label: string }>({
    visible: false,
    betType: '',
    label: '',
  });

  // Track which hand types user has bet on this round (for selected styling)
  const [placedBets, setPlacedBets] = useState<Set<string>>(new Set());

  // Stage transition flash
  const prevStageRef = useRef<string>('idle');
  const stageFlash = useRef(new Animated.Value(0)).current;

  // History
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);

  // Emotes
  const [emotePickerVisible, setEmotePickerVisible] = useState(false);
  const [emoteTarget, setEmoteTarget] = useState<'a' | 'b'>('a');
  const [activeEmote, setActiveEmote] = useState<{ emoteId: string; target: 'a' | 'b' } | null>(null);
  const emoteAnim = useRef(new Animated.Value(0)).current;

  // Toast & flash overlay
  const toast = useToast();
  const flashOverlay = useFlashOverlay();

  // --------------------------------------------------
  // Orientation lock & status bar
  // --------------------------------------------------
  useEffect(() => {
    let mounted = true;

    async function lockLandscape() {
      try {
        // Force landscape — works on Expo, Capacitor, and native builds
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch {
        // Fallback: try specific direction if LANDSCAPE enum not supported
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
        } catch {
          // Orientation lock not supported on this platform
        }
      }
    }
    lockLandscape();

    return () => {
      mounted = false;
      // Restore portrait for other screens
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {
        ScreenOrientation.unlockAsync().catch(() => {});
      });
    };
  }, []);

  // --------------------------------------------------
  // Socket connection & event listeners
  // --------------------------------------------------
  useEffect(() => {
    let mounted = true;

    async function connectSocket() {
      try {
        const socket = await socketService.connect();
        if (!mounted) return;
        setConnected(true);
        setError(null);

        // Join tier
        socket.emit('join_tier', { tier });

        // Request leaderboard
        socket.emit('get_leaderboard', { tier, period: lbPeriod });

        // ---- Listeners ----
        const onGameState = (state: GameState) => {
          if (!mounted) return;
          setGs(state);
        };

        const onBetOk = (result: any) => {
          if (!mounted) return;
          toast.show(`Bet placed! ${formatChips(result?.amount ?? 0)}`, C.green);
        };

        const onChipsUpdate = (data: { chips?: number; gameChips?: number }) => {
          if (!mounted) return;
          const newChips = data.gameChips ?? data.chips;
          if (newChips != null) {
            setGs((prev) => (prev ? { ...prev, chips: newChips } : prev));
          }
        };

        const onLeaderboard = ({ entries }: { entries: LeaderboardEntry[] }) => {
          if (!mounted) return;
          setLeaderboard(entries ?? []);
        };

        const onPayout = (info: { payouts: PayoutInfo[]; newBalance: number }) => {
          if (!mounted) return;
          const bets = info.payouts || [];
          const totalWon = bets.filter(b => b.won).reduce((s, b) => s + b.payout, 0);
          const totalLost = bets.filter(b => !b.won).reduce((s, b) => s + b.amount, 0);
          const net = totalWon - totalLost;

          if (net > 0) {
            flashOverlay.flash('rgba(38,217,92,0.25)');
            toast.show(`Won ${formatChips(totalWon)}!`, C.green, 3500);
          } else if (net < 0 || totalLost > 0) {
            flashOverlay.flash('rgba(231,76,60,0.25)');
            toast.show(`Lost ${formatChips(totalLost)}`, C.red, 2500);
          } else {
            toast.show('Push — bet returned', C.gold, 2000);
          }
          // Update local chip balance
          if (info.newBalance != null) {
            setGs((prev) => (prev ? { ...prev, chips: info.newBalance } : prev));
          }
          // Refresh leaderboard after payout
          socket.emit('get_leaderboard', { tier, period: lbPeriod });
        };

        const onError = ({ message }: { message: string }) => {
          if (!mounted) return;
          toast.show(message, C.red, 3000);
        };

        const onDisconnect = () => {
          if (!mounted) return;
          setConnected(false);
        };

        const onHistory = ({ entries }: { entries: any[] }) => {
          if (!mounted) return;
          setHistoryEntries(entries ?? []);
        };

        const onEmoteReceived = ({ emoteId, target }: { fromUserId: string; emoteId: string; target: 'a' | 'b' }) => {
          if (!mounted) return;
          setActiveEmote({ emoteId, target });
          emoteAnim.setValue(0);
          Animated.sequence([
            Animated.timing(emoteAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.delay(1200),
            Animated.timing(emoteAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]).start(() => setActiveEmote(null));
        };

        // Server-push: New round started
        const onRoundStart = (data: {
          roundNumber: number;
          playerA: { name: string; emoji: string; cards: Card[] };
          playerB: { name: string; emoji: string; cards: Card[] };
          multipliers: Record<string, number>;
          winnerProbs: { a: number; b: number };
          countdown: number;
          minBet: number;
          handNames: Record<number, string>;
        }) => {
          if (!mounted) return;
          setGs((prev) => prev ? {
            ...prev,
            roundNumber: data.roundNumber,
            stage: 'preflop' as const,
            playerA: data.playerA,
            playerB: data.playerB,
            community: [],
            multipliers: data.multipliers,
            winnerProbs: data.winnerProbs,
            countdown: data.countdown,
            minBet: data.minBet,
            handNames: data.handNames,
            bets: {},
            resultA: null,
            resultB: null,
            winner: null,
            lastResults: prev.lastResults,  // preserve until next showdown
            roundTotalBets: 0,
          } : prev);
          setPlacedBets(new Set());
        };

        // Server-push: Stage changed (flop/turn/river)
        const onStageChange = (data: {
          stage: string;
          community: Card[];
          multipliers: Record<string, number>;
          winnerProbs: { a: number; b: number };
          countdown: number;
        }) => {
          if (!mounted) return;
          setGs((prev) => prev ? {
            ...prev,
            stage: data.stage as GameState['stage'],
            community: data.community,
            multipliers: data.multipliers,
            winnerProbs: data.winnerProbs,
            countdown: data.countdown,
          } : prev);
        };

        // Server-push: Countdown tick (lightweight — just the number)
        const onCountdown = (data: { countdown: number }) => {
          if (!mounted) return;
          setGs((prev) => prev ? { ...prev, countdown: data.countdown } : prev);
        };

        // Server-push: Round result with personalized payouts
        const onRoundResult = (data: {
          roundNumber: number;
          winner: 'a' | 'b' | 'tie';
          resultA: { name: string; rank: number };
          resultB: { name: string; rank: number };
          community: Card[];
          playerA: { name: string; emoji: string; cards: Card[] };
          playerB: { name: string; emoji: string; cards: Card[] };
          payouts: PayoutInfo[];
          newBalance: number;
          countdown: number;
        }) => {
          if (!mounted) return;

          // Update game state to showdown
          setGs((prev) => prev ? {
            ...prev,
            stage: 'showdown' as const,
            winner: data.winner,
            resultA: data.resultA,
            resultB: data.resultB,
            community: data.community,
            playerA: data.playerA,
            playerB: data.playerB,
            countdown: data.countdown,
            chips: data.newBalance,
            lastResults: {
              roundNumber: data.roundNumber,
              winner: data.winner,
              resultA: data.resultA,
              resultB: data.resultB,
              payouts: data.payouts,
            },
          } : prev);

          // Show payout feedback
          const bets = data.payouts || [];
          if (bets.length > 0) {
            const totalWon = bets.filter((b: any) => b.won).reduce((s: number, b: any) => s + b.payout, 0);
            const totalLost = bets.filter((b: any) => !b.won).reduce((s: number, b: any) => s + b.amount, 0);
            const net = totalWon - totalLost;

            if (net > 0) {
              flashOverlay.flash('rgba(38,217,92,0.25)');
              toast.show(`Won ${formatChips(totalWon)}!`, C.green, 3500);
            } else if (net < 0 || totalLost > 0) {
              flashOverlay.flash('rgba(231,76,60,0.25)');
              toast.show(`Lost ${formatChips(totalLost)}`, C.red, 2500);
            } else {
              toast.show('Push — bet returned', C.gold, 2000);
            }
          }

          // Refresh leaderboard after round result
          socket.emit('get_leaderboard', { tier, period: lbPeriod });
        };

        // Server-push: Bet aggregates updated
        const onBetUpdate = (data: {
          bets: Record<string, { total: number; count: number }>;
          roundTotalBets: number;
        }) => {
          if (!mounted) return;
          setGs((prev) => prev ? {
            ...prev,
            bets: data.bets,
            roundTotalBets: data.roundTotalBets,
          } : prev);
        };

        socket.on('game_state', onGameState);
        socket.on('bet_ok', onBetOk);
        socket.on('chips_update', onChipsUpdate);
        socket.on('leaderboard', onLeaderboard);
        socket.on('payout', onPayout);
        socket.on('error', onError);
        socket.on('disconnect', onDisconnect);
        socket.on('history', onHistory);
        socket.on('emote_received', onEmoteReceived);
        socket.on('round_start', onRoundStart);
        socket.on('stage_change', onStageChange);
        socket.on('countdown', onCountdown);
        socket.on('round_result', onRoundResult);
        socket.on('bet_update', onBetUpdate);

        return () => {
          socket.off('game_state', onGameState);
          socket.off('bet_ok', onBetOk);
          socket.off('chips_update', onChipsUpdate);
          socket.off('leaderboard', onLeaderboard);
          socket.off('payout', onPayout);
          socket.off('error', onError);
          socket.off('disconnect', onDisconnect);
          socket.off('history', onHistory);
          socket.off('emote_received', onEmoteReceived);
          socket.off('round_start', onRoundStart);
          socket.off('stage_change', onStageChange);
          socket.off('countdown', onCountdown);
          socket.off('round_result', onRoundResult);
          socket.off('bet_update', onBetUpdate);
        };
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message ?? 'Connection failed');
        setConnected(false);
      }
    }

    const cleanupPromise = connectSocket();

    return () => {
      mounted = false;
      cleanupPromise?.then((cleanup) => cleanup?.());
    };
  }, [tier]);

  // --------------------------------------------------
  // Stage transition flash effect
  // --------------------------------------------------
  useEffect(() => {
    if (!gs) return;
    if (gs.stage !== prevStageRef.current && gs.stage !== 'idle' && gs.stage !== 'paused') {
      stageFlash.setValue(1);
      Animated.timing(stageFlash, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
    // Reset placed bets when a new round starts (entering preflop from any stage)
    if (gs.stage === 'preflop' && prevStageRef.current !== 'preflop') {
      setPlacedBets(new Set());
    }
    prevStageRef.current = gs.stage;
  }, [gs?.stage]);

  // Re-fetch leaderboard when period toggles
  useEffect(() => {
    const socket = socketService.getSocket();
    if (socket?.connected) {
      socket.emit('get_leaderboard', { tier, period: lbPeriod });
    }
  }, [lbPeriod, tier]);

  // --------------------------------------------------
  // Handlers
  // --------------------------------------------------
  const handlePlaceBet = useCallback(
    (betType: string, amount: number) => {
      const socket = socketService.getSocket();
      if (!socket?.connected) {
        toast.show('Not connected', C.red);
        return;
      }
      socket.emit('bet', { tier, betType, amount });
      setPlacedBets((prev) => new Set(prev).add(betType));
    },
    [tier],
  );

  const openBetModal = useCallback((betType: string, label: string) => {
    setBetModal({ visible: true, betType, label });
  }, []);

  const handleGoBack = useCallback(() => {
    const socket = socketService.getSocket();
    if (!socket) { navigation.goBack(); return; }

    // Wait for server to confirm chips are saved to Cosmos, then navigate
    socket.emit('leave_tier', { tier }, (res: any) => {
      if (res?.ok && res.chips !== undefined) {
        const { useAuthStore } = require('../../stores/authStore');
        const store = useAuthStore.getState();
        if (store.user) {
          useAuthStore.setState({ user: { ...store.user, chips: res.chips } });
        }
      }
      navigation.goBack();
    });

    // Safety timeout — navigate back even if ack never arrives
    setTimeout(() => { navigation.goBack(); }, 3000);
  }, [tier, navigation]);

  const handleSendEmote = useCallback((emoteId: string) => {
    socketService.sendEmote(tier, emoteId, emoteTarget);
    setEmotePickerVisible(false);
  }, [tier, emoteTarget]);

  // --------------------------------------------------
  // Derived values
  // --------------------------------------------------
  const chips = gs?.chips ?? 0;
  const multipliers = gs?.multipliers ?? {};
  const handNames = gs?.handNames ?? {};
  const stage = gs?.stage ?? 'idle';
  const countdown = gs?.countdown ?? 0;
  const isShowdown = stage === 'showdown';

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  if (!gs && !error) {
    return (
      <ImageBackground source={ASSETS.loadingScreen} style={s.loadingContainer} resizeMode="cover">
        <StatusBar hidden />
        <Text style={s.loadingText}>Connecting…</Text>
      </ImageBackground>
    );
  }

  if (error && !gs) {
    return (
      <View style={s.loadingContainer}>
        <StatusBar hidden />
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={handleGoBack}>
          <Text style={s.retryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar hidden />
      {flashOverlay.component}

      {/* ============ TOP BAR ============ */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={handleGoBack}>
          <Text style={s.backBtnText}>◀ BACK</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <View style={s.chipBalance}>
          <PremiumIcon name="coin" size={16} />
          <AnimatedNumber value={chips} style={s.chipText} duration={500} />
        </View>
      </View>

      {/* ============ MAIN ROW: Left sidebar | Center | Right sidebar ============ */}
      <View style={s.mainRow}>
        {/* --- LEFT SIDEBAR: Leaderboard --- */}
        <LeaderboardPanel
          entries={leaderboard}
          period={lbPeriod}
          onTogglePeriod={() => setLbPeriod((p) => (p === '24h' ? '7d' : '24h'))}
        />

        {/* --- CENTER AREA --- */}
        <View style={s.center}>
          {/* Layer 1: Background image — table surface */}
          <Image source={ASSETS.tableBg} style={s.centerBgImg} resizeMode="cover" />

          {/* Layer 2: Dark glass overlay — makes bg subtle, not dominant */}
          <View style={s.centerDarkOverlay} pointerEvents="none" />

          {/* Layer 3: FX particles — atmospheric */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Image source={ASSETS.fxOverlay} style={s.centerFxImg} resizeMode="cover" />
          </View>

          {/* Layer 4: Purple/blue ambient glow — center focus */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Top center glow (purple) */}
            <LinearGradient
              colors={['rgba(138,92,255,0.12)', 'transparent'] as [string, string]}
              style={s.glowTop}
            />
            {/* Bottom center glow (blue) */}
            <LinearGradient
              colors={['transparent', 'rgba(62,230,255,0.06)'] as [string, string]}
              style={s.glowBottom}
            />
            {/* Center radial-like glow — subtle light pool */}
            <View style={s.glowCenter} />
          </View>

          {/* Layer 5: Edge vignette — darkens borders, focuses center */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <LinearGradient
              colors={['rgba(8,11,22,0.8)', 'transparent'] as [string, string]}
              style={s.vignetteTop}
            />
            <LinearGradient
              colors={['transparent', 'rgba(8,11,22,0.8)'] as [string, string]}
              style={s.vignetteBot}
            />
            <LinearGradient
              colors={['rgba(8,11,22,0.7)', 'transparent'] as [string, string]}
              start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
              style={s.vignetteLeft}
            />
            <LinearGradient
              colors={['transparent', 'rgba(8,11,22,0.7)'] as [string, string]}
              start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
              style={s.vignetteRight}
            />
          </View>

          {/* Ambient floating particles */}
          <AmbientParticles />

          {/* Pot Display */}
          <View style={s.potContainer}>
            <View style={s.potBadge}>
              <PremiumIcon name="coin" size={14} />
              <View>
                <Text style={s.potLabel}>TOTAL POT</Text>
                <AnimatedNumber value={gs?.roundTotalBets ?? 0} style={s.potValue} duration={800} />
              </View>
            </View>
          </View>

          {/* Players + VS + Community */}
          <View style={s.playArea}>
            {/* Player A */}
            <View style={[s.playerSection, isShowdown && gs?.winner !== 'tie' && gs?.winner !== 'a' && s.playerSectionDimmed]}>
              <View style={s.playerAvatarWrap}>
                <Image source={ASSETS.playerA} style={s.playerAvatarImg} />
              </View>
              <Text style={s.playerName} numberOfLines={1}>
                {gs?.playerA?.name ?? 'Player A'}
              </Text>
              <AnimatedWinnerBtn
                source={ASSETS.winBtnLeft}
                label={`A WIN ×${(multipliers.winner_a ?? 0).toFixed(2)}`}
                disabled={isShowdown || stage === 'idle'}
                onPress={() => openBetModal('winner_a', `${gs?.playerA?.name ?? 'A'} Wins`)}
                btnStyle={s.winnerBtnA}
              />
              <View style={s.holeCards}>
                {(gs?.playerA?.cards ?? []).map((card, i) => (
                  <AnimatedCard
                    key={`a-${i}-${card.rank}-${card.suit}`}
                    card={card}
                    index={i}
                    size="sm"
                  />
                ))}
                {(!gs?.playerA?.cards || gs.playerA.cards.length === 0) && (
                  <>
                    <AnimatedCard index={0} size="sm" />
                    <AnimatedCard index={1} size="sm" />
                  </>
                )}
              </View>
              {isShowdown && gs?.resultA && (
                <Text style={[s.handResult, gs.winner === 'a' && s.handResultWin]}>
                  {gs.resultA.name}
                </Text>
              )}
            </View>

            {/* VS Badge + Countdown */}
            <View style={s.vsSection}>
              <CountdownRing countdown={countdown} maxCountdown={STAGE_MAX_COUNTDOWN} size={54} />
              <Text style={s.vsText}>VS</Text>
            </View>

            {/* Player B */}
            <View style={[s.playerSection, isShowdown && gs?.winner !== 'tie' && gs?.winner !== 'b' && s.playerSectionDimmed]}>
              <View style={s.playerAvatarWrap}>
                <Image source={ASSETS.playerB} style={s.playerAvatarImg} />
              </View>
              <Text style={s.playerName} numberOfLines={1}>
                {gs?.playerB?.name ?? 'Player B'}
              </Text>
              <AnimatedWinnerBtn
                source={ASSETS.winBtnRight}
                label={`B WIN ×${(multipliers.winner_b ?? 0).toFixed(2)}`}
                disabled={isShowdown || stage === 'idle'}
                onPress={() => openBetModal('winner_b', `${gs?.playerB?.name ?? 'B'} Wins`)}
                btnStyle={s.winnerBtnB}
              />
              <View style={s.holeCards}>
                {(gs?.playerB?.cards ?? []).map((card, i) => (
                  <AnimatedCard
                    key={`b-${i}-${card.rank}-${card.suit}`}
                    card={card}
                    index={i}
                    size="sm"
                  />
                ))}
                {(!gs?.playerB?.cards || gs.playerB.cards.length === 0) && (
                  <>
                    <AnimatedCard index={0} size="sm" />
                    <AnimatedCard index={1} size="sm" />
                  </>
                )}
              </View>
              {isShowdown && gs?.resultB && (
                <Text style={[s.handResult, gs.winner === 'b' && s.handResultWin]}>
                  {gs.resultB.name}
                </Text>
              )}
            </View>
          </View>

          {/* Community Cards */}
          <View style={s.communityRow}>
            {(gs?.community ?? []).map((card, i) => (
              <AnimatedCard
                key={`c-${i}-${card.rank}-${card.suit}`}
                card={card}
                index={i}
                size="sm"
              />
            ))}
            {/* Empty placeholders for unrevealed community cards */}
            {Array.from({ length: 5 - (gs?.community?.length ?? 0) }).map((_, i) => (
              <View key={`empty-${i}`} style={s.communityPlaceholder} />
            ))}
          </View>

          {/* Highest winner hand label */}
          {isShowdown && gs?.winner && gs.winner !== 'tie' && (
            <Text style={s.highestHandLabel}>HIGHEST WINNER HAND</Text>
          )}

          {/* Showdown results overlay */}
          {isShowdown && gs?.winner && (
            <View style={s.showdownOverlay}>
              {isShowdown && countdown > 0 && (
                <View style={s.nextRoundContainer}>
                  <Text style={s.nextRoundLabel}>NEXT ROUND</Text>
                  <Text style={s.nextRoundCountdown}>{countdown}</Text>
                </View>
              )}
              <PulsingText style={s.showdownWinner}>
                {gs.winner === 'tie'
                  ? 'TIE'
                  : `${gs.winner === 'a' ? gs.playerA?.name : gs.playerB?.name} WINS!`}
              </PulsingText>
              {gs.winner !== 'tie' && (
                <Text style={s.showdownHand}>
                  {gs.winner === 'a' ? gs.resultA?.name : gs.resultB?.name}
                </Text>
              )}
            </View>
          )}

          {/* Confetti overlay for winner */}
          {isShowdown && gs?.winner && gs.winner !== 'tie' && (
            <ConfettiOverlay side={gs.winner === 'a' ? 'left' : 'right'} />
          )}
        </View>

        {/* --- RIGHT SIDEBAR: Hand type aggregate bets --- */}
        <HandBetsSidebar
          bets={gs?.bets ?? {}}
          handNames={handNames}
          multipliers={multipliers}
        />
      </View>

      {/* ============ BOTTOM PANEL: Hand type betting grid ============ */}
      <View style={s.bottomPanel}>
        {HAND_GRID.map((row, ri) => (
          <View key={ri} style={s.handGridRow}>
            {row.map((hand) => {
              const mult = multipliers[hand.key] ?? 0;
              const disabled = isShowdown || stage === 'idle' || mult <= 0;
              return (
                <AnimatedBetCell
                  key={hand.key}
                  hand={hand}
                  mult={mult}
                  disabled={disabled}
                  selected={placedBets.has(hand.key)}
                  onPress={() => openBetModal(hand.key, hand.label)}
                />
              );
            })}
          </View>
        ))}
      </View>

      {/* ============ BET MODAL ============ */}
      <BetModal
        visible={betModal.visible}
        betType={betModal.betType}
        label={betModal.label}
        minBet={gs?.minBet ?? 100}
        maxChips={chips}
        onConfirm={(amount) => handlePlaceBet(betModal.betType, amount)}
        onClose={() => setBetModal((prev) => ({ ...prev, visible: false }))}
      />

      {/* ============ TOAST ============ */}
      {toast.component}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Color shortcuts (dark casino theme)
// ---------------------------------------------------------------------------
const C = {
  bg: '#0B0F1A',
  surface: 'rgba(12, 14, 24, 0.85)',
  surfaceLight: 'rgba(20, 24, 38, 0.7)',
  surfaceSolid: '#111827',
  gold: '#D4AF37',
  goldDim: 'rgba(212, 175, 55, 0.25)',
  goldGlow: 'rgba(212, 175, 55, 0.4)',
  neonBlue: '#3EE6FF',
  neonPurple: '#8A5CFF',
  neonPurpleDim: 'rgba(138, 92, 255, 0.2)',
  greenFelt: '#1B5E20',
  red: '#E74C3C',
  green: '#26D95C',
  text: '#F0F6FC',
  textSec: '#8B949E',
  textMuted: '#484F58',
  textDim: 'rgba(240, 246, 252, 0.6)',
  border: 'rgba(218, 165, 32, 0.15)',
  borderGold: 'rgba(212, 175, 55, 0.3)',
  // Shared radii
  rSm: 10,
  rMd: 16,
  rLg: 24,
  // Glow presets
  glowSm: 8,
  glowMd: 16,
  glowLg: 24,
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  // ---- Root / Loading ----
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: C.gold,
    fontSize: 18,
    fontWeight: '600',
  },
  errorText: {
    color: C.red,
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryBtn: {
    backgroundColor: C.gold,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryBtnText: {
    color: C.bg,
    fontWeight: '700',
    fontSize: 14,
  },

  // ---- Top Bar — panel asset background ----
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: wp(14),
    paddingVertical: hp(8),
    backgroundColor: 'rgba(8, 8, 16, 0.7)',
  },
  backBtn: {
    paddingHorizontal: wp(8),
    paddingVertical: hp(4),
  },
  backBtnImg: {
    width: wp(28),
    height: wp(28),
    resizeMode: 'contain',
  },
  backBtnText: {
    color: C.gold,
    fontSize: wp(12),
    fontWeight: '800',
    letterSpacing: 1,
  },
  roundLabel: {
    color: C.text,
    fontSize: wp(13),
    fontWeight: '600',
  },
  chipBalance: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(12),
    paddingVertical: hp(5),
    backgroundColor: 'rgba(8,10,20,0.85)',
    borderWidth: 1,
    borderColor: C.borderGold,
    borderRadius: wp(12),
  },
  chipIcon: {
    fontSize: wp(14),
    marginRight: wp(4),
  },
  chipIconImg: {
    width: wp(18),
    height: wp(18),
    resizeMode: 'contain',
    marginRight: wp(4),
  },
  chipText: {
    color: C.gold,
    fontWeight: '800',
    fontSize: wp(14),
  },

  // ---- Main Row ----
  mainRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },

  // ---- Sidebar (shared left & right) — panel asset as bg ----
  sidebar: {
    width: '18%' as any,
    paddingVertical: hp(8),
    paddingHorizontal: wp(8),
    overflow: 'hidden',
    backgroundColor: 'rgba(8,10,20,0.85)',
    borderWidth: 1,
    borderColor: C.borderGold,
    borderRadius: wp(4),
  },
  sidebarBgAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  } as any,
  sidebarBgImage: {
    borderRadius: 0,
  },
  sidebarTitle: {
    color: C.gold,
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(218,165,32,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  sidebarTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  sidebarTitleLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(218, 165, 32, 0.2)',
  },
  sidebarEmpty: {
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 12,
    fontSize: 12,
  },
  periodToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 6,
    gap: 4,
  },
  periodBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(218, 165, 32, 0.15)',
  },
  periodBtnActive: {
    backgroundColor: C.gold,
  },
  periodBtnText: {
    color: C.textSec,
    fontSize: 9,
    fontWeight: '700',
  },
  periodBtnTextActive: {
    color: C.bg,
  },

  // Leaderboard rows
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 4,
    marginBottom: 2,
    borderRadius: 6,
    borderBottomWidth: 0,
  },
  leaderRowTop: {
    backgroundColor: 'rgba(218,165,32,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(218,165,32,0.12)',
  },
  leaderRowFirst: {
    backgroundColor: 'rgba(218,165,32,0.15)',
    borderColor: 'rgba(218,165,32,0.3)',
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  leaderRankBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  leaderRankIcon: {
    fontSize: 11,
  },
  rank1: { backgroundColor: '#DAA520' },
  rank2: { backgroundColor: '#A0A0A0' },
  rank3: { backgroundColor: '#CD7F32' },
  leaderRankText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
  },
  leaderAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(218,165,32,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  leaderAvatarText: {
    color: C.text,
    fontSize: 8,
    fontWeight: '800',
  },
  leaderTrophy: {
    color: C.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  leaderRank: {
    color: C.gold,
    fontSize: 10,
    fontWeight: '800',
    width: 22,
  },
  leaderName: {
    flex: 1,
    color: C.text,
    fontSize: 10,
    marginRight: 4,
  },
  leaderChips: {
    color: C.green,
    fontSize: 10,
    fontWeight: '700',
  },

  // Hand bet rows (right sidebar) — glass-style rows
  handBetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 6,
    marginBottom: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(14,17,34,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  handBetIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(138,92,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handBetIcon: {
    fontSize: 11,
  },
  handBetName: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: '600',
  },
  handBetNameActive: {
    color: C.text,
    fontWeight: '700',
  },
  handBetAmount: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  handBetAmountActive: {
    color: C.gold,
    fontWeight: '800',
  },

  // ---- Center Area ----
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  // Layer 1: Background image
  centerBgImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  // Layer 2: Dark glass overlay
  centerDarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,11,22,0.55)',
  },
  // Layer 3: FX particles
  centerFxImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.3,
  },
  // Layer 4: Ambient glow
  glowTop: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: '40%',
    borderBottomLeftRadius: 100,
    borderBottomRightRadius: 100,
  } as any,
  glowBottom: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: '30%',
    borderTopLeftRadius: 80,
    borderTopRightRadius: 80,
  } as any,
  glowCenter: {
    position: 'absolute',
    top: '25%',
    left: '25%',
    right: '25%',
    bottom: '25%',
    borderRadius: 120,
    backgroundColor: 'rgba(138,92,255,0.04)',
  } as any,
  // Layer 5: Edge vignettes
  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '25%',
  } as any,
  vignetteBot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '25%',
  } as any,
  vignetteLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '12%',
  } as any,
  vignetteRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '12%',
  } as any,
  ambientParticles: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    overflow: 'hidden',
  } as any,
  // Pot display
  potContainer: {
    alignItems: 'center',
    marginBottom: 2,
    zIndex: 2,
  },
  potBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1.5,
    borderColor: C.gold,
    borderRadius: C.rLg,
    paddingHorizontal: wp(14),
    paddingVertical: hp(6),
    gap: wp(8),
    shadowColor: C.neonPurple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: C.glowLg,
    elevation: 14,
  },
  potChipIcon: {
    width: wp(28),
    height: wp(28),
    resizeMode: 'contain',
  },
  potChipEmoji: {
    fontSize: wp(22),
  },
  potLabel: {
    color: C.textSec,
    fontSize: wp(8),
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase' as any,
  },
  potValue: {
    color: C.gold,
    fontSize: wp(18),
    fontWeight: '900',
    letterSpacing: 1,
    textShadowColor: 'rgba(218,165,32,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  // Play area (players + VS)
  playArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 2,
  },
  playerSection: {
    flex: 1,
    alignItems: 'center',
  },
  playerAvatar: {
    width: wp(80),
    height: wp(80),
    borderRadius: wp(40),
    borderWidth: 2,
    borderColor: C.gold,
    marginBottom: 3,
    resizeMode: 'cover',
  },
  playerAvatarWrap: {
    width: wp(80),
    height: wp(80),
    borderRadius: wp(40),
    borderWidth: 2,
    borderColor: 'rgba(138,92,255,0.5)',
    backgroundColor: 'rgba(12,15,28,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    shadowColor: C.neonPurple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: wp(12),
    elevation: 8,
    overflow: 'hidden',
  },
  playerAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: wp(40),
    resizeMode: 'cover',
  } as any,
  playerAvatarEmoji: {
    fontSize: wp(32),
  },
  playerSectionDimmed: {
    opacity: 0.25,
  },
  playerEmoji: {
    fontSize: wp(28),
    marginBottom: 2,
  },
  playerName: {
    color: C.text,
    fontSize: wp(13),
    fontWeight: '700',
    marginBottom: 4,
    maxWidth: wp(120),
    textAlign: 'center',
  },
  holeCards: {
    flexDirection: 'row',
    gap: wp(4),
  },
  cardHighlight: {
    borderWidth: 2,
    borderColor: C.gold,
    borderRadius: 8,
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: C.glowLg,
    elevation: 12,
  },
  handResult: {
    color: C.textSec,
    fontSize: wp(10),
    fontWeight: '700',
    marginTop: 3,
  },
  handResultWin: {
    color: C.gold,
    fontSize: wp(12),
    fontWeight: '800',
  },

  // VS badge
  vsSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp(10),
  },
  vsBadge: {
    marginVertical: 4,
  },
  vsBadgeImg: {
    width: wp(48),
    height: wp(48),
    resizeMode: 'contain',
  },
  vsText: {
    color: C.gold,
    fontSize: wp(20),
    fontWeight: '900',
    letterSpacing: 2,
  },
  stageLabel: {
    color: C.textSec,
    fontSize: wp(9),
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Community cards
  communityRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: wp(4),
    marginVertical: 2,
  },
  communityPlaceholder: {
    width: wp(40),
    height: hp(56),
    borderRadius: wp(6),
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
    margin: 1,
  },

  // Winner bet buttons
  winnerBetsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: wp(16),
    marginTop: 4,
    backgroundColor: 'transparent',
  },
  winnerBtn: {
    borderRadius: C.rSm,
    minWidth: wp(100),
    alignItems: 'center',
    overflow: 'hidden',
    marginTop: 2,
    marginBottom: 4,
  },
  winnerBtnBg: {
    paddingHorizontal: wp(14),
    paddingVertical: hp(7),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: wp(100),
    overflow: 'hidden',
    borderRadius: C.rSm,
    backgroundColor: 'rgba(12, 15, 28, 0.75)',
    borderWidth: 1,
    borderColor: C.borderGold,
  },
  winnerBtnBgImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
  } as any,
  winnerBtnA: {
    borderColor: 'rgba(62, 230, 255, 0.4)',
    backgroundColor: 'rgba(62, 230, 255, 0.08)',
  },
  winnerBtnB: {
    borderColor: 'rgba(255, 92, 120, 0.4)',
    backgroundColor: 'rgba(255, 92, 120, 0.08)',
  },
  winnerBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Showdown overlay
  showdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,11,22,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    zIndex: 20,
  },
  showdownWinner: {
    color: C.gold,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: C.goldGlow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 16,
  },
  showdownHand: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },

  // ---- Bottom Panel: Hand grid — asset-based buttons ----
  bottomPanel: {
    paddingTop: hp(8),
    paddingBottom: 0,
    paddingHorizontal: wp(10),
    marginTop: 'auto',
  } as any,
  handGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: hp(6),
    gap: wp(6),
  },
  handCell: {
    flex: 1,
  },
  handCellDisabled: {
    opacity: 0.45,
  },
  handCellOuter: {
    width: '100%',
    height: hp(56),
    borderRadius: wp(10),
    overflow: 'hidden',
    position: 'relative',
  } as any,
  handCellBgImg: {
    position: 'absolute',
    top: '-85%',
    left: '-17.5%',
    width: '135%',
    height: '306%',
  } as any,
  handCellContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(8),
    zIndex: 2,
  } as any,
  handCellIcon: {
    fontSize: wp(16),
    marginRight: wp(5),
    width: wp(22),
    textAlign: 'center',
  },
  handCellLabels: {
    flex: 1,
    marginRight: wp(6),
  },
  handCellName: {
    color: 'rgba(240, 246, 252, 0.92)',
    fontSize: wp(11),
    fontWeight: '700',
  },
  handCellNameDisabled: {
    color: C.textMuted,
  },
  handCellNameSelected: {
    color: '#E8C84A',
  },
  handCellMult: {
    color: C.gold,
    fontSize: wp(14),
    fontWeight: '900',
    marginRight: wp(8),
    textShadowColor: 'rgba(218,165,32,0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  handCellMultDisabled: {
    color: C.textMuted,
  },

  // ---- Bet Modal — premium floating casino glass ----
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any,
    }),
  },
  modalCard: {
    width: wp(340),
    borderRadius: wp(22),
    padding: wp(24),
    overflow: 'hidden',
    backgroundColor: 'rgba(12,14,28,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.30)',
    shadowColor: '#8A5CFF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 24,
    position: 'relative',
    ...Platform.select({
      web: { boxShadow: '0 0 60px 12px rgba(138,92,255,0.25), 0 0 20px 4px rgba(212,175,55,0.15)' } as any,
    }),
  } as any,
  modalGlowTop: {
    position: 'absolute',
    top: -50,
    left: '15%',
    width: '70%',
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(138,92,255,0.18)',
  } as any,
  modalGlowBottom: {
    position: 'absolute',
    bottom: -40,
    left: '20%',
    width: '60%',
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(62,230,255,0.10)',
  } as any,
  modalHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: 'rgba(139,148,158,0.8)',
    fontSize: wp(11),
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 4,
  },
  modalTitle: {
    color: C.gold,
    fontSize: wp(22),
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(212,175,55,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  modalAmountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    paddingVertical: hp(10),
    paddingHorizontal: wp(20),
    borderRadius: wp(14),
    backgroundColor: 'rgba(138,92,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(138,92,255,0.12)',
  },
  modalAmountIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  modalAmount: {
    color: '#FFFFFF',
    fontSize: wp(32),
    fontWeight: '900',
    textShadowColor: 'rgba(212,175,55,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 14,
    marginHorizontal: 10,
  },

  // Casino chip preset buttons
  presetGrid: {
    marginBottom: 18,
    gap: 10,
  },
  presetGridRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  chipBtn: {
    width: wp(85),
    height: hp(46),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: wp(24),
    backgroundColor: 'rgba(22,27,34,0.70)',
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.25)',
    overflow: 'hidden',
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  } as any,
  chipBtnActive: {
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderColor: C.gold,
    borderWidth: 2,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
    ...Platform.select({
      web: { boxShadow: '0 0 16px 3px rgba(212,175,55,0.35)' } as any,
    }),
  } as any,
  chipRing: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.12)',
  } as any,
  chipRingActive: {
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.40)',
  },
  chipSelectText: {
    color: 'rgba(240,246,252,0.6)',
    fontSize: wp(14),
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: C.gold,
    textShadowColor: 'rgba(212,175,55,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },

  // Premium slider
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 10,
  },
  sliderBtn: {
    width: wp(36),
    height: wp(36),
    borderRadius: wp(18),
    backgroundColor: 'rgba(22,27,34,0.60)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.20)',
  },
  sliderBtnText: {
    color: C.gold,
    fontSize: wp(20),
    fontWeight: '700',
  },
  sliderTrackWrap: {
    flex: 1,
  },
  sliderTrack: {
    flex: 1,
    height: hp(8),
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'visible',
    position: 'relative',
  } as any,
  sliderFillGlow: {
    position: 'absolute',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    ...Platform.select({
      web: { boxShadow: '0 0 10px 2px rgba(212,175,55,0.25)' } as any,
    }),
  } as any,
  sliderFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: C.gold,
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  } as any,
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingHorizontal: wp(46),
  },
  sliderLabel: {
    color: 'rgba(139,148,158,0.5)',
    fontSize: wp(10),
    fontWeight: '600',
  },

  // Action buttons
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: hp(13),
    borderRadius: wp(14),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
  },
  modalCancelText: {
    color: 'rgba(139,148,158,0.8)',
    fontWeight: '700',
    fontSize: wp(13),
    letterSpacing: 1,
  },
  modalOkBtn: {
    flex: 1.5,
    borderRadius: wp(14),
    overflow: 'hidden',
  },
  modalOkInner: {
    paddingVertical: hp(14),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,160,75,0.90)',
    borderRadius: wp(14),
    borderWidth: 1,
    borderColor: 'rgba(34,200,85,0.35)',
    shadowColor: '#1CA04B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
    ...Platform.select({
      web: { boxShadow: '0 4px 20px 4px rgba(28,160,75,0.35)' } as any,
    }),
  } as any,
  modalOkGlow: {
    position: 'absolute',
    top: -4,
    left: '10%',
    width: '80%',
    height: '120%',
    borderRadius: 14,
    backgroundColor: 'rgba(34,200,85,0.15)',
  } as any,
  modalOkText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: wp(14),
    letterSpacing: 1,
  },

  // ---- Toast ----
  toast: {
    position: 'absolute',
    bottom: hp(80),
    alignSelf: 'center',
    backgroundColor: C.surface,
    borderRadius: wp(10),
    paddingHorizontal: wp(20),
    paddingVertical: hp(10),
    borderWidth: 1,
    zIndex: 1000,
    elevation: 20,
  },
  toastText: {
    fontSize: wp(13),
    fontWeight: '700',
  },

  // ---- Confetti ----
  confettiContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%' as any,
    overflow: 'hidden',
    pointerEvents: 'none' as any,
  },
  confettiContainerLeft: { left: 0 },
  confettiContainerRight: { right: 0 },
  confettiPiece: {
    position: 'absolute',
    width: 6,
    height: 10,
    borderRadius: 2,
  },

  // ---- Highest hand label ----
  highestHandLabel: {
    color: C.gold,
    fontSize: wp(10),
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    marginVertical: 2,
    textTransform: 'uppercase' as any,
  },

  // ---- Next round countdown ----
  nextRoundContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  nextRoundLabel: {
    color: C.gold,
    fontSize: wp(11),
    fontWeight: '700',
    letterSpacing: 1,
  },
  nextRoundCountdown: {
    color: C.gold,
    fontSize: wp(32),
    fontWeight: '900',
  },

  // ---- History ----
  historyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  historyBtnText: {
    fontSize: wp(18),
  },
  historyRow: {
    backgroundColor: C.surfaceLight,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  historyRound: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '700',
  },
  historyResult: {
    color: C.red,
    fontSize: 12,
    fontWeight: '800',
  },
  historyResultWon: {
    color: C.green,
  },
  historyBetType: {
    color: C.textMuted,
    fontSize: 10,
  },
  historyHand: {
    color: C.gold,
    fontSize: 10,
    fontWeight: '700',
  },

  // ---- Emotes ----
  emoteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  emoteBtnText: {
    fontSize: wp(18),
  },
  emoteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  emoteCell: {
    width: wp(72),
    height: wp(72),
    backgroundColor: C.surfaceLight,
    borderRadius: wp(10),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  emoteEmoji: {
    fontSize: wp(24),
  },
  emoteImg: {
    width: wp(36),
    height: wp(36),
    resizeMode: 'contain',
  },
  emoteLabel: {
    color: C.textSec,
    fontSize: wp(8),
    marginTop: 2,
  },
  emoteCost: {
    color: C.gold,
    fontSize: 8,
    fontWeight: '700',
  },
  emoteFloater: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    zIndex: 100,
  },

  // ---- Asset integration ----
  trophyIcon: {
    width: 14,
    height: 14,
    resizeMode: 'contain' as any,
    marginRight: 2,
  },

  // ---- Missing styles (referenced but not defined) ----
  handBetRowActive: {
    backgroundColor: 'rgba(212,175,55,0.06)',
    borderColor: 'rgba(212,175,55,0.15)',
  },
  handBetRowFlashGreen: {
    backgroundColor: 'rgba(38,217,92,0.08)',
    borderColor: 'rgba(38,217,92,0.2)',
  },
  handBetRowFlashRed: {
    backgroundColor: 'rgba(231,76,60,0.08)',
    borderColor: 'rgba(231,76,60,0.2)',
  },
  handBetCount: {
    color: C.textSec,
    fontSize: 8,
    marginTop: 1,
    opacity: 0.7,
  },
  handBetDeltaUp: {
    color: '#26D95C',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 1,
  },
  handBetDeltaDown: {
    color: '#E74C3C',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 1,
  },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: -12,
    backgroundColor: 'rgba(22,27,34,0.90)',
    borderWidth: 2,
    borderColor: C.gold,
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { boxShadow: '0 0 12px 3px rgba(212,175,55,0.4)' } as any,
    }),
  } as any,
  sliderThumbInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.gold,
  },
  modalOkBtnDisabled: {
    opacity: 0.4,
  },
});
