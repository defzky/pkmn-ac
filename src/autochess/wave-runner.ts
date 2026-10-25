/**
 * wave-runner.ts — dual-board auto-battler phase machine: prep → combat → (buff every 3) → …
 *
 * P18: NO path. Enemies stand on the top 3×3 arena (cells y −1..−3, front row y −1);
 * player units stand on the bottom 3×3 (y 0..2). Round won = all enemies dead →
 * damage the enemy heart; round lost = player team wiped → damage the player heart.
 */
import { register } from '../core/registry';
import { WaveDef, prepSeconds, interest, streakBonus, type MobSpec, type WaveComp } from './wave';
import { create as createBase, type BaseState } from './base';
import { tick as aiTick, respawnUnits } from './unitAI';
import type { MobBattle } from './unitAI';
import type { UnitBattle } from './unit';
import { NONE, type SynergyMods } from './synergy';
import { initBuffs, type RunBuffs, type BuffDef } from './buffs';
import { waveRnd } from './rng';

export type Phase = 'prep' | 'combat' | 'buff' | 'won' | 'lost';

export interface RunState {
  wave: number;
  phase: Phase;
  /** seconds left in prep; auto-start combat at 0 */
  prepLeft: number;
  /** mobs still waiting to spawn */
  spawnQ: MobSpec[];
  /** countdown to next spawn */
  spawnT: number;
  /** seconds between spawns */
  spawnGap: number;
  mobs: MobBattle[];
  gold: number;
  /** player heart (bottom-right blue badge) */
  base: BaseState;
  /** enemy heart (top-right red badge) */
  foe: BaseState;
  /** kills this run (for stats) */
  kills: number;
  /** permanent buffs picked at buff phases (merged into combat mods) */
  buffs: RunBuffs;
  /** consecutive round wins (streak bonus 3+) */
  streak: number;
  /** consecutive team-wipe rounds (consolation gold 2+) */
  lossStreak: number;
  /** opt-in endless past MAX_WAVE (RUN COMPLETE screen) */
  endless: boolean;
  /** daily seed (undefined = Math.random) */
  seed?: number;
  /** cached wave composition — preview, shop bias & combat share ONE roll per wave */
  comp: WaveComp | null;
  /** wave the cache belongs to (invalidates on direct st.wave mutation / debug API) */
  compW: number;
  /** last round resolution for the UI (loss must not show the win banner) */
  roundResult?: 'win' | 'loss';
  /** last round economy breakdown for the banner sub (wave/int/streak gold) */
  lastEcon?: { wave: number; interest: number; streak: number };
}

/** enemy grid slots, front row first (y −1 = front … y −3 = back) */
export const FOE_SLOTS: Array<{ x: number; y: number }> = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 2, y: -1 },
  { x: 0, y: -2 }, { x: 1, y: -2 }, { x: 2, y: -2 },
  { x: 0, y: -3 }, { x: 1, y: -3 }, { x: 2, y: -3 },
];
/** 3×3 enemy grid capacity */
export const MAX_FIELD = FOE_SLOTS.length;
export const PLAYER_HP = 45;
export const FOE_HP = 20;
/** heart damage when the player team is wiped */
export const LOSS_DMG = 3;

/** buy/placement window before wave auto-starts (wave 1; later waves use prepSeconds(wave)) */
export const PREP_SECONDS = 25;
export const SPAWN_GAP = 0.4;
export const START_GOLD = 5;
/** gold granted on every wave clear — D2c: 2 + floor(w/2) */
export function waveBonus(wave: number): number {
  return 2 + Math.floor(wave / 2);
}
/** grant a buff pick every N waves */
export const BUFF_EVERY = 3;

function dexEntry(dex: number): any {
  return ((G as any).DEX_BY || {})[dex];
}

function toMob(s: MobSpec, slot: { x: number; y: number }): MobBattle {
  const e = dexEntry(s.dex);
  // GDD common §4: normal 1 / elite 2 / boss 10 — always pays (drop chance removed)
  const bounty = s.boss ? 10 : s.elite ? 2 : 1;
  return {
    dex: s.dex,
    hp: s.hp,
    maxHp: s.hp,
    atk: s.atk,
    spd: s.spd,
    types: Array.isArray(e?.types) ? e.types : [],
    star: s.star,
    boss: s.boss,
    cx: slot.x,
    cy: slot.y, // fixed enemy-arena cell (no walking)
    progress: 0,
    alive: true,
    bounty,
    // roles / elites / bosses (defaults 0/false)
    armor: s.armor ?? 0,
    shield: s.shield ?? 0,
    dodge: s.dodge ?? 0,
    regen: s.regen ?? 0,
    barrier: s.barrier ?? 0,
    stunImmune: !!s.stunImmune,
    slowImmune: !!s.slowImmune,
    kbImmune: !!s.kbImmune,
    rest: !!s.rest,
    rested: false,
    restT: 0,
    roar: !!s.roar,
    roarCd: 10,
    disable: !!s.disable,
    disT: 8,
    statuses: [],
    shred: 0,
    shredT: 0,
    affix: s.affix,
    atkT: 0,
    stopT: 0,
  };
}

/** fresh run at wave 1 */
export function createRun(gold = START_GOLD, prep = PREP_SECONDS, seed?: number): RunState {
  return {
    wave: 1,
    phase: 'prep',
    prepLeft: prep,
    spawnQ: [],
    spawnT: 0,
    spawnGap: SPAWN_GAP,
    mobs: [],
    gold,
    base: createBase(PLAYER_HP),
    foe: createBase(FOE_HP),
    kills: 0,
    buffs: initBuffs(),
    streak: 0,
    lossStreak: 0,
    endless: false,
    seed,
    comp: null,
    compW: 0,
  };
}

/** Cached composition for st.wave: preview, shop bias & startCombat all read THIS. */
export function getComp(st: RunState): WaveComp {
  if (!st.comp || st.compW !== st.wave) {
    st.comp = WaveDef.compose(st.wave, st.seed ? waveRnd(st.seed, st.wave) : undefined);
    st.compW = st.wave;
  }
  return st.comp;
}

/** roll composition for current wave (queue = full wave, no slice), enter combat */
export function startCombat(st: RunState): void {
  if (st.phase !== 'prep') return;
  const comp = getComp(st);
  st.spawnQ = comp.mobs.map((m) => ({ ...m }));
  st.spawnT = 0;
  st.mobs = [];
  st.phase = 'combat';
}

function advanceWave(st: RunState): void {
  st.wave++;
  st.comp = null; // next wave = fresh roll
  st.compW = 0;
  st.phase = 'prep';
  st.prepLeft = prepSeconds(st.wave); // D2c: 25 / 15 / 12s curve
}

/** RUN COMPLETE → Endless: keep going past MAX_WAVE (score keeps accumulating). */
export function resumeEndless(st: RunState): void {
  st.endless = true;
  st.wave += 1;
  st.comp = null;
  st.compW = 0;
  st.phase = 'prep';
  st.prepLeft = prepSeconds(st.wave);
}

/**
 * advance one dt. units = player board battle units (alive flags respected).
 * returns true when phase changed (combat→buff/prep/won/lost) for UI hook.
 */
export function tick(
  st: RunState,
  units: UnitBattle[],
  dt: number,
  mods: SynergyMods = NONE
): boolean {
  if (st.phase === 'prep') {
    respawnUnits(units); // GDD common §1: dead defenders back at prep start
    st.prepLeft -= dt;
    if (st.prepLeft <= 0) {
      startCombat(st);
      return true;
    }
    return false;
  }
  if (st.phase !== 'combat') return false;

  // spawn queue → free enemy-arena slots (max MAX_FIELD alive; queue keeps full wave)
  if (st.spawnQ.length) {
    st.spawnT -= dt;
    let guard = 0;
    while (st.spawnQ.length && st.spawnT <= 0 && guard++ <= MAX_FIELD) {
      const used = new Set(st.mobs.map((m) => m.cx + ',' + m.cy));
      const slot = FOE_SLOTS.find((s) => !used.has(s.x + ',' + s.y));
      if (!slot) break;
      st.mobs.push(toMob(st.spawnQ.shift()!, slot));
      st.spawnT += st.spawnGap;
    }
  }

  const r = aiTick(units, st.mobs, dt, mods, []);
  st.kills += r.kills;
  if (r.gold) st.gold += r.gold;
  // dead mobs leave the array → frees their slot for the spawn queue (syncEnemies
  // detects the missing mob → Faint fade path)
  if (st.mobs.some((m) => !m.alive)) st.mobs = st.mobs.filter((m) => m.alive);

  // player team wiped (or never fielded) → damage player heart + consolation streak
  if (!units.some((u) => u.alive)) {
    st.streak = 0;
    st.lossStreak++;
    const cons = st.lossStreak >= 2 ? Math.min(2, st.lossStreak - 1) : 0;
    if (cons) st.gold += cons; // GDD common §4
    st.lastEcon = { wave: 0, interest: 0, streak: cons };
    st.base.hp = Math.max(0, st.base.hp - (LOSS_DMG + Math.floor(st.wave / 4)));
    if (st.base.hp <= 0) {
      st.phase = 'lost';
      return true;
    }
    st.roundResult = 'loss'; // AU-1: UI must not show the win banner on a wipe
    advanceWave(st);
    return true;
  }

  // all enemies spawned and cleared → economy + damage enemy heart + win at wave 10
  if (!st.spawnQ.length && !st.mobs.some((m) => m.alive)) {
    st.roundResult = 'win';
    st.streak++;
    st.lossStreak = 0;
    const ei = interest(st.gold, st.buffs.interestCap);
    const es = streakBonus(st.streak);
    const eb = waveBonus(st.wave);
    st.gold += ei + es + eb;
    st.lastEcon = { wave: eb, interest: ei, streak: es };
    const survivors = units.filter((u) => u.alive).length;
    st.foe.hp = Math.max(0, st.foe.hp - (1 + survivors));
    if (st.foe.hp <= 0 || (WaveDef.isFinal(st.wave) && !st.endless)) {
      st.phase = 'won';
      return true;
    }
    if (st.wave % BUFF_EVERY === 0) {
      st.phase = 'buff';
      return true;
    }
    advanceWave(st);
    return true;
  }
  return false;
}

/**
 * apply a picked buff, then advance to next wave. no-op outside buff phase.
 */
export function pickBuff(st: RunState, buff: BuffDef): boolean {
  if (st.phase !== 'buff') return false;
  buff.apply(st);
  advanceWave(st);
  return true;
}

/** skip remaining prep (manual Start button) */
export function forceStart(st: RunState): void {
  if (st.phase === 'prep') startCombat(st);
}

const WaveRunner = {
  createRun,
  getComp,
  startCombat,
  tick,
  pickBuff,
  forceStart,
  resumeEndless,
  FOE_SLOTS,
  MAX_FIELD,
  PLAYER_HP,
  FOE_HP,
  LOSS_DMG,
  PREP_SECONDS,
  SPAWN_GAP,
  START_GOLD,
  waveBonus,
  prepSeconds,
  BUFF_EVERY,
};
register('WaveRunner', WaveRunner);
export { WaveRunner };
export default WaveRunner;
