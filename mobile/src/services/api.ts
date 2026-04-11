import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Use the Expo dev server host IP so physical devices can reach the backend
function getBaseUrl(): string {
  if (!__DEV__) return 'https://bullfight-api.azurecontainerapps.io/api';

  // Expo injects the dev machine's LAN IP via Constants.expoConfig.hostUri
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:3000/api`;

  // Fallback for emulators
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000/api';
  return 'http://localhost:3000/api';
}

const API_URL = getBaseUrl();

if (!__DEV__ && API_URL.includes('localhost')) {
  console.warn(
    '⚠️  Production build is connecting to localhost! ' +
    'This is almost certainly a misconfiguration. ' +
    'Set the API URL to the production endpoint.'
  );
}

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Attach access token to every request
    this.client.interceptors.request.use(async (config) => {
      const token = await AsyncStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Auto-refresh on 401
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const refreshToken = await AsyncStorage.getItem('refreshToken');
            if (!refreshToken) throw new Error('No refresh token');

            const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
            await AsyncStorage.setItem('accessToken', data.accessToken);
            await AsyncStorage.setItem('refreshToken', data.refreshToken);

            originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
            return this.client(originalRequest);
          } catch {
            await AsyncStorage.removeItem('accessToken');
            await AsyncStorage.removeItem('refreshToken');
            // Will be caught by auth store to redirect to login
            throw error;
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // ---- Auth ----
  async signup(email: string, password: string, displayName: string) {
    const { data } = await this.client.post('/auth/signup', { email, password, displayName });
    await this.storeTokens(data.tokens);
    return data;
  }

  async login(email: string, password: string) {
    const { data } = await this.client.post('/auth/login', { email, password });
    await this.storeTokens(data.tokens);
    return data;
  }

  async googleSignIn(idToken: string) {
    const { data } = await this.client.post('/auth/google', { idToken });
    await this.storeTokens(data.tokens);
    return data;
  }

  async appleSignIn(idToken: string) {
    const { data } = await this.client.post('/auth/apple', { idToken });
    await this.storeTokens(data.tokens);
    return data;
  }

  async getMe() {
    const { data } = await this.client.get('/auth/me');
    return data;
  }

  // ---- User / Profile ----
  async updateProfile(updates: Record<string, any>) {
    const { data } = await this.client.patch('/users/profile', updates);
    return data;
  }

  async getUserProfile(userId: string) {
    const { data } = await this.client.get(`/users/${userId}`);
    return data;
  }

  async getChipBalance() {
    const { data } = await this.client.get('/users/chips/balance');
    return data;
  }

  // buyChips removed — no IAP in v1.0

  // ---- Bonuses ----
  async claimStreakBonus() {
    const { data } = await this.client.post('/users/bonus/streak');
    return data;
  }

  async claimHourlyBonus() {
    const { data } = await this.client.post('/users/bonus/hourly');
    return data;
  }

  async claimBrokeBonus() {
    const { data } = await this.client.post('/users/bonus/broke');
    return data;
  }

  async claimPackageBonus(packageId: string) {
    const { data } = await this.client.post('/users/bonus/package', { packageId });
    return data;
  }

  // ---- VIP ----
  // subscribeVip removed — no IAP

  async claimVipDaily() {
    const { data } = await this.client.post('/users/vip/daily');
    return data;
  }

  // ---- Leaderboard ----
  async getLeaderboard(): Promise<Array<{ userId: string; displayName: string; chips: number; vipLevel: number }>> {
    const { data } = await this.client.get('/game/leaderboard');
    return data;
  }

  // ---- Friends ----
  async sendFriendRequest(toUserId: string) {
    const { data } = await this.client.post('/friends/request', { toUserId });
    return data;
  }

  async acceptFriendRequest(friendshipId: string) {
    const { data } = await this.client.post('/friends/accept', { friendshipId });
    return data;
  }

  async removeFriend(friendUserId: string, block = false) {
    const { data } = await this.client.post('/friends/remove', { friendUserId, block });
    return data;
  }

  async getFriendsList() {
    const { data } = await this.client.get('/friends/list');
    return data;
  }

  async getPendingRequests() {
    const { data } = await this.client.get('/friends/pending');
    return data;
  }

  async searchUsers(q: string) {
    const { data } = await this.client.get('/users/search', { params: { q } });
    return data;
  }

  // ---- Gifts ----
  async sendGift(toUserId: string, amount: number) {
    const { data } = await this.client.post('/friends/gift', { toUserId, amount });
    return data;
  }

  async getGiftHistory() {
    const { data } = await this.client.get('/friends/gifts');
    return data;
  }

  async getGiftLimit() {
    const { data } = await this.client.get('/friends/gift-limit');
    return data;
  }

  // ---- Clubs ----
  async createClub(body: { name: string; description?: string; isPublic?: boolean; minVipLevel?: number }) {
    const { data } = await this.client.post('/clubs', body);
    return data;
  }

  async getClubs(params?: { search?: string; page?: number }) {
    const { data } = await this.client.get('/clubs', { params });
    return data;
  }

  async getClub(clubId: string) {
    const { data } = await this.client.get(`/clubs/${clubId}`);
    return data;
  }

  async joinClub(clubId: string) {
    const { data } = await this.client.post(`/clubs/${clubId}/join`);
    return data;
  }

  async leaveClub(clubId: string) {
    const { data } = await this.client.post(`/clubs/${clubId}/leave`);
    return data;
  }

  async inviteToClub(clubId: string, friendId: string) {
    const { data } = await this.client.post(`/clubs/${clubId}/invite`, { friendId });
    return data;
  }

  async approveClubMember(clubId: string, userId: string) {
    const { data } = await this.client.post(`/clubs/${clubId}/approve`, { userId });
    return data;
  }

  async kickClubMember(clubId: string, userId: string) {
    const { data } = await this.client.post(`/clubs/${clubId}/kick`, { userId });
    return data;
  }

  async promoteClubMember(clubId: string, userId: string) {
    const { data } = await this.client.post(`/clubs/${clubId}/promote`, { userId });
    return data;
  }

  async donateToClub(clubId: string, amount: number) {
    const { data } = await this.client.post(`/clubs/${clubId}/donate`, { amount });
    return data;
  }

  async getClubRankings(clubId: string) {
    const { data } = await this.client.get(`/clubs/${clubId}/rankings`);
    return data;
  }

  async getClubChat(clubId: string) {
    const { data } = await this.client.get(`/clubs/${clubId}/chat`);
    return data;
  }

  async sendClubChat(clubId: string, message: string) {
    const { data } = await this.client.post(`/clubs/${clubId}/chat`, { message });
    return data;
  }

  async updateClubSettings(clubId: string, settings: Record<string, any>) {
    const { data } = await this.client.put(`/clubs/${clubId}/settings`, settings);
    return data;
  }

  async deleteClub(clubId: string) {
    const { data } = await this.client.delete(`/clubs/${clubId}`);
    return data;
  }

  // ---- Missions & Achievements ----
  async getMissions() {
    const { data } = await this.client.get('/missions');
    return data;
  }

  async getAchievements() {
    const { data } = await this.client.get('/achievements');
    return data;
  }

  async claimMission(missionId: string) {
    const { data } = await this.client.post(`/missions/${missionId}/claim`);
    return data;
  }

  // ---- Lucky Spin ----
  async getSpinStatus() {
    const { data } = await this.client.get('/lucky-spin/status');
    return data;
  }

  async spin(useFree: boolean) {
    const { data } = await this.client.post('/lucky-spin', { useFree });
    return data;
  }

  async getSpinHistory() {
    const { data } = await this.client.get('/lucky-spin/history');
    return data;
  }

  async getJackpot() {
    const { data } = await this.client.get('/lucky-spin/jackpot');
    return data;
  }

  // ---- Helpers ----
  private async storeTokens(tokens: { accessToken: string; refreshToken: string }) {
    await AsyncStorage.setItem('accessToken', tokens.accessToken);
    await AsyncStorage.setItem('refreshToken', tokens.refreshToken);
  }
}

export const api = new ApiService();
