/**
 * wave-runner.ts — dual-board auto-battler phase machine: prep → combat → (buff every 3) → …
 *
 * P18: NO path. Enemies stand on the top 3×3 arena (cells y −1..−3, front row y −1);
 * player units stand on the bottom 3×3 (y 0..2). Round won = all enemies dead →
 * damage the enemy heart; round lost = player team wiped → damage the player heart.
 */
import { register } from '../core/registry';
import { WaveDef, prepSeconds, interest, streakBonus, type MobSpec } from './wave';
import { create as createBase, type BaseState } from './base';
import { tick as aiTick, respawnUnits } from './unitAI';
import type { MobBattle } from './unitAI';
import type { UnitBattle } from './unit';
import { NONE, type SynergyMods } from './synergy';
import { initBuffs, type RunBuffs, type BuffDef } from './buffs';

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
  // GDD bounty: boss 10, elite 2, normal ~1 per 3–5 kills (direct coin drop 28% ≈ 1/3.6)
  const bounty = s.boss ? 10 : s.elite ? 2 : Math.random() < 0.28 ? 1 : 0;
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
export function createRun(gold = START_GOLD, prep = PREP_SECONDS): RunState {
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
  };
}

/** roll composition for current wave (capped to the 3×3 grid), enter combat */
export function startCombat(st: RunState): void {
  if (st.phase !== 'prep') return;
  const comp = WaveDef.compose(st.wave);
  st.spawnQ = comp.mobs.slice(0, MAX_FIELD).map((m) => ({ ...m }));
  st.spawnT = 0;
  st.mobs = [];
  st.phase = 'combat';
}

function advanceWave(st: RunState): void {
  st.wave++;
  st.phase = 'prep';
  st.prepLeft = prepSeconds(st.wave); // D2c: 25 / 15 / 12s curve
}

/** RUN COMPLETE → Endless: keep going past MAX_WAVE (score keeps accumulating). */
export function resumeEndless(st: RunState): void {
  st.endless = true;
  st.wave += 1;
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

  // spawn queue → fixed enemy-arena slots (front row first)
  if (st.spawnQ.length) {
    st.spawnT -= dt;
    while (st.spawnQ.length && st.spawnT <= 0) {
      const slot = FOE_SLOTS[st.mobs.length % MAX_FIELD];
      st.mobs.push(toMob(st.spawnQ.shift()!, slot));
      st.spawnT += st.spawnGap;
    }
  }

  const r = aiTick(units, st.mobs, dt, mods, []);
  st.kills += r.kills;
  if (r.gold) st.gold += r.gold;

  // player team wiped (or never fielded) → damage player heart + consolation streak
  if (!units.some((u) => u.alive)) {
    st.streak = 0;
    st.lossStreak++;
    if (st.lossStreak >= 2) st.gold += Math.min(2, st.lossStreak - 1); // GDD common §4
    st.base.hp = Math.max(0, st.base.hp - (LOSS_DMG + Math.floor(st.wave / 4)));
    if (st.base.hp <= 0) {
      st.phase = 'lost';
      return true;
    }
    advanceWave(st);
    return true;
  }

  // all enemies spawned and cleared → economy + damage enemy heart + win at wave 10
  if (!st.spawnQ.length && !st.mobs.some((m) => m.alive)) {
    st.streak++;
    st.lossStreak = 0;
    st.gold += interest(st.gold, st.buffs.interestCap) + streakBonus(st.streak) + waveBonus(st.wave);
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
