import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
  Modal,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  colors,
  shadows,
  wp,
  hp,
  fs,
  borderRadius,
  gradients,
  spacing,
} from '../../theme';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';
import PremiumIcon from '../../components/PremiumIcon';

const { width: SW } = Dimensions.get('window');
const WHEEL_SIZE = wp(80);
const NUM_SEGMENTS = 8;
const SEGMENT_ANGLE = 360 / NUM_SEGMENTS;

// ── Segments (must match server) ──────────────────────────────────────────────
const SEGMENTS = [
  { label: '500', reward: 500, color: '#2D5A27' },
  { label: '1K', reward: 1000, color: '#1A3A6C' },
  { label: '2.5K', reward: 2500, color: '#5C2D82' },
  { label: '5K', reward: 5000, color: '#2D5A27' },
  { label: '10K', reward: 10000, color: '#1A3A6C' },
  { label: '25K', reward: 25000, color: '#5C2D82' },
  { label: '50K', reward: 50000, color: '#8B6914' },
  { label: '🎰 JACKPOT', reward: 0, color: '#B8941F' },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface SpinStatus {
  nextFreeSpinAt: string | null;
  freeSpinsRemaining: number;
  jackpotAmount: number;
}

interface SpinResult {
  segmentIndex: number;
  reward: number;
  isJackpot: boolean;
  jackpotAmount?: number;
  newBalance: number;
}

interface HistoryItem {
  segmentIndex: number;
  reward: number;
  isJackpot: boolean;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Wheel Segment Component ───────────────────────────────────────────────────
function WheelSegment({ index }: { index: number }) {
  const seg = SEGMENTS[index];
  const rotation = SEGMENT_ANGLE * index;
  return (
    <View
      style={[
        $.segmentWrap,
        {
          transform: [
            { rotate: `${rotation}deg` },
            { translateY: -WHEEL_SIZE / 4 },
          ],
        },
      ]}
    >
      <View style={[$.segment, { backgroundColor: seg.color }]}>
        <Text style={$.segmentLabel} numberOfLines={1}>
          {seg.label}
        </Text>
      </View>
    </View>
  );
}

// ── Pointer ───────────────────────────────────────────────────────────────────
function Pointer() {
  return (
    <View style={$.pointerWrap}>
      <View style={$.pointer} />
    </View>
  );
}

// ── Result Modal ──────────────────────────────────────────────────────────────
function ResultModal({
  visible,
  result,
  onCollect,
}: {
  visible: boolean;
  result: SpinResult | null;
  onCollect: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible]);

  if (!result) return null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={$.modalOverlay}>
        <Animated.View
          style={[$.modalCard, { transform: [{ scale: scaleAnim }] }]}
        >
          <LinearGradient
            colors={['#1A1F2E', '#0D1117']}
            style={$.modalGradient}
          >
            {result.isJackpot ? (
              <>
                <Text style={$.jackpotWinTitle}>🎰 JACKPOT! 🎰</Text>
                <Text style={$.jackpotWinAmount}>
                  {formatChips(result.jackpotAmount ?? result.reward)}
                </Text>
                <Text style={$.jackpotWinSub}>chips</Text>
              </>
            ) : (
              <>
                <Text style={$.winTitle}>🎉 You Won!</Text>
                <Text style={$.winAmount}>{formatChips(result.reward)}</Text>
                <Text style={$.winSub}>chips</Text>
              </>
            )}

            <TouchableOpacity onPress={onCollect} activeOpacity={0.8}>
              <LinearGradient
                colors={gradients.goldButton as [string, string, ...string[]]}
                style={$.collectBtn}
              >
                <Text style={$.collectBtnText}>Collect</Text>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── History Row ───────────────────────────────────────────────────────────────
function HistoryRow({ item }: { item: HistoryItem }) {
  const d = new Date(item.createdAt);
  return (
    <View style={$.histRow}>
      <Text style={$.histDate}>
        {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
      <Text style={[$.histReward, item.isJackpot && $.histJackpot]}>
        {item.isJackpot ? '🎰 JACKPOT' : `+${formatChips(item.reward)}`}
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════════════════
export default function LuckySpinScreen() {
  const navigation = useNavigation();
  const user = useAuthStore((s) => s.user);

  // State
  const [status, setStatus] = useState<SpinStatus | null>(null);
  const [jackpot, setJackpot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [loading, setLoading] = useState(true);

  const spinAnim = useRef(new Animated.Value(0)).current;
  const currentRotation = useRef(0);
  const jackpotPulse = useRef(new Animated.Value(1)).current;

  const hasFree = (status?.freeSpinsRemaining ?? 0) > 0;

  // ── Jackpot pulse animation ───────────────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(jackpotPulse, {
          toValue: 1.06,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(jackpotPulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ── Fetch data on focus ───────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [s, j, h] = await Promise.all([
        api.getSpinStatus(),
        api.getJackpot(),
        api.getSpinHistory(),
      ]);
      setStatus(s);
      setJackpot(j.amount ?? 0);
      setHistory(h.slice(0, 10));
    } catch (e) {
      console.warn('LuckySpin: failed to load data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // ── Jackpot polling (every 30s) ───────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const j = await api.getJackpot();
        setJackpot(j.amount ?? 0);
      } catch {}
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!status?.nextFreeSpinAt || hasFree) {
      setCountdown('');
      return;
    }
    const tick = () => {
      const ms = new Date(status.nextFreeSpinAt!).getTime() - Date.now();
      if (ms <= 0) {
        setCountdown('');
        loadData(); // refresh — free spin now available
      } else {
        setCountdown(formatCountdown(ms));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, hasFree, loadData]);

  // ── Spin handler ──────────────────────────────────────────────────────────
  const handleSpin = async () => {
    if (spinning || loading) return;
    setSpinning(true);

    try {
      const res: SpinResult = await api.spin(hasFree);

      // Calculate target rotation: at least 5 full spins + offset to land on segment
      // Segment 0 is at the top. The pointer is at top, so segment i center is at
      // i * SEGMENT_ANGLE degrees clockwise.  We spin clockwise, so we need the
      // wheel to stop with segment `res.segmentIndex` under the pointer.
      const targetSegAngle = res.segmentIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
      const fullSpins = 360 * 5;
      // We rotate the wheel, pointer is at top (0°). To land on segment i,
      // the wheel must rotate so that segment i is at top = 360 - targetSegAngle.
      const landAngle = 360 - targetSegAngle;
      const totalRotation = currentRotation.current + fullSpins + landAngle;

      // Normalise for the next spin
      spinAnim.setValue(currentRotation.current);
      Animated.timing(spinAnim, {
        toValue: totalRotation,
        duration: 3200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        currentRotation.current = totalRotation % 360;
        setResult(res);
        setShowResult(true);
        setSpinning(false);
      });
    } catch (e: any) {
      console.warn('Spin failed', e);
      setSpinning(false);
    }
  };

  const handleCollect = () => {
    setShowResult(false);
    setResult(null);
    loadData(); // refresh status & balance
  };

  // ── Wheel rotation interpolation ──────────────────────────────────────────
  const wheelRotate = spinAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={$.root}>
      <LinearGradient
        colors={gradients.background as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={$.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={$.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={$.backBtn}
          >
            <PremiumIcon name="arrow-left" size={22} />
          </TouchableOpacity>
          <Text style={$.title}>Lucky Spin</Text>
          <View style={{ width: wp(10) }} />
        </View>

        {/* Jackpot display */}
        <Animated.View
          style={[$.jackpotBox, { transform: [{ scale: jackpotPulse }] }]}
        >
          <LinearGradient
            colors={['rgba(212,175,55,0.25)', 'rgba(212,175,55,0.05)']}
            style={$.jackpotGradient}
          >
            <Text style={$.jackpotLabel}>💰 JACKPOT</Text>
            <Text style={$.jackpotAmount}>{formatChips(jackpot)}</Text>
          </LinearGradient>
        </Animated.View>

        {/* Wheel */}
        <View style={$.wheelArea}>
          <Pointer />
          <View style={$.wheelRing}>
            <Animated.View
              style={[
                $.wheelInner,
                { transform: [{ rotate: wheelRotate }] },
              ]}
            >
              {SEGMENTS.map((_, i) => (
                <WheelSegment key={i} index={i} />
              ))}
              {/* Center hub */}
              <View style={$.hub}>
                <Text style={$.hubText}>🐂</Text>
              </View>
            </Animated.View>
          </View>
        </View>

        {/* Spin controls */}
        <View style={$.controls}>
          <TouchableOpacity
            onPress={handleSpin}
            disabled={spinning || loading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={
                spinning
                  ? (['#555', '#444'] as [string, string])
                  : (gradients.goldButton as [string, string, ...string[]])
              }
              style={$.spinBtn}
            >
              <Text style={$.spinBtnText}>
                {spinning ? 'Spinning…' : 'SPIN!'}
              </Text>
              {hasFree && !spinning && (
                <View style={$.freeBadge}>
                  <Text style={$.freeBadgeText}>FREE</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <Text style={$.costText}>
            {hasFree
              ? `Free spin! (${status?.freeSpinsRemaining} remaining)`
              : '5,000 chips per spin'}
          </Text>

          {countdown !== '' && (
            <Text style={$.countdown}>
              Next free spin in {countdown}
            </Text>
          )}
        </View>

        {/* History (collapsible) */}
        <TouchableOpacity
          style={$.histToggle}
          onPress={() => setHistoryOpen((o) => !o)}
          activeOpacity={0.7}
        >
          <Text style={$.histToggleText}>
            Spin History {historyOpen ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>

        {historyOpen && (
          <View style={$.histList}>
            {history.length === 0 ? (
              <Text style={$.histEmpty}>No spins yet</Text>
            ) : (
              <FlatList
                data={history}
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item }) => <HistoryRow item={item} />}
                scrollEnabled={false}
              />
            )}
          </View>
        )}
      </ScrollView>

      {/* Result modal */}
      <ResultModal
        visible={showResult}
        result={result}
        onCollect={handleCollect}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════════
const $ = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: hp(4),
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.md,
    paddingTop: hp(6),
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: wp(10),
    height: wp(10),
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fs(22),
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },

  // Jackpot
  jackpotBox: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderGold,
    ...shadows.gold,
  },
  jackpotGradient: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  jackpotLabel: {
    fontSize: fs(13),
    color: colors.primary,
    fontWeight: '600',
    letterSpacing: 2,
  },
  jackpotAmount: {
    fontSize: fs(32),
    fontWeight: '800',
    color: colors.gold,
    marginTop: 2,
  },

  // Wheel area
  wheelArea: {
    marginTop: spacing.lg,
    width: WHEEL_SIZE + wp(6),
    height: WHEEL_SIZE + wp(6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelRing: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    borderRadius: WHEEL_SIZE / 2,
    borderWidth: 4,
    borderColor: colors.primary,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  wheelInner: {
    width: WHEEL_SIZE - 8,
    height: WHEEL_SIZE - 8,
    borderRadius: (WHEEL_SIZE - 8) / 2,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Individual segment
  segmentWrap: {
    position: 'absolute',
    width: WHEEL_SIZE * 0.42,
    height: WHEEL_SIZE / 2,
    alignItems: 'center',
    transformOrigin: 'center bottom',
  },
  segment: {
    width: '100%',
    height: WHEEL_SIZE / 4,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: fs(11),
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
  },

  // Pointer
  pointerWrap: {
    position: 'absolute',
    top: 0,
    zIndex: 10,
    alignItems: 'center',
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: wp(3),
    borderRightWidth: wp(3),
    borderTopWidth: wp(5),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.primary,
  },

  // Hub
  hub: {
    position: 'absolute',
    width: WHEEL_SIZE * 0.2,
    height: WHEEL_SIZE * 0.2,
    borderRadius: WHEEL_SIZE * 0.1,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  hubText: {
    fontSize: fs(20),
  },

  // Controls
  controls: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  spinBtn: {
    width: wp(55),
    height: hp(6.5),
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.gold,
  },
  spinBtnText: {
    fontSize: fs(20),
    fontWeight: '800',
    color: colors.background,
    letterSpacing: 2,
  },
  freeBadge: {
    position: 'absolute',
    top: -hp(1),
    right: -wp(2),
    backgroundColor: colors.green,
    paddingHorizontal: wp(2),
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  freeBadgeText: {
    fontSize: fs(10),
    fontWeight: '800',
    color: '#FFF',
  },
  costText: {
    fontSize: fs(13),
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  countdown: {
    fontSize: fs(12),
    color: colors.primary,
    marginTop: spacing.xs,
  },

  // History
  histToggle: {
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  histToggleText: {
    fontSize: fs(14),
    color: colors.textSecondary,
    fontWeight: '600',
  },
  histList: {
    width: wp(90),
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  histEmpty: {
    fontSize: fs(13),
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  histRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  histDate: {
    fontSize: fs(12),
    color: colors.textSecondary,
  },
  histReward: {
    fontSize: fs(13),
    fontWeight: '700',
    color: colors.green,
  },
  histJackpot: {
    color: colors.gold,
  },

  // Result modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: wp(80),
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderGold,
    ...shadows.gold,
  },
  modalGradient: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  winTitle: {
    fontSize: fs(24),
    fontWeight: '700',
    color: colors.text,
  },
  winAmount: {
    fontSize: fs(40),
    fontWeight: '800',
    color: colors.primary,
    marginTop: spacing.xs,
  },
  winSub: {
    fontSize: fs(14),
    color: colors.textSecondary,
  },
  jackpotWinTitle: {
    fontSize: fs(28),
    fontWeight: '800',
    color: colors.gold,
    textShadowColor: 'rgba(255,215,0,0.6)',
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  jackpotWinAmount: {
    fontSize: fs(46),
    fontWeight: '900',
    color: colors.gold,
    marginTop: spacing.xs,
    textShadowColor: 'rgba(255,215,0,0.5)',
    textShadowRadius: 20,
    textShadowOffset: { width: 0, height: 0 },
  },
  jackpotWinSub: {
    fontSize: fs(16),
    color: colors.primary,
    fontWeight: '600',
  },
  collectBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: wp(12),
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  collectBtnText: {
    fontSize: fs(16),
    fontWeight: '800',
    color: colors.background,
    letterSpacing: 1,
  },
});
