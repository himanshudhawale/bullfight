import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

interface User {
  id: string;
  email: string;
  displayName: string;
  profilePicUrl?: string;
  statusText?: string;
  chips: number;
  vipLevel: number;
  vipXp: number;
  gamesPlayed: number;
  gamesWon: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  guestLogin: () => void;
  googleSignIn: (idToken: string) => Promise<void>;
  appleSignIn: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  signup: async (email, password, displayName) => {
    try {
      set({ isLoading: true, error: null });
      const { user } = await api.signup(email, password, displayName);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Signup failed',
        isLoading: false,
      });
      throw err;
    }
  },

  guestLogin: () => {
    const guestId = `guest_${Date.now()}`;
    set({
      user: {
        id: guestId,
        email: '',
        displayName: `Guest_${guestId.slice(-4)}`,
        chips: 50000,
        vipLevel: 1,
        vipXp: 0,
        gamesPlayed: 0,
        gamesWon: 0,
      },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  },

  login: async (email, password) => {
    try {
      set({ isLoading: true, error: null });
      const { user } = await api.login(email, password);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Login failed',
        isLoading: false,
      });
      throw err;
    }
  },

  googleSignIn: async (idToken) => {
    try {
      set({ isLoading: true, error: null });
      const { user } = await api.googleSignIn(idToken);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Google sign-in failed',
        isLoading: false,
      });
      throw err;
    }
  },

  appleSignIn: async (idToken) => {
    try {
      set({ isLoading: true, error: null });
      const { user } = await api.appleSignIn(idToken);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Apple sign-in failed',
        isLoading: false,
      });
      throw err;
    }
  },

  logout: async () => {
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  loadUser: async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const user = await api.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      await AsyncStorage.removeItem('accessToken');
      await AsyncStorage.removeItem('refreshToken');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
