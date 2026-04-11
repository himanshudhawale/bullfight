import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import type { Card as CardType } from '../../../shared/types';

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const SUIT_COLORS: Record<string, string> = {
  hearts: '#D4343B',
  diamonds: '#D4343B',
  clubs: '#1A1A2E',
  spades: '#1A1A2E',
};

interface PlayingCardProps {
  card?: CardType;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { w: 38, h: 54, rank: 9, suit: 12, center: 18, logo: 16, corner: 2, cornerLeft: 3 },
  md: { w: 48, h: 68, rank: 11, suit: 14, center: 24, logo: 20, corner: 3, cornerLeft: 4 },
  lg: { w: 64, h: 90, rank: 14, suit: 18, center: 32, logo: 28, corner: 4, cornerLeft: 5 },
};

export default function PlayingCard({ card, faceDown, size = 'md' }: PlayingCardProps) {
  const dim = SIZES[size];

  if (faceDown || !card) {
    return (
      <View style={[styles.card, styles.cardBack, { width: dim.w, height: dim.h }]}>
        {/* Diamond cross-hatch pattern */}
        <View style={styles.hatchContainer}>
          <View style={[styles.hatchLine, styles.hatchDiag1]} />
          <View style={[styles.hatchLine, styles.hatchDiag2]} />
          <View style={[styles.hatchLine, styles.hatchDiag3]} />
          <View style={[styles.hatchLine, styles.hatchDiag4]} />
        </View>
        <View style={styles.backLogoWrap}>
          <Image
            source={require('../../assets/game/bull_logo.png')}
            style={{ width: dim.logo, height: dim.logo }}
            resizeMode="contain"
          />
        </View>
      </View>
    );
  }

  const symbol = SUIT_SYMBOLS[card.suit];
  const color = SUIT_COLORS[card.suit];

  return (
    <View style={[styles.card, styles.cardFace, { width: dim.w, height: dim.h }]}>
      {/* Top-left corner */}
      <View style={[styles.cornerTop, { top: dim.corner, left: dim.cornerLeft }]}>
        <Text style={[styles.rankText, { fontSize: dim.rank, color }]}>{card.rank}</Text>
        <Text style={[styles.suitText, { fontSize: dim.suit - 4, color }]}>{symbol}</Text>
      </View>

      {/* Center suit */}
      <Text style={[styles.centerSuit, { fontSize: dim.center, color }]}>{symbol}</Text>

      {/* Bottom-right corner (mirrored) */}
      <View style={[styles.cornerBottom, { bottom: dim.corner, right: dim.cornerLeft }]}>
        <Text style={[styles.suitText, { fontSize: dim.suit - 4, color, transform: [{ rotate: '180deg' }] }]}>{symbol}</Text>
        <Text style={[styles.rankText, { fontSize: dim.rank, color, transform: [{ rotate: '180deg' }] }]}>{card.rank}</Text>
      </View>

      {/* Subtle bottom inner shadow */}
      <View style={styles.innerShadow} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 6,
    margin: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'hidden',
  },
  cardFace: {
    backgroundColor: '#FAFBF6',
    borderWidth: 0.5,
    borderColor: 'rgba(212,175,55,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBack: {
    backgroundColor: '#6B0F1A',
    borderWidth: 1,
    borderColor: '#DAA520',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hatchContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  hatchLine: {
    position: 'absolute',
    backgroundColor: 'rgba(218,165,32,0.12)',
  },
  hatchDiag1: {
    width: 1,
    height: '200%',
    top: '-50%',
    left: '25%',
    transform: [{ rotate: '45deg' }],
  },
  hatchDiag2: {
    width: 1,
    height: '200%',
    top: '-50%',
    left: '50%',
    transform: [{ rotate: '45deg' }],
  },
  hatchDiag3: {
    width: 1,
    height: '200%',
    top: '-50%',
    left: '25%',
    transform: [{ rotate: '-45deg' }],
  },
  hatchDiag4: {
    width: 1,
    height: '200%',
    top: '-50%',
    left: '50%',
    transform: [{ rotate: '-45deg' }],
  },
  backLogoWrap: {
    opacity: 0.7,
    zIndex: 2,
  },
  cornerTop: {
    position: 'absolute',
    alignItems: 'center',
  },
  cornerBottom: {
    position: 'absolute',
    alignItems: 'center',
  },
  rankText: {
    fontWeight: '800',
    lineHeight: 14,
  },
  suitText: {
    lineHeight: 12,
    marginTop: -2,
  },
  centerSuit: {
    fontWeight: '400',
    opacity: 0.85,
  },
  innerShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    // Simulated inner shadow via a semi-transparent overlay
    opacity: 0.06,
    // Use background color for the shadow effect
    ...(({ backgroundColor: '#000' }) as any),
  },
});
