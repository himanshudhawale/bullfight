import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TextInput, ActivityIndicator, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadows, wp, hp, fs, borderRadius, gradients, spacing, glassStyle } from '../theme';
import PremiumIcon from './PremiumIcon';
import { api } from '../services/api';

// ─── Types ──────────────────────────────────────────────────────────────────
interface GiftChipsModalProps {
  visible: boolean;
  onClose: () => void;
  friend: { id: string; displayName: string } | null;
  onSuccess?: (amount: number) => void;
}

interface GiftLimit {
  dailyLimit: number;
  usedToday: number;
  remaining: number;
}

const QUICK_AMOUNTS = [1_000, 5_000, 10_000, 50_000, 100_000];
const QUICK_LABELS = ['1K', '5K', '10K', '50K', '100K'];
const MIN_GIFT = 1_000;

// ─── Component ──────────────────────────────────────────────────────────────
export default function GiftChipsModal({ visible, onClose, friend, onSuccess }: GiftChipsModalProps) {
  const [amount, setAmount] = useState('');
  const [limit, setLimit] = useState<GiftLimit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const checkScale = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (visible && friend) {
      setAmount(''); setError(''); setSuccess(false);
      fetchLimit();
    }
  }, [visible, friend]);

  const fetchLimit = useCallback(async () => {
    try {
      const { data } = await (api as any).client.get('/api/friends/gift-limit');
      setLimit(data);
    } catch {
      setLimit(null);
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!friend) return;
    const parsed = parseInt(amount, 10) || 0;

    if (parsed < MIN_GIFT) return setError(`Minimum gift is ${formatChips(MIN_GIFT)} chips`);
    if (limit && parsed > limit.remaining) return setError('Daily gift limit exceeded');

    setLoading(true); setError('');
    try {
      const { data } = await (api as any).client.post('/api/friends/gift', {
        toUserId: friend.id, amount: parsed,
      });
      if (!data.success) throw new Error(data.message || 'Transfer failed');

      setSuccess(true);
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true }).start();
      onSuccess?.(parsed);
      setTimeout(() => { onClose(); }, 1800);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [friend, amount, limit, onClose, onSuccess, checkScale]);

  if (!friend) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.card, glassStyle]}>
          {success ? (
            <View style={s.successWrap}>
              <Animated.View style={[s.checkCircle, { transform: [{ scale: checkScale }] }]}>
                <PremiumIcon name="trophy" size={fs(32)} />
              </Animated.View>
              <Text style={s.successText}>
                Sent {formatChips(parseInt(amount, 10))} chips to {friend.displayName}!
              </Text>
            </View>
          ) : (
            <>
              <Text style={s.title}>Gift Chips</Text>
              <Text style={s.friendLabel}>To: {friend.displayName}</Text>

              <TextInput
                style={s.input}
                keyboardType="numeric"
                placeholder="Enter amount"
                placeholderTextColor={colors.textSecondary}
                value={amount}
                onChangeText={(t) => { setAmount(t.replace(/[^0-9]/g, '')); setError(''); }}
                editable={!loading}
              />

              <View style={s.quickRow}>
                {QUICK_AMOUNTS.map((q, i) => (
                  <TouchableOpacity
                    key={q}
                    style={[s.quickBtn, parseInt(amount, 10) === q && s.quickBtnActive]}
                    onPress={() => { setAmount(String(q)); setError(''); }}
                    disabled={loading}
                  >
                    <Text style={[s.quickText, parseInt(amount, 10) === q && s.quickTextActive]}>
                      {QUICK_LABELS[i]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {limit && (
                <Text style={s.limitText}>
                  Gift limit: {formatChips(limit.remaining)} / {formatChips(limit.dailyLimit)} remaining today
                </Text>
              )}

              {!!error && <Text style={s.errorText}>{error}</Text>}

              <TouchableOpacity onPress={handleSend} disabled={loading} style={s.sendWrap}>
                <LinearGradient
                  colors={gradients.gold}
                  style={[s.sendBtn, loading && { opacity: 0.6 }]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <Text style={s.sendText}>Send Gift</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} style={s.cancelWrap} disabled={loading}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

// ─── Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  card: {
    width: wp(340), borderRadius: borderRadius.xl, padding: spacing.lg, ...shadows.strong,
  },
  title: { color: colors.textPrimary, fontSize: fs(20), fontWeight: '700', textAlign: 'center' },
  friendLabel: {
    color: colors.gold, fontSize: fs(14), textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.md,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: borderRadius.md,
    padding: spacing.sm, color: colors.textPrimary, fontSize: fs(18),
    textAlign: 'center', marginBottom: spacing.sm,
  },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  quickBtn: {
    flex: 1, marginHorizontal: wp(3), paddingVertical: hp(8), borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  quickBtnActive: { borderColor: colors.gold, backgroundColor: 'rgba(255,215,0,0.12)' },
  quickText: { color: colors.textSecondary, fontSize: fs(12), fontWeight: '600' },
  quickTextActive: { color: colors.gold },
  limitText: { color: colors.textSecondary, fontSize: fs(11), textAlign: 'center', marginBottom: spacing.sm },
  errorText: { color: '#FF5252', fontSize: fs(12), textAlign: 'center', marginBottom: spacing.sm },
  sendWrap: { marginTop: spacing.xs },
  sendBtn: { paddingVertical: hp(14), borderRadius: borderRadius.md, alignItems: 'center' },
  sendText: { color: colors.background, fontWeight: '700', fontSize: fs(16) },
  cancelWrap: { alignSelf: 'center', marginTop: spacing.md },
  cancelText: { color: colors.textSecondary, fontSize: fs(14) },
  successWrap: { alignItems: 'center', paddingVertical: spacing.xl },
  checkCircle: {
    width: wp(64), height: wp(64), borderRadius: wp(32),
    backgroundColor: 'rgba(255,215,0,0.15)', justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.md,
  },
  successText: { color: colors.gold, fontSize: fs(16), fontWeight: '600', textAlign: 'center' },
});
