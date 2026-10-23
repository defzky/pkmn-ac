/**
 * wave-runner.ts — autochess TD phase machine: prep → combat → reward → … → won/lost.
 *
 * P14. Owns run state: wave number, spawn queue, mobs, gold, base.
 * Combat math delegated to UnitAI.tick; composition to WaveDef.compose.
 */
import { register } from '../core/registry';
import { WaveDef, type MobSpec } from './wave';
import { Path } from './path';
import { create as createBase, leak as baseLeak, type BaseState } from './base';
import { tick as aiTick } from './unitAI';
import type { MobBattle } from './unitAI';
import type { UnitBattle } from './unit';
import { NONE, type SynergyMods } from './synergy';

export type Phase = 'prep' | 'combat' | 'reward' | 'won' | 'lost';

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
  base: BaseState;
  /** kills this run (for stats) */
  kills: number;
}

export const PREP_SECONDS = 20;
export const SPAWN_GAP = 0.4;
export const START_GOLD = 20;

/** income = 5 + floor(w/3) + interest min(5, floor(g/10)) */
export function income(wave: number, gold: number): number {
  const base = 5 + Math.floor(wave / 3);
  const interest = Math.min(5, Math.floor(Math.max(0, gold) / 10));
  return base + interest;
}

function dexEntry(dex: number): any {
  return ((G as any).DEX_BY || {})[dex];
}

function toMob(s: MobSpec): MobBattle {
  const e = dexEntry(s.dex);
  const rarity = e && typeof e.rarity === 'number' ? e.rarity : 1;
  return {
    dex: s.dex,
    hp: s.hp,
    atk: s.atk,
    spd: s.spd,
    types: Array.isArray(e?.types) ? e.types : [],
    star: s.star,
    boss: s.boss,
    progress: 0,
    alive: true,
    bounty: (1 + rarity) * (s.boss ? 10 : 1),
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
    base: createBase(),
    kills: 0,
  };
}

/** roll composition for current wave, enter combat */
export function startCombat(st: RunState): void {
  if (st.phase !== 'prep') return;
  const comp = WaveDef.compose(st.wave);
  st.spawnQ = comp.mobs.map((m) => ({ ...m }));
  st.spawnT = 0;
  st.mobs = [];
  st.phase = 'combat';
}

/**
 * advance one dt. units = player board battle units (alive flags respected).
 * returns true when phase changed (combat→reward | →lost) for UI hook.
 */
export function tick(
  st: RunState,
  units: UnitBattle[],
  dt: number,
  mods: SynergyMods = NONE
): boolean {
  if (st.phase === 'prep') {
    st.prepLeft -= dt;
    if (st.prepLeft <= 0) {
      startCombat(st);
      return true;
    }
    return false;
  }
  if (st.phase !== 'combat') return false;

  // spawn queue
  if (st.spawnQ.length) {
    st.spawnT -= dt;
    while (st.spawnQ.length && st.spawnT <= 0) {
      st.mobs.push(toMob(st.spawnQ.shift()!));
      st.spawnT += st.spawnGap;
    }
  }

  const r = aiTick(units, st.mobs, dt, mods, Path.laneCells());
  st.kills += r.kills;
  if (r.gold) st.gold += r.gold;
  for (const l of r.leaks) {
    if (baseLeak(st.base, l.boss)) {
      st.phase = 'lost';
      return true;
    }
  }

  // all spawned and cleared → reward
  if (!st.spawnQ.length && !st.mobs.some((m) => m.alive)) {
    st.phase = 'reward';
    return true;
  }
  return false;
}

/**
 * collect reward, advance wave. returns income granted (0 if not in reward phase).
 */
export function claimReward(st: RunState): number {
  if (st.phase !== 'reward') return 0;
  const gain = income(st.wave, st.gold);
  st.gold += gain;
  if (WaveDef.isFinal(st.wave)) {
    st.phase = 'won';
    return gain;
  }
  st.wave++;
  st.phase = 'prep';
  st.prepLeft = PREP_SECONDS;
  return gain;
}

/** skip remaining prep (manual Start button) */
export function forceStart(st: RunState): void {
  if (st.phase === 'prep') startCombat(st);
}

const WaveRunner = {
  createRun,
  startCombat,
  tick,
  claimReward,
  forceStart,
  income,
  PREP_SECONDS,
  SPAWN_GAP,
  START_GOLD,
};
register('WaveRunner', WaveRunner);
export { WaveRunner };
export default WaveRunner;
