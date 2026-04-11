import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Animated,
  Platform,
  Image,
  Dimensions,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows, wp, hp, fs, borderRadius } from '../../theme';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import { ChatMessage } from '../../../../shared/types';
import PremiumIcon, { getIconSymbol } from '../../components/PremiumIcon';

const BG_FRIENDS = require('../../../assets/game/bg_friends.png');
const { width: SW, height: SH } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Friend {
  id: string;
  friendId: string;
  displayName: string;
  onlineStatus: 'online' | 'in_game' | 'away' | 'offline';
  currentTier?: string | null;
  vipLevel: number;
  chips: number;
}

interface PendingRequest {
  id: string;
  fromUserId: string;
  fromDisplayName?: string;
  displayName?: string;
}

interface SearchResult {
  id: string;
  displayName: string;
  isFriend?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_COLOR: Record<string, string> = {
  online: '#4ADE80',
  in_game: '#4ADE80',
  away: '#FB923C',
  offline: '#484F58',
};
const STATUS_ORDER: Record<string, number> = { in_game: 0, online: 1, away: 2, offline: 3 };

function formatChips(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
}

// ---------------------------------------------------------------------------
// ActionBtn
// ---------------------------------------------------------------------------
function ActionBtn({ label, icon, variant, onPress, disabled }: {
  label: string;
  icon: string;
  variant: 'primary' | 'glass';
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => { if (!disabled) Animated.spring(scale, { toValue: 0.92, useNativeDriver: true }).start(); };
  const pressOut = () => { if (!disabled) Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start(); };

  if (variant === 'primary') {
    return (
      <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.45 : 1 }}>
        <TouchableOpacity activeOpacity={1} onPressIn={pressIn} onPressOut={pressOut} onPress={disabled ? undefined : onPress} disabled={disabled}>
          <LinearGradient
            colors={disabled ? ['#555', '#444'] as [string, string] : ['#D4AF37', '#B8941F'] as [string, string]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.actionBtnPrimary}
          >
            <PremiumIcon name={icon} size={11} />
            <Text style={s.actionBtnTextPrimary}>{label}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity activeOpacity={1} onPressIn={pressIn} onPressOut={pressOut} onPress={onPress} style={s.actionBtnGlass}>
        <PremiumIcon name={icon} size={11} />
        <Text style={s.actionBtnTextGlass}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// TabButton
// ---------------------------------------------------------------------------
function TabButton({ label, count, active, onPress }: {
  label: string; count?: number; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[s.tab, active && s.tabActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.tabText, active && s.tabTextActive]}>
        {label}
        {count !== undefined && <Text style={active ? s.tabCountActive : s.tabCount}> {count}</Text>}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Chat Modal
// ---------------------------------------------------------------------------
function ChatModal({ visible, friend, onClose }: {
  visible: boolean; friend: Friend | null; onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const currentUser = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!visible || !friend) return;
    setMessages([]);
    socketService.getChatHistory(friend.friendId);

    const onHistory = (data: { messages: ChatMessage[] }) => {
      setMessages(data.messages ?? []);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    };
    const onMessage = (msg: ChatMessage) => {
      if (msg.fromUserId === friend.friendId || msg.toUserId === friend.friendId) {
        setMessages((prev) => [...prev, msg]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    };

    socketService.on('chat_history', onHistory);
    socketService.on('message_received', onMessage);
    return () => {
      socketService.off('chat_history', onHistory);
      socketService.off('message_received', onMessage);
    };
  }, [visible, friend]);

  const send = () => {
    if (!text.trim() || !friend) return;
    socketService.sendMessage(friend.friendId, text.trim());
    const outgoing: ChatMessage = {
      id: Date.now().toString(),
      fromUserId: currentUser?.id ?? '',
      toUserId: friend.friendId,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, outgoing]);
    setText('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.modalContainer}>
          {/* Header */}
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{friend?.displayName ?? 'Chat'}</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
          </View>
          {/* Messages */}
          <ScrollView ref={scrollRef} style={s.modalMessages} contentContainerStyle={{ paddingVertical: hp(8) }}>
            {messages.map((m) => {
              const isMine = m.fromUserId === currentUser?.id;
              return (
                <View key={m.id} style={[s.msgRow, isMine ? s.msgRowRight : s.msgRowLeft]}>
                  <View style={[s.msgBubble, isMine ? s.msgBubbleMine : s.msgBubbleTheirs]}>
                    <Text style={s.msgText}>{m.text}</Text>
                    <Text style={s.msgTime}>{formatTime(m.createdAt)}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          {/* Input */}
          <View style={s.modalInputRow}>
            <TextInput
              style={s.modalInput}
              value={text}
              onChangeText={setText}
              placeholder="Type a message..."
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={send} style={s.modalSendBtn}>
              <Text style={s.modalSendText}>SEND</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export default function FriendsScreen() {
  const nav = useNavigation<any>();
  const [tab, setTab] = useState<'friends' | 'pending' | 'search' | 'mail'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Mail
  const [mailItems, setMailItems] = useState<any[]>([]);
  const [unreadMail, setUnreadMail] = useState(0);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chat
  const [chatFriend, setChatFriend] = useState<Friend | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // ---- Data loading ----
  const loadData = useCallback(async () => {
    try {
      const [friendsData, pendingData, mailData] = await Promise.all([
        api.getFriendsList(),
        api.getPendingRequests(),
        api.getMail().catch(() => ({ mail: [], unreadCount: 0 })),
      ]);
      setFriends(friendsData ?? []);
      setPending(pendingData ?? []);
      setMailItems(mailData.mail ?? []);
      setUnreadMail(mailData.unreadCount ?? 0);
    } catch (e) {
      console.warn('Failed to load friends:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // Sort friends: in_game > online > away > offline
  const sorted = [...friends].sort(
    (a, b) => (STATUS_ORDER[a.onlineStatus] ?? 9) - (STATUS_ORDER[b.onlineStatus] ?? 9),
  );
  const onlineCount = friends.filter((f) => f.onlineStatus !== 'offline').length;

  // ---- Search debounce ----
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await api.searchUsers(searchQuery.trim());
        const friendIds = new Set(friends.map((f) => f.friendId));
        setSearchResults(
          (data ?? []).map((u: any) => ({ ...u, isFriend: friendIds.has(u.id) })),
        );
      } catch { setSearchResults([]); }
    }, 500);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, friends]);

  // ---- Accept / Decline ----
  const acceptRequest = async (req: PendingRequest) => {
    try {
      await api.acceptFriendRequest(req.id);
      loadData();
    } catch { Alert.alert('Error', 'Could not accept request'); }
  };
  const declineRequest = (req: PendingRequest) => {
    setPending((prev) => prev.filter((p) => p.id !== req.id));
  };

  // ---- Send friend request ----
  const addFriend = async (userId: string) => {
    try {
      await api.sendFriendRequest(userId);
      Alert.alert('Request Sent', 'Friend request sent!');
    } catch { Alert.alert('Error', 'Could not send request'); }
  };

  // ---- Open chat ----
  const openChat = (friend: Friend) => {
    setChatFriend(friend);
    setChatOpen(true);
  };

  // ---- Render helpers ----
  const renderFriend = ({ item }: { item: Friend }) => {
    const statusColor = STATUS_COLOR[item.onlineStatus] ?? STATUS_COLOR.offline;
    const isInGame = item.onlineStatus === 'in_game';
    return (
      <View style={s.card}>
        <View style={s.cardContent}>
          {/* Avatar */}
          <View style={s.avatarWrap}>
            <View style={[s.avatarCircle, { borderColor: statusColor }]}>
              <Text style={s.avatarLetter}>{(item.displayName || '?')[0].toUpperCase()}</Text>
            </View>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          </View>
          {/* Info */}
          <View style={s.infoBlock}>
            <Text style={s.friendName} numberOfLines={1}>{item.displayName}</Text>
            <Text style={[s.statusLabel, { color: statusColor }]}>
              {isInGame ? (getIconSymbol('ingame') + ' In Game') : item.onlineStatus === 'online' ? (getIconSymbol('online') + ' Online') : item.onlineStatus === 'away' ? (getIconSymbol('away') + ' Away') : (getIconSymbol('offline') + ' Offline')}
            </Text>
            <Text style={s.chipText}>{formatChips(item.chips)}</Text>
          </View>
          {/* Actions */}
          <View style={s.actions}>
            {isInGame && item.currentTier && (
              <>
                <ActionBtn icon="⏭" label="JOIN" variant="primary" onPress={() => nav.navigate('Game', { tier: item.currentTier })} />
                <ActionBtn icon="eye" label="WATCH" variant="glass" onPress={() => nav.navigate('Game', { tier: item.currentTier })} />
              </>
            )}
            {item.onlineStatus === 'online' && (
              <ActionBtn icon="sword" label="INVITE" variant="primary" onPress={() => Alert.alert('Invite sent!')} />
            )}
            <ActionBtn icon="chat" label="MSG" variant="glass" onPress={() => openChat(item)} />
          </View>
        </View>
      </View>
    );
  };

  const renderPending = ({ item }: { item: PendingRequest }) => (
    <View style={s.card}>
      <View style={s.cardContent}>
        <View style={s.avatarWrap}>
          <View style={[s.avatarCircle, { borderColor: colors.primary }]}>
            <Text style={s.avatarLetter}>{((item.fromDisplayName ?? item.displayName) || '?')[0].toUpperCase()}</Text>
          </View>
        </View>
        <View style={s.infoBlock}>
          <Text style={s.friendName} numberOfLines={1}>{item.fromDisplayName ?? item.displayName ?? 'Unknown'}</Text>
          <Text style={s.statusLabel}>Friend request</Text>
        </View>
        <View style={s.actions}>
          <ActionBtn icon="check" label="ACCEPT" variant="primary" onPress={() => acceptRequest(item)} />
          <ActionBtn icon="cross" label="DECLINE" variant="glass" onPress={() => declineRequest(item)} />
        </View>
      </View>
    </View>
  );

  const renderSearchResult = ({ item }: { item: SearchResult }) => (
    <View style={s.card}>
      <View style={s.cardContent}>
        <View style={s.avatarWrap}>
          <View style={[s.avatarCircle, { borderColor: colors.textMuted }]}>
            <Text style={s.avatarLetter}>{(item.displayName || '?')[0].toUpperCase()}</Text>
          </View>
        </View>
        <View style={s.infoBlock}>
          <Text style={s.friendName} numberOfLines={1}>{item.displayName}</Text>
        </View>
        <View style={s.actions}>
          {item.isFriend ? (
            <View style={s.friendsBadge}><Text style={s.friendsBadgeText}>FRIENDS</Text></View>
          ) : (
            <ActionBtn icon="add" label="ADD" variant="primary" onPress={() => addFriend(item.id)} />
          )}
        </View>
      </View>
    </View>
  );

  // ---- Mail helpers ----
  const MAIL_ICONS: Record<string, string> = {
    daily_bonus: '🎁', streak_bonus: '🔥', system: '📢',
    gift: '🎁', tournament_reward: '🏆', welcome: '🎉',
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return days === 1 ? 'Yesterday' : `${days}d ago`;
  };

  const handleClaimMail = async (id: string) => {
    setClaimingId(id);
    try {
      await api.claimMail(id);
      setMailItems(prev => prev.map(m => m.id === id ? { ...m, claimed: true } : m));
      setUnreadMail(prev => Math.max(0, prev - 1));
    } catch { Alert.alert('Error', 'Could not claim reward.'); }
    finally { setClaimingId(null); }
  };

  const handleClaimAll = async () => {
    try {
      await api.claimAllMail();
      setMailItems(prev => prev.map(m => m.chips && !m.claimed ? { ...m, claimed: true } : m));
      setUnreadMail(0);
      Alert.alert('✅ All Claimed', 'All rewards have been collected!');
    } catch { Alert.alert('Error', 'Could not claim all.'); }
  };

  const handleDeleteMail = async (id: string) => {
    try {
      await api.deleteMail(id);
      setMailItems(prev => prev.filter(m => m.id !== id));
    } catch { Alert.alert('Error', 'Could not delete mail.'); }
  };

  const unclaimedCount = mailItems.filter(m => m.chips > 0 && !m.claimed).length;

  const renderMailItem = ({ item }: { item: any }) => (
    <View style={[s.card, !item.read && { borderLeftWidth: 3, borderLeftColor: colors.primary }]}>
      <View style={s.cardContent}>
        <View style={[s.avatarCircle, { borderColor: 'rgba(212,175,55,0.3)' }]}>
          <Text style={{ fontSize: fs(20) }}>{MAIL_ICONS[item.mailType] || '📩'}</Text>
        </View>
        <View style={[s.infoBlock, { marginLeft: wp(12) }]}>
          <Text style={s.friendName}>{item.title}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: fs(12), marginTop: hp(2) }} numberOfLines={2}>
            {item.body}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: hp(4), gap: wp(8) }}>
            {item.chips > 0 && (
              <Text style={{ color: colors.primary, fontSize: fs(13), fontWeight: '800' }}>
                💰 {item.chips.toLocaleString()}
              </Text>
            )}
            <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: fs(10) }}>{timeAgo(item.createdAt)}</Text>
          </View>
        </View>
        <View style={s.actions}>
          {item.chips > 0 && !item.claimed ? (
            <TouchableOpacity
              onPress={() => handleClaimMail(item.id)}
              disabled={claimingId === item.id}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={claimingId === item.id ? ['#555', '#444'] as [string, string] : ['#E8C84A', '#D4AF37'] as [string, string]}
                style={{ borderRadius: 20, paddingHorizontal: wp(14), paddingVertical: hp(8) }}
              >
                <Text style={{ color: '#0A0E1A', fontSize: fs(11), fontWeight: '900', letterSpacing: 1 }}>
                  {claimingId === item.id ? '...' : 'CLAIM'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : item.claimed ? (
            <View style={{ backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 12, paddingHorizontal: wp(10), paddingVertical: hp(4) }}>
              <Text style={{ color: '#22C55E', fontSize: fs(10), fontWeight: '700' }}>✓ Claimed</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={() => handleDeleteMail(item.id)} hitSlop={8}>
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: fs(18) }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={s.emptyState}>
      <PremiumIcon name={tab === 'mail' ? 'inbox' : tab === 'pending' ? 'inbox' : tab === 'search' ? 'search' : 'users'} size={40} />
      <Text style={s.emptyTitle}>
        {tab === 'mail' ? 'No Mail Yet' : tab === 'pending' ? 'No Pending Requests' : tab === 'search' ? 'Find New Players' : 'No Friends Yet'}
      </Text>
      <Text style={s.emptyText}>
        {tab === 'mail' ? 'Daily bonuses and rewards will appear here' : tab === 'pending' ? 'Friend requests will appear here' : tab === 'search' ? 'Search by username to add friends' : 'Invite players to build your crew'}
      </Text>
    </View>
  );

  const listData = tab === 'friends' ? sorted : tab === 'pending' ? pending : tab === 'mail' ? mailItems : searchResults;
  const renderItem = tab === 'friends' ? renderFriend : tab === 'pending' ? renderPending : tab === 'mail' ? renderMailItem : renderSearchResult;

  return (
    <View style={s.container}>
      <Image source={BG_FRIENDS} style={s.bgImage} resizeMode="cover" />

      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12}>
            <Text style={{ color: colors.primary, fontSize: 22, fontWeight: '700' }}>‹</Text>
          </TouchableOpacity>
          <View>
            <Text style={s.headerTitle}>YOUR CREW</Text>
            <Text style={s.headerSub}>
              <Text style={s.headerOnline}>{onlineCount}</Text> in the arena now
            </Text>
          </View>
        </View>
        <View style={s.headerBadge}>
          <Text style={s.headerBadgeText}>{friends.length}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        <TabButton label="Crew" count={friends.length} active={tab === 'friends'} onPress={() => setTab('friends')} />
        <TabButton label="Requests" count={pending.length} active={tab === 'pending'} onPress={() => setTab('pending')} />
        <TabButton label="Mail" count={unreadMail || undefined} active={tab === 'mail'} onPress={() => setTab('mail')} />
        <TabButton label="Find" active={tab === 'search'} onPress={() => setTab('search')} />
      </View>

      {/* Claim All banner */}
      {tab === 'mail' && unclaimedCount > 0 && (
        <TouchableOpacity onPress={handleClaimAll} activeOpacity={0.8}>
          <LinearGradient
            colors={['rgba(212,175,55,0.15)', 'rgba(212,175,55,0.05)'] as [string, string]}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: hp(10), borderRadius: 12, marginBottom: hp(12), borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)' }}
          >
            <Text style={{ color: colors.primary, fontSize: fs(13), fontWeight: '800', letterSpacing: 1 }}>
              CLAIM ALL ({unclaimedCount})
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Search Input */}
      {tab === 'search' && (
        <View style={s.searchWrap}>
          <PremiumIcon name="search" size={16} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by username..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}

      {/* List */}
      <FlatList
        data={listData as any[]}
        keyExtractor={(item) => item.id}
        renderItem={renderItem as any}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.list}
        ListEmptyComponent={loading ? null : renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />

      {/* Chat Modal */}
      <ChatModal visible={chatOpen} friend={chatFriend} onClose={() => setChatOpen(false)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: wp(16), position: 'relative', overflow: 'hidden' },
  bgImage: { ...StyleSheet.absoluteFillObject, width: SW, height: SH } as any,
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: hp(12), paddingTop: hp(28) },
  headerTitle: { color: '#FFF', fontSize: fs(28), fontWeight: '900', letterSpacing: 4, textShadowColor: 'rgba(212,175,55,0.4)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20 },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: fs(12), fontWeight: '600', letterSpacing: 1, marginTop: hp(4) },
  headerOnline: { color: '#4ADE80', fontWeight: '800' },
  headerBadge: { backgroundColor: 'rgba(212,175,55,0.12)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.25)', borderRadius: borderRadius.full, paddingHorizontal: wp(14), paddingVertical: hp(6) },
  headerBadgeText: { color: colors.primary, fontSize: fs(15), fontWeight: '900' },
  tabRow: { flexDirection: 'row', gap: wp(4), marginBottom: hp(16), borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: hp(12) },
  tabActive: { backgroundColor: 'rgba(212,175,55,0.08)', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: fs(12), fontWeight: '700', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase' as any },
  tabTextActive: { color: '#FFF' },
  tabCount: { color: 'rgba(255,255,255,0.25)', fontWeight: '600' },
  tabCountActive: { color: colors.primary },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(22,27,34,0.7)', borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, paddingHorizontal: wp(14), marginBottom: hp(16) },
  searchIcon: { fontSize: fs(16), marginRight: wp(8) },
  searchInput: { flex: 1, paddingVertical: hp(12), fontSize: fs(14), color: colors.text },
  list: { paddingBottom: hp(40), gap: hp(10) },
  card: { backgroundColor: 'rgba(22,27,34,0.75)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.15)', borderRadius: borderRadius.lg, ...shadows.card as object },
  cardContent: { flexDirection: 'row', alignItems: 'center', padding: wp(14) },
  avatarWrap: { position: 'relative', marginRight: wp(14) },
  avatarCircle: { width: wp(48), height: wp(48), borderRadius: wp(24), borderWidth: 2, backgroundColor: 'rgba(10,14,26,0.9)', justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { fontSize: fs(20), fontWeight: '800', color: 'rgba(240,246,252,0.6)' },
  statusDot: { position: 'absolute', bottom: 0, right: 0, width: wp(12), height: wp(12), borderRadius: wp(6), borderWidth: 2, borderColor: colors.background },
  infoBlock: { flex: 1 },
  friendName: { color: colors.text, fontSize: fs(16), fontWeight: '800', marginBottom: hp(2) },
  statusLabel: { fontSize: fs(12), fontWeight: '600', marginBottom: hp(2) },
  chipText: { color: colors.textMuted, fontSize: fs(11), fontWeight: '600' },
  actions: { marginLeft: wp(8), gap: hp(6), alignItems: 'flex-end' as const },
  actionBtnPrimary: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: hp(7), paddingHorizontal: wp(14), borderRadius: 20, gap: wp(4) },
  actionBtnGlass: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: hp(6), paddingHorizontal: wp(12), borderRadius: 20, gap: wp(4), backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  actionBtnIcon: { fontSize: fs(11) },
  actionBtnTextPrimary: { color: '#FFF', fontSize: fs(9), fontWeight: '800' as const, letterSpacing: 1.5 },
  actionBtnTextGlass: { color: 'rgba(255,255,255,0.7)', fontSize: fs(9), fontWeight: '700' as const, letterSpacing: 1 },
  friendsBadge: { backgroundColor: 'rgba(212,175,55,0.15)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)', borderRadius: 20, paddingVertical: hp(6), paddingHorizontal: wp(12) },
  friendsBadgeText: { color: colors.primary, fontSize: fs(9), fontWeight: '800', letterSpacing: 1 },
  emptyState: { alignItems: 'center', paddingVertical: hp(60) },
  emptyIcon: { fontSize: fs(40), marginBottom: hp(12) },
  emptyTitle: { color: colors.text, fontSize: fs(18), fontWeight: '700', marginBottom: hp(6) },
  emptyText: { color: colors.textMuted, fontSize: fs(13), textAlign: 'center', maxWidth: wp(240), lineHeight: fs(18) },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContainer: { height: '70%', backgroundColor: 'rgba(16,20,30,0.97)', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: 'rgba(212,175,55,0.15)' } as any,
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: wp(20), paddingVertical: hp(16), borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  modalTitle: { color: '#FFF', fontSize: fs(18), fontWeight: '800' },
  modalClose: { color: colors.textMuted, fontSize: fs(22) },
  modalMessages: { flex: 1, paddingHorizontal: wp(16) },
  msgRow: { marginBottom: hp(8) },
  msgRowRight: { alignItems: 'flex-end' },
  msgRowLeft: { alignItems: 'flex-start' },
  msgBubble: { maxWidth: '75%', paddingVertical: hp(8), paddingHorizontal: wp(14), borderRadius: 16 } as any,
  msgBubbleMine: { backgroundColor: 'rgba(212,175,55,0.2)', borderBottomRightRadius: 4 },
  msgBubbleTheirs: { backgroundColor: 'rgba(255,255,255,0.08)', borderBottomLeftRadius: 4 },
  msgText: { color: colors.text, fontSize: fs(14) },
  msgTime: { color: colors.textMuted, fontSize: fs(9), marginTop: hp(4), textAlign: 'right' as any },
  modalInputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: wp(16), paddingVertical: hp(10), borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  modalInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, paddingVertical: hp(10), paddingHorizontal: wp(16), color: colors.text, fontSize: fs(14) },
  modalSendBtn: { marginLeft: wp(10), backgroundColor: colors.primary, borderRadius: 20, paddingVertical: hp(10), paddingHorizontal: wp(18) },
  modalSendText: { color: '#000', fontSize: fs(11), fontWeight: '800', letterSpacing: 1 },
});
