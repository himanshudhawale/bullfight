import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  StatusBar,
  Dimensions,
  Image,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { LinearGradient } from 'expo-linear-gradient';
import { socketService } from '../../services/socket';
import PlayingCard from '../../components/PlayingCard';
import type { Card, PokerTableState, PokerSeatClient, PokerPot, PokerAction } from '../../../../shared/types';
import { POKER_QUICK_MESSAGES } from '../../../../shared/constants';

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
const ASSETS = {
  chipIcon: require('../../../assets/game/gold_coin.png'),
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const ACTION_TIMEOUT = 30;

type PokerRouteParams = { Poker: { tableId: string } };

// ---------------------------------------------------------------------------
// Dynamic seat positioning — elliptical layout for 6–9 players
// ---------------------------------------------------------------------------
const SEAT_CENTER = { x: 50, y: 46 };   // ellipse center (% of table area)
const SEAT_RX = 44;                       // horizontal radius (%)
const SEAT_RY = 38;                       // vertical radius (%)
const SEAT_PAD = { top: 6, bottom: 14, left: 6, right: 6 }; // keep seats in-bounds

function generateSeatPositions(count: number): { top: number; left: number }[] {
  const seats: { top: number; left: number }[] = [];
  for (let i = 0; i < count; i++) {
    // Start from bottom-center (π/2 = 6 o'clock) and go clockwise
    const angle = Math.PI / 2 - (2 * Math.PI / count) * i;
    const rawLeft = SEAT_CENTER.x + SEAT_RX * Math.cos(angle);
    const rawTop  = SEAT_CENTER.y + SEAT_RY * Math.sin(angle);
    const left = Math.max(SEAT_PAD.left, Math.min(100 - SEAT_PAD.right, rawLeft));
    const top  = Math.max(SEAT_PAD.top,  Math.min(100 - SEAT_PAD.bottom, rawTop));
    seats.push({ top: Math.round(top * 10) / 10, left: Math.round(left * 10) / 10 });
  }
  return seats;
}

// Pre-compute for 6–9 players; 8 is the default
const SEAT_LAYOUTS: Record<number, { top: number; left: number }[]> = {
  6: generateSeatPositions(6),
  7: generateSeatPositions(7),
  8: generateSeatPositions(8),
  9: generateSeatPositions(9),
};

// Bet pill offset: push toward table center from each seat position
function getBetOffset(seatPos: { top: number; left: number }): { top: number; left: number } {
  const dx = SEAT_CENTER.x - seatPos.left;
  const dy = SEAT_CENTER.y - seatPos.top;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const scale = 22 / dist;
  return {
    top: Math.round(dy * scale),
    left: Math.round(dx * scale),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatChips(n: number): string {
  if (n == null) return '$0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ChatBubble {
  seatIndex: number;
  text: string;
  key: number;
}

function SeatChatBubble({ text }: { text: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    const fadeOut = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    }, 3600);

    return () => clearTimeout(fadeOut);
  }, []);

  return (
    <Animated.View style={[st.chatBubble, { opacity, transform: [{ translateY }] }]}>
      <Text style={st.chatBubbleText}>{text}</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Animated wrappers — card deal, chip-to-pot, win-chip
// ---------------------------------------------------------------------------

/** Card slides in from center with scale-up + fade-in */
function DealAnimatedCard({ card, faceDown, size, delay = 0 }: {
  card?: import('../../../../shared/types').Card;
  faceDown?: boolean;
  size: 'sm' | 'md' | 'lg';
  delay?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.3)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, delay, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ scale }, { translateY }] }}>
      <PlayingCard card={card} faceDown={faceDown} size={size} />
    </Animated.View>
  );
}

/** Chip icon that pops up from seat toward pot (purely visual feedback) */
function ChipToPotAnim({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      opacity.setValue(1);
      translateY.setValue(0);
      scale.setValue(1);
      Animated.parallel([
        Animated.timing(translateY, { toValue: -30, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.5, duration: 400, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 400, delay: 100, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.Image
      source={ASSETS.chipIcon}
      style={[st.chipAnim, { opacity, transform: [{ translateY }, { scale }] }]}
    />
  );
}

/** Pot win animation — chip icon drops down toward winner with bounce */
function WinChipAnim({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-25)).current;
  const scale = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (visible) {
      opacity.setValue(0);
      translateY.setValue(-25);
      scale.setValue(0.4);
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.spring(translateY, { toValue: 0, friction: 5, tension: 60, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1.2, friction: 4, tension: 50, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 600, delay: 800, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.Image
      source={ASSETS.chipIcon}
      style={[st.winChipAnim, { opacity, transform: [{ translateY }, { scale }] }]}
    />
  );
}

/** Animated pot total — bounces on value change */
function AnimatedPotDisplay({ pots }: { pots: PokerPot[] }) {
  const total = pots.reduce((sum, p) => sum + p.amount, 0);
  const prevTotal = useRef(total);
  const bounce = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (total !== prevTotal.current && total > 0) {
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1.15, duration: 150, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.spring(bounce, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      ]).start();
    }
    prevTotal.current = total;
  }, [total]);

  if (total <= 0) return null;

  return (
    <Animated.View style={[st.potDisplay, { transform: [{ scale: bounce }] }]}>
      <Image source={ASSETS.chipIcon} style={st.potChipIcon} />
      <Text style={st.potLabel}>POT</Text>
      <Text style={st.potText}>{formatChips(total)}</Text>
    </Animated.View>
  );
}

// Avatar with optional timer ring
function AvatarCircle({
  name,
  isHero,
  isActive,
  countdown,
}: {
  name: string;
  isHero: boolean;
  isActive: boolean;
  countdown: number;
}) {
  const letter = (name || '?')[0].toUpperCase();
  const progress = isActive ? Math.max(0, countdown / ACTION_TIMEOUT) : 0;

  return (
    <View style={st.avatarOuter}>
      {/* Timer ring background */}
      {isActive && (
        <View style={[st.timerRing, { borderColor: 'rgba(218,165,32,0.2)' }]} />
      )}
      {/* Timer ring progress (approximate quadrant approach) */}
      {isActive && progress > 0 && (
        <View
          style={[
            st.timerRing,
            {
              borderColor: C.gold,
              opacity: 0.5 + progress * 0.5,
              borderRightColor: progress < 0.75 ? 'transparent' : C.gold,
              borderBottomColor: progress < 0.5 ? 'transparent' : C.gold,
              borderLeftColor: progress < 0.25 ? 'transparent' : C.gold,
              transform: [{ rotate: '-90deg' }],
            },
          ]}
        />
      )}
      <LinearGradient
        colors={isHero ? ['#DAA520', '#B8860B'] : ['#9B59B6', '#6C3483']}
        style={st.avatarCircle}
      >
        <Text style={st.avatarLetter}>{letter}</Text>
      </LinearGradient>
    </View>
  );
}

function SeatView({
  seat,
  seatPosition,
  isDealer,
  isSmallBlind,
  isBigBlind,
  isActive,
  isHero,
  winner,
  chatText,
  countdown,
}: {
  seat: PokerSeatClient;
  seatPosition: { top: number; left: number };
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isActive: boolean;
  isHero: boolean;
  winner: { amount: number; hand?: string } | null;
  chatText: string | null;
  countdown: number;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const allInPulse = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (isActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isActive]);

  useEffect(() => {
    if (seat.allIn) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(allInPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(allInPulse, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [seat.allIn]);

  if (!seat.userId) {
    return (
      <View style={st.seatEmpty}>
        <Text style={st.seatEmptyText}>+</Text>
      </View>
    );
  }

  const betOffset = getBetOffset(seatPosition);

  return (
    <Animated.View
      style={[
        st.seatOccupied,
        isActive && st.seatActive,
        seat.folded && st.seatFolded,
        winner && st.seatWinner,
        { transform: [{ scale: pulseAnim }] },
      ]}
    >
      {/* Dealer button */}
      {isDealer && (
        <View style={st.dealerChip}>
          <Text style={st.dealerChipText}>D</Text>
        </View>
      )}
      {/* SB badge */}
      {isSmallBlind && !isDealer && (
        <View style={[st.blindBadge, st.sbBadge]}>
          <Text style={st.blindBadgeText}>SB</Text>
        </View>
      )}
      {/* BB badge */}
      {isBigBlind && (
        <View style={[st.blindBadge, st.bbBadge]}>
          <Text style={st.blindBadgeText}>BB</Text>
        </View>
      )}

      {/* Avatar */}
      <AvatarCircle
        name={seat.displayName}
        isHero={isHero}
        isActive={isActive}
        countdown={countdown}
      />

      {/* Username */}
      <Text style={st.seatName} numberOfLines={1}>
        {seat.displayName}
      </Text>

      {/* Chip count */}
      <View style={st.seatChipsRow}>
        <Image source={ASSETS.chipIcon} style={st.seatChipIcon} />
        <Text style={st.seatChips}>{formatChips(seat.chips)}</Text>
      </View>

      {/* Hole cards */}
      <View style={st.seatCards}>
        {seat.holeCards && seat.holeCards.length > 0 ? (
          seat.holeCards.map((card, i) => (
            <DealAnimatedCard key={`${card.rank}-${card.suit}-${i}`} card={card} size="sm" delay={i * 100} />
          ))
        ) : seat.holeCards === null ? null : (
          <>
            <DealAnimatedCard faceDown size="sm" delay={0} />
            <DealAnimatedCard faceDown size="sm" delay={100} />
          </>
        )}
      </View>

      {/* ALL IN badge */}
      {seat.allIn && (
        <Animated.Text style={[st.allInBadge, { opacity: allInPulse }]}>
          ALL IN
        </Animated.Text>
      )}

      {/* Current bet pill + chip-to-pot animation */}
      {seat.currentBet > 0 && (
        <View
          style={[
            st.seatBet,
            { top: betOffset.top, marginLeft: betOffset.left },
          ]}
        >
          <ChipToPotAnim visible={seat.currentBet > 0} />
          <Image source={ASSETS.chipIcon} style={st.betChipIcon} />
          <Text style={st.seatBetText}>{formatChips(seat.currentBet)}</Text>
        </View>
      )}

      {/* Winner badge + win chip animation */}
      {winner && (
        <View style={st.winnerBadge}>
          <WinChipAnim visible={!!winner} />
          <Text style={st.winnerBadgeText}>+{formatChips(winner.amount)}</Text>
          {winner.hand && <Text style={st.winnerHandText}>{winner.hand}</Text>}
        </View>
      )}

      {chatText && <SeatChatBubble text={chatText} key={chatText} />}
    </Animated.View>
  );
}

function ActionButtons({
  state,
  userId,
  onAction,
}: {
  state: PokerTableState;
  userId: string;
  onAction: (action: PokerAction, amount?: number) => void;
}) {
  const [raiseAmount, setRaiseAmount] = useState(0);
  const allInPulse = useRef(new Animated.Value(0)).current;

  const mySeat = state.seats.find(s => s.userId === userId);
  const isMyTurn = mySeat && state.activeSeat === mySeat.seatIndex && state.phase !== 'waiting' && state.phase !== 'showdown';

  const canCheck = mySeat && mySeat.currentBet >= (state.seats.reduce((max, s) => Math.max(max, s.currentBet), 0));
  const toCall = mySeat ? Math.max(0, state.seats.reduce((max, s) => Math.max(max, s.currentBet), 0) - mySeat.currentBet) : 0;

  useEffect(() => {
    setRaiseAmount(state.minRaise);
  }, [state.minRaise, state.handNumber]);

  useEffect(() => {
    if (isMyTurn) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(allInPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(allInPulse, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isMyTurn]);

  if (!isMyTurn) return null;

  const maxChips = mySeat?.chips ?? 0;
  const minR = state.minRaise;
  const step = Math.max(1, Math.floor((maxChips - minR) / 10));

  const decreaseRaise = () => setRaiseAmount(prev => Math.max(minR, prev - step));
  const increaseRaise = () => setRaiseAmount(prev => Math.min(maxChips, prev + step));

  return (
    <View style={st.actionWrapper}>
      {/* Raise slider row */}
      <View style={st.raiseRow}>
        <TouchableOpacity style={st.raiseStepBtn} onPress={decreaseRaise} activeOpacity={0.6}>
          <Text style={st.raiseStepText}>−</Text>
        </TouchableOpacity>
        <View style={st.raiseAmountDisplay}>
          <Text style={st.raiseAmountText}>{formatChips(raiseAmount)}</Text>
        </View>
        <TouchableOpacity style={st.raiseStepBtn} onPress={increaseRaise} activeOpacity={0.6}>
          <Text style={st.raiseStepText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.raisePreset}
          onPress={() => setRaiseAmount(Math.min(maxChips, minR * 2))}
        >
          <Text style={st.raisePresetText}>2×</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.raisePreset}
          onPress={() => setRaiseAmount(Math.min(maxChips, Math.floor(maxChips / 2)))}
        >
          <Text style={st.raisePresetText}>½</Text>
        </TouchableOpacity>
      </View>

      {/* Action buttons row */}
      <View style={st.actionBar}>
        <TouchableOpacity
          style={[st.actionBtn, st.actionFold]}
          onPress={() => onAction('fold')}
          activeOpacity={0.7}
        >
          <Text style={[st.actionBtnText, { color: '#E74C3C' }]}>FOLD</Text>
        </TouchableOpacity>

        {canCheck ? (
          <TouchableOpacity
            style={[st.actionBtn, st.actionCheck]}
            onPress={() => onAction('check')}
            activeOpacity={0.7}
          >
            <Text style={[st.actionBtnText, { color: C.green }]}>CHECK</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[st.actionBtn, st.actionCall]}
            onPress={() => onAction('call')}
            activeOpacity={0.7}
          >
            <Text style={[st.actionBtnText, { color: '#82C8FF' }]}>
              CALL {formatChips(toCall)}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[st.actionBtn, st.actionRaise]}
          onPress={() => onAction('raise', raiseAmount)}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={['#DAA520', '#B8860B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.raiseGradient}
          >
            <Text style={[st.actionBtnText, { color: '#FFF' }]}>
              RAISE {formatChips(raiseAmount)}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <Animated.View style={{ opacity: Animated.add(0.7, Animated.multiply(allInPulse, 0.3)) }}>
          <TouchableOpacity
            style={[st.actionBtn, st.actionAllIn]}
            onPress={() => onAction('all_in')}
            activeOpacity={0.7}
          >
            <Text style={[st.actionBtnText, { color: '#DDA0DD' }]}>ALL IN</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

// Oval table felt background
function TableFelt() {
  return (
    <View style={st.feltContainer}>
      <LinearGradient
        colors={[C.feltLight, C.felt, C.feltDark]}
        style={st.feltGradient}
        start={{ x: 0.5, y: 0.3 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={st.feltOval}>
          <View style={st.feltOvalInner} />
        </View>
      </LinearGradient>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export default function PokerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PokerRouteParams, 'Poker'>>();
  const tableId = route.params.tableId;

  const [state, setState] = useState<PokerTableState | null>(null);
  const [connected, setConnected] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [chatBubbles, setChatBubbles] = useState<ChatBubble[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const chatKeyRef = useRef(0);
  // Orientation lock
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  // Socket connection
  useEffect(() => {
    let mounted = true;

    const socket = socketService.getSocket();
    if (!socket) return;

    setUserId((socket as any).userId || '');

    const onTableState = (s: PokerTableState) => {
      if (!mounted) return;
      setState(s);
    };

    const onConnect = () => mounted && setConnected(true);
    const onDisconnect = () => mounted && setConnected(false);

    socket.on('poker:table_state', onTableState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Chat listener
    const onChat = (msg: { seatIndex: number; text: string }) => {
      if (!mounted) return;
      const key = ++chatKeyRef.current;
      setChatBubbles(prev => [...prev, { seatIndex: msg.seatIndex, text: msg.text, key }]);
      setTimeout(() => {
        setChatBubbles(prev => prev.filter(b => b.key !== key));
      }, 4000);
    };
    socket.on('poker:chat', onChat);

    // Join the table
    socket.emit('poker:join_table', { tableId });
    setConnected(socket.connected);

    // Try to get userId from socket
    const sid = (socket as any).auth?.userId || (socket as any).userId;
    if (sid) setUserId(sid);

    return () => {
      mounted = false;
      socket.off('poker:table_state', onTableState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('poker:chat', onChat);
      socket.emit('poker:leave_table', { tableId });
    };
  }, [tableId]);

  const handleAction = useCallback((action: PokerAction, amount?: number) => {
    const socket = socketService.getSocket();
    if (!socket?.connected) return;
    socket.emit('poker:action', { tableId, action, amount });
  }, [tableId]);

  const handleGoBack = useCallback(() => {
    const socket = socketService.getSocket();
    socket?.emit('poker:leave_table', { tableId });
    navigation.goBack();
  }, [tableId, navigation]);

  const handleSendChat = useCallback((messageId: string) => {
    socketService.sendPokerChat(tableId, messageId);
    setChatOpen(false);
  }, [tableId]);

  // Find hero seat index for seat ordering
  const heroSeatIdx = state?.seats.findIndex(s => s.userId === userId) ?? -1;

  // Pick layout for current seat count and rotate so hero is at position 0
  const seatCount = state?.seats.length ?? 8;
  const seatLayout = SEAT_LAYOUTS[Math.min(Math.max(seatCount, 6), 9)] ?? SEAT_LAYOUTS[8];

  const rotatedPositions = useMemo(() => {
    if (!state || heroSeatIdx < 0) return seatLayout;
    const n = state.seats.length;
    return state.seats.map((_, i) => {
      const visualIdx = (i - heroSeatIdx + n) % n;
      return seatLayout[visualIdx % seatLayout.length];
    });
  }, [state?.seats.length, heroSeatIdx, seatLayout]);

  // Countdown pulse animation
  const countdownPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (state && state.countdown > 0 && state.countdown <= 3) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(countdownPulse, { toValue: 1.2, duration: 300, useNativeDriver: true }),
          Animated.timing(countdownPulse, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      countdownPulse.setValue(1);
    }
  }, [state?.countdown]);

  // Loading
  if (!state) {
    return (
      <View style={st.loadingContainer}>
        <StatusBar hidden />
        <LinearGradient colors={[C.bg, '#0F0F24']} style={st.loadingGradient}>
          <Text style={st.loadingText}>Joining table…</Text>
        </LinearGradient>
      </View>
    );
  }

  // Build winners map for display
  const winnerMap = new Map<number, { amount: number; hand?: string }>();
  if (state.winners) {
    for (const w of state.winners) {
      winnerMap.set(w.seatIndex, { amount: w.amount, hand: w.hand });
    }
  }

  // Build chat map: latest bubble per seat
  const chatMap = new Map<number, string>();
  for (const b of chatBubbles) {
    chatMap.set(b.seatIndex, b.text);
  }

  // Derive SB / BB from dealer position
  const numActive = state.seats.filter(se => se.userId).length;
  const sbSeat = numActive === 2
    ? state.dealerSeat
    : (state.dealerSeat + 1) % state.seats.length;
  const bbSeat = numActive === 2
    ? (state.dealerSeat + 1) % state.seats.length
    : (state.dealerSeat + 2) % state.seats.length;

  return (
    <View style={st.root}>
      <StatusBar hidden />

      {/* Top info bar */}
      <View style={st.topBar}>
        <TouchableOpacity onPress={handleGoBack} style={st.backBtn} activeOpacity={0.7}>
          <Text style={st.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <View style={st.topCenter}>
          <Text style={st.tableInfoText}>Hand #{state.handNumber ?? 0}</Text>
        </View>
        <View style={st.countdown}>
          {state.countdown > 0 && state.phase !== 'waiting' && state.phase !== 'showdown' && (
            <Animated.Text
              style={[
                st.countdownText,
                state.countdown <= 5 && st.countdownUrgent,
                state.countdown <= 3 && { transform: [{ scale: countdownPulse }] },
              ]}
            >
              {state.countdown}s
            </Animated.Text>
          )}
        </View>
      </View>

      {/* Table area */}
      <View style={st.tableArea}>
        <TableFelt />

        {/* Community cards + pot */}
        <View style={st.communityArea}>
          <AnimatedPotDisplay pots={state.pots} />
          <View style={st.communityCards}>
            {state.communityCards.map((card, i) => (
              <DealAnimatedCard key={`c-${card.rank}-${card.suit}-${i}`} card={card} size="md" delay={i * 80} />
            ))}
            {Array.from({ length: 5 - state.communityCards.length }).map((_, i) => (
              <View key={`empty-${i}`} style={st.communityPlaceholder} />
            ))}
          </View>
        </View>

        {/* Seats */}
        {state.seats.map((seat, idx) => {
          const pos = rotatedPositions[idx % rotatedPositions.length];
          return (
            <View
              key={idx}
              style={[
                st.seatContainer,
                { top: `${pos.top}%`, left: `${pos.left}%` },
              ]}
            >
              <SeatView
                seat={seat}
                seatPosition={pos}
                isDealer={state.dealerSeat === idx}
                isSmallBlind={sbSeat === idx}
                isBigBlind={bbSeat === idx}
                isActive={state.activeSeat === idx}
                isHero={seat.userId === userId}
                winner={winnerMap.get(idx) ?? null}
                chatText={chatMap.get(idx) ?? null}
                countdown={state.activeSeat === idx ? state.countdown : 0}
              />
            </View>
          );
        })}
      </View>

      {/* Bottom bar: actions + chat toggle */}
      <View style={st.bottomBar}>
        <ActionButtons state={state} userId={userId} onAction={handleAction} />

        <TouchableOpacity
          style={[st.chatToggle, chatOpen && st.chatToggleActive]}
          onPress={() => setChatOpen(prev => !prev)}
          activeOpacity={0.7}
        >
          <Text style={st.chatToggleText}>💬</Text>
        </TouchableOpacity>
      </View>

      {/* Quick chat overlay */}
      {chatOpen && (
        <View style={st.chatOverlay}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chatList}>
            {POKER_QUICK_MESSAGES.map(msg => (
              <TouchableOpacity
                key={msg.id}
                style={st.chatPill}
                onPress={() => handleSendChat(msg.id)}
                activeOpacity={0.7}
              >
                <Text style={st.chatPillText}>{msg.text}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------
const C = {
  bg: '#0A0A16',
  surface: '#12122A',
  surfaceLight: '#1C1C3A',
  gold: '#DAA520',
  goldLight: 'rgba(218,165,32,0.15)',
  text: '#F0F0F0',
  textSec: '#7A7F94',
  green: '#26D95C',
  red: '#E74C3C',
  blue: '#3498DB',
  purple: '#9B59B6',
  border: 'rgba(255,255,255,0.08)',
  felt: '#0D4A22',
  feltLight: '#126B33',
  feltDark: '#062E13',
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const st = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────────
  root: { flex: 1, backgroundColor: C.bg },
  loadingContainer: { flex: 1 },
  loadingGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: C.gold, fontSize: 18, fontWeight: '700', letterSpacing: 2 },

  // ── Top bar ─────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'rgba(18,18,42,0.85)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  backBtnText: { color: C.gold, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  topCenter: { alignItems: 'center' },
  tableInfoText: { color: C.textSec, fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  countdown: { minWidth: 44, alignItems: 'flex-end' },
  countdownText: { color: C.gold, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  countdownUrgent: { color: C.red },

  // ── Table area ──────────────────────────────────────────────────────────
  tableArea: { flex: 1, position: 'relative', overflow: 'hidden' },

  // ── Felt ────────────────────────────────────────────────────────────────
  feltContainer: { ...StyleSheet.absoluteFillObject },
  feltGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  feltOval: {
    width: '70%',
    height: '65%',
    borderRadius: 9999,
    borderWidth: 2.5,
    borderColor: 'rgba(218,165,32,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(13,74,34,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  feltOvalInner: {
    width: '94%',
    height: '88%',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(218,165,32,0.1)',
    backgroundColor: 'rgba(18,107,51,0.25)',
  },

  // ── Community cards ─────────────────────────────────────────────────────
  communityArea: {
    position: 'absolute',
    top: '32%',
    left: '25%',
    right: '25%',
    alignItems: 'center',
    zIndex: 5,
  },
  communityCards: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  communityPlaceholder: {
    width: 48,
    height: 68,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(218,165,32,0.2)',
    borderStyle: 'dashed',
    margin: 1,
  },

  // ── Pot ─────────────────────────────────────────────────────────────────
  potDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,22,0.6)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  potChipIcon: { width: 18, height: 18, resizeMode: 'contain', marginRight: 6 },
  potLabel: { color: C.textSec, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginRight: 4 },
  potText: { color: C.gold, fontSize: 16, fontWeight: '800' },

  // ── Seats ───────────────────────────────────────────────────────────────
  seatContainer: {
    position: 'absolute',
    transform: [{ translateX: -48 }, { translateY: -44 }],
    alignItems: 'center',
    width: 96,
    zIndex: 10,
  },
  seatEmpty: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(28,28,58,0.4)',
  },
  seatEmptyText: { color: C.textSec, fontSize: 18, fontWeight: '300' },
  seatOccupied: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 5,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(18,18,42,0.92)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    minWidth: 86,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  seatActive: {
    borderColor: C.gold,
    borderWidth: 1.5,
    shadowColor: C.gold,
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  seatFolded: { opacity: 0.35 },
  seatWinner: {
    borderColor: C.green,
    borderWidth: 1.5,
    shadowColor: C.green,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    backgroundColor: 'rgba(38,217,92,0.08)',
  },

  // ── Avatar ──────────────────────────────────────────────────────────────
  avatarOuter: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  timerRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: C.gold,
  },

  // ── Seat info ───────────────────────────────────────────────────────────
  seatName: {
    color: C.text,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 1,
    maxWidth: 70,
    textAlign: 'center',
  },
  seatCards: { flexDirection: 'row', gap: 2, marginVertical: 2 },
  seatChipsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  seatChipIcon: { width: 11, height: 11, resizeMode: 'contain', marginRight: 2 },
  seatChips: { color: C.gold, fontSize: 10, fontWeight: '700' },

  // ── Bet pill ────────────────────────────────────────────────────────────
  seatBet: {
    position: 'absolute',
    bottom: -18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18,18,42,0.85)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(218,165,32,0.3)',
  },
  betChipIcon: { width: 10, height: 10, resizeMode: 'contain', marginRight: 3 },
  seatBetText: { color: C.gold, fontSize: 9, fontWeight: '700' },

  // ── ALL IN ──────────────────────────────────────────────────────────────
  allInBadge: {
    color: C.red,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 1,
  },

  // ── Dealer / Blind badges ───────────────────────────────────────────────
  dealerChip: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 4,
  },
  dealerChipText: { color: '#000', fontSize: 9, fontWeight: '900' },
  blindBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 20,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 12,
  },
  sbBadge: { backgroundColor: '#2980B9' },
  bbBadge: { backgroundColor: '#E67E22' },
  blindBadgeText: { color: '#FFF', fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },

  // ── Winner badge ────────────────────────────────────────────────────────
  winnerBadge: {
    position: 'absolute',
    top: -22,
    backgroundColor: 'rgba(38,217,92,0.92)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    zIndex: 15,
  },
  winnerBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  winnerHandText: { color: '#FFF', fontSize: 8, fontWeight: '600', textAlign: 'center' },

  // ── Action buttons ──────────────────────────────────────────────────────
  actionWrapper: { flex: 1, justifyContent: 'center' },
  raiseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    gap: 6,
  },
  raiseStepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surfaceLight,
    borderWidth: 1,
    borderColor: 'rgba(218,165,32,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  raiseStepText: { color: C.gold, fontSize: 16, fontWeight: '700' },
  raiseAmountDisplay: {
    backgroundColor: 'rgba(218,165,32,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(218,165,32,0.25)',
    minWidth: 70,
    alignItems: 'center',
  },
  raiseAmountText: { color: C.gold, fontSize: 13, fontWeight: '800' },
  raisePreset: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(218,165,32,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(218,165,32,0.2)',
  },
  raisePresetText: { color: C.gold, fontSize: 10, fontWeight: '700' },

  actionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
  },
  actionBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  actionFold: {
    backgroundColor: '#5C1010',
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.25)',
    shadowColor: '#E74C3C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  actionCheck: {
    backgroundColor: '#0D3B1A',
    borderWidth: 1,
    borderColor: 'rgba(38,217,92,0.2)',
  },
  actionCall: {
    backgroundColor: '#1A3A5C',
    borderWidth: 1,
    borderColor: 'rgba(52,152,219,0.2)',
  },
  actionRaise: { padding: 0, overflow: 'hidden' },
  raiseGradient: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionAllIn: {
    backgroundColor: '#4A1A6B',
    borderWidth: 1,
    borderColor: 'rgba(155,89,182,0.3)',
    shadowColor: C.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },

  // ── Bottom bar ──────────────────────────────────────────────────────────
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: C.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },

  // ── Chat toggle ─────────────────────────────────────────────────────────
  chatToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    marginLeft: 8,
  },
  chatToggleActive: { borderColor: C.gold, backgroundColor: C.goldLight },
  chatToggleText: { fontSize: 15 },

  // ── Chat bubble ─────────────────────────────────────────────────────────
  chatBubble: {
    position: 'absolute',
    top: -28,
    backgroundColor: 'rgba(218,165,32,0.94)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 100,
    alignSelf: 'center',
    zIndex: 20,
  },
  chatBubbleText: { color: '#FFF', fontSize: 9, fontWeight: '700', textAlign: 'center' },

  // ── Chip animations ────────────────────────────────────────────────────
  chipAnim: {
    position: 'absolute',
    width: 16,
    height: 16,
    top: -8,
    alignSelf: 'center',
    zIndex: 30,
  },
  winChipAnim: {
    width: 20,
    height: 20,
    alignSelf: 'center',
    marginBottom: 2,
  },

  // ── Chat overlay ────────────────────────────────────────────────────────
  chatOverlay: {
    position: 'absolute',
    bottom: 52,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10,10,22,0.94)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  chatList: { gap: 8, alignItems: 'center' },
  chatPill: {
    backgroundColor: C.surfaceLight,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(218,165,32,0.25)',
  },
  chatPillText: { color: C.gold, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});
