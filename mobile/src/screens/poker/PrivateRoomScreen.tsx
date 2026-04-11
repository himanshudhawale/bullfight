import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  TextInput, ScrollView, Alert, RefreshControl, Animated, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadows, wp, hp, fs, borderRadius, gradients, spacing, glassStyle } from '../../theme';
import { PremiumIcon } from '../../components/PremiumIcon';
import { socketService } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Types ──────────────────────────────────────────────────────────────────
interface RoomConfig {
  name: string;
  blinds: string;
  maxPlayers: number;
  minBuyIn: number;
  maxBuyIn: number;
  password?: string;
  minVipLevel: number;
}

interface RoomInfo {
  id: string;
  name: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  blinds: string;
  hasPassword: boolean;
}

interface Player {
  id: string;
  displayName: string;
  chips: number;
  cards: string[];
  seatIndex: number;
  isFolded: boolean;
  isDealer: boolean;
  currentBet: number;
}

interface RoomState {
  roomId: string;
  roomName: string;
  blinds: string;
  hostId: string;
  players: Player[];
  communityCards: string[];
  pot: number;
  currentTurn: string | null;
  myCards: string[];
  minRaise: number;
  callAmount: number;
  phase: string;
}

interface Friend {
  id: string;
  displayName: string;
}

const BLINDS_OPTIONS = ['100/200', '500/1K', '1K/2K', '5K/10K', '25K/50K'];
const MAX_PLAYERS_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9];
const SEAT_POSITIONS = [
  { top: '78%', left: '42%' },  // 0 — bottom center (you)
  { top: '65%', left: '8%' },   // 1
  { top: '40%', left: '2%' },   // 2
  { top: '15%', left: '10%' },  // 3
  { top: '5%', left: '35%' },   // 4
  { top: '5%', left: '60%' },   // 5
  { top: '15%', left: '82%' },  // 6
  { top: '40%', left: '88%' },  // 7
  { top: '65%', left: '80%' },  // 8
];

// ─── Component ──────────────────────────────────────────────────────────────
export default function PrivateRoomScreen({ route, navigation }: any) {
  const autoJoinRoomId = route?.params?.roomId;
  const user = useAuthStore((s) => s.user);

  // Room list state
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{ roomId: string } | null>(null);
  const [joinPassword, setJoinPassword] = useState('');

  // In-room state
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showInvite, setShowInvite] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);

  // Create room form
  const [formName, setFormName] = useState('');
  const [formBlinds, setFormBlinds] = useState(BLINDS_OPTIONS[0]);
  const [formMaxPlayers, setFormMaxPlayers] = useState(6);
  const [formMinBuy, setFormMinBuy] = useState('10000');
  const [formMaxBuy, setFormMaxBuy] = useState('100000');
  const [formPassword, setFormPassword] = useState('');
  const [formUsePassword, setFormUsePassword] = useState(false);
  const [formMinVip, setFormMinVip] = useState(0);

  // ── Socket listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const handleUpdate = (state: RoomState) => setRoomState(state);
    const handleInvite = ({ roomId, roomName, inviterName }: any) => {
      Alert.alert('Room Invite', `${inviterName} invited you to "${roomName}"`, [
        { text: 'Decline', style: 'cancel' },
        { text: 'Join', onPress: () => joinRoom(roomId) },
      ]);
    };

    socketService.on('private_room:update', handleUpdate);
    socketService.on('private_room:invited', handleInvite);
    return () => {
      socketService.off('private_room:update', handleUpdate);
      socketService.off('private_room:invited', handleInvite);
    };
  }, []);

  useEffect(() => {
    fetchRooms();
    if (autoJoinRoomId) joinRoom(autoJoinRoomId);
  }, [autoJoinRoomId]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const fetchRooms = useCallback(() => {
    setRefreshing(true);
    socketService.emit('private_room:list', {}, (res: any) => {
      if (res?.rooms) setRooms(res.rooms);
      setRefreshing(false);
    });
  }, []);

  const joinRoom = useCallback((roomId: string, password?: string) => {
    socketService.emit('private_room:join', { roomId, password }, (res: any) => {
      if (res?.error) {
        Alert.alert('Error', res.error);
      }
    });
  }, []);

  const leaveRoom = useCallback(() => {
    if (!roomState) return;
    socketService.emit('private_room:leave', { roomId: roomState.roomId });
    setRoomState(null);
  }, [roomState]);

  const performAction = useCallback((action: string, amount?: number) => {
    if (!roomState) return;
    socketService.emit('private_room:action', { roomId: roomState.roomId, action, amount });
  }, [roomState]);

  const createRoom = useCallback(() => {
    const config: RoomConfig = {
      name: formName.trim(),
      blinds: formBlinds,
      maxPlayers: formMaxPlayers,
      minBuyIn: parseInt(formMinBuy, 10) || 10000,
      maxBuyIn: parseInt(formMaxBuy, 10) || 100000,
      password: formUsePassword ? formPassword : undefined,
      minVipLevel: formMinVip,
    };
    if (!config.name) return Alert.alert('Error', 'Room name is required');
    socketService.emit('private_room:create', config, (res: any) => {
      if (res?.error) return Alert.alert('Error', res.error);
      setShowCreate(false);
      resetForm();
    });
  }, [formName, formBlinds, formMaxPlayers, formMinBuy, formMaxBuy, formPassword, formUsePassword, formMinVip]);

  const resetForm = () => {
    setFormName(''); setFormBlinds(BLINDS_OPTIONS[0]); setFormMaxPlayers(6);
    setFormMinBuy('10000'); setFormMaxBuy('100000'); setFormPassword('');
    setFormUsePassword(false); setFormMinVip(0);
  };

  const loadFriends = useCallback(async () => {
    try {
      const res = await api.getFriends();
      setFriends(res?.friends ?? []);
    } catch { setFriends([]); }
  }, []);

  const inviteFriend = useCallback((friendId: string) => {
    if (!roomState) return;
    socketService.emit('private_room:invite', { roomId: roomState.roomId, friendId });
    setShowInvite(false);
  }, [roomState]);

  // ── Room List View ──────────────────────────────────────────────────────
  if (!roomState) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <PremiumIcon name="lock" size={fs(22)} />
          <Text style={s.headerTitle}>Private Rooms</Text>
        </View>

        <FlatList
          data={rooms}
          keyExtractor={(r) => r.id}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchRooms} tintColor={colors.gold} />}
          ListEmptyComponent={<Text style={s.emptyText}>No active rooms</Text>}
          renderItem={({ item }) => (
            <View style={[s.card, glassStyle]}>
              <View style={s.cardRow}>
                <Text style={s.roomName}>{item.name}</Text>
                {item.hasPassword && <PremiumIcon name="lock" size={fs(14)} />}
              </View>
              <Text style={s.cardSub}>Host: {item.hostName}</Text>
              <Text style={s.cardSub}>
                Players: {item.players}/{item.maxPlayers}  •  Blinds: {item.blinds}
              </Text>
              <TouchableOpacity
                style={s.joinBtn}
                onPress={() => {
                  if (item.hasPassword) {
                    setPasswordPrompt({ roomId: item.id });
                    setJoinPassword('');
                  } else {
                    joinRoom(item.id);
                  }
                }}
              >
                <LinearGradient colors={gradients.gold} style={s.joinGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text style={s.joinText}>Join</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        />

        {/* Floating Create Button */}
        <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)}>
          <LinearGradient colors={gradients.gold} style={s.fabGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={s.fabText}>+ Create Room</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Password Prompt */}
        <Modal visible={!!passwordPrompt} transparent animationType="fade">
          <View style={s.overlay}>
            <View style={[s.modalCard, glassStyle]}>
              <Text style={s.modalTitle}>Enter Password</Text>
              <TextInput
                style={s.input}
                placeholder="Room password"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                value={joinPassword}
                onChangeText={setJoinPassword}
              />
              <View style={s.modalBtnRow}>
                <TouchableOpacity onPress={() => setPasswordPrompt(null)} style={s.cancelBtn}>
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (passwordPrompt) joinRoom(passwordPrompt.roomId, joinPassword);
                    setPasswordPrompt(null);
                  }}
                >
                  <LinearGradient colors={gradients.gold} style={s.modalGoldBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={s.joinText}>Join</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Create Room Modal */}
        {renderCreateModal()}
      </View>
    );
  }

  // ── In-Room View ────────────────────────────────────────────────────────
  const myId = user?.id;
  const isMyTurn = roomState.currentTurn === myId;

  return (
    <View style={s.container}>
      {/* Room Header */}
      <View style={s.roomHeader}>
        <View>
          <Text style={s.roomHeaderName}>{roomState.roomName}</Text>
          <Text style={s.roomHeaderSub}>Blinds: {roomState.blinds}</Text>
        </View>
        <View style={s.roomHeaderRight}>
          <TouchableOpacity onPress={() => { loadFriends(); setShowInvite(true); }} style={s.inviteBtn}>
            <Text style={s.inviteBtnText}>Invite</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={leaveRoom} style={s.leaveBtn}>
            <Text style={s.leaveBtnText}>Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Table */}
      <View style={s.tableWrap}>
        <View style={s.tableOval}>
          {/* Community Cards */}
          <View style={s.communityRow}>
            {roomState.communityCards.map((c, i) => (
              <View key={i} style={s.communityCard}>
                <Text style={s.cardLabel}>{c}</Text>
              </View>
            ))}
          </View>
          <Text style={s.potText}>Pot: {formatChips(roomState.pot)}</Text>
        </View>

        {/* Seats */}
        {roomState.players.map((p) => {
          const pos = SEAT_POSITIONS[p.seatIndex] ?? SEAT_POSITIONS[0];
          const isMe = p.id === myId;
          return (
            <View key={p.id} style={[s.seat, { top: pos.top as any, left: pos.left as any }]}>
              <View style={[s.seatBubble, isMe && s.seatBubbleMe, p.isFolded && s.seatFolded]}>
                <Text style={s.seatName} numberOfLines={1}>{p.displayName}</Text>
                <Text style={s.seatChips}>{formatChips(p.chips)}</Text>
              </View>
              <View style={s.seatCards}>
                {(isMe ? roomState.myCards : p.cards).map((c, i) => (
                  <View key={i} style={[s.miniCard, !isMe && s.miniCardHidden]}>
                    <Text style={s.miniCardText}>{isMe ? c : '?'}</Text>
                  </View>
                ))}
              </View>
              {p.isDealer && <View style={s.dealerBadge}><Text style={s.dealerText}>D</Text></View>}
              {p.currentBet > 0 && <Text style={s.betLabel}>{formatChips(p.currentBet)}</Text>}
            </View>
          );
        })}
      </View>

      {/* Action Bar */}
      <View style={s.actionBar}>
        <TouchableOpacity
          style={[s.actionBtn, s.foldBtn]}
          onPress={() => performAction('fold')}
          disabled={!isMyTurn}
        >
          <Text style={s.actionBtnText}>Fold</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actionBtn, s.callBtn]}
          onPress={() => performAction(roomState.callAmount > 0 ? 'call' : 'check')}
          disabled={!isMyTurn}
        >
          <Text style={s.actionBtnText}>
            {roomState.callAmount > 0 ? `Call ${formatChips(roomState.callAmount)}` : 'Check'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actionBtn, s.raiseBtn]}
          onPress={() => performAction('raise', raiseAmount || roomState.minRaise)}
          disabled={!isMyTurn}
        >
          <LinearGradient colors={gradients.gold} style={s.raiseBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={s.actionBtnText}>Raise {formatChips(raiseAmount || roomState.minRaise)}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Raise Slider */}
      {isMyTurn && (
        <View style={s.sliderRow}>
          <Text style={s.sliderLabel}>{formatChips(roomState.minRaise)}</Text>
          <TextInput
            style={s.raiseInput}
            keyboardType="numeric"
            value={raiseAmount ? String(raiseAmount) : ''}
            placeholder={String(roomState.minRaise)}
            placeholderTextColor={colors.textSecondary}
            onChangeText={(t) => setRaiseAmount(parseInt(t, 10) || 0)}
          />
          <Text style={s.sliderLabel}>All-In</Text>
        </View>
      )}

      {/* Invite Modal */}
      <Modal visible={showInvite} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.modalCard, glassStyle, { maxHeight: hp(400) }]}>
            <Text style={s.modalTitle}>Invite Friend</Text>
            <FlatList
              data={friends}
              keyExtractor={(f) => f.id}
              ListEmptyComponent={<Text style={s.emptyText}>No friends found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.friendRow} onPress={() => inviteFriend(item.id)}>
                  <Text style={s.friendName}>{item.displayName}</Text>
                  <Text style={s.inviteTag}>Invite</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setShowInvite(false)} style={s.cancelBtn}>
              <Text style={s.cancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );

  // ── Create Modal Renderer ───────────────────────────────────────────────
  function renderCreateModal() {
    return (
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={s.overlay}>
          <ScrollView contentContainerStyle={s.createScroll}>
            <View style={[s.modalCard, glassStyle]}>
              <Text style={s.modalTitle}>Create Room</Text>

              <Text style={s.label}>Room Name</Text>
              <TextInput style={s.input} value={formName} onChangeText={setFormName}
                placeholder="My Room" placeholderTextColor={colors.textSecondary} />

              <Text style={s.label}>Blinds</Text>
              <View style={s.chipRow}>
                {BLINDS_OPTIONS.map((b) => (
                  <TouchableOpacity key={b} style={[s.chip, formBlinds === b && s.chipActive]} onPress={() => setFormBlinds(b)}>
                    <Text style={[s.chipText, formBlinds === b && s.chipTextActive]}>{b}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Max Players</Text>
              <View style={s.chipRow}>
                {MAX_PLAYERS_OPTIONS.map((n) => (
                  <TouchableOpacity key={n} style={[s.chip, formMaxPlayers === n && s.chipActive]} onPress={() => setFormMaxPlayers(n)}>
                    <Text style={[s.chipText, formMaxPlayers === n && s.chipTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Min Buy-In</Text>
              <TextInput style={s.input} keyboardType="numeric" value={formMinBuy} onChangeText={setFormMinBuy}
                placeholderTextColor={colors.textSecondary} />

              <Text style={s.label}>Max Buy-In</Text>
              <TextInput style={s.input} keyboardType="numeric" value={formMaxBuy} onChangeText={setFormMaxBuy}
                placeholderTextColor={colors.textSecondary} />

              <View style={s.toggleRow}>
                <Text style={s.label}>Password Protected</Text>
                <TouchableOpacity style={[s.toggle, formUsePassword && s.toggleActive]} onPress={() => setFormUsePassword(!formUsePassword)}>
                  <View style={[s.toggleKnob, formUsePassword && s.toggleKnobActive]} />
                </TouchableOpacity>
              </View>
              {formUsePassword && (
                <TextInput style={s.input} secureTextEntry value={formPassword} onChangeText={setFormPassword}
                  placeholder="Password" placeholderTextColor={colors.textSecondary} />
              )}

              <Text style={s.label}>Min VIP Level</Text>
              <View style={s.chipRow}>
                {[0, 1, 2, 3, 5, 7, 10].map((v) => (
                  <TouchableOpacity key={v} style={[s.chip, formMinVip === v && s.chipActive]} onPress={() => setFormMinVip(v)}>
                    <Text style={[s.chipText, formMinVip === v && s.chipTextActive]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity onPress={createRoom} style={{ marginTop: spacing.md }}>
                <LinearGradient colors={gradients.gold} style={s.modalGoldBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text style={s.joinText}>Create</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCreate(false)} style={s.cancelBtn}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

// ─── Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: hp(50), paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.textPrimary, fontSize: fs(22), fontWeight: '700' },

  listContent: { padding: spacing.md, paddingBottom: hp(100) },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: hp(40), fontSize: fs(14) },

  card: {
    ...shadows.medium, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roomName: { color: colors.textPrimary, fontSize: fs(16), fontWeight: '600' },
  cardSub: { color: colors.textSecondary, fontSize: fs(12), marginTop: hp(2) },
  joinBtn: { alignSelf: 'flex-end', marginTop: spacing.sm },
  joinGrad: { paddingHorizontal: wp(20), paddingVertical: hp(8), borderRadius: borderRadius.md },
  joinText: { color: colors.background, fontWeight: '700', fontSize: fs(14), textAlign: 'center' },

  fab: { position: 'absolute', bottom: hp(30), alignSelf: 'center' },
  fabGrad: { paddingHorizontal: wp(28), paddingVertical: hp(14), borderRadius: borderRadius.full, ...shadows.strong },
  fabText: { color: colors.background, fontWeight: '700', fontSize: fs(15) },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: SCREEN_W * 0.88, borderRadius: borderRadius.xl, padding: spacing.lg },
  modalTitle: { color: colors.textPrimary, fontSize: fs(18), fontWeight: '700', marginBottom: spacing.md, textAlign: 'center' },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  modalGoldBtn: { paddingHorizontal: wp(30), paddingVertical: hp(12), borderRadius: borderRadius.md },

  input: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: borderRadius.md,
    padding: spacing.sm, color: colors.textPrimary, fontSize: fs(14), marginBottom: spacing.sm,
  },
  label: { color: colors.textSecondary, fontSize: fs(12), marginBottom: hp(4), marginTop: spacing.sm },
  cancelBtn: { alignSelf: 'center', marginTop: spacing.md, paddingVertical: hp(8) },
  cancelText: { color: colors.textSecondary, fontSize: fs(14) },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: wp(12), paddingVertical: hp(6), borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'transparent',
  },
  chipActive: { borderColor: colors.gold, backgroundColor: 'rgba(255,215,0,0.12)' },
  chipText: { color: colors.textSecondary, fontSize: fs(12) },
  chipTextActive: { color: colors.gold, fontWeight: '600' },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  toggle: {
    width: wp(44), height: hp(24), borderRadius: hp(12),
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', paddingHorizontal: wp(2),
  },
  toggleActive: { backgroundColor: 'rgba(255,215,0,0.35)' },
  toggleKnob: {
    width: hp(20), height: hp(20), borderRadius: hp(10), backgroundColor: colors.textSecondary,
  },
  toggleKnobActive: { alignSelf: 'flex-end', backgroundColor: colors.gold },

  createScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: hp(40) },

  // In-Room
  roomHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: hp(50), paddingBottom: spacing.sm,
  },
  roomHeaderName: { color: colors.textPrimary, fontSize: fs(18), fontWeight: '700' },
  roomHeaderSub: { color: colors.textSecondary, fontSize: fs(12) },
  roomHeaderRight: { flexDirection: 'row', gap: spacing.sm },
  inviteBtn: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: wp(12), paddingVertical: hp(6), borderRadius: borderRadius.md },
  inviteBtnText: { color: colors.textPrimary, fontSize: fs(12) },
  leaveBtn: { backgroundColor: 'rgba(255,60,60,0.2)', paddingHorizontal: wp(12), paddingVertical: hp(6), borderRadius: borderRadius.md },
  leaveBtnText: { color: '#FF5252', fontSize: fs(12), fontWeight: '600' },

  tableWrap: { flex: 1, position: 'relative', marginHorizontal: spacing.md },
  tableOval: {
    position: 'absolute', top: '15%', left: '10%', width: '80%', height: '55%',
    borderRadius: wp(120), backgroundColor: 'rgba(20,80,40,0.6)',
    borderWidth: 2, borderColor: 'rgba(255,215,0,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  communityRow: { flexDirection: 'row', gap: spacing.xs },
  communityCard: {
    width: wp(36), height: hp(50), borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center',
  },
  cardLabel: { color: colors.textPrimary, fontSize: fs(14), fontWeight: '600' },
  potText: { color: colors.gold, fontSize: fs(14), fontWeight: '700', marginTop: spacing.xs },

  seat: { position: 'absolute', alignItems: 'center', width: wp(64) },
  seatBubble: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: borderRadius.md,
    paddingHorizontal: wp(6), paddingVertical: hp(4), alignItems: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  seatBubbleMe: { borderColor: colors.gold },
  seatFolded: { opacity: 0.4 },
  seatName: { color: colors.textPrimary, fontSize: fs(10), fontWeight: '600' },
  seatChips: { color: colors.gold, fontSize: fs(9) },
  seatCards: { flexDirection: 'row', marginTop: hp(2), gap: wp(2) },
  miniCard: {
    width: wp(22), height: hp(30), borderRadius: borderRadius.xs,
    backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center',
  },
  miniCardHidden: { backgroundColor: 'rgba(130,70,180,0.3)' },
  miniCardText: { color: colors.textPrimary, fontSize: fs(10), fontWeight: '700' },
  dealerBadge: {
    position: 'absolute', top: -hp(4), right: -wp(2),
    width: wp(16), height: wp(16), borderRadius: wp(8),
    backgroundColor: colors.gold, justifyContent: 'center', alignItems: 'center',
  },
  dealerText: { color: colors.background, fontSize: fs(9), fontWeight: '800' },
  betLabel: { color: colors.gold, fontSize: fs(9), marginTop: hp(1) },

  actionBar: {
    flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: hp(10),
  },
  actionBtn: { flex: 1, marginHorizontal: spacing.xs, borderRadius: borderRadius.md, overflow: 'hidden' },
  actionBtnText: { color: colors.textPrimary, textAlign: 'center', fontWeight: '700', fontSize: fs(13), paddingVertical: hp(12) },
  foldBtn: { backgroundColor: 'rgba(255,60,60,0.25)' },
  callBtn: { backgroundColor: 'rgba(255,255,255,0.1)' },
  raiseBtn: {},
  raiseBtnGrad: { borderRadius: borderRadius.md },

  sliderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: hp(20),
  },
  sliderLabel: { color: colors.textSecondary, fontSize: fs(11) },
  raiseInput: {
    flex: 1, marginHorizontal: spacing.sm, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: borderRadius.md, paddingHorizontal: spacing.sm, paddingVertical: hp(6),
    color: colors.textPrimary, fontSize: fs(14), textAlign: 'center',
  },

  friendRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  friendName: { color: colors.textPrimary, fontSize: fs(14) },
  inviteTag: { color: colors.gold, fontSize: fs(12), fontWeight: '600' },
});
