/* ═══════════════════════════════════════════════
   BULL FIGHT — Main App Logic
   ═══════════════════════════════════════════════ */

const API_URL = location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

// ─── STATE ───
const state = {
  user: null,
  tokens: { accessToken: null, refreshToken: null },
  currentScreen: 'lobbyScreen',
  currentTier: null,
  bets: [0, 0, 0],       // bets on seat 0, 1, 2
  selectedSeat: 0,        // which seat is selected for chip placement
  gamePhase: 'betting',   // betting | dealing | result
};

const TIERS = [
  { id: 'monte_carlo', name: 'Monte Carlo', emoji: '🎰', buyIn: '1K–5K', minBet: 100, color: '#cd7f32', players: 24 },
  { id: 'macau', name: 'Macau', emoji: '🎲', buyIn: '10K–50K', minBet: 1000, color: '#c0c0c0', players: 18 },
  { id: 'las_vegas', name: 'Las Vegas', emoji: '🃏', buyIn: '100K–500K', minBet: 10000, color: '#ffd700', players: 12 },
  { id: 'monaco', name: 'Monaco', emoji: '👑', buyIn: '1M+', minBet: 100000, color: '#89f7fe', players: 6 },
];

const CHIPS = [
  { value: 100, label: '100', css: 'chip-white' },
  { value: 500, label: '500', css: 'chip-red' },
  { value: 1000, label: '1K', css: 'chip-blue' },
  { value: 5000, label: '5K', css: 'chip-green' },
  { value: 10000, label: '10K', css: 'chip-orange' },
  { value: 50000, label: '50K', css: 'chip-purple' },
  { value: 100000, label: '100K', css: 'chip-black' },
];

const HAND_NAMES = {
  0: 'High Card', 1: 'Pair', 2: 'Two Pair', 3: 'Three of a Kind',
  4: 'Straight', 5: 'Flush', 6: 'Full House', 7: 'Four of a Kind',
  8: 'Straight Flush', 9: 'Royal Flush',
};

const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

const VIP_CONFIG = [
  { level: 1, name: 'Bronze', emoji: '🥉', color: '#cd7f32', xp: 0 },
  { level: 2, name: 'Silver', emoji: '🥈', color: '#c0c0c0', xp: 5000 },
  { level: 3, name: 'Gold', emoji: '🥇', color: '#ffd700', xp: 25000 },
  { level: 4, name: 'Platinum', emoji: '💎', color: '#e5e4e2', xp: 100000, spend: 50 },
  { level: 5, name: 'Diamond', emoji: '👑', color: '#89f7fe', xp: 500000, spend: 250 },
];

const CHIP_PACKS = [
  { id: 'pack_10k', chips: 10000, price: '$0.99', label: 'Starter', emoji: '💰' },
  { id: 'pack_100k', chips: 100000, price: '$4.99', label: 'Popular', emoji: '💎', badge: 'popular' },
  { id: 'pack_500k', chips: 500000, price: '$14.99', label: 'Value', emoji: '🏆', badge: 'best' },
  { id: 'pack_2m', chips: 2000000, price: '$49.99', label: 'High Roller', emoji: '🎲' },
  { id: 'pack_5m', chips: 5000000, price: '$99.99', label: 'Whale', emoji: '🐳' },
];

const COSMETICS = [
  { id: 'skin_gold', name: 'Gold Cards', type: 'Card Skin', price: 50000, emoji: '🃏' },
  { id: 'skin_neon', name: 'Neon Glow', type: 'Card Skin', price: 100000, emoji: '✨' },
  { id: 'table_royal', name: 'Royal Felt', type: 'Table Theme', price: 75000, emoji: '🎰' },
  { id: 'table_ocean', name: 'Ocean Blue', type: 'Table Theme', price: 75000, emoji: '🌊' },
  { id: 'frame_fire', name: 'Fire Frame', type: 'Avatar Frame', price: 25000, emoji: '🔥' },
  { id: 'frame_crown', name: 'Crown Frame', type: 'Avatar Frame', price: 150000, emoji: '👑' },
];

// ═══════════ API CLIENT ═══════════
async function apiCall(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.tokens.accessToken) {
    headers['Authorization'] = `Bearer ${state.tokens.accessToken}`;
  }
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  console.log('[api]', method, path, body ? JSON.stringify(body) : '');
  let res = await fetch(`${API_URL}${path}`, opts);
  console.log('[api] response:', res.status);

  // Auto-refresh on 401
  if (res.status === 401 && state.tokens.refreshToken) {
    const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.tokens.refreshToken }),
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      state.tokens.accessToken = data.accessToken;
      state.tokens.refreshToken = data.refreshToken;
      saveTokens();
      headers['Authorization'] = `Bearer ${data.accessToken}`;
      res = await fetch(`${API_URL}${path}`, { method, headers, body: opts.body });
    } else {
      logout();
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function saveTokens() {
  localStorage.setItem('bf_tokens', JSON.stringify(state.tokens));
}
function loadTokens() {
  try {
    const t = JSON.parse(localStorage.getItem('bf_tokens'));
    if (t) state.tokens = t;
  } catch {}
}

// ═══════════ AUTH ═══════════
function showLogin() {
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('signupForm').classList.add('hidden');
  document.getElementById('authError').classList.add('hidden');
}
function showSignup() {
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('signupForm').classList.remove('hidden');
  document.getElementById('authError').classList.add('hidden');
}
function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  console.log('[login] email:', email, 'password length:', password.length);
  if (!email || !password) return showAuthError('Please fill in all fields');
  try {
    const data = await apiCall('POST', '/auth/login', { email, password });
    console.log('[login] success:', data.user.displayName);
    state.tokens = data.tokens;
    state.user = data.user;
    saveTokens();
    enterApp();
  } catch (e) {
    console.error('[login] error:', e);
    showAuthError(e.message);
  }
}

async function handleSignup() {
  const displayName = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  if (!displayName || !email || !password) return showAuthError('Please fill in all fields');
  if (password.length < 8) return showAuthError('Password must be at least 8 characters');
  try {
    const data = await apiCall('POST', '/auth/signup', { email, password, displayName });
    state.tokens = data.tokens;
    state.user = data.user;
    saveTokens();
    showToast('🎉 Welcome! You received 100,000 free chips!');
    enterApp();
  } catch (e) {
    showAuthError(e.message);
  }
}

function handleGoogleLogin() {
  showToast('Google sign-in coming soon!');
}

function logout() {
  state.user = null;
  state.tokens = { accessToken: null, refreshToken: null };
  localStorage.removeItem('bf_tokens');
  document.getElementById('authOverlay').classList.add('active');
  document.getElementById('screensContainer').classList.add('hidden');
  document.getElementById('topBar').classList.add('hidden');
  document.getElementById('bottomNav').classList.add('hidden');
  showLogin();
}

async function tryAutoLogin() {
  loadTokens();
  if (!state.tokens.accessToken) {
    console.log('[auto-login] no saved token');
    return;
  }
  try {
    console.log('[auto-login] trying saved token...');
    state.user = await apiCall('GET', '/auth/me');
    console.log('[auto-login] success:', state.user.displayName);
    enterApp();
  } catch (e) {
    console.log('[auto-login] failed, clearing tokens:', e.message);
    state.tokens = { accessToken: null, refreshToken: null };
    localStorage.removeItem('bf_tokens');
  }
}

function enterApp() {
  document.getElementById('authOverlay').classList.remove('active');
  document.getElementById('screensContainer').classList.remove('hidden');
  document.getElementById('topBar').classList.remove('hidden');
  document.getElementById('bottomNav').classList.remove('hidden');
  updateTopBar();
  renderLobby();
  navigateTo('lobbyScreen');
}

// ═══════════ TOP BAR ═══════════
function updateTopBar() {
  if (!state.user) return;
  const vip = VIP_CONFIG[(state.user.vipLevel || 1) - 1];
  document.getElementById('topVipBadge').textContent = vip.emoji;
  document.getElementById('topPlayerName').textContent = state.user.displayName || 'Player';
  document.getElementById('topChipAmount').textContent = formatNum(state.user.chips || 0);
}

// ═══════════ NAVIGATION ═══════════
function navigateTo(screenId) {
  if (screenId === 'gameScreen') return; // game uses joinTable
  state.currentScreen = screenId;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === screenId);
  });

  // Show/hide bottom nav and top bar for game
  document.getElementById('bottomNav').classList.remove('hidden');
  document.getElementById('topBar').classList.remove('hidden');

  // Render screen content
  if (screenId === 'profileScreen') renderProfile();
  if (screenId === 'storeScreen') renderStore('chips');
  if (screenId === 'friendsScreen') renderFriends('list');
}

// ═══════════ LOBBY ═══════════
function renderLobby() {
  const grid = document.getElementById('tierGrid');
  grid.innerHTML = TIERS.map(t => `
    <div class="tier-card" style="--tier-color: ${t.color}40" onclick="joinTable('${t.id}')">
      <div class="tier-header">
        <span class="tier-icon">${t.emoji}</span>
        <div class="tier-info">
          <div class="tier-name" style="color:${t.color}">${t.name}</div>
          <div class="tier-buyin">Buy-in: ${t.buyIn}</div>
        </div>
        <div class="tier-bet-badge">
          <div class="tier-bet-label">Min Bet</div>
          <div class="tier-bet-value">${formatNum(t.minBet)}</div>
        </div>
      </div>
      <div class="tier-footer">
        <span class="tier-players">🟢 ${t.players + Math.floor(Math.random()*10)} playing</span>
        <span class="tier-tables">${2 + Math.floor(Math.random()*6)} tables</span>
      </div>
    </div>
  `).join('');
}

function setGameMode(mode) {
  state.gameMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  if (mode === 'pvp') showToast('PvP matchmaking coming soon!');
}

function claimDailyBonus() {
  showToast('🎁 +5,000 chips! Daily bonus claimed!');
}

// ═══════════ GAME TABLE ═══════════
function joinTable(tierId) {
  const tier = TIERS.find(t => t.id === tierId);
  if (!tier) return;
  state.currentTier = tier;
  state.currentBet = 0;
  state.gamePhase = 'betting';

  // Hide nav, show game
  document.getElementById('bottomNav').classList.add('hidden');
  document.getElementById('topBar').classList.add('hidden');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('gameScreen').classList.add('active');

  document.getElementById('tableName').textContent = tier.name;
  document.getElementById('dealerCards').innerHTML = '';
  document.getElementById('playerCards').innerHTML = '';
  document.getElementById('dealerResult').textContent = '';
  document.getElementById('playerResult').textContent = '';
  document.getElementById('potAmount').textContent = '0';
  document.getElementById('resultOverlay').classList.add('hidden');
  document.getElementById('bettingControls').classList.remove('hidden');
  document.getElementById('resultControls').classList.add('hidden');

  renderChipSelector();
  updateDealButton();
}

function renderChipSelector() {
  const tier = state.currentTier;
  const el = document.getElementById('chipSelector');
  el.innerHTML = CHIPS
    .filter(c => c.value >= tier.minBet / 10 && c.value <= (state.user?.chips || 0))
    .map(c => `
      <div class="chip ${c.css}" onclick="addBet(${c.value})" title="${c.label}">
        ${c.label}
      </div>
    `).join('');
}

function addBet(amount) {
  const max = state.user?.chips || 0;
  if (state.currentBet + amount > max) {
    showToast('Not enough chips!');
    return;
  }
  state.currentBet += amount;
  document.getElementById('potAmount').textContent = formatNum(state.currentBet);
  updateDealButton();
}

function clearBet() {
  state.currentBet = 0;
  document.getElementById('potAmount').textContent = '0';
  updateDealButton();
}

function updateDealButton() {
  const btn = document.getElementById('dealBtn');
  const minBet = state.currentTier?.minBet || 0;
  btn.disabled = state.currentBet < minBet;
}

async function deal() {
  if (state.gamePhase !== 'betting' || state.currentBet <= 0) return;
  state.gamePhase = 'dealing';

  const dealBtn = document.getElementById('dealBtn');
  dealBtn.disabled = true;
  dealBtn.textContent = 'DEALING...';

  // Show face-down cards first
  dealFaceDown('dealerCards', 5);
  dealFaceDown('playerCards', 5);

  try {
    const result = await apiCall('POST', '/game/pvd/play', {
      tier: state.currentTier.id,
      bet: state.currentBet,
    });

    // Update user balance
    state.user.chips = result.newBalance;
    if (result.vipXp !== undefined) state.user.vipXp = result.vipXp;
    if (result.vipLevel !== undefined) state.user.vipLevel = result.vipLevel;

    // Wait, then reveal cards
    await sleep(800);
    revealCards('dealerCards', result.dealerCards);
    await sleep(600);
    revealCards('playerCards', result.playerCards);

    // Show hand names
    await sleep(500);
    document.getElementById('dealerResult').textContent = HAND_NAMES[result.dealerHand.rank] || 'Unknown';
    document.getElementById('playerResult').textContent = HAND_NAMES[result.playerHand.rank] || 'Unknown';

    // Show result
    await sleep(600);
    showResult(result.payout);

  } catch (e) {
    showToast('Error: ' + e.message);
    state.gamePhase = 'betting';
    dealBtn.disabled = false;
    dealBtn.textContent = 'DEAL';
    document.getElementById('dealerCards').innerHTML = '';
    document.getElementById('playerCards').innerHTML = '';
  }
}

function dealFaceDown(containerId, count) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'playing-card face-down';
    card.style.animationDelay = `${i * 0.1}s`;
    el.appendChild(card);
  }
}

function revealCards(containerId, cards) {
  const el = document.getElementById(containerId);
  const cardEls = el.querySelectorAll('.playing-card');
  cards.forEach((card, i) => {
    const cardEl = cardEls[i];
    if (!cardEl) return;
    cardEl.classList.add('card-flip');
    setTimeout(() => {
      const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
      const colorClass = isRed ? 'card-red' : 'card-black';
      const suit = SUIT_SYMBOLS[card.suit] || '?';
      const rank = card.rank.toUpperCase();

      cardEl.className = `playing-card face-up`;
      cardEl.innerHTML = `
        <div class="card-corner card-corner-top ${colorClass}">
          <span class="card-rank">${rank}</span>
          <span class="card-suit-sm">${suit}</span>
        </div>
        <span class="card-suit-center ${colorClass}">${suit}</span>
        <div class="card-corner card-corner-bottom ${colorClass}">
          <span class="card-rank">${rank}</span>
          <span class="card-suit-sm">${suit}</span>
        </div>
      `;
    }, 250);
  });
}

function showResult(payout) {
  state.gamePhase = 'result';
  const overlay = document.getElementById('resultOverlay');
  const iconEl = document.getElementById('resultIcon');
  const textEl = document.getElementById('resultText');
  const amountEl = document.getElementById('resultAmount');

  overlay.classList.remove('hidden');

  if (payout > 0) {
    iconEl.textContent = '🏆';
    textEl.textContent = 'YOU WIN';
    textEl.className = 'result-text win';
    amountEl.textContent = `+${formatNum(payout)}`;
    amountEl.className = 'result-amount positive';
  } else if (payout < 0) {
    iconEl.textContent = '💔';
    textEl.textContent = 'YOU LOSE';
    textEl.className = 'result-text lose';
    amountEl.textContent = formatNum(payout);
    amountEl.className = 'result-amount negative';
    // Shake the table
    document.querySelector('.game-table').style.animation = 'shake 0.4s ease';
    setTimeout(() => { document.querySelector('.game-table').style.animation = ''; }, 400);
  } else {
    iconEl.textContent = '🤝';
    textEl.textContent = 'PUSH';
    textEl.className = 'result-text push';
    amountEl.textContent = 'Bet returned';
    amountEl.className = 'result-amount';
  }

  // Switch controls
  document.getElementById('bettingControls').classList.add('hidden');
  document.getElementById('resultControls').classList.remove('hidden');
  updateTopBar();
}

function playAgain() {
  state.currentBet = 0;
  state.gamePhase = 'betting';
  document.getElementById('dealerCards').innerHTML = '';
  document.getElementById('playerCards').innerHTML = '';
  document.getElementById('dealerResult').textContent = '';
  document.getElementById('playerResult').textContent = '';
  document.getElementById('potAmount').textContent = '0';
  document.getElementById('resultOverlay').classList.add('hidden');
  document.getElementById('bettingControls').classList.remove('hidden');
  document.getElementById('resultControls').classList.add('hidden');
  document.getElementById('dealBtn').textContent = 'DEAL';
  renderChipSelector();
  updateDealButton();
}

function leaveTable() {
  state.currentTier = null;
  state.currentBet = 0;
  state.gamePhase = 'betting';
  updateTopBar();
  navigateTo('lobbyScreen');
}

// ═══════════ FRIENDS ═══════════
const MOCK_FRIENDS = [
  { id: '1', displayName: 'PokerKing88', status: 'online', vipLevel: 3 },
  { id: '2', displayName: 'LuckyAce', status: 'in_game', vipLevel: 4 },
  { id: '3', displayName: 'CardShark', status: 'offline', vipLevel: 2 },
  { id: '4', displayName: 'DiamondDan', status: 'away', vipLevel: 5 },
];

const STATUS_COLORS = { online: '#2ecc71', in_game: '#4fc3f7', away: '#ffa726', offline: '#4a5568' };
const STATUS_LABELS = { online: 'Online', in_game: 'In Game', away: 'Away', offline: 'Offline' };

function switchFriendsTab(btn, tab) {
  btn.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderFriends(tab);
}

function renderFriends(tab) {
  const el = document.getElementById('friendsContent');
  if (tab === 'list') {
    el.innerHTML = MOCK_FRIENDS.map(f => {
      const vip = VIP_CONFIG[f.vipLevel - 1];
      return `
        <div class="friend-card">
          <div class="friend-avatar">
            ${f.displayName[0]}
            <div class="friend-status-dot" style="background:${STATUS_COLORS[f.status]}"></div>
          </div>
          <div class="friend-info">
            <div class="friend-name">${f.displayName} ${vip.emoji}</div>
            <div class="friend-status" style="color:${STATUS_COLORS[f.status]}">${STATUS_LABELS[f.status]}</div>
          </div>
          <div class="friend-actions">
            <button class="btn-invite">Invite</button>
            <button class="btn-chat">💬</button>
          </div>
        </div>`;
    }).join('');
  } else if (tab === 'requests') {
    el.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px 0">No pending requests</p>';
  } else {
    el.innerHTML = `
      <div class="input-group" style="margin-bottom:12px">
        <input type="text" placeholder="Search by username..." style="width:100%;padding:12px 16px;font-size:14px;background:var(--bg-surface);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm);outline:none">
      </div>
      <p style="text-align:center;color:var(--text-muted);padding:20px 0">Type a username to search</p>`;
  }
}

// ═══════════ STORE ═══════════
function switchStoreTab(btn, tab) {
  btn.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderStore(tab);
}

function renderStore(tab) {
  const el = document.getElementById('storeContent');
  if (tab === 'chips') {
    el.innerHTML = CHIP_PACKS.map(p => `
      <div class="pack-card ${p.badge === 'best' ? 'best-value' : ''}">
        ${p.badge ? `<span class="pack-badge ${p.badge}">${p.badge === 'best' ? 'BEST VALUE' : 'POPULAR'}</span>` : ''}
        <span class="pack-emoji">${p.emoji}</span>
        <div class="pack-info">
          <div class="pack-label">${p.label}</div>
          <div class="pack-chips">${formatNum(p.chips)} chips</div>
        </div>
        <div class="pack-price">${p.price}</div>
      </div>
    `).join('');
  } else if (tab === 'cosmetics') {
    el.innerHTML = `<div class="cosmetic-grid">${COSMETICS.map(c => `
      <div class="cosmetic-card">
        <div class="cosmetic-emoji">${c.emoji}</div>
        <div class="cosmetic-name">${c.name}</div>
        <div class="cosmetic-type">${c.type}</div>
        <div class="cosmetic-price">💰 ${formatNum(c.price)}</div>
      </div>
    `).join('')}</div>`;
  } else {
    el.innerHTML = `
      <div class="vip-banner">
        <div class="vip-banner-icon">👑</div>
        <div class="vip-banner-title">VIP Membership</div>
        <div class="vip-banner-sub">Unlock exclusive perks and boost your progress</div>
      </div>
      <div class="vip-plan">
        <div class="vip-plan-header">
          <span class="vip-plan-name">📅 Monthly</span>
          <span class="vip-plan-price">$9.99/mo</span>
        </div>
        <div class="vip-perk">✅ 5K daily bonus chips</div>
        <div class="vip-perk">✅ Exclusive emojis</div>
        <div class="vip-perk">✅ Priority matchmaking</div>
      </div>
      <div class="vip-plan">
        <div class="vip-plan-header">
          <span class="vip-plan-name">🗓️ Annual</span>
          <span class="vip-plan-price">$79.99/yr</span>
        </div>
        <div class="vip-perk">✅ All monthly perks</div>
        <div class="vip-perk">✅ 20% shop discount</div>
        <div class="vip-perk">✅ Exclusive Diamond frame</div>
        <div class="vip-perk">✅ Save $39.89/year</div>
      </div>`;
  }
}

// ═══════════ PROFILE ═══════════
function renderProfile() {
  const u = state.user;
  if (!u) return;
  const vip = VIP_CONFIG[(u.vipLevel || 1) - 1];
  const nextVip = u.vipLevel < 5 ? VIP_CONFIG[u.vipLevel] : null;
  const xpPct = nextVip ? Math.min(((u.vipXp || 0) / nextVip.xp) * 100, 100) : 100;
  const winRate = u.gamesPlayed ? Math.round((u.gamesWon / u.gamesPlayed) * 100) : 0;

  document.getElementById('profileContent').innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar" style="border-color:${vip.color}">
        ${(u.displayName || '?')[0].toUpperCase()}
        <div class="profile-vip-overlay" style="background:${vip.color}">${vip.emoji}</div>
      </div>
      <div class="profile-name">${u.displayName || 'Player'}</div>
      <div class="profile-status">${u.statusText || 'Tap to set status...'}</div>
    </div>

    <div class="profile-card">
      <div class="vip-progress">
        <div class="vip-progress-header">
          <span class="vip-level-name">${vip.emoji} ${vip.name}</span>
          ${nextVip ? `<span class="vip-next">Next: ${nextVip.emoji} ${nextVip.name}</span>` : ''}
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${xpPct}%;background:${vip.color}"></div>
        </div>
        <div class="vip-xp-text">${formatNum(u.vipXp || 0)} / ${nextVip ? formatNum(nextVip.xp) : 'MAX'} XP</div>
        ${nextVip?.spend ? `<div class="vip-spend-req">Requires $${nextVip.spend} lifetime spend</div>` : ''}
      </div>
    </div>

    <div class="profile-card">
      <div class="profile-card-title">📊 Statistics</div>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${u.gamesPlayed || 0}</div>
          <div class="stat-label">Games</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${u.gamesWon || 0}</div>
          <div class="stat-label">Wins</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" style="color:var(--green)">${winRate}%</div>
          <div class="stat-label">Win Rate</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" style="color:var(--gold)">${formatNum(u.biggestWin || 0)}</div>
          <div class="stat-label">Best Win</div>
        </div>
      </div>
    </div>

    <div class="profile-card">
      <div class="profile-card-title">💰 Chips</div>
      <div class="chip-balance">${formatNum(u.chips || 0)}</div>
    </div>

    <div class="profile-card">
      <div class="profile-card-title">🎨 Cosmetics</div>
      <div class="cosmetic-slots">
        <div class="cosmetic-slot">
          <div class="cosmetic-slot-icon">🃏</div>
          <div class="cosmetic-slot-label">Card Skin</div>
        </div>
        <div class="cosmetic-slot">
          <div class="cosmetic-slot-icon">🎰</div>
          <div class="cosmetic-slot-label">Table</div>
        </div>
        <div class="cosmetic-slot">
          <div class="cosmetic-slot-icon">🖼️</div>
          <div class="cosmetic-slot-label">Frame</div>
        </div>
      </div>
    </div>

    <button class="btn-logout" onclick="logout()">Log Out</button>
  `;
}

// ═══════════ PARTICLE BACKGROUND ═══════════
function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  const COUNT = 40;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.3 + 0.05,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(212, 175, 55, ${p.alpha})`;
      ctx.fill();
    });

    // Draw connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(212, 175, 55, ${0.06 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ═══════════ TOAST ═══════════
function showToast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'toastSlide 0.4s ease';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ═══════════ HELPERS ═══════════
function formatNum(n) {
  if (n === undefined || n === null) return '0';
  const num = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (num >= 1000000) return sign + (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 10000) return sign + (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return sign + num.toLocaleString();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ═══════════ INIT ═══════════
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  tryAutoLogin();
});
