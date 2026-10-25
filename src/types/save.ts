/* Save document schema — mirrors newSave() in src/core/db.js.
 * Contract only: runtime logic (sanitize/merge) stays in db.ts.
 */

export interface SaveStats {
  runs: number;
  bestTime: number;
  bestLevel: number;
  totalKills: number;
  pulls: number;
  coinsEarned: number;
  shinies: number;
  bossesTotal: number;
  riftWins: number;
  evolutions: number;
  missionsDone: number;
  groupRuns: number;
  bestGroupTime: number;
}

export interface SaveProfile {
  favs: number[];
  title: string;
}

export interface OwnedEntry {
  at: number;
  from: 'starter' | 'gacha' | 'wild' | string;
}

export interface Tickets {
  t1: number;
  t10: number;
}

/** Ledger entry: [earned, spent] per currency (c/coins, t1, t10). */
export type LedgerEntry = [number, number];
/** device -> currency -> [earned, spent] (only grows). */
export type Ledger = Record<string, Partial<Record<'c' | 't1' | 't10', LedgerEntry>>>;

export interface Save {
  v: number;
  name: string;
  created: number;
  updated: number;
  coins: number;
  /** dex -> OwnedEntry */
  owned: Record<number, OwnedEntry>;
  /** dex -> OwnedEntry (shiny variants) */
  shiny: Record<number, OwnedEntry>;
  partner: number | null;
  partnerShiny: boolean;
  starter: number | null;
  personality: { trait: string | null; scores: Record<string, number> } | null;
  /** deprecated (account-wide), migrated into pupg */
  upgrades: Record<string, number>;
  /** dex -> upgradeId -> level */
  pupg: Record<number, Record<string, number>>;
  /** dex -> date (negative = unfavorited at that time) */
  dfav: Record<number, number>;
  /** dex -> play count (sort "most used") */
  pused: Record<number, number>;
  tickets: Tickets;
  /** banner gen -> pulls without ★5 */
  pity: Record<number, number>;
  /** dex -> date: legendaries beaten in rifts */
  legends: Record<number, number>;
  /** terrain type -> date: rift arenas won */
  arenas: Record<string, number>;
  /** item id -> date: equippable items found */
  itemsFound: Record<string, number>;
  /** move id -> date: evolved moves seen */
  evoMoves: Record<string, number>;
  /** achievement id -> date */
  ach: Record<string, number>;
  /** daily/week mission progress */
  missions: Record<string, unknown>;
  profile: SaveProfile;
  stats: SaveStats;
  /** per-device earn/spend ledger (coins/tickets merge safety) */
  led?: Ledger;
  pupgDone?: boolean;
  /** dex -> 4 move shortcuts (validated against Moves.BY_ID) */
  pbind?: Record<number, (string | null)[]>;
  /** dex -> max 3 banned move ids */
  pban?: Record<number, string[]>;
  legend?: boolean;
  sus?: boolean;
  ban?: boolean;
  /** autochess meta (v4) */
  ac?: SaveAc;
}

/** START_COINS default for new saves (db.js). */
export const START_COINS = 500;

/** Autochess meta (save v4): best scores + per-daily-seed best. */
export interface AcDailyEntry { score: number; wave: number; at: number; }
export interface SaveAc {
  bestScore: number;
  bestWave: number;
  bestEndless: number;
  runs: number;
  /** YYYY-MM-DD -> best run of that daily seed (keep newest 30) */
  daily: Record<string, AcDailyEntry>;
}
/** Default ac block (migrate/newSave). */
export const AC_INIT: SaveAc = { bestScore: 0, bestWave: 0, bestEndless: 0, runs: 0, daily: {} };

/** Save schema version (db.js VERSION). */
export const SAVE_VERSION = 4;
