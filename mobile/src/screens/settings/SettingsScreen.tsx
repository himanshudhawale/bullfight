import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, shadows, wp, hp, fs, borderRadius, glassStyle } from '../../theme';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';
import GradientButton from '../../components/GradientButton';
import PremiumIcon from '../../components/PremiumIcon';

// ─── Custom Toggle ───
function GoldToggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  const trackBg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.08)', 'rgba(212,175,55,0.35)'],
  });

  const thumbLeft = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, wp(20)],
  });

  const thumbColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.textMuted, colors.primary],
  });

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onToggle}>
      <Animated.View style={[s.toggleTrack, { backgroundColor: trackBg }]}>
        <Animated.View style={[s.toggleThumb, { left: thumbLeft, backgroundColor: thumbColor }]} />
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ───
export default function SettingsScreen() {
  const nav = useNavigation();
  const { user, logout, loadUser } = useAuthStore();

  // Profile fields
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [statusText, setStatusText] = useState(user?.statusText ?? '');
  const [saving, setSaving] = useState(false);

  // Preferences (visual only — local state)
  const [soundEffects, setSoundEffects] = useState(true);
  const [music, setMusic] = useState(true);
  const [notifications, setNotifications] = useState(true);

  // Fade-in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.updateProfile({ displayName, statusText });
      await loadUser();
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <View style={s.root}>
      {/* ═══ HEADER ═══ */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} activeOpacity={0.7}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Settings</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* ═══ PROFILE SECTION ═══ */}
          <Text style={s.sectionTitle}>Profile</Text>
          <View style={s.card}>
            <Text style={s.inputLabel}>Display Name</Text>
            <TextInput
              style={s.textInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter display name"
              placeholderTextColor={colors.textMuted}
              maxLength={24}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[s.inputLabel, { marginTop: hp(14) }]}>Status</Text>
            <TextInput
              style={s.textInput}
              value={statusText}
              onChangeText={setStatusText}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.textMuted}
              maxLength={60}
              autoCapitalize="sentences"
            />

            <View style={s.saveWrap}>
              <GradientButton
                title="SAVE"
                onPress={handleSave}
                loading={saving}
                disabled={saving}
                size="md"
              />
            </View>
          </View>

          {/* ═══ PREFERENCES SECTION ═══ */}
          <Text style={s.sectionTitle}>Preferences</Text>
          <View style={s.card}>
            <View style={s.prefRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <PremiumIcon name="sound" size={14} />
                <Text style={s.prefLabel}>Sound Effects</Text>
              </View>
              <GoldToggle value={soundEffects} onToggle={() => setSoundEffects((v) => !v)} />
            </View>
            <View style={s.divider} />
            <View style={s.prefRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <PremiumIcon name="music" size={14} />
                <Text style={s.prefLabel}>Music</Text>
              </View>
              <GoldToggle value={music} onToggle={() => setMusic((v) => !v)} />
            </View>
            <View style={s.divider} />
            <View style={s.prefRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <PremiumIcon name="bell" size={14} />
                <Text style={s.prefLabel}>Notifications</Text>
              </View>
              <GoldToggle value={notifications} onToggle={() => setNotifications((v) => !v)} />
            </View>
          </View>

          {/* ═══ ACCOUNT SECTION ═══ */}
          <Text style={s.sectionTitle}>Account</Text>
          <View style={s.card}>
            <TouchableOpacity style={s.logoutRow} activeOpacity={0.6} onPress={handleLogout}>
              <Text style={s.logoutText}>Log Out</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: hp(80) }} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: hp(54),
    paddingBottom: hp(12),
    paddingHorizontal: wp(16),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.glassBorder,
  },
  backBtn: {
    width: wp(40),
    height: wp(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: colors.primary,
    fontSize: fs(28),
    fontWeight: '300',
  },
  headerTitle: {
    color: colors.text,
    fontSize: fs(18),
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Scroll ──
  scroll: {
    paddingHorizontal: wp(16),
    paddingTop: hp(20),
  },

  // ── Section ──
  sectionTitle: {
    color: colors.primary,
    fontSize: fs(12),
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: hp(8),
    marginTop: hp(16),
    marginLeft: wp(4),
  },
  card: {
    ...glassStyle.card,
    padding: wp(16),
    marginBottom: hp(8),
    ...shadows.subtle,
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any)
      : {}),
  },

  // ── Inputs ──
  inputLabel: {
    color: colors.textSecondary,
    fontSize: fs(11),
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: hp(6),
    textTransform: 'uppercase',
  },
  textInput: {
    ...glassStyle.input,
    paddingHorizontal: wp(14),
    paddingVertical: hp(12),
    fontSize: fs(15),
    color: colors.text,
  },
  saveWrap: {
    marginTop: hp(16),
    alignItems: 'center',
  },

  // ── Preference rows ──
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: hp(10),
  },
  prefLabel: {
    color: colors.text,
    fontSize: fs(15),
    fontWeight: '500',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.glassBorder,
  },

  // ── Toggle ──
  toggleTrack: {
    width: wp(42),
    height: wp(24),
    borderRadius: wp(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
  },
  toggleThumb: {
    position: 'absolute',
    width: wp(20),
    height: wp(20),
    borderRadius: wp(10),
  },

  // ── Logout ──
  logoutRow: {
    paddingVertical: hp(12),
    alignItems: 'center',
  },
  logoutText: {
    color: colors.red,
    fontSize: fs(15),
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
