import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { socketService } from '../../services/socket';
import { colors, wp, hp, fs } from '../../theme';
import { TABLE_TIERS } from '../../../../shared/constants';
import { TableTier } from '../../../../shared/types';

interface PokerTable {
  tableId: string;
  tier: string;
  name: string;
  playerCount: number;
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
}

export default function PokerTableSelectScreen() {
  const navigation = useNavigation<any>();
  const [tables, setTables] = useState<PokerTable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleTables = (data: PokerTable[]) => {
      setTables(data);
      setLoading(false);
    };

    socketService.on('poker:tables', handleTables);
    socketService.getSocket()?.emit('poker:list_tables');

    return () => {
      socketService.off('poker:tables', handleTables);
    };
  }, []);

  const getTierConfig = (tier: string) => {
    const key = tier as TableTier;
    return TABLE_TIERS[key] ?? null;
  };

  const formatChips = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
    return n.toLocaleString();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading tables…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.header}>Select a Table</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {tables.map((table) => {
          const cfg = getTierConfig(table.tier);
          const emoji = cfg?.emoji ?? '🂠';

          return (
            <View key={table.tableId} style={styles.card}>
              {/* Header row */}
              <View style={styles.cardHeader}>
                <Text style={styles.emoji}>{emoji}</Text>
                <Text style={styles.tableName}>{table.name}</Text>
              </View>

              {/* Info rows */}
              <View style={styles.infoRow}>
                <Text style={styles.label}>Small / Big Blind</Text>
                <Text style={styles.value}>
                  {formatChips(table.smallBlind)} / {formatChips(table.bigBlind)}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Players</Text>
                <View style={styles.playerRow}>
                  <Text style={styles.value}>
                    {table.playerCount}/{table.maxSeats}
                  </Text>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          table.playerCount >= table.maxSeats
                            ? colors.red
                            : table.playerCount > 0
                            ? colors.green
                            : colors.textMuted,
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Join button */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  navigation.navigate('Poker', { tableId: table.tableId })
                }
              >
                <LinearGradient
                  colors={['#E8C84A', '#D4AF37', '#B8941F']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.joinBtn}
                >
                  <Text style={styles.joinText}>JOIN TABLE</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
    paddingTop: hp(56),
    paddingHorizontal: wp(20),
  },
  centered: {
    flex: 1,
    backgroundColor: '#0D1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fs(14),
    marginTop: hp(12),
  },
  header: {
    color: colors.primary,
    fontSize: fs(24),
    fontWeight: '700',
    letterSpacing: 0.5,
    flex: 1,
    textAlign: 'center',
    marginRight: wp(32),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: hp(20),
  },
  backBtn: {
    width: wp(32),
    height: wp(32),
    borderRadius: wp(16),
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    color: '#fff',
    fontSize: fs(22),
    fontWeight: '600',
    marginTop: -2,
  },
  list: {
    paddingBottom: hp(40),
    gap: hp(16),
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    borderRadius: 16,
    padding: wp(16),
    gap: hp(12),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(10),
  },
  emoji: {
    fontSize: fs(28),
  },
  tableName: {
    color: colors.text,
    fontSize: fs(20),
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: colors.textSecondary,
    fontSize: fs(13),
  },
  value: {
    color: colors.text,
    fontSize: fs(14),
    fontWeight: '600',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  joinBtn: {
    borderRadius: 12,
    paddingVertical: hp(12),
    alignItems: 'center',
    marginTop: hp(4),
  },
  joinText: {
    color: '#0D1117',
    fontSize: fs(14),
    fontWeight: '800',
    letterSpacing: 1.2,
  },
});
