import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, Image, StyleSheet, TouchableOpacity, Animated, Dimensions, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, shadows, wp, hp, fs } from '../theme';
import { useAuthStore } from '../stores/authStore';
import PremiumIcon from '../components/PremiumIcon';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import LobbyScreen from '../screens/lobby/LobbyScreen';
import GameScreen from '../screens/game/GameScreen';
import PokerScreen from '../screens/poker/PokerScreen';
import PokerTableSelectScreen from '../screens/poker/PokerTableSelectScreen';
import PrivateRoomScreen from '../screens/poker/PrivateRoomScreen';
import TournamentScreen from '../screens/poker/TournamentScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import FriendsScreen from '../screens/social/FriendsScreen';
import ClubScreen from '../screens/social/ClubScreen';
import StoreScreen from '../screens/store/StoreScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import MissionsScreen from '../screens/lobby/MissionsScreen';
import LuckySpinScreen from '../screens/lobby/LuckySpinScreen';

export type RootStackParamList = {
  Main: undefined;
  Game: { tier: string };
  PokerTableSelect: undefined;
  Poker: { tableId: string };
  PrivateRooms: { roomId?: string };
  Tournaments: { tournamentId?: string };
  Friends: undefined;
  Clubs: undefined;
  Store: undefined;
  Profile: undefined;
  Settings: undefined;
  Missions: undefined;
  LuckySpin: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTab = createBottomTabNavigator();

const TAB_LABELS: Record<string, string> = {
  Lobby: 'Play',
  Friends: 'Friends',
  Store: 'Store',
  Profile: 'Profile',
};

const BULL_ICON = require('../../assets/game/bull_logo.png');

function TabItem({ emoji, icon, label, focused, onPress }: {
  emoji?: string; icon?: any; label: string; focused: boolean; onPress: () => void;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.85, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      activeOpacity={1}
      style={tabStyles.tab}
    >
      {/* Soft glow behind active icon */}
      {focused && <View style={[tabStyles.activeGlow, icon ? tabStyles.activeGlowGold : undefined]} />}
      {icon ? (
        <Animated.View style={[tabStyles.iconWrap, { transform: [{ scale }] }]}>
          <Image
            source={icon}
            style={[tabStyles.bullIcon, focused ? tabStyles.bullIconFocused : tabStyles.bullIconDim]}
            resizeMode="contain"
          />
        </Animated.View>
      ) : (
        <Animated.View style={[tabStyles.iconWrap, { transform: [{ scale }] }, !focused && { opacity: 0.3 }]}>
          <PremiumIcon name={emoji!} size={22} />
        </Animated.View>
      )}
      <Text style={[tabStyles.label, focused && tabStyles.labelFocused]}>
        {label}
      </Text>
      {focused && <View style={[tabStyles.activeDot, icon ? tabStyles.activeDotGold : undefined]} />}
    </TouchableOpacity>
  );
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const TAB_EMOJI: Record<string, string> = {
    Lobby: 'play', Friends: 'users', Store: 'diamond',
  };

  return (
    <View style={tabStyles.floatWrap}>
      <BlurView intensity={6} tint="dark" style={tabStyles.blurPill}>
        <View style={tabStyles.pillSurface}>
          {state.routes.map((route: any, index: number) => {
            const focused = state.index === index;
            const label = TAB_LABELS[route.name] || route.name;
            const isProfile = route.name === 'Profile';

            return (
              <TabItem
                key={route.key}
                emoji={isProfile ? undefined : (TAB_EMOJI[route.name] || '⚡')}
                icon={isProfile ? BULL_ICON : undefined}
                label={label}
                focused={focused}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
              />
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

function AuthNavigator() {
  const [screen, setScreen] = React.useState<'login' | 'signup'>('login');

  if (screen === 'signup') {
    return <SignupScreen onSwitchToLogin={() => setScreen('login')} />;
  }
  return <LoginScreen onSwitchToSignup={() => setScreen('signup')} />;
}

function MainNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Main" component={LobbyScreen} />
      <RootStack.Screen
        name="Game"
        component={GameScreen}
        options={{ orientation: 'landscape' }}
      />
      <RootStack.Screen name="PokerTableSelect" component={PokerTableSelectScreen} />
      <RootStack.Screen
        name="Poker"
        component={PokerScreen}
        options={{ orientation: 'landscape' }}
      />
      <RootStack.Screen name="Friends" component={FriendsScreen} />
      <RootStack.Screen name="Clubs" component={ClubScreen} />
      <RootStack.Screen name="Store" component={StoreScreen} />
      <RootStack.Screen name="Profile" component={ProfileScreen} />
      <RootStack.Screen name="Settings" component={SettingsScreen} />
      <RootStack.Screen name="PrivateRooms" component={PrivateRoomScreen} />
      <RootStack.Screen name="Tournaments" component={TournamentScreen} />
      <RootStack.Screen name="Missions" component={MissionsScreen} />
      <RootStack.Screen name="LuckySpin" component={LuckySpinScreen} />
    </RootStack.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return null;
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const { width: SW } = Dimensions.get('window');

const tabStyles = StyleSheet.create({
  floatWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: hp(8),
    paddingTop: hp(6),
    backgroundColor: 'rgba(8,10,18,0.9)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  blurPill: {
    width: SW * 0.85,
    borderRadius: 16,
    overflow: 'hidden',
  },
  pillSurface: {
    flexDirection: 'row',
    backgroundColor: 'rgba(14,18,26,0.6)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.04)',
    paddingVertical: hp(4),
    paddingHorizontal: wp(4),
    gap: wp(4),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp(4),
    gap: hp(3),
  },
  emoji: {
    fontSize: fs(22),
    opacity: 0.3,
  },
  emojiFocused: {
    opacity: 1,
    textShadowColor: 'rgba(255,255,255,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  iconWrap: {
    width: wp(24),
    height: wp(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bullIcon: {
    width: wp(22),
    height: wp(22),
  },
  bullIconFocused: {
    opacity: 1,
    ...(Platform.OS === 'web'
      ? { filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.6))' } as any
      : {
          shadowColor: '#D4AF37',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 6,
        }),
  } as any,
  bullIconDim: {
    opacity: 0.3,
  },
  activeGlow: {
    position: 'absolute',
    top: hp(2),
    width: wp(32),
    height: wp(32),
    borderRadius: wp(16),
    backgroundColor: 'rgba(155,92,255,0.05)',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 0 6px 2px rgba(155,92,255,0.05)' } as any
      : {
          shadowColor: '#9B5CFF',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.1,
          shadowRadius: 5,
        }),
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(155,92,255,0.6)',
    marginTop: hp(1),
    ...(Platform.OS !== 'web'
      ? {
          shadowColor: '#9B5CFF',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 3,
        }
      : {}),
  },
  activeGlowGold: {
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  activeDotGold: {
    backgroundColor: 'rgba(212,175,55,0.7)',
  },
  label: {
    fontSize: fs(9),
    fontWeight: '600',
    color: 'rgba(255,255,255,0.18)',
    letterSpacing: 0.8,
  },
  labelFocused: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
  },
});
