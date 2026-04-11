import { getContainer } from '../config/cosmos';

// ---- Mission Template Definitions ----

interface MissionTemplate {
  id: string;
  description: string;
  target: number;
  reward: number;
}

interface MissionProgress {
  templateId: string;
  description: string;
  target: number;
  progress: number;
  reward: number;
  completed: boolean;
  claimed: boolean;
}

interface MissionDoc {
  id: string;
  docType: 'user_missions';
  userId: string;
  dailyMissions: MissionProgress[];
  dailyDate: string; // YYYY-MM-DD UTC
  weeklyMissions: MissionProgress[];
  weeklyStart: string; // YYYY-MM-DD UTC (Monday)
}

interface AchievementProgress {
  id: string;
  description: string;
  target: number;
  progress: number;
  reward: number;
  unlocked: boolean;
  claimed: boolean;
  unlockedAt?: string;
}

interface AchievementDoc {
  id: string;
  docType: 'user_achievements';
  userId: string;
  achievements: AchievementProgress[];
}

// ---- Daily Mission Pool ----

const DAILY_POOL: { id: string; descTemplate: string; targets: number[]; rewardScale: number }[] = [
  { id: 'play_rounds',     descTemplate: 'Play {target} rounds',            targets: [5, 10, 20],          rewardScale: 1000 },
  { id: 'win_hands',       descTemplate: 'Win {target} poker hands',        targets: [3, 5, 10],           rewardScale: 2000 },
  { id: 'bet_chips',       descTemplate: 'Bet {target} chips total',        targets: [50000, 100000, 500000], rewardScale: 0.1 },
  { id: 'play_bullfight',  descTemplate: 'Play {target} bullfight rounds',  targets: [3, 5, 10],           rewardScale: 2000 },
  { id: 'win_bullfight',   descTemplate: 'Win {target} bullfight bets',     targets: [2, 5],               rewardScale: 5000 },
  { id: 'send_gift',       descTemplate: 'Send chips to {target} friends',  targets: [1, 3],               rewardScale: 5000 },
  { id: 'play_tournament', descTemplate: 'Play {target} tournament(s)',     targets: [1, 2],               rewardScale: 10000 },
  { id: 'use_emote',       descTemplate: 'Use {target} emotes',             targets: [5, 10],              rewardScale: 1000 },
];

// ---- Weekly Mission Pool ----

const WEEKLY_POOL: { id: string; descTemplate: string; targets: number[]; rewardScale: number }[] = [
  { id: 'weekly_hands',       descTemplate: 'Win {target} poker hands this week',  targets: [20, 50],            rewardScale: 2000 },
  { id: 'weekly_earnings',    descTemplate: 'Earn {target} chips this week',       targets: [500000, 1000000],   rewardScale: 0.1 },
  { id: 'weekly_tournaments', descTemplate: 'Play {target} tournaments',           targets: [3, 5],              rewardScale: 20000 },
  { id: 'weekly_login',       descTemplate: 'Login {target} days this week',       targets: [5, 7],              rewardScale: 10000 },
];

// ---- Achievement Definitions ----

const ACHIEVEMENT_DEFS: { id: string; description: string; target: number; reward: number; eventType: string }[] = [
  { id: 'first_win',            description: 'Win your first poker hand',     target: 1,         reward: 5000,    eventType: 'win_hands' },
  { id: 'high_roller',          description: 'Bet 1M chips in a single hand', target: 1000000,   reward: 50000,   eventType: 'single_bet' },
  { id: 'social_butterfly',     description: 'Add 10 friends',                target: 10,        reward: 10000,   eventType: 'add_friend' },
  { id: 'tournament_champion',  description: 'Win a tournament',              target: 1,         reward: 100000,  eventType: 'win_tournament' },
  { id: 'vip_gold',             description: 'Reach VIP level 6',             target: 6,         reward: 25000,   eventType: 'vip_level' },
  { id: 'vip_diamond',          description: 'Reach VIP level 10',            target: 10,        reward: 100000,  eventType: 'vip_level' },
  { id: 'chip_millionaire',     description: 'Accumulate 1M chips',           target: 1000000,   reward: 50000,   eventType: 'chip_balance' },
  { id: 'club_leader',          description: 'Create a club',                 target: 1,         reward: 10000,   eventType: 'create_club' },
  { id: 'generous',             description: 'Gift 100K chips total',         target: 100000,    reward: 25000,   eventType: 'gift_chips' },
  { id: 'bullfight_master',     description: 'Win 100 bullfight bets',        target: 100,       reward: 50000,   eventType: 'win_bullfight' },
  { id: 'streak_king',          description: 'Login 30 days in a row',        target: 30,        reward: 100000,  eventType: 'login_streak' },
  { id: 'big_winner',           description: 'Win 10M chips total',           target: 10000000,  reward: 200000,  eventType: 'total_winnings' },
];

// ---- Helpers ----

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStartUTC(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - diff);
  return monday.toISOString().slice(0, 10);
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function buildMission(pool: typeof DAILY_POOL[number]): MissionProgress {
  const target = pool.targets[Math.floor(Math.random() * pool.targets.length)];
  const reward = Math.round(target * pool.rewardScale);
  // Clamp daily rewards to 1000-50000 range
  const clampedReward = Math.max(1000, Math.min(50000, reward));
  return {
    templateId: pool.id,
    description: pool.descTemplate.replace('{target}', target.toLocaleString()),
    target,
    progress: 0,
    reward: clampedReward,
    completed: false,
    claimed: false,
  };
}

function buildWeeklyMission(pool: typeof WEEKLY_POOL[number]): MissionProgress {
  const target = pool.targets[Math.floor(Math.random() * pool.targets.length)];
  const reward = Math.round(target * pool.rewardScale);
  // Clamp weekly rewards to 10000-100000 range
  const clampedReward = Math.max(10000, Math.min(100000, reward));
  return {
    templateId: pool.id,
    description: pool.descTemplate.replace('{target}', target.toLocaleString()),
    target,
    progress: 0,
    reward: clampedReward,
    completed: false,
    claimed: false,
  };
}

// ---- Service ----

export class MissionService {
  private get dataContainer() {
    return getContainer('data');
  }

  private get usersContainer() {
    return getContainer('users');
  }

  private async getMissionDoc(userId: string): Promise<MissionDoc | null> {
    try {
      const { resource } = await this.dataContainer
        .item(`missions_${userId}`, userId)
        .read<MissionDoc>();
      return resource ?? null;
    } catch (err: any) {
      if (err.code === 404) return null;
      throw err;
    }
  }

  private async upsertMissionDoc(doc: MissionDoc): Promise<void> {
    await this.dataContainer.items.upsert(doc);
  }

  private async getAchievementDoc(userId: string): Promise<AchievementDoc | null> {
    try {
      const { resource } = await this.dataContainer
        .item(`achievements_${userId}`, userId)
        .read<AchievementDoc>();
      return resource ?? null;
    } catch (err: any) {
      if (err.code === 404) return null;
      throw err;
    }
  }

  private async upsertAchievementDoc(doc: AchievementDoc): Promise<void> {
    await this.dataContainer.items.upsert(doc);
  }

  private initAchievementDoc(userId: string): AchievementDoc {
    return {
      id: `achievements_${userId}`,
      docType: 'user_achievements',
      userId,
      achievements: ACHIEVEMENT_DEFS.map((a) => ({
        id: a.id,
        description: a.description,
        target: a.target,
        progress: 0,
        reward: a.reward,
        unlocked: false,
        claimed: false,
      })),
    };
  }

  // ---- Public API ----

  async getDailyMissions(userId: string): Promise<MissionProgress[]> {
    const today = getTodayUTC();
    let doc = await this.getMissionDoc(userId);

    if (!doc || doc.dailyDate !== today) {
      // Generate new daily missions
      const selected = pickRandom(DAILY_POOL, 3);
      const dailyMissions = selected.map(buildMission);

      if (!doc) {
        doc = {
          id: `missions_${userId}`,
          docType: 'user_missions',
          userId,
          dailyMissions,
          dailyDate: today,
          weeklyMissions: [],
          weeklyStart: '',
        };
      } else {
        doc.dailyMissions = dailyMissions;
        doc.dailyDate = today;
      }
      await this.upsertMissionDoc(doc);
    }

    return doc.dailyMissions;
  }

  async getWeeklyMissions(userId: string): Promise<MissionProgress[]> {
    const weekStart = getWeekStartUTC();
    let doc = await this.getMissionDoc(userId);

    if (!doc || doc.weeklyStart !== weekStart) {
      const selected = pickRandom(WEEKLY_POOL, 2);
      const weeklyMissions = selected.map(buildWeeklyMission);

      if (!doc) {
        doc = {
          id: `missions_${userId}`,
          docType: 'user_missions',
          userId,
          dailyMissions: [],
          dailyDate: '',
          weeklyMissions,
          weeklyStart: weekStart,
        };
      } else {
        doc.weeklyMissions = weeklyMissions;
        doc.weeklyStart = weekStart;
      }
      await this.upsertMissionDoc(doc);
    }

    return doc.weeklyMissions;
  }

  async getAchievements(userId: string): Promise<AchievementProgress[]> {
    let doc = await this.getAchievementDoc(userId);
    if (!doc) {
      doc = this.initAchievementDoc(userId);
      await this.upsertAchievementDoc(doc);
    }
    return doc.achievements;
  }

  async trackEvent(userId: string, eventType: string, value: number = 1): Promise<void> {
    // Update daily missions
    const today = getTodayUTC();
    const weekStart = getWeekStartUTC();
    let doc = await this.getMissionDoc(userId);

    if (doc) {
      let changed = false;

      if (doc.dailyDate === today) {
        for (const m of doc.dailyMissions) {
          if (m.templateId === eventType && !m.completed) {
            m.progress = Math.min(m.progress + value, m.target);
            if (m.progress >= m.target) m.completed = true;
            changed = true;
          }
        }
      }

      // Map game events to weekly mission template ids
      const weeklyEventMap: Record<string, string> = {
        win_hands: 'weekly_hands',
        earn_chips: 'weekly_earnings',
        play_tournament: 'weekly_tournaments',
        daily_login: 'weekly_login',
      };

      if (doc.weeklyStart === weekStart) {
        const weeklyId = weeklyEventMap[eventType];
        for (const m of doc.weeklyMissions) {
          // Match direct templateId or mapped event
          if ((m.templateId === eventType || m.templateId === weeklyId) && !m.completed) {
            m.progress = Math.min(m.progress + value, m.target);
            if (m.progress >= m.target) m.completed = true;
            changed = true;
          }
        }
      }

      if (changed) await this.upsertMissionDoc(doc);
    }

    // Update achievements
    let achDoc = await this.getAchievementDoc(userId);
    if (!achDoc) {
      achDoc = this.initAchievementDoc(userId);
    }

    let achChanged = false;
    for (const ach of achDoc.achievements) {
      if (ach.unlocked) continue;

      const def = ACHIEVEMENT_DEFS.find((d) => d.id === ach.id);
      if (!def || def.eventType !== eventType) continue;

      // For threshold achievements (vip_level, chip_balance, single_bet) use max value
      const isAbsolute = ['vip_level', 'chip_balance', 'single_bet'].includes(eventType);
      if (isAbsolute) {
        ach.progress = Math.max(ach.progress, value);
      } else {
        ach.progress += value;
      }

      if (ach.progress >= ach.target) {
        ach.unlocked = true;
        ach.unlockedAt = new Date().toISOString();
      }
      achChanged = true;
    }

    if (achChanged) await this.upsertAchievementDoc(achDoc);
  }

  async claimReward(userId: string, missionId: string): Promise<{ reward: number }> {
    // Check daily missions first
    const doc = await this.getMissionDoc(userId);
    if (!doc) throw new Error('No missions found');

    let mission: MissionProgress | undefined;
    let source: 'daily' | 'weekly' = 'daily';

    mission = doc.dailyMissions.find((m) => m.templateId === missionId && m.completed && !m.claimed);
    if (!mission) {
      mission = doc.weeklyMissions.find((m) => m.templateId === missionId && m.completed && !m.claimed);
      source = 'weekly';
    }

    // Also check achievements
    if (!mission) {
      const achDoc = await this.getAchievementDoc(userId);
      if (achDoc) {
        const ach = achDoc.achievements.find((a) => a.id === missionId && a.unlocked && !a.claimed);
        if (ach) {
          ach.claimed = true;
          await this.upsertAchievementDoc(achDoc);
          await this.addChipsToUser(userId, ach.reward);
          return { reward: ach.reward };
        }
      }
      throw new Error('Mission not found or not claimable');
    }

    mission.claimed = true;
    await this.upsertMissionDoc(doc);
    await this.addChipsToUser(userId, mission.reward);
    return { reward: mission.reward };
  }

  private async addChipsToUser(userId: string, amount: number): Promise<void> {
    const { resource: user } = await this.usersContainer.item(userId, userId).read();
    if (!user) throw new Error('User not found');

    user.chips = (user.chips || 0) + amount;
    await this.usersContainer.item(userId, userId).replace(user);
  }
}
