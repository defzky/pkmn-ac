/**
 * wave-runner.ts — autochess TD phase machine: prep → combat → (buff every 3) → … → won/lost.
 *
 * P14. Owns run state: wave number, spawn queue, mobs, gold, base, permanent buffs.
 * Combat math delegated to UnitAI.tick; composition to WaveDef.compose.
 * GDD Bagian 5: start 5g, +3 per wave clear, buff pick every 3rd wave.
 */
import { register } from '../core/registry';
import { WaveDef, type MobSpec } from './wave';
import { Path } from './path';
import { create as createBase, leak as baseLeak, type BaseState } from './base';
import { tick as aiTick } from './unitAI';
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
  base: BaseState;
  /** kills this run (for stats) */
  kills: number;
  /** permanent buffs picked at buff phases (merged into combat mods) */
  buffs: RunBuffs;
}

/** buy/placement window before wave auto-starts (Start button skips; user asked longer) */
export const PREP_SECONDS = 30;
export const SPAWN_GAP = 0.4;
export const START_GOLD = 5;
/** flat gold granted on every wave clear (GDD Bagian 5 — no interest) */
export const WAVE_BONUS = 3;
/** grant a buff pick every N waves */
export const BUFF_EVERY = 3;

function dexEntry(dex: number): any {
  return ((G as any).DEX_BY || {})[dex];
}

function toMob(s: MobSpec, branch: number): MobBattle {
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
    branch, // ring branch: alternate 0/1 so both sides get mobs
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
    buffs: initBuffs(),
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

function advanceWave(st: RunState): void {
  st.wave++;
  st.phase = 'prep';
  st.prepLeft = PREP_SECONDS;
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
      st.mobs.push(toMob(st.spawnQ.shift()!, st.mobs.length % 2));
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

  // all spawned and cleared → wave bonus, then buff pick (every 3rd) / advance
  if (!st.spawnQ.length && !st.mobs.some((m) => m.alive)) {
    st.gold += WAVE_BONUS;
    if (WaveDef.isFinal(st.wave)) {
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
  PREP_SECONDS,
  SPAWN_GAP,
  START_GOLD,
  WAVE_BONUS,
  BUFF_EVERY,
};
register('WaveRunner', WaveRunner);
export { WaveRunner };
export default WaveRunner;
