import { getContainer } from '../config/cosmos';
import { Container } from '@azure/cosmos';

/* ------------------------------------------------------------------ */
/*  Spin Wheel Configuration                                          */
/* ------------------------------------------------------------------ */

export interface SpinSegment {
  label: string;
  weight: number;
  reward: number; // 0 = jackpot (pool amount resolved at spin time)
  isJackpot: boolean;
}

const SPIN_SEGMENTS: SpinSegment[] = [
  { label: '500 chips',    weight: 30, reward: 500,    isJackpot: false },
  { label: '1,000 chips',  weight: 25, reward: 1_000,  isJackpot: false },
  { label: '2,500 chips',  weight: 18, reward: 2_500,  isJackpot: false },
  { label: '5,000 chips',  weight: 12, reward: 5_000,  isJackpot: false },
  { label: '10,000 chips', weight: 8,  reward: 10_000, isJackpot: false },
  { label: '25,000 chips', weight: 4,  reward: 25_000, isJackpot: false },
  { label: '50,000 chips', weight: 2,  reward: 50_000, isJackpot: false },
  { label: 'JACKPOT',      weight: 1,  reward: 0,      isJackpot: true  },
];

const TOTAL_WEIGHT = SPIN_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const FREE_SPIN_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
const PAID_SPIN_COST = 5_000;
const VIP_BONUS_MIN_LEVEL = 6;
const JACKPOT_MIN = 100_000;
const SPIN_HISTORY_LIMIT = 20;
const SPIN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const JACKPOT_DOC_ID = 'global_jackpot';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface UserSpinState {
  id: string;
  userId: string;
  docType: 'user_spin_state';
  lastFreeSpinTime: number;   // epoch ms
  freeSpinsUsedToday: number;
  vipBonusUsedToday: boolean;
  lastResetDate: string;      // YYYY-MM-DD — tracks daily reset
}

interface JackpotDoc {
  id: string;
  userId: string; // partition key value — 'global_jackpot'
  docType: 'jackpot';
  amount: number;
}

interface SpinResult {
  id: string;
  userId: string;
  docType: 'spin_result';
  segmentIndex: number;
  segmentLabel: string;
  reward: number;
  isJackpot: boolean;
  wasFree: boolean;
  timestamp: number;
  ttl: number;
}

export interface SpinStatus {
  nextFreeSpinAt: number | null; // epoch ms, null if spin available now
  freeSpinsRemaining: number;
  jackpotAmount: number;
  segments: SpinSegment[];
}

export interface SpinOutcome {
  segmentIndex: number;
  segmentLabel: string;
  reward: number;
  isJackpot: boolean;
  newBalance: number;
  jackpotAmount: number;
}

/* ------------------------------------------------------------------ */
/*  Service                                                           */
/* ------------------------------------------------------------------ */

export class LuckySpinService {
  private get dataContainer(): Container {
    return getContainer('data');
  }

  private get usersContainer(): Container {
    return getContainer('users');
  }

  /* ---------- helpers -------------------------------------------- */

  private todayString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async getUserSpinState(userId: string): Promise<UserSpinState> {
    const docId = `spin_state_${userId}`;
    try {
      const { resource } = await this.dataContainer
        .item(docId, userId)
        .read<UserSpinState>();
      if (resource) return resource;
    } catch {
      // not found — create default
    }
    return {
      id: docId,
      userId,
      docType: 'user_spin_state',
      lastFreeSpinTime: 0,
      freeSpinsUsedToday: 0,
      vipBonusUsedToday: false,
      lastResetDate: this.todayString(),
    };
  }

  private async saveUserSpinState(state: UserSpinState): Promise<void> {
    await this.dataContainer.items.upsert(state);
  }

  private async getJackpotDoc(): Promise<JackpotDoc> {
    try {
      const { resource } = await this.dataContainer
        .item(JACKPOT_DOC_ID, JACKPOT_DOC_ID)
        .read<JackpotDoc>();
      if (resource) return resource;
    } catch {
      // not found
    }
    const doc: JackpotDoc = {
      id: JACKPOT_DOC_ID,
      userId: JACKPOT_DOC_ID, // partition key
      docType: 'jackpot',
      amount: JACKPOT_MIN,
    };
    await this.dataContainer.items.upsert(doc);
    return doc;
  }

  private async getUserVipLevel(userId: string): Promise<number> {
    try {
      const { resource } = await this.usersContainer
        .item(userId, userId)
        .read<{ vipLevel?: number }>();
      return resource?.vipLevel ?? 1;
    } catch {
      return 1;
    }
  }

  /** Reset daily counters if the date has rolled over. */
  private resetIfNewDay(state: UserSpinState): void {
    const today = this.todayString();
    if (state.lastResetDate !== today) {
      state.freeSpinsUsedToday = 0;
      state.vipBonusUsedToday = false;
      state.lastResetDate = today;
    }
  }

  /** Compute how many free spins remain right now. */
  private computeFreeSpins(
    state: UserSpinState,
    vipLevel: number,
  ): { remaining: number; nextFreeAt: number | null } {
    this.resetIfNewDay(state);

    const now = Date.now();
    const cooldownReady = now - state.lastFreeSpinTime >= FREE_SPIN_COOLDOWN_MS;

    // Base free spin (cooldown-based)
    let baseFree = cooldownReady ? 1 : 0;
    const nextFreeAt = cooldownReady
      ? null
      : state.lastFreeSpinTime + FREE_SPIN_COOLDOWN_MS;

    // VIP bonus: 1 extra free spin per day for VIP 6+
    let vipBonus = 0;
    if (vipLevel >= VIP_BONUS_MIN_LEVEL && !state.vipBonusUsedToday) {
      vipBonus = 1;
    }

    return { remaining: baseFree + vipBonus, nextFreeAt };
  }

  /** Weighted random segment selection. */
  private pickSegment(): number {
    let roll = Math.random() * TOTAL_WEIGHT;
    for (let i = 0; i < SPIN_SEGMENTS.length; i++) {
      roll -= SPIN_SEGMENTS[i].weight;
      if (roll <= 0) return i;
    }
    return 0; // fallback
  }

  /* ---------- public API ----------------------------------------- */

  async getStatus(userId: string): Promise<SpinStatus> {
    const [state, jackpotDoc, vipLevel] = await Promise.all([
      this.getUserSpinState(userId),
      this.getJackpotDoc(),
      this.getUserVipLevel(userId),
    ]);

    const { remaining, nextFreeAt } = this.computeFreeSpins(state, vipLevel);

    return {
      nextFreeSpinAt: nextFreeAt,
      freeSpinsRemaining: remaining,
      jackpotAmount: jackpotDoc.amount,
      segments: SPIN_SEGMENTS,
    };
  }

  async spin(userId: string, useFree: boolean): Promise<SpinOutcome> {
    const [state, jackpotDoc, vipLevel, userDoc] = await Promise.all([
      this.getUserSpinState(userId),
      this.getJackpotDoc(),
      this.getUserVipLevel(userId),
      this.usersContainer.item(userId, userId).read(),
    ]);

    const user = userDoc.resource;
    if (!user) throw new Error('User not found');

    this.resetIfNewDay(state);

    /* --- validate & consume spin --------------------------------- */
    if (useFree) {
      const { remaining } = this.computeFreeSpins(state, vipLevel);
      if (remaining <= 0) {
        throw new Error('No free spins available');
      }

      const now = Date.now();
      const cooldownReady = now - state.lastFreeSpinTime >= FREE_SPIN_COOLDOWN_MS;

      if (cooldownReady) {
        // consume cooldown-based free spin
        state.lastFreeSpinTime = now;
        state.freeSpinsUsedToday += 1;
      } else if (vipLevel >= VIP_BONUS_MIN_LEVEL && !state.vipBonusUsedToday) {
        // consume VIP bonus spin
        state.vipBonusUsedToday = true;
      } else {
        throw new Error('No free spins available');
      }
    } else {
      // paid spin
      if ((user.chips || 0) < PAID_SPIN_COST) {
        throw new Error('Not enough chips for a paid spin');
      }
      user.chips = (user.chips || 0) - PAID_SPIN_COST;
    }

    /* --- determine outcome --------------------------------------- */
    const segmentIndex = this.pickSegment();
    const segment = SPIN_SEGMENTS[segmentIndex];

    let reward: number;
    let isJackpot = false;

    if (segment.isJackpot) {
      reward = jackpotDoc.amount;
      isJackpot = true;
      // reset jackpot pool
      jackpotDoc.amount = JACKPOT_MIN;
    } else {
      reward = segment.reward;
    }

    user.chips = (user.chips || 0) + reward;

    /* --- persist everything -------------------------------------- */
    const spinResultDoc: SpinResult = {
      id: `spin_${userId}_${Date.now()}`,
      userId,
      docType: 'spin_result',
      segmentIndex,
      segmentLabel: segment.label,
      reward,
      isJackpot,
      wasFree: useFree,
      timestamp: Date.now(),
      ttl: SPIN_TTL_SECONDS,
    };

    await Promise.all([
      this.saveUserSpinState(state),
      this.dataContainer.items.upsert(jackpotDoc),
      this.usersContainer.item(userId, userId).replace(user),
      this.dataContainer.items.create(spinResultDoc),
    ]);

    return {
      segmentIndex,
      segmentLabel: segment.label,
      reward,
      isJackpot,
      newBalance: user.chips,
      jackpotAmount: jackpotDoc.amount,
    };
  }

  /** Feed a percentage of bets into the jackpot pool. */
  async addToJackpot(amount: number): Promise<void> {
    const contribution = Math.floor(amount * 0.01);
    if (contribution <= 0) return;

    const doc = await this.getJackpotDoc();
    doc.amount += contribution;
    await this.dataContainer.items.upsert(doc);
  }

  /** Return the last 20 spins for a user. */
  async getSpinHistory(userId: string): Promise<SpinResult[]> {
    const { resources } = await this.dataContainer.items
      .query<SpinResult>({
        query:
          `SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'spin_result' ` +
          `ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit`,
        parameters: [
          { name: '@userId', value: userId },
          { name: '@limit', value: SPIN_HISTORY_LIMIT },
        ],
      })
      .fetchAll();
    return resources;
  }

  /** Public: current jackpot amount. */
  async getJackpotAmount(): Promise<number> {
    const doc = await this.getJackpotDoc();
    return doc.amount;
  }
}
