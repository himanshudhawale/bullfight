import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  RefreshControl,
  Animated,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { socketService } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import PremiumIcon from '../../components/PremiumIcon';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TournamentRouteParams = {
  Tournament: { tournamentId?: string };
};

interface Tournament {
  id: string;
  name: string;
  buyIn: number;
  playersRegistered: number;
  maxPlayers: number;
  prizePool: number;
  status: 'registering' | 'in_progress' | 'complete';
  blindLevel?: number;
  smallBlind?: number;
  bigBlind?: number;
  nextBlindIn?: number;
  rebuyAvailable?: boolean;
}

interface TournamentState {
  tournamentId: string;
  blindLevel: number;
  smallBlind: number;
  bigBlind: number;
  nextBlindIn: number;
  playersRemaining: number;
  yourStack: number;
  averageStack: number;
  pot: number;
  communityCards: string[];
  yourCards: string[];
  currentBet: number;
  canCheck: boolean;
  canRaise: boolean;
  minRaise: number;
  maxRaise: number;
  rebuyAvailable: boolean;
  isYourTurn: boolean;
}

interface TournamentResult {
  place: number;
  prize: number;
  results?: { place: number; displayName: string; prize: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatChips = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
};

const statusColor = (s: Tournament['status']) =>
  s === 'registering' ? colors.green : s === 'in_progress' ? colors.warning : colors.textMuted;

const statusLabel = (s: Tournament['status']) =>
  s === 'registering' ? 'Registering' : s === 'in_progress' ? 'In Progress' : 'Complete';

const formatTimer = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function TournamentScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<TournamentRouteParams, 'Tournament'>>();
  const user = useAuthStore((s) => s.user);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());

  // Detail / in-game state
  const [activeId, setActiveId] = useState<string | null>(
    route.params?.tournamentId ?? null,
  );
  const [gameState, setGameState] = useState<TournamentState | null>(null);
  const [raiseAmount, setRaiseAmount] = useState(0);

  // Results modal
  const [result, setResult] = useState<TournamentResult | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const blindTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ------ Socket helpers --------------------------------------------------
  const socket = () => socketService.getSocket();

  const fetchList = useCallback(() => {
    socket()?.emit('tournament:list', (data: Tournament[]) => {
      if (Array.isArray(data)) setTournaments(data);
      setLoading(false);
      setRefreshing(false);
    });
  }, []);

  const fetchState = useCallback((id: string) => {
    socket()?.emit('tournament:state', { tournamentId: id }, (state: TournamentState) => {
      if (state) {
        setGameState(state);
        setRaiseAmount(state.minRaise);
      }
    });
  }, []);

  // ------ Lifecycle -------------------------------------------------------
  useEffect(() => {
    fetchList();
    refreshInterval.current = setInterval(fetchList, 10_000);

    const onList = (data: Tournament[]) => {
      if (Array.isArray(data)) setTournaments(data);
    };
    const onUpdate = (state: TournamentState) => {
      if (activeId && state.tournamentId === activeId) {
        setGameState(state);
        setRaiseAmount(state.minRaise);
      }
    };
    const onStart = ({ tournamentId }: { tournamentId: string }) => {
      if (registeredIds.has(tournamentId)) {
        setActiveId(tournamentId);
        fetchState(tournamentId);
      }
    };
    const onEliminated = (data: { place: number; prize: number }) => {
      setResult({ place: data.place, prize: data.prize });
    };
    const onComplete = ({ results }: { results: TournamentResult['results'] }) => {
      if (results) {
        const me = results.find((r) => r.displayName === user?.displayName);
        setResult({ place: me?.place ?? 0, prize: me?.prize ?? 0, results });
      }
      setActiveId(null);
      setGameState(null);
    };

    socketService.on('tournament:list', onList);
    socketService.on('tournament:update', onUpdate);
    socketService.on('tournament:start', onStart);
    socketService.on('tournament:eliminated', onEliminated);
    socketService.on('tournament:complete', onComplete);

    // If opened with a specific tournamentId, fetch its state
    if (route.params?.tournamentId) fetchState(route.params.tournamentId);

    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
      if (blindTimer.current) clearInterval(blindTimer.current);
      socketService.off('tournament:list', onList);
      socketService.off('tournament:update', onUpdate);
      socketService.off('tournament:start', onStart);
      socketService.off('tournament:eliminated', onEliminated);
      socketService.off('tournament:complete', onComplete);
    };
  }, []);

  // Blind countdown
  useEffect(() => {
    if (!gameState) return;
    blindTimer.current = setInterval(() => {
      setGameState((prev) =>
        prev && prev.nextBlindIn > 0
          ? { ...prev, nextBlindIn: prev.nextBlindIn - 1 }
          : prev,
      );
    }, 1000);
    return () => {
      if (blindTimer.current) clearInterval(blindTimer.current);
    };
  }, [gameState?.blindLevel]);

  // ------ Actions ---------------------------------------------------------
  const handleRegister = (id: string) => {
    socket()?.emit('tournament:register', { tournamentId: id }, (res: any) => {
      if (res?.success) setRegisteredIds((prev) => new Set(prev).add(id));
    });
  };

  const handleUnregister = (id: string) => {
    socket()?.emit('tournament:unregister', { tournamentId: id }, () => {
      setRegisteredIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  };

  const handleAction = (action: 'fold' | 'check' | 'call' | 'raise') => {
    if (!activeId) return;
    const payload: any = { tournamentId: activeId, action };
    if (action === 'raise') payload.amount = raiseAmount;
    socket()?.emit('tournament:action', payload, () => {});
  };

  const handleRebuy = () => {
    if (!activeId) return;
    socket()?.emit('tournament:rebuy', { tournamentId: activeId }, () => {});
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchList();
  };

  // ------ Sub-renders -----------------------------------------------------
  const renderCard = ({ item }: { item: Tournament }) => {
    const isRegistered = registeredIds.has(item.id);
    const isFull = item.playersRegistered >= item.maxPlayers;

    return (
      <Animated.View style={[st.card, shadows.card, { opacity: fadeAnim }]}>
        <View style={st.cardTop}>
          <View style={st.cardTitleRow}>
            <PremiumIcon name="trophy" size={fs(22)} />
            <Text style={st.cardName} numberOfLines={1}>{item.name}</Text>
          </View>
          <View style={[st.statusBadge, { backgroundColor: `${statusColor(item.status)}22` }]}>
            <View style={[st.statusDot, { backgroundColor: statusColor(item.status) }]} />
            <Text style={[st.statusText, { color: statusColor(item.status) }]}>
              {statusLabel(item.status)}
            </Text>
          </View>
        </View>

        <View style={st.cardInfoGrid}>
          <InfoCell label="Buy-in" value={formatChips(item.buyIn)} />
          <InfoCell label="Prize Pool" value={formatChips(item.prizePool)} gold />
          <InfoCell
            label="Players"
            value={`${item.playersRegistered}/${item.maxPlayers}`}
          />
        </View>

        {item.status === 'registering' && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              isRegistered ? handleUnregister(item.id) : handleRegister(item.id)
            }
            disabled={!isRegistered && isFull}
          >
            <LinearGradient
              colors={
                isRegistered
                  ? [colors.red, '#CC3333']
                  : isFull
                  ? [colors.textMuted, colors.textMuted]
                  : (gradients.goldButton as [string, string, ...string[]])
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={st.actionBtn}
            >
              <Text style={st.actionBtnText}>
                {isRegistered ? 'UNREGISTER' : isFull ? 'FULL' : 'REGISTER'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };

  // ------ In-game view ----------------------------------------------------
  if (activeId && gameState) {
    return (
      <View style={st.container}>
        {/* Header */}
        <View style={st.headerRow}>
          <TouchableOpacity
            onPress={() => { setActiveId(null); setGameState(null); }}
            style={st.backBtn}
          >
            <Text style={st.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={st.header}>Tournament</Text>
          <View style={st.backBtn} />
        </View>

        {/* Blind info */}
        <View style={[st.blindBar, glassStyle.card]}>
          <View style={st.blindItem}>
            <Text style={st.blindLabel}>Blinds</Text>
            <Text style={st.blindValue}>
              {formatChips(gameState.smallBlind)}/{formatChips(gameState.bigBlind)}
            </Text>
          </View>
          <View style={st.blindDivider} />
          <View style={st.blindItem}>
            <Text style={st.blindLabel}>Level {gameState.blindLevel}</Text>
            <Text style={st.blindValue}>{formatTimer(gameState.nextBlindIn)}</Text>
          </View>
          <View style={st.blindDivider} />
          <View style={st.blindItem}>
            <Text style={st.blindLabel}>Players</Text>
            <Text style={st.blindValue}>{gameState.playersRemaining}</Text>
          </View>
        </View>

        {/* Stack info */}
        <View style={[st.stackRow, glassStyle.card]}>
          <View style={st.stackItem}>
            <Text style={st.stackLabel}>Your Stack</Text>
            <Text style={[st.stackValue, { color: colors.primary }]}>
              {formatChips(gameState.yourStack)}
            </Text>
          </View>
          <View style={st.stackItem}>
            <Text style={st.stackLabel}>Avg Stack</Text>
            <Text style={st.stackValue}>{formatChips(gameState.averageStack)}</Text>
          </View>
        </View>

        {/* Cards & pot */}
        <View style={[st.tableArea, glassStyle.cardBright]}>
          <Text style={st.potText}>Pot: {formatChips(gameState.pot)}</Text>

          <View style={st.communityRow}>
            {(gameState.communityCards ?? []).map((c, i) => (
              <View key={i} style={st.cardSlot}>
                <Text style={st.cardChar}>{c}</Text>
              </View>
            ))}
            {Array.from({ length: 5 - (gameState.communityCards?.length ?? 0) }).map(
              (_, i) => (
                <View key={`e${i}`} style={[st.cardSlot, st.cardEmpty]} />
              ),
            )}
          </View>

          <View style={st.holeRow}>
            {(gameState.yourCards ?? []).map((c, i) => (
              <View key={i} style={[st.cardSlot, st.holeCard]}>
                <Text style={st.cardChar}>{c}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Actions */}
        {gameState.isYourTurn && (
          <View style={st.actionsWrap}>
            {/* Raise slider */}
            {gameState.canRaise && (
              <View style={st.raiseRow}>
                <TouchableOpacity
                  style={st.raiseTick}
                  onPress={() =>
                    setRaiseAmount((p) => Math.max(gameState.minRaise, p - gameState.bigBlind))
                  }
                >
                  <Text style={st.raiseTickText}>−</Text>
                </TouchableOpacity>
                <Text style={st.raiseAmountText}>{formatChips(raiseAmount)}</Text>
                <TouchableOpacity
                  style={st.raiseTick}
                  onPress={() =>
                    setRaiseAmount((p) => Math.min(gameState.maxRaise, p + gameState.bigBlind))
                  }
                >
                  <Text style={st.raiseTickText}>+</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={st.btnRow}>
              <TouchableOpacity
                style={[st.gameBtn, { backgroundColor: colors.red }]}
                onPress={() => handleAction('fold')}
              >
                <Text style={st.gameBtnText}>FOLD</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[st.gameBtn, { backgroundColor: colors.blue }]}
                onPress={() => handleAction(gameState.canCheck ? 'check' : 'call')}
              >
                <Text style={st.gameBtnText}>
                  {gameState.canCheck ? 'CHECK' : `CALL ${formatChips(gameState.currentBet)}`}
                </Text>
              </TouchableOpacity>

              {gameState.canRaise && (
                <TouchableOpacity
                  onPress={() => handleAction('raise')}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={gradients.goldButton as [string, string, ...string[]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={st.gameBtn}
                  >
                    <Text style={[st.gameBtnText, { color: colors.background }]}>
                      RAISE
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Rebuy */}
        {gameState.rebuyAvailable && (
          <TouchableOpacity onPress={handleRebuy} activeOpacity={0.8}>
            <LinearGradient
              colors={[colors.green, '#1FA04A']}
              style={st.rebuyBtn}
            >
              <Text style={st.rebuyBtnText}>REBUY</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Results modal */}
        <ResultsModal result={result} onClose={() => { setResult(null); setActiveId(null); setGameState(null); }} />
      </View>
    );
  }

  // ------ Lobby -----------------------------------------------------------
  return (
    <View style={st.container}>
      <View style={st.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Text style={st.backBtnText}>‹</Text>
        </TouchableOpacity>
        <PremiumIcon name="trophy" size={fs(24)} />
        <Text style={st.header}>Tournaments</Text>
        <View style={st.backBtn} />
      </View>

      {loading ? (
        <View style={st.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={st.loadingText}>Loading tournaments…</Text>
        </View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={(t) => t.id}
          renderItem={renderCard}
          contentContainerStyle={st.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <Text style={st.emptyText}>No tournaments available right now.</Text>
          }
        />
      )}

      <ResultsModal result={result} onClose={() => setResult(null)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------
function InfoCell({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <View style={st.infoCell}>
      <Text style={st.infoCellLabel}>{label}</Text>
      <Text style={[st.infoCellValue, gold && { color: colors.primary }]}>{value}</Text>
    </View>
  );
}

function ResultsModal({
  result,
  onClose,
}: {
  result: TournamentResult | null;
  onClose: () => void;
}) {
  if (!result) return null;

  return (
    <Modal transparent animationType="fade" visible={!!result} onRequestClose={onClose}>
      <View style={st.modalOverlay}>
        <View style={[st.modalBox, glassStyle.cardBright]}>
          <PremiumIcon name="trophy" size={fs(40)} />
          <Text style={st.modalTitle}>
            {result.place <= 3 ? '🎉 Congratulations!' : 'Tournament Over'}
          </Text>
          <Text style={st.modalPlace}>#{result.place} Place</Text>
          {result.prize > 0 && (
            <Text style={st.modalPrize}>Won {formatChips(result.prize)} chips</Text>
          )}

          {result.results && result.results.length > 0 && (
            <View style={st.standingsWrap}>
              <Text style={st.standingsTitle}>Final Standings</Text>
              {result.results.slice(0, 6).map((r) => (
                <View key={r.place} style={st.standingsRow}>
                  <Text style={st.standingsPlace}>#{r.place}</Text>
                  <Text style={st.standingsName} numberOfLines={1}>{r.displayName}</Text>
                  <Text style={st.standingsPrize}>{formatChips(r.prize)}</Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
            <LinearGradient
              colors={gradients.goldButton as [string, string, ...string[]]}
              style={st.modalBtn}
            >
              <Text style={st.modalBtnText}>CLOSE</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const row = (mb = 0): any => ({ flexDirection: 'row', alignItems: 'center', marginBottom: mb });
const center: any = { justifyContent: 'center', alignItems: 'center' };
const bold = (sz: number, c = colors.text): any => ({ color: c, fontSize: fs(sz), fontWeight: '700' });
const label = (sz: number): any => ({ color: colors.textSecondary, fontSize: fs(sz) });

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: hp(56), paddingHorizontal: wp(16) },
  centered: { flex: 1, ...center },
  loadingText: { ...label(14), marginTop: hp(12) },
  headerRow: { ...row(hp(16)), gap: wp(8) },
  header: { ...bold(24, colors.primary), flex: 1 },
  backBtn: { width: wp(32), height: wp(32), borderRadius: wp(16), backgroundColor: 'rgba(255,255,255,0.08)', ...center },
  backBtnText: { color: '#fff', fontSize: fs(22), fontWeight: '600', marginTop: -2 },
  list: { paddingBottom: hp(40), gap: hp(14) },
  emptyText: { color: colors.textMuted, fontSize: fs(14), textAlign: 'center', marginTop: hp(60) },
  card: { ...glassStyle.card, padding: wp(16) },
  cardTop: { ...row(hp(12)), justifyContent: 'space-between' },
  cardTitleRow: { ...row(), gap: wp(8), flex: 1, marginRight: wp(8) },
  cardName: { ...bold(17), flexShrink: 1 },
  statusBadge: { ...row(), paddingHorizontal: wp(10), paddingVertical: hp(4), borderRadius: borderRadius.full, gap: wp(5) },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: fs(11), fontWeight: '600' },
  cardInfoGrid: { ...row(hp(12)), justifyContent: 'space-between' },
  infoCell: { alignItems: 'center', flex: 1 },
  infoCellLabel: { ...label(11), marginBottom: hp(2) },
  infoCellValue: { ...bold(15) },
  actionBtn: { borderRadius: borderRadius.md, paddingVertical: hp(11), alignItems: 'center' },
  actionBtnText: { color: colors.background, fontSize: fs(13), fontWeight: '800', letterSpacing: 1 },
  blindBar: { ...row(), padding: wp(12), marginBottom: hp(10) },
  blindItem: { flex: 1, alignItems: 'center' },
  blindLabel: label(11),
  blindValue: { ...bold(15), marginTop: hp(2) },
  blindDivider: { width: 1, height: hp(28), backgroundColor: colors.glassBorder },
  stackRow: { ...row(), padding: wp(12), marginBottom: hp(10) },
  stackItem: { flex: 1, alignItems: 'center' },
  stackLabel: label(11),
  stackValue: { ...bold(18), marginTop: hp(2) },
  tableArea: { padding: wp(16), alignItems: 'center', marginBottom: hp(10) },
  potText: { ...bold(16, colors.primary), marginBottom: hp(12) },
  communityRow: { ...row(), gap: wp(6), marginBottom: hp(14) },
  cardSlot: { width: wp(48), height: hp(64), borderRadius: borderRadius.sm, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: colors.glassBorder, ...center },
  cardEmpty: { borderStyle: 'dashed' as const, opacity: 0.4 },
  cardChar: bold(18),
  holeRow: { ...row(), gap: wp(8) },
  holeCard: { backgroundColor: 'rgba(212,175,55,0.12)', borderColor: colors.borderGold },
  actionsWrap: { marginTop: hp(4) },
  raiseRow: { ...row(), justifyContent: 'center', gap: wp(16), marginBottom: hp(10) },
  raiseTick: { width: wp(36), height: wp(36), borderRadius: wp(18), backgroundColor: 'rgba(255,255,255,0.1)', ...center },
  raiseTickText: { ...bold(20), fontWeight: '600' },
  raiseAmountText: { ...bold(18, colors.primary), minWidth: wp(80), textAlign: 'center' },
  btnRow: { ...row(), gap: wp(8) },
  gameBtn: { flex: 1, borderRadius: borderRadius.md, paddingVertical: hp(13), ...center },
  gameBtnText: { color: '#fff', fontSize: fs(13), fontWeight: '800', letterSpacing: 0.8 },
  rebuyBtn: { borderRadius: borderRadius.md, paddingVertical: hp(12), alignItems: 'center', marginTop: hp(10) },
  rebuyBtnText: { color: '#fff', fontSize: fs(13), fontWeight: '800', letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, ...center, padding: wp(24) },
  modalBox: { width: '100%', padding: wp(24), alignItems: 'center' },
  modalTitle: { ...bold(22), marginTop: hp(12) },
  modalPlace: { ...bold(32, colors.primary), fontWeight: '800', marginTop: hp(6) },
  modalPrize: { color: colors.green, fontSize: fs(16), fontWeight: '600', marginTop: hp(4) },
  standingsWrap: { width: '100%', marginTop: hp(16) },
  standingsTitle: { ...label(12), fontWeight: '600', marginBottom: hp(6), textAlign: 'center' },
  standingsRow: { ...row(), paddingVertical: hp(5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder },
  standingsPlace: { ...bold(13, colors.primary), width: wp(32) },
  standingsName: { color: colors.text, fontSize: fs(13), flex: 1 },
  standingsPrize: { color: colors.green, fontSize: fs(13), fontWeight: '600' },
  modalBtn: { borderRadius: borderRadius.md, paddingVertical: hp(12), paddingHorizontal: wp(40), marginTop: hp(20), alignItems: 'center' },
  modalBtnText: { color: colors.background, fontSize: fs(14), fontWeight: '800', letterSpacing: 1 },
});
