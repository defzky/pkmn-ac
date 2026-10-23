/* ============ autochess/unitAI.ts — auto-battle tick ============
 * Units stand on cells; acquire nearest alive mob in range; attack on cooldown.
 * Mobs advance along lane cells (progress in cell units); leak handled by caller.
 * Damage = totalAtk × typeMult(move type vs mob types) via Types chart (soft).
 * Units do NOT take damage from mobs in v1 (pure TD); boss flag only affects leak.
 */
import { register } from '../core/registry';
import Types from '../data/types';
import { Path } from './path';
import { UnitBattle, totalAtk, effCd } from './unit';
import { SynergyMods, NONE } from './synergy';

export interface MobBattle {
  dex: number;
  hp: number;
  atk: number;
  spd: number;      // cells/s
  types: string[];
  star: number;
  boss: boolean;
  /** distance travelled along lane in cells */
  progress: number;
  alive: boolean;
  /** bounty in gold */
  bounty: number;
}

export interface TickResult {
  kills: number;
  gold: number;
  /** mobs that reached path end this tick (leaks) */
  leaks: MobBattle[];
}

/** Cell position of a mob given progress along laneCells. */
export function mobCell(m: MobBattle, cells: Array<{ x: number; y: number }>): { x: number; y: number } {
  const i = Math.min(cells.length - 1, Math.max(0, Math.floor(m.progress)));
  return cells[i];
}

/** Chebyshev-ish cell distance (max of dx,dy — grid-friendly). */
export function cellDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Damage multiplier: move type vs mob types, softened. Returns 1 if no move type. */
export function typeMult(moveType: string, mobTypes: string[]): number {
  if (!moveType || !mobTypes?.length) return 1;
  return Types.mult(moveType, mobTypes);
}

/**
 * Advance battle by dt seconds.
 * mods: team synergy (atkSpd, rangeAdd, bountyMul, typeBoostMul).
 */
export function tick(
  units: UnitBattle[],
  mobs: MobBattle[],
  dt: number,
  mods: SynergyMods = NONE,
  cells: Array<{ x: number; y: number }> = Path.laneCells(),
): TickResult {
  let kills = 0, gold = 0;
  const leaks: MobBattle[] = [];

  // mobs advance
  for (const m of mobs) {
    if (!m.alive) continue;
    m.progress += m.spd * dt;
    if (m.progress >= cells.length - 1) {
      m.alive = false;
      leaks.push(m);
    }
  }

  // units attack
  for (const u of units) {
    if (!u.alive) continue;
    u.cd -= dt;
    if (u.cd > 0) continue;
    // nearest alive mob within range (+ synergy rangeAdd)
    const range = u.range + mods.rangeAdd;
    let best: MobBattle | null = null, bestD = Infinity;
    for (const m of mobs) {
      if (!m.alive) continue;
      const c = mobCell(m, cells);
      const d = cellDist(u.x, u.y, c.x, c.y);
      if (d <= range && d < bestD) { bestD = d; best = m; }
    }
    if (!best) { /* idle: keep cd at 0 so first in-range shot is instant */ u.cd = 0; continue; }
    // fire
    const move = (u as any).move || '';
    const moveType = move ? ((globalThis as any).G?.Moves?.BY_ID?.[move]?.type ?? '') : '';
    let dmg = totalAtk(u) * typeMult(moveType, best.types);
    dmg *= mods.typeBoostMul;
    best.hp -= dmg;
    u.cd = effCd(u, mods);
    if (best.hp <= 0) {
      best.alive = false;
      kills++;
      gold += Math.round(best.bounty * mods.bountyMul);
    }
  }

  return { kills, gold, leaks };
}

/** True when all mobs dead or leaked. */
export function over(mobs: MobBattle[]): boolean {
  return mobs.every((m) => !m.alive);
}

const UnitAI = { tick, over, mobCell, cellDist, typeMult };
register('UnitAI', UnitAI);
export { UnitAI };
export default UnitAI;
