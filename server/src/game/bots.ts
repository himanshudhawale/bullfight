import { BullfightGame, BETTING_STAGES, BullfightStage } from './bullfight';

// ---- Bot definitions ----

export interface BotConfig {
  id: string;
  name: string;
  startingChips: number;
}

export const BOT_CONFIGS: BotConfig[] = [
  { id: 'bot:lucky-dragon', name: 'Lucky Dragon', startingChips: 1_000_000 },
  { id: 'bot:high-roller', name: 'High Roller', startingChips: 1_000_000 },
  { id: 'bot:ace-hunter', name: 'Ace Hunter', startingChips: 1_000_000 },
];

// ---- Helpers ----

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Bot betting logic ----

function placeBotBets(game: BullfightGame, bot: BotConfig): void {
  if (!(BETTING_STAGES as readonly string[]).includes(game.stage)) return;

  const availableBets: string[] = [];
  for (const [betType, mult] of Object.entries(game.currentMultipliers)) {
    if (mult > 0) availableBets.push(betType);
  }
  if (availableBets.length === 0) return;

  const handBets = shuffle(availableBets.filter(b => b.startsWith('hand_')));
  const winnerBets = availableBets.filter(b => b.startsWith('winner_'));

  // Pick 1-3 random hand types
  const numHandBets = Math.min(randomInt(1, 3), handBets.length);
  const selectedBets: string[] = handBets.slice(0, numHandBets);

  // ~40% chance to also bet on winner_a or winner_b
  if (winnerBets.length > 0 && Math.random() < 0.4) {
    selectedBets.push(winnerBets[Math.floor(Math.random() * winnerBets.length)]);
  }

  for (const betType of selectedBets) {
    const amount = randomInt(1, 50) * 100; // 100 to 5,000 in steps of 100
    const result = game.placeBet(bot.id, betType, amount);
    if (result.ok) {
      console.log(`🤖 ${bot.name} bet ${amount} on ${betType} (${result.multiplier}x)`);
    }
  }

  // Replenish chips if running low
  if ((game.chipBalances.get(bot.id) || 0) < 10_000) {
    game.buyChips(bot.id, 500_000);
    console.log(`🤖 ${bot.name} replenished chips`);
  }
}

// ---- Public entry point ----

export function startBots(game: BullfightGame): void {
  for (const bot of BOT_CONFIGS) {
    game.buyChips(bot.id, bot.startingChips);
  }

  game.onStageChange = (stage: BullfightStage) => {
    if (!(BETTING_STAGES as readonly string[]).includes(stage)) return;

    // Stagger bot bets with random 1–5 second delays
    for (const bot of BOT_CONFIGS) {
      const delay = randomInt(1000, 5000);
      setTimeout(() => placeBotBets(game, bot), delay);
    }
  };

  console.log(`🤖 ${BOT_CONFIGS.length} bots registered: ${BOT_CONFIGS.map(b => b.name).join(', ')}`);
}
