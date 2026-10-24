/**
 * wave-runner-td.ts — Tower Defence phase machine: prep → combat → (buff every 3) → …
 *
 * TD mode: single 3×3 player board. Mobs spawn at ring start (top-center) and WALK
 * the ring lane AROUND the board (branch 0 left / 1 right, alternating — set at
 * spawn) toward base; leak when reaching lane end. Board cells stay pokemon-only.
 * No foe heart. Round won = all mobs dead; round lost = team wipe
 * (same as autochess). Game lost = base HP 0 (leaks). Game won = wave 20 cleared.
 * Leak penalty via base.ts (normal 5, boss 20).
 */
import { register } from '../core/registry';
import { WaveDef, type MobSpec } from './wave';
import { create as createBase, leak as baseLeak, type BaseState } from './base';
import { tick as aiTick, respawnUnits } from './unitAI';
import type { MobBattle } from './unitAI';
import type { UnitBattle } from './unit';
import { NONE, type SynergyMods } from './synergy';
import { initBuffs, type RunBuffs, type BuffDef } from './buffs';
import { Path } from './path';

export type Phase = 'prep' | 'combat' | 'buff' | 'won' | 'lost';

export interface TdRunState {
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
  /** player base (TD: leak target, no foe heart) */
  base: BaseState;
  /** kills this run (for stats) */
  kills: number;
  /** permanent buffs picked at buff phases (merged into combat mods) */
  buffs: RunBuffs;
}

/** base HP for TD run (base.ts START_HP) */
export const TD_BASE_HP = 100;
/** buy/placement window before wave auto-starts */
export const PREP_SECONDS = 30;
export const SPAWN_GAP = 0.4;
export const START_GOLD = 5;
/** gold granted on every wave clear — scales with wave: 3 + floor(w/2) */
export function waveBonus(wave: number): number {
  return 3 + Math.floor(wave / 2);
}
/** grant a buff pick every N waves */
export const BUFF_EVERY = 3;
/** cap concurrent walking mobs (path length); spawnQ drains at SPAWN_GAP */
export const MAX_MOBS = 12;

function dexEntry(dex: number): any {
  return ((G as any).DEX_BY || {})[dex];
}

/** Walking mob — NO cx/cy (progress-based); spawner sets branch (ring lane 0/1). */
function toMob(s: MobSpec): MobBattle {
  const e = dexEntry(s.dex);
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
    // no cx/cy → walks; no branch → uses fallback cells (TD path)
    progress: 0,
    alive: true,
    bounty,
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
    atkT: 0,
    stopT: 0,
  };
}

/** fresh TD run at wave 1 */
export function createRun(gold = START_GOLD, prep = PREP_SECONDS): TdRunState {
  return {
    wave: 1,
    phase: 'prep',
    prepLeft: prep,
    spawnQ: [],
    spawnT: 0,
    spawnGap: SPAWN_GAP,
    mobs: [],
    gold,
    base: createBase(TD_BASE_HP),
    kills: 0,
    buffs: initBuffs(),
  };
}

/** roll composition for current wave, enter combat */
export function startCombat(st: TdRunState): void {
  if (st.phase !== 'prep') return;
  const comp = WaveDef.compose(st.wave);
  st.spawnQ = comp.mobs.slice(0, MAX_MOBS).map((m) => ({ ...m }));
  st.spawnT = 0;
  st.mobs = [];
  st.phase = 'combat';
}

function advanceWave(st: TdRunState): void {
  st.wave++;
  st.phase = 'prep';
  st.prepLeft = PREP_SECONDS;
}

/**
 * advance one dt. units = player board battle units (alive flags respected).
 * returns true when phase changed (combat→buff/prep/won/lost) for UI hook.
 */
export function tick(
  st: TdRunState,
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

  // spawn queue → walking mobs at path[0]
  if (st.spawnQ.length) {
    st.spawnT -= dt;
    while (st.spawnQ.length && st.spawnT <= 0) {
      const m = toMob(st.spawnQ.shift()!);
      m.branch = st.mobs.length % 2; // alternate left/right ring lane (mob never steps on board cells)
      st.mobs.push(m);
      st.spawnT += st.spawnGap;
    }
  }

  const lane = Path.branchCells(0);
  const r = aiTick(units, st.mobs, dt, mods, lane);
  st.kills += r.kills;
  if (r.gold) st.gold += r.gold;

  // leaks → base damage (normal 5, boss 20); base dead → lost
  for (const m of r.leaks) {
    const destroyed = baseLeak(st.base, m.boss);
    if (destroyed) {
      st.phase = 'lost';
      return true;
    }
  }

  // player team wiped (or never fielded) → also lose (no mobs to kill them, but empty board = loss)
  if (!units.some((u) => u.alive)) {
    // treat as round loss: advance without base damage (leaks already handled) — actually
    // classic TD: empty board just means no defense; round continues until all mobs
    // dead/leaked. Only lose if base hits 0. So do nothing here for TD.
  }

  // all enemies spawned and cleared → round won: wave bonus; win game at wave 20
  if (!st.spawnQ.length && !st.mobs.some((m) => m.alive)) {
    st.gold += waveBonus(st.wave);
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
export function pickBuff(st: TdRunState, buff: BuffDef): boolean {
  if (st.phase !== 'buff') return false;
  buff.apply(st);
  advanceWave(st);
  return true;
}

/** skip remaining prep (manual Start button) */
export function forceStart(st: TdRunState): void {
  if (st.phase === 'prep') startCombat(st);
}

const WaveRunnerTd = {
  createRun,
  startCombat,
  tick,
  pickBuff,
  forceStart,
  TD_BASE_HP,
  PREP_SECONDS,
  SPAWN_GAP,
  START_GOLD,
  waveBonus,
  BUFF_EVERY,
  MAX_MOBS,
};
register('WaveRunnerTd', WaveRunnerTd);
export { WaveRunnerTd };
export default WaveRunnerTd;
