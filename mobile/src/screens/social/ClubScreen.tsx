import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Platform,
  Dimensions, Alert, Modal, ScrollView, RefreshControl, KeyboardAvoidingView,
  Switch, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadows, wp, hp, fs, borderRadius } from '../../theme';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import PremiumIcon from '../../components/PremiumIcon';

const { width: SW, height: SH } = Dimensions.get('window');

// Types
interface Club {
  id: string;
  name: string;
  description?: string;
  level: number;
  memberCount: number;
  isPublic: boolean;
  minVipLevel?: number;
  myRole?: 'owner' | 'admin' | 'member';
}

interface ClubMember {
  id: string;
  userId: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  vipLevel: number;
  donations?: number;
}

interface ChatMsg {
  id: string;
  userId: string;
  displayName: string;
  message: string;
  createdAt: string;
}

interface RankEntry {
  userId: string;
  displayName: string;
  amount: number;
  rank: number;
}
// Helpers

function formatChips(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
}

const LEVEL_COLORS: Record<number, string> = {
  1: colors.textSecondary,
  2: colors.bronze,
  3: colors.silver,
  4: colors.gold,
  5: colors.diamond,
};

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: 'OWNER', color: colors.primary },
  admin: { label: 'ADMIN', color: colors.purple },
  member: { label: 'MEMBER', color: colors.textSecondary },
};
// GoldButton

function GoldButton({ label, icon, onPress, disabled, small }: {
  label: string; icon?: string; onPress: () => void; disabled?: boolean; small?: boolean;
}) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={disabled ? undefined : onPress} disabled={disabled}>
      <LinearGradient
        colors={disabled ? ['#555', '#444'] as [string, string] : ['#D4AF37', '#B8941F'] as [string, string]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[s.goldBtn, small && s.goldBtnSmall, disabled && { opacity: 0.5 }]}
      >
        {icon && <PremiumIcon name={icon} size={small ? 10 : 12} />}
        <Text style={[s.goldBtnText, small && s.goldBtnTextSmall]}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function GlassButton({ label, icon, onPress }: {
  label: string; icon?: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.glassBtn} activeOpacity={0.7} onPress={onPress}>
      {icon && <PremiumIcon name={icon} size={10} />}
      <Text style={s.glassBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}
// TabButton

function TabButton({ label, active, onPress }: {
  label: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[s.tab, active && s.tabActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}
// Create Club Modal

function CreateClubModal({ visible, onClose, onCreated }: {
  visible: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [minVip, setMinVip] = useState(0);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return Alert.alert('Error', 'Club name is required');
    setCreating(true);
    try {
      await api.createClub({
        name: name.trim(),
        description: description.trim() || undefined,
        isPublic,
        minVipLevel: minVip > 0 ? minVip : undefined,
      });
      setName(''); setDescription(''); setIsPublic(true); setMinVip(0);
      onCreated();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to create club');
    } finally { setCreating(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.createModal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Create Club</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ padding: wp(20) }} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>CLUB NAME</Text>
            <TextInput style={s.fieldInput} value={name} onChangeText={setName}
              placeholder="Enter club name" placeholderTextColor={colors.textMuted} maxLength={30} />

            <Text style={s.fieldLabel}>DESCRIPTION</Text>
            <TextInput style={[s.fieldInput, { height: hp(80), textAlignVertical: 'top' }]}
              value={description} onChangeText={setDescription} multiline
              placeholder="What's your club about?" placeholderTextColor={colors.textMuted} maxLength={200} />

            <View style={s.switchRow}>
              <Text style={s.fieldLabel}>PUBLIC CLUB</Text>
              <Switch value={isPublic} onValueChange={setIsPublic}
                trackColor={{ false: colors.surfaceLight, true: 'rgba(212,175,55,0.4)' }}
                thumbColor={isPublic ? colors.primary : colors.textMuted} />
            </View>

            <Text style={s.fieldLabel}>MIN VIP LEVEL (0 = none)</Text>
            <View style={s.vipRow}>
              {[0, 1, 2, 3, 4, 5].map((v) => (
                <TouchableOpacity key={v} onPress={() => setMinVip(v)}
                  style={[s.vipChip, minVip === v && s.vipChipActive]}>
                  <Text style={[s.vipChipText, minVip === v && s.vipChipTextActive]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ marginTop: hp(20) }}>
              <GoldButton label={creating ? 'CREATING...' : 'CREATE CLUB'} icon="star" onPress={handleCreate} disabled={creating} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
// Donate Modal

function DonateModal({ visible, clubId, onClose, onDonated }: {
  visible: boolean; clubId: string; onClose: () => void; onDonated: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  const handleDonate = async () => {
    const num = parseInt(amount, 10);
    if (!num || num <= 0) return Alert.alert('Error', 'Enter a valid amount');
    setSending(true);
    try {
      await api.donateToClub(clubId, num);
      setAmount('');
      onDonated();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Donation failed');
    } finally { setSending(false); }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.donateModal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Donate Chips</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <View style={{ padding: wp(20) }}>
            <Text style={s.fieldLabel}>AMOUNT</Text>
            <TextInput style={s.fieldInput} value={amount} onChangeText={setAmount}
              placeholder="Enter chip amount" placeholderTextColor={colors.textMuted}
              keyboardType="number-pad" />
            <View style={{ marginTop: hp(16) }}>
              <GoldButton label={sending ? 'SENDING...' : 'DONATE'} icon="gift" onPress={handleDonate} disabled={sending} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
// Club Detail View

function ClubDetailView({ clubId, onBack }: { clubId: string; onBack: () => void }) {
  const currentUser = useAuthStore((st) => st.user);
  const [club, setClub] = useState<any>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [rankings, setRankings] = useState<RankEntry[]>([]);
  const [subTab, setSubTab] = useState<'members' | 'chat' | 'rankings' | 'settings'>('members');
  const [loading, setLoading] = useState(true);
  const [chatText, setChatText] = useState('');
  const [donateVisible, setDonateVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Settings state
  const [settingsName, setSettingsName] = useState('');
  const [settingsDesc, setSettingsDesc] = useState('');
  const [settingsPublic, setSettingsPublic] = useState(true);

  const myRole = club?.myRole ?? members.find((m) => m.userId === currentUser?.id)?.role;
  const isOwner = myRole === 'owner';
  const isAdmin = myRole === 'admin' || isOwner;

  const loadClub = useCallback(async () => {
    try {
      const data = await api.getClub(clubId);
      setClub(data.club ?? data);
      setMembers(data.members ?? []);
      setSettingsName(data.club?.name ?? data.name ?? '');
      setSettingsDesc(data.club?.description ?? data.description ?? '');
      setSettingsPublic(data.club?.isPublic ?? data.isPublic ?? true);
    } catch { Alert.alert('Error', 'Failed to load club'); }
    setLoading(false);
  }, [clubId]);

  const loadChat = useCallback(async () => {
    try {
      const data = await api.getClubChat(clubId);
      setChatMessages(data.messages ?? data ?? []);
    } catch {}
  }, [clubId]);

  const loadRankings = useCallback(async () => {
    try {
      const data = await api.getClubRankings(clubId);
      setRankings(data.rankings ?? data ?? []);
    } catch {}
  }, [clubId]);

  useEffect(() => { loadClub(); }, [loadClub]);

  useEffect(() => {
    if (subTab === 'chat') { loadChat(); socketService.joinClubChat(clubId); }
    if (subTab === 'rankings') loadRankings();
    return () => { socketService.leaveClubChat(clubId); };
  }, [subTab, clubId, loadChat, loadRankings]);

  // Socket listener for live chat
  useEffect(() => {
    const onMsg = (msg: ChatMsg) => {
      if (msg.userId !== currentUser?.id) {
        setChatMessages((prev) => [...prev, msg]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    };
    socketService.on('club:chat', onMsg);
    return () => { socketService.off('club:chat', onMsg); };
  }, [currentUser?.id]);

  const sendChat = () => {
    if (!chatText.trim()) return;
    socketService.sendClubChat(clubId, chatText.trim());
    const outgoing: ChatMsg = {
      id: Date.now().toString(),
      userId: currentUser?.id ?? '',
      displayName: currentUser?.displayName ?? 'You',
      message: chatText.trim(),
      createdAt: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, outgoing]);
    setChatText('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleKick = (userId: string, name: string) => {
    Alert.alert('Kick Member', `Remove ${name} from the club?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Kick', style: 'destructive', onPress: async () => {
        try { await api.kickClubMember(clubId, userId); loadClub(); } catch {}
      }},
    ]);
  };

  const handlePromote = async (userId: string) => {
    try { await api.promoteClubMember(clubId, userId); loadClub(); } catch {}
  };

  const handleLeave = () => {
    Alert.alert('Leave Club', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        try { await api.leaveClub(clubId); onBack(); } catch {}
      }},
    ]);
  };

  const handleDeleteClub = () => {
    Alert.alert('Delete Club', 'This cannot be undone. Delete this club?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.deleteClub(clubId); onBack(); } catch {}
      }},
    ]);
  };

  const handleSaveSettings = async () => {
    try {
      await api.updateClubSettings(clubId, {
        name: settingsName.trim(),
        description: settingsDesc.trim(),
        isPublic: settingsPublic,
      });
      Alert.alert('Saved', 'Club settings updated');
      loadClub();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to save settings');
    }
  };

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const clubName = club?.name ?? 'Club';
  const clubLevel = club?.level ?? 1;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={{ marginRight: wp(12) }}>
          <PremiumIcon name="back" size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{clubName}</Text>
          <Text style={s.headerSub}>
            Lv.{clubLevel} · {members.length} members
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: wp(8) }}>
          <GlassButton label="Donate" icon="gift" onPress={() => setDonateVisible(true)} />
          {!isOwner && <GlassButton label="Leave" icon="logout" onPress={handleLeave} />}
        </View>
      </View>

      {club?.description ? (
        <Text style={s.clubDesc} numberOfLines={2}>{club.description}</Text>
      ) : null}

      {/* Sub-tabs */}
      <View style={s.tabRow}>
        <TabButton label="Members" active={subTab === 'members'} onPress={() => setSubTab('members')} />
        <TabButton label="Chat" active={subTab === 'chat'} onPress={() => setSubTab('chat')} />
        <TabButton label="Rankings" active={subTab === 'rankings'} onPress={() => setSubTab('rankings')} />
        {isOwner && <TabButton label="Settings" active={subTab === 'settings'} onPress={() => setSubTab('settings')} />}
      </View>

      {/* Members */}
      {subTab === 'members' && (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id ?? m.userId}
          contentContainerStyle={s.list}
          renderItem={({ item }) => {
            const roleInfo = ROLE_LABELS[item.role] ?? ROLE_LABELS.member;
            const canManage = isOwner && item.userId !== currentUser?.id;
            return (
              <View style={s.card}>
                <View style={s.cardContent}>
                  <View style={[s.avatarCircle, { borderColor: roleInfo.color }]}>
                    <Text style={s.avatarLetter}>{item.displayName?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                  <View style={s.infoBlock}>
                    <Text style={s.memberName}>{item.displayName}</Text>
                    <Text style={[s.roleBadgeText, { color: roleInfo.color }]}>{roleInfo.label}</Text>
                  </View>
                  {canManage && (
                    <View style={{ gap: hp(4) }}>
                      {item.role === 'member' && (
                        <GoldButton label="Promote" small onPress={() => handlePromote(item.userId)} />
                      )}
                      <GlassButton label="Kick" icon="close" onPress={() => handleKick(item.userId, item.displayName)} />
                    </View>
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={s.emptyText}>No members yet</Text>}
        />
      )}

      {/* Chat */}
      {subTab === 'chat' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={hp(100)}>
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: hp(8), paddingHorizontal: wp(4) }}>
            {chatMessages.map((m) => {
              const isMine = m.userId === currentUser?.id;
              return (
                <View key={m.id} style={[s.msgRow, isMine ? s.msgRowRight : s.msgRowLeft]}>
                  {!isMine && <Text style={s.msgSender}>{m.displayName}</Text>}
                  <View style={[s.msgBubble, isMine ? s.msgBubbleMine : s.msgBubbleTheirs]}>
                    <Text style={s.msgText}>{m.message}</Text>
                    <Text style={s.msgTime}>{formatTime(m.createdAt)}</Text>
                  </View>
                </View>
              );
            })}
            {chatMessages.length === 0 && <Text style={s.emptyText}>No messages yet. Say hello!</Text>}
          </ScrollView>
          <View style={s.chatInputRow}>
            <TextInput style={s.chatInput} value={chatText} onChangeText={setChatText}
              placeholder="Type a message..." placeholderTextColor={colors.textMuted}
              onSubmitEditing={sendChat} returnKeyType="send" />
            <TouchableOpacity onPress={sendChat} style={s.chatSendBtn}>
              <Text style={s.chatSendText}>SEND</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Rankings */}
      {subTab === 'rankings' && (
        <FlatList
          data={rankings}
          keyExtractor={(r, i) => r.userId ?? `${i}`}
          contentContainerStyle={s.list}
          renderItem={({ item, index }) => (
            <View style={s.card}>
              <View style={s.cardContent}>
                <View style={[s.rankCircle, index < 3 && { borderColor: colors.primary }]}>
                  <Text style={[s.rankNum, index < 3 && { color: colors.primary }]}>#{index + 1}</Text>
                </View>
                <View style={s.infoBlock}>
                  <Text style={s.memberName}>{item.displayName}</Text>
                  <Text style={s.chipText}>{formatChips(item.amount)} donated</Text>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={s.emptyText}>No donations yet</Text>}
        />
      )}

      {/* Settings (owner only) */}
      {subTab === 'settings' && isOwner && (
        <ScrollView contentContainerStyle={{ padding: wp(4), paddingBottom: hp(40) }}>
          <Text style={s.fieldLabel}>CLUB NAME</Text>
          <TextInput style={s.fieldInput} value={settingsName} onChangeText={setSettingsName} maxLength={30} />

          <Text style={s.fieldLabel}>DESCRIPTION</Text>
          <TextInput style={[s.fieldInput, { height: hp(80), textAlignVertical: 'top' }]}
            value={settingsDesc} onChangeText={setSettingsDesc} multiline maxLength={200} />

          <View style={s.switchRow}>
            <Text style={s.fieldLabel}>PUBLIC</Text>
            <Switch value={settingsPublic} onValueChange={setSettingsPublic}
              trackColor={{ false: colors.surfaceLight, true: 'rgba(212,175,55,0.4)' }}
              thumbColor={settingsPublic ? colors.primary : colors.textMuted} />
          </View>

          <View style={{ marginTop: hp(16), gap: hp(12) }}>
            <GoldButton label="SAVE SETTINGS" icon="checkmark" onPress={handleSaveSettings} />
            <TouchableOpacity onPress={handleDeleteClub} style={s.deleteBtn}>
              <Text style={s.deleteBtnText}>DELETE CLUB</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      <DonateModal visible={donateVisible} clubId={clubId}
        onClose={() => setDonateVisible(false)} onDonated={loadRankings} />
    </View>
  );
}
// Main Screen

export default function ClubScreen() {
  const [mainTab, setMainTab] = useState<'my' | 'browse'>('my');
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [browseClubs, setBrowseClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMyClubs = useCallback(async () => {
    try {
      const data = await api.getClubs({ search: '', page: 1 });
      const clubs: Club[] = data.clubs ?? data ?? [];
      setMyClubs(clubs.filter((c: any) => c.myRole));
    } catch {}
  }, []);

  const loadBrowse = useCallback(async (query: string, pg: number, append = false) => {
    try {
      const data = await api.getClubs({ search: query, page: pg });
      const clubs: Club[] = data.clubs ?? data ?? [];
      if (append) setBrowseClubs((prev) => [...prev, ...clubs]);
      else setBrowseClubs(clubs);
      setHasMore(clubs.length >= 20);
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadMyClubs(), loadBrowse(searchQuery, 1)]);
    setPage(1);
    setRefreshing(false);
  }, [loadMyClubs, loadBrowse, searchQuery]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadMyClubs(), loadBrowse('', 1)]);
      setLoading(false);
    })();
  }, [loadMyClubs, loadBrowse]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { loadBrowse(searchQuery, 1); setPage(1); }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, loadBrowse]);

  const loadMore = () => {
    if (!hasMore) return;
    const next = page + 1;
    setPage(next);
    loadBrowse(searchQuery, next, true);
  };

  const handleJoin = async (club: Club) => {
    try {
      await api.joinClub(club.id);
      Alert.alert('Success', club.isPublic ? 'Joined!' : 'Request sent!');
      refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not join');
    }
  };

  // Detail view
  if (selectedClubId) {
    return <ClubDetailView clubId={selectedClubId} onBack={() => { setSelectedClubId(null); refresh(); }} />;
  }

  const renderClubCard = (club: Club, isMine: boolean) => (
    <TouchableOpacity
      key={club.id}
      style={s.card}
      activeOpacity={0.7}
      onPress={() => isMine ? setSelectedClubId(club.id) : undefined}
    >
      <View style={s.cardContent}>
        <View style={[s.clubIcon, { borderColor: LEVEL_COLORS[club.level] ?? colors.textSecondary }]}>
          <Text style={[s.clubIconText, { color: LEVEL_COLORS[club.level] ?? colors.textSecondary }]}>
            {club.name?.[0]?.toUpperCase() ?? 'C'}
          </Text>
        </View>
        <View style={s.infoBlock}>
          <Text style={s.memberName} numberOfLines={1}>{club.name}</Text>
          <Text style={s.chipText}>
            Lv.{club.level ?? 1} · {club.memberCount ?? 0} members
            {club.myRole ? ` · ${ROLE_LABELS[club.myRole]?.label}` : ''}
          </Text>
        </View>
        {isMine ? (
          <PremiumIcon name="chevron-right" size={16} />
        ) : (
          <GoldButton label="Join" small onPress={() => handleJoin(club)} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>CLUBS</Text>
          <Text style={s.headerSub}>{myClubs.length} clubs joined</Text>
        </View>
        <GoldButton label="CREATE" icon="add" onPress={() => setCreateVisible(true)} />
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        <TabButton label="My Clubs" active={mainTab === 'my'} onPress={() => setMainTab('my')} />
        <TabButton label="Browse" active={mainTab === 'browse'} onPress={() => setMainTab('browse')} />
      </View>

      {/* Search (browse tab) */}
      {mainTab === 'browse' && (
        <View style={s.searchWrap}>
          <PremiumIcon name="search" size={16} />
          <TextInput style={s.searchInput} placeholder="Search clubs..."
            placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={setSearchQuery} />
        </View>
      )}

      {/* List */}
      {mainTab === 'my' ? (
        <FlatList
          data={myClubs}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => renderClubCard(item, true)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            loading ? null : (
              <View style={s.emptyState}>
                <Text style={s.emptyTitle}>No Clubs Yet</Text>
                <Text style={s.emptySubtext}>Create or join a club to get started!</Text>
              </View>
            )
          }
        />
      ) : (
        <FlatList
          data={browseClubs}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => renderClubCard(item, false)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            loading ? null : (
              <View style={s.emptyState}>
                <Text style={s.emptyTitle}>No Clubs Found</Text>
                <Text style={s.emptySubtext}>Try a different search</Text>
              </View>
            )
          }
        />
      )}

      <CreateClubModal visible={createVisible} onClose={() => setCreateVisible(false)} onCreated={refresh} />
    </View>
  );
}
// Styles

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: wp(16) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: hp(12), paddingTop: hp(28) },
  headerTitle: { color: '#FFF', fontSize: fs(28), fontWeight: '900', letterSpacing: 4, textShadowColor: 'rgba(212,175,55,0.4)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20 },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: fs(12), fontWeight: '600', letterSpacing: 1, marginTop: hp(4) },
  clubDesc: { color: colors.textSecondary, fontSize: fs(13), marginBottom: hp(12), paddingHorizontal: wp(4) },

  // Tabs
  tabRow: { flexDirection: 'row', gap: wp(4), marginBottom: hp(16), borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: hp(12) },
  tabActive: { backgroundColor: 'rgba(212,175,55,0.08)', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: fs(12), fontWeight: '700', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase' as any },
  tabTextActive: { color: '#FFF' },

  // Search
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(22,27,34,0.7)', borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, paddingHorizontal: wp(14), marginBottom: hp(16) },
  searchInput: { flex: 1, paddingVertical: hp(12), paddingLeft: wp(8), fontSize: fs(14), color: colors.text },

  // List
  list: { paddingBottom: hp(40), gap: hp(10) },

  // Cards
  card: { backgroundColor: 'rgba(22,27,34,0.75)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.15)', borderRadius: borderRadius.lg, ...shadows.card as object },
  cardContent: { flexDirection: 'row', alignItems: 'center', padding: wp(14), gap: wp(12) },

  // Club icon
  clubIcon: { width: wp(48), height: wp(48), borderRadius: wp(24), borderWidth: 2, backgroundColor: 'rgba(10,14,26,0.9)', justifyContent: 'center', alignItems: 'center' },
  clubIconText: { fontSize: fs(20), fontWeight: '800' },

  // Avatar
  avatarCircle: { width: wp(40), height: wp(40), borderRadius: wp(20), borderWidth: 2, backgroundColor: 'rgba(10,14,26,0.9)', justifyContent: 'center', alignItems: 'center', marginRight: wp(12) },
  avatarLetter: { fontSize: fs(16), fontWeight: '800', color: 'rgba(240,246,252,0.6)' },

  // Info
  infoBlock: { flex: 1 },
  memberName: { color: colors.text, fontSize: fs(15), fontWeight: '800', marginBottom: hp(2) },
  chipText: { color: colors.textMuted, fontSize: fs(11), fontWeight: '600' },
  roleBadgeText: { fontSize: fs(10), fontWeight: '800', letterSpacing: 1 },

  // Rank
  rankCircle: { width: wp(40), height: wp(40), borderRadius: wp(20), borderWidth: 2, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: wp(12) },
  rankNum: { fontSize: fs(14), fontWeight: '800', color: colors.textSecondary },

  // Buttons
  goldBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: hp(12), paddingHorizontal: wp(20), borderRadius: borderRadius.full, gap: wp(6), ...shadows.button as object },
  goldBtnSmall: { paddingVertical: hp(7), paddingHorizontal: wp(14) },
  goldBtnText: { color: '#FFF', fontSize: fs(11), fontWeight: '800', letterSpacing: 1.5 },
  goldBtnTextSmall: { fontSize: fs(9) },
  glassBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: hp(6), paddingHorizontal: wp(12), borderRadius: 20, gap: wp(4), backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  glassBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: fs(9), fontWeight: '700', letterSpacing: 1 },
  deleteBtn: { alignItems: 'center', paddingVertical: hp(12), borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.red },
  deleteBtnText: { color: colors.red, fontSize: fs(11), fontWeight: '800', letterSpacing: 1.5 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: hp(60) },
  emptyTitle: { color: colors.text, fontSize: fs(18), fontWeight: '700', marginBottom: hp(6) },
  emptySubtext: { color: colors.textMuted, fontSize: fs(13), textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontSize: fs(13), textAlign: 'center', paddingVertical: hp(40) },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  createModal: { height: '75%', backgroundColor: 'rgba(16,20,30,0.97)', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: 'rgba(212,175,55,0.15)' } as any,
  donateModal: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(16,20,30,0.97)', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: 'rgba(212,175,55,0.15)' } as any,
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: wp(20), paddingVertical: hp(16), borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  modalTitle: { color: '#FFF', fontSize: fs(18), fontWeight: '800' },
  modalClose: { color: colors.textMuted, fontSize: fs(22) },

  // Form fields
  fieldLabel: { color: colors.textSecondary, fontSize: fs(10), fontWeight: '700', letterSpacing: 1.5, marginBottom: hp(6), marginTop: hp(14) },
  fieldInput: { backgroundColor: 'rgba(22,27,34,0.6)', borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingVertical: hp(12), paddingHorizontal: wp(14), color: colors.text, fontSize: fs(14) },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: hp(14) },
  vipRow: { flexDirection: 'row', gap: wp(8), marginTop: hp(4) },
  vipChip: { width: wp(36), height: wp(36), borderRadius: wp(18), borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  vipChipActive: { borderColor: colors.primary, backgroundColor: 'rgba(212,175,55,0.15)' },
  vipChipText: { color: colors.textMuted, fontSize: fs(13), fontWeight: '700' },
  vipChipTextActive: { color: colors.primary },

  // Chat
  chatInputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: hp(10), borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, paddingVertical: hp(10), paddingHorizontal: wp(16), color: colors.text, fontSize: fs(14) },
  chatSendBtn: { marginLeft: wp(10), backgroundColor: colors.primary, borderRadius: 20, paddingVertical: hp(10), paddingHorizontal: wp(18) },
  chatSendText: { color: '#000', fontSize: fs(11), fontWeight: '800', letterSpacing: 1 },
  msgRow: { marginBottom: hp(8) },
  msgRowRight: { alignItems: 'flex-end' as const },
  msgRowLeft: { alignItems: 'flex-start' as const },
  msgSender: { color: colors.purple, fontSize: fs(10), fontWeight: '700', marginBottom: hp(2) },
  msgBubble: { maxWidth: '75%', paddingVertical: hp(8), paddingHorizontal: wp(14), borderRadius: 16 } as any,
  msgBubbleMine: { backgroundColor: 'rgba(212,175,55,0.2)', borderBottomRightRadius: 4 },
  msgBubbleTheirs: { backgroundColor: 'rgba(255,255,255,0.08)', borderBottomLeftRadius: 4 },
  msgText: { color: colors.text, fontSize: fs(14) },
  msgTime: { color: colors.textMuted, fontSize: fs(9), marginTop: hp(4), textAlign: 'right' as any },
});
