import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  Easing,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import PremiumIcon from '../../components/PremiumIcon';
import { useAuthStore } from '../../stores/authStore';
import {
  colors,
  shadows,
  wp,
  hp,
  fs,
  borderRadius,
  gradients,
  spacing,
  glassStyle,
} from '../../theme';

/* ── Types ─────────────────────────────────────────────── */

interface Mission {
  id: string;
  templateId: string;
  title: string;
  progress: number;
  target: number;
  reward: number;
  claimed: boolean;
  type: 'daily' | 'weekly';
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  reward: number;
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;
  target?: number;
}

type Tab = 'daily' | 'weekly' | 'achievements';

/* ── API helpers ───────────────────────────────────────── */

function getBaseUrl() {
  if (!__DEV__) return 'https://bullfight-api.azurecontainerapps.io/api';
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:3000/api`;
  return 'http://localhost:3000/api';
}
const API = getBaseUrl();

async function authGet(path: string) {
  const token = await AsyncStorage.getItem('accessToken');
  return axios.get(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
async function authPost(path: string, body?: any) {
  const token = await AsyncStorage.getItem('accessToken');
  return axios.post(`${API}${path}`, body, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/* ── Countdown helpers ─────────────────────────────────── */

function msUntilNextMidnightUTC(): number {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return next.getTime() - now.getTime();
}

function msUntilNextMondayMidnightUTC(): number {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const daysUntilMon = day === 0 ? 1 : 8 - day;
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMon),
  );
  return next.getTime() - now.getTime();
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function useCountdown(getRemainingMs: () => number) {
  const [remaining, setRemaining] = useState(getRemainingMs);
  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemainingMs()), 1000);
    return () => clearInterval(id);
  }, [getRemainingMs]);
  return formatMs(remaining);
}

/* ── Animated progress bar ─────────────────────────────── */

function ProgressBar({ ratio, color = colors.blue }: { ratio: number; color?: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(ratio, 1),
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [ratio]);

  const width = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={$.progressTrack}>
      <Animated.View style={[$.progressFill, { width, backgroundColor: color }]} />
    </View>
  );
}

/* ── Claim button with pulse ───────────────────────────── */

function ClaimButton({ onPress, loading }: { onPress: () => void; loading: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Pressable onPress={onPress} disabled={loading}>
        <LinearGradient
          colors={gradients.goldButton as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={$.claimBtn}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={$.claimBtnText}>Claim</Text>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

/* ── Mission card ──────────────────────────────────────── */

function MissionCard({
  mission,
  onClaim,
  claimingId,
}: {
  mission: Mission;
  onClaim: (id: string) => void;
  claimingId: string | null;
}) {
  const done = mission.progress >= mission.target;
  const icon = mission.type === 'daily' ? 'star' : 'trophy';

  return (
    <View style={[$.glassCard, shadows.card]}>
      <View style={$.cardRow}>
        <View style={$.iconWrap}>
          <PremiumIcon name={icon} size={22} />
        </View>
        <View style={$.cardBody}>
          <Text style={$.cardTitle}>{mission.title}</Text>
          <ProgressBar ratio={mission.target ? mission.progress / mission.target : 0} />
          <Text style={$.progressLabel}>
            {mission.progress}/{mission.target}
          </Text>
        </View>
        <View style={$.rewardCol}>
          <View style={$.chipBadge}>
            <PremiumIcon name="chip" size={14} />
            <Text style={$.chipText}>{mission.reward}</Text>
          </View>
          {mission.claimed ? (
            <View style={$.claimedBadge}>
              <Text style={$.claimedText}>Claimed ✓</Text>
            </View>
          ) : done ? (
            <ClaimButton
              onPress={() => onClaim(mission.id)}
              loading={claimingId === mission.id}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

/* ── Achievement card ──────────────────────────────────── */

function AchievementCard({ ach }: { ach: Achievement }) {
  const hasProgress = typeof ach.progress === 'number' && typeof ach.target === 'number';
  return (
    <View
      style={[
        $.glassCard,
        shadows.card,
        !ach.unlocked && $.cardDimmed,
        ach.unlocked && $.cardGoldBorder,
      ]}
    >
      <View style={$.cardRow}>
        <View style={$.iconWrap}>
          <PremiumIcon name={ach.unlocked ? 'trophy' : 'lock'} size={22} />
        </View>
        <View style={$.cardBody}>
          <Text style={[$.cardTitle, !ach.unlocked && $.textDimmed]}>{ach.title}</Text>
          <Text style={[$.achDesc, !ach.unlocked && $.textDimmed]}>{ach.description}</Text>
          {hasProgress && (
            <>
              <ProgressBar
                ratio={ach.target ? (ach.progress ?? 0) / ach.target : 0}
                color={ach.unlocked ? colors.primary : colors.purple}
              />
              <Text style={$.progressLabel}>
                {ach.progress}/{ach.target}
              </Text>
            </>
          )}
          {ach.unlocked && ach.unlockedAt && (
            <Text style={$.unlockDate}>
              Unlocked {new Date(ach.unlockedAt).toLocaleDateString()}
            </Text>
          )}
        </View>
        <View style={$.rewardCol}>
          <View style={$.chipBadge}>
            <PremiumIcon name="chip" size={14} />
            <Text style={$.chipText}>{ach.reward}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ── Main screen ───────────────────────────────────────── */

export default function MissionsScreen() {
  const loadUser = useAuthStore((s) => s.loadUser);
  const [tab, setTab] = useState<Tab>('daily');
  const [daily, setDaily] = useState<Mission[]>([]);
  const [weekly, setWeekly] = useState<Mission[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const dailyCountdown = useCountdown(msUntilNextMidnightUTC);
  const weeklyCountdown = useCountdown(msUntilNextMondayMidnightUTC);

  const fetchData = useCallback(async () => {
    try {
      const [missionsRes, achRes] = await Promise.all([
        authGet('/missions'),
        authGet('/achievements'),
      ]);
      setDaily(missionsRes.data.daily ?? []);
      setWeekly(missionsRes.data.weekly ?? []);
      setAchievements(achRes.data ?? []);
    } catch {
      // silently fail – user sees empty state
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    })();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleClaim = useCallback(
    async (id: string) => {
      setClaimingId(id);
      try {
        await authPost(`/missions/${id}/claim`);
        // Update local state optimistically
        const update = (m: Mission) => (m.id === id ? { ...m, claimed: true } : m);
        setDaily((prev) => prev.map(update));
        setWeekly((prev) => prev.map(update));
        loadUser(); // refresh chip balance
      } catch {
        // ignore
      } finally {
        setClaimingId(null);
      }
    },
    [loadUser],
  );

  /* ── Derived counts ── */
  const dailyDone = daily.filter((m) => m.claimed).length;
  const weeklyDone = weekly.filter((m) => m.claimed).length;

  /* ── Tab selector ── */
  const tabs: { key: Tab; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'achievements', label: 'Achievements' },
  ];

  if (loading) {
    return (
      <View style={$.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={$.root}>
      {/* Header */}
      <Text style={$.screenTitle}>Missions</Text>

      {/* Tabs */}
      <View style={$.tabRow}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[$.tabBtn, tab === t.key && $.tabBtnActive]}
          >
            <Text style={[$.tabLabel, tab === t.key && $.tabLabelActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={$.scroll}
        contentContainerStyle={$.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Daily tab ── */}
        {tab === 'daily' && (
          <>
            <View style={$.timerRow}>
              <PremiumIcon name="clock" size={16} />
              <Text style={$.timerText}>Resets in {dailyCountdown}</Text>
            </View>
            {daily.length === 0 ? (
              <Text style={$.emptyText}>No daily missions available.</Text>
            ) : (
              daily.map((m) => (
                <MissionCard
                  key={m.id}
                  mission={m}
                  onClaim={handleClaim}
                  claimingId={claimingId}
                />
              ))
            )}
            <View style={$.summaryRow}>
              <Text style={$.summaryText}>
                Daily Progress: {dailyDone}/{daily.length} completed
              </Text>
            </View>
          </>
        )}

        {/* ── Weekly tab ── */}
        {tab === 'weekly' && (
          <>
            <View style={$.timerRow}>
              <PremiumIcon name="clock" size={16} />
              <Text style={$.timerText}>Resets in {weeklyCountdown}</Text>
            </View>
            {weekly.length === 0 ? (
              <Text style={$.emptyText}>No weekly missions available.</Text>
            ) : (
              weekly.map((m) => (
                <MissionCard
                  key={m.id}
                  mission={m}
                  onClaim={handleClaim}
                  claimingId={claimingId}
                />
              ))
            )}
            <View style={$.summaryRow}>
              <Text style={$.summaryText}>
                Weekly Progress: {weeklyDone}/{weekly.length} completed
              </Text>
            </View>
          </>
        )}

        {/* ── Achievements tab ── */}
        {tab === 'achievements' && (
          <>
            {achievements.length === 0 ? (
              <Text style={$.emptyText}>No achievements yet.</Text>
            ) : (
              achievements.map((a) => <AchievementCard key={a.id} ach={a} />)
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────── */

const $ = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: hp(6),
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontSize: fs(24),
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  /* Tabs */
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.glass,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  tabBtnActive: {
    backgroundColor: colors.surfaceLight,
  },
  tabLabel: {
    fontSize: fs(13),
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: colors.primary,
  },

  /* Scroll */
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: hp(4),
  },

  /* Timer */
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  timerText: {
    fontSize: fs(13),
    color: colors.textSecondary,
  },

  /* Glass card */
  glassCard: {
    ...glassStyle.card,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  cardDimmed: { opacity: 0.5 },
  cardGoldBorder: {
    borderColor: colors.borderGold,
    borderWidth: 1,
  },

  /* Card layout */
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: wp(10),
    height: wp(10),
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  cardBody: { flex: 1, marginRight: spacing.sm },
  cardTitle: {
    fontSize: fs(14),
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  achDesc: {
    fontSize: fs(11),
    color: colors.textSecondary,
    marginBottom: 6,
  },

  /* Progress bar */
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceLight,
    overflow: 'hidden',
    marginBottom: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: fs(10),
    color: colors.textMuted,
  },

  /* Reward / claim */
  rewardCol: { alignItems: 'center', minWidth: wp(16) },
  chipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  chipText: {
    fontSize: fs(13),
    fontWeight: '700',
    color: colors.primary,
  },
  claimBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  claimBtnText: {
    fontSize: fs(12),
    fontWeight: '700',
    color: colors.background,
  },
  claimedBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  claimedText: {
    fontSize: fs(11),
    color: colors.success,
    fontWeight: '600',
  },

  /* Unlock date */
  unlockDate: {
    fontSize: fs(10),
    color: colors.textMuted,
    marginTop: 2,
  },

  /* Summary */
  summaryRow: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: fs(13),
    fontWeight: '600',
    color: colors.textSecondary,
  },

  /* Text dimmed */
  textDimmed: { color: colors.textMuted },
  emptyText: {
    fontSize: fs(13),
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
