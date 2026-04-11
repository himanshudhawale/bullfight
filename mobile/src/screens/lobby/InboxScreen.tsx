import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Dimensions,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { api } from '../../services/api';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Theme Constants ────────────────────────────────────────────────────────
const C = {
  bg: '#0A0E17',
  card: '#141A26',
  cardBorder: '#1E2738',
  gold: '#D4AF37',
  goldLight: '#E8C84A',
  purple: '#8B5CF6',
  blue: '#3B82F6',
  textPrimary: '#F0E6D3',
  textSecondary: '#8A8B9F',
  green: '#22C55E',
  red: '#EF4444',
};

// ─── Types ──────────────────────────────────────────────────────────────────
type MailType =
  | 'daily_bonus'
  | 'streak_bonus'
  | 'system'
  | 'gift'
  | 'tournament_reward'
  | 'welcome';

interface MailItem {
  id: string;
  mailType: MailType;
  title: string;
  body: string;
  chips?: number;
  claimed: boolean;
  read: boolean;
  createdAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const MAIL_ICONS: Record<MailType, string> = {
  daily_bonus: '🎁',
  streak_bonus: '🔥',
  system: '📢',
  gift: '🎁',
  tournament_reward: '🏆',
  welcome: '🎉',
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `${diffWeek}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ─── Swipeable Row ──────────────────────────────────────────────────────────
interface SwipeRowProps {
  children: React.ReactNode;
  canDelete: boolean;
  onDelete: () => void;
}

function SwipeRow({ children, canDelete, onDelete }: SwipeRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const lastDx = useRef(0);

  if (!canDelete) return <>{children}</>;

  const onMoveShouldSet = (_: any, gesture: any) =>
    Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy);

  const panHandlers = {
    onStartShouldSetResponder: () => false,
    onMoveShouldSetResponder: () => true,
    onResponderMove: (e: any) => {
      const touch = e.nativeEvent;
      if (lastDx.current === 0) lastDx.current = touch.pageX;
      const dx = touch.pageX - lastDx.current;
      if (dx < 0) translateX.setValue(Math.max(dx, -80));
    },
    onResponderRelease: () => {
      const currentVal = (translateX as any).__getValue?.() ?? 0;
      if (currentVal < -40) {
        Animated.spring(translateX, {
          toValue: -80,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
      lastDx.current = 0;
    },
  };

  const handleDelete = () => {
    Animated.timing(translateX, {
      toValue: -SCREEN_W,
      duration: 250,
      useNativeDriver: true,
    }).start(onDelete);
  };

  return (
    <View style={styles.swipeContainer}>
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={handleDelete}
        activeOpacity={0.8}
      >
        <Text style={styles.deleteActionText}>🗑️</Text>
        <Text style={styles.deleteActionLabel}>Delete</Text>
      </TouchableOpacity>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function InboxScreen() {
  const navigation = useNavigation<any>();

  const [mail, setMail] = useState<MailItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);

  // ── Fetch ───────────────────────────────────────────────────────────────
  const fetchMail = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.getMail();
      setMail(res.mail);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      console.error('Failed to fetch mail:', err);
      if (!silent) Alert.alert('Error', 'Could not load your mail.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMail();
  }, [fetchMail]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMail(true);
  }, [fetchMail]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleClaim = useCallback(async (item: MailItem) => {
    try {
      setClaimingId(item.id);
      const res = await api.claimMail(item.id);
      setMail((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, claimed: true, read: true } : m)),
      );
      Alert.alert('Chips Claimed! 💰', `+${formatChips(res.chipsAwarded)} chips`);
    } catch {
      Alert.alert('Error', 'Failed to claim reward.');
    } finally {
      setClaimingId(null);
    }
  }, []);

  const handleClaimAll = useCallback(async () => {
    const claimable = mail.filter((m) => m.chips && m.chips > 0 && !m.claimed);
    if (claimable.length === 0) return;

    try {
      setClaimingAll(true);
      const res = await api.claimAllMail();
      setMail((prev) =>
        prev.map((m) =>
          m.chips && m.chips > 0 && !m.claimed ? { ...m, claimed: true, read: true } : m,
        ),
      );
      Alert.alert('All Rewards Claimed! 🎉', `+${formatChips(res.totalClaimed)} chips`);
    } catch {
      Alert.alert('Error', 'Failed to claim all rewards.');
    } finally {
      setClaimingAll(false);
    }
  }, [mail]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.deleteMail(id);
      setMail((prev) => prev.filter((m) => m.id !== id));
    } catch {
      Alert.alert('Error', 'Failed to delete mail.');
    }
  }, []);

  const handlePress = useCallback(
    async (item: MailItem) => {
      if (!item.read) {
        try {
          await api.markMailRead(item.id);
          setMail((prev) =>
            prev.map((m) => (m.id === item.id ? { ...m, read: true } : m)),
          );
          setUnreadCount((c) => Math.max(0, c - 1));
        } catch {
          // silent fail for read marking
        }
      }
    },
    [],
  );

  // ── Derived ─────────────────────────────────────────────────────────────
  const hasClaimable = mail.some((m) => m.chips && m.chips > 0 && !m.claimed);
  const canDelete = (item: MailItem) =>
    item.claimed || !item.chips || item.chips === 0;

  // ── Render ──────────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: MailItem }) => {
    const icon = MAIL_ICONS[item.mailType] || '📩';
    const isClaiming = claimingId === item.id;

    return (
      <SwipeRow canDelete={canDelete(item)} onDelete={() => handleDelete(item.id)}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => handlePress(item)}
          style={styles.cardOuter}
        >
          <LinearGradient
            colors={['#1A2235', '#141A26']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.card,
              !item.read && styles.cardUnread,
            ]}
          >
            {/* Left accent for unread */}
            {!item.read && (
              <LinearGradient
                colors={[C.gold, C.goldLight]}
                style={styles.unreadBar}
              />
            )}

            <View style={styles.cardContent}>
              {/* Icon */}
              <View style={styles.iconContainer}>
                <LinearGradient
                  colors={['#1E2A3E', '#162030']}
                  style={styles.iconBg}
                >
                  <Text style={styles.iconEmoji}>{icon}</Text>
                </LinearGradient>
              </View>

              {/* Body */}
              <View style={styles.cardBody}>
                <View style={styles.titleRow}>
                  <Text
                    style={[styles.cardTitle, !item.read && styles.cardTitleUnread]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.timestamp}>{relativeTime(item.createdAt)}</Text>
                </View>

                <Text style={styles.cardText} numberOfLines={2}>
                  {item.body}
                </Text>

                {/* Chips + Action */}
                <View style={styles.cardFooter}>
                  {item.chips != null && item.chips > 0 && (
                    <View style={styles.chipsBadge}>
                      <Text style={styles.chipsCoin}>🪙</Text>
                      <Text style={styles.chipsAmount}>
                        +{formatChips(item.chips)}
                      </Text>
                    </View>
                  )}

                  {item.chips != null && item.chips > 0 && !item.claimed && (
                    <TouchableOpacity
                      onPress={() => handleClaim(item)}
                      disabled={isClaiming}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={[C.gold, '#B8941E']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.claimBtn}
                      >
                        {isClaiming ? (
                          <ActivityIndicator size="small" color="#000" />
                        ) : (
                          <Text style={styles.claimBtnText}>CLAIM</Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  )}

                  {item.claimed && (
                    <View style={styles.claimedBadge}>
                      <Text style={styles.claimedText}>✓ Claimed</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </SwipeRow>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyTitle}>No mail yet</Text>
        <Text style={styles.emptySubtitle}>
          Rewards and messages will show up here
        </Text>
      </View>
    );
  };

  const renderHeader = () => {
    if (!hasClaimable) return null;
    return (
      <TouchableOpacity
        onPress={handleClaimAll}
        disabled={claimingAll}
        activeOpacity={0.85}
        style={styles.claimAllOuter}
      >
        <LinearGradient
          colors={[C.gold, '#B8941E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.claimAllBtn}
        >
          {claimingAll ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Text style={styles.claimAllIcon}>💰</Text>
              <Text style={styles.claimAllText}>CLAIM ALL REWARDS</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#111827', '#0A0E17']}
        style={styles.header}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>INBOX</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </View>

        {/* Spacer for symmetry */}
        <View style={styles.backBtn} />
      </LinearGradient>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {loading && mail.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.gold} />
          <Text style={styles.loadingText}>Loading mail…</Text>
        </View>
      ) : (
        <FlatList
          data={mail}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.gold}
              colors={[C.gold]}
              progressBackgroundColor={C.card}
            />
          }
        />
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 32,
    color: C.textPrimary,
    fontWeight: '300',
    marginTop: -2,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: 2,
  },
  badge: {
    backgroundColor: C.red,
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: C.textSecondary,
    fontSize: 14,
  },

  // List
  listContent: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexGrow: 1,
  },

  // Claim All
  claimAllOuter: {
    marginBottom: 14,
  },
  claimAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  claimAllIcon: {
    fontSize: 18,
  },
  claimAllText: {
    color: '#0A0E17',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // Swipe
  swipeContainer: {
    marginBottom: 10,
    position: 'relative',
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: C.red,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  deleteActionText: {
    fontSize: 20,
  },
  deleteActionLabel: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // Card
  cardOuter: {
    marginBottom: 10,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  cardUnread: {
    borderColor: 'rgba(212, 175, 55, 0.25)',
  },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
  },

  // Icon
  iconContainer: {
    alignSelf: 'flex-start',
  },
  iconBg: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  iconEmoji: {
    fontSize: 22,
  },

  // Card body
  cardBody: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textSecondary,
    flex: 1,
  },
  cardTitleUnread: {
    color: C.textPrimary,
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 11,
    color: C.textSecondary,
  },
  cardText: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },

  // Chips
  chipsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.2)',
  },
  chipsCoin: {
    fontSize: 14,
  },
  chipsAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: C.gold,
  },

  // Claim button
  claimBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimBtnText: {
    color: '#0A0E17',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Claimed badge
  claimedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
  },
  claimedText: {
    color: C.green,
    fontSize: 12,
    fontWeight: '700',
  },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    maxWidth: 240,
  },
});
