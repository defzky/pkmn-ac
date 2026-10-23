/* ============ autochess/unit-stats.ts — derive board stats from pokedex ============
 * Unit on board: hp/atk scale with star; spd = cell/s; range from phys vs spec;
 * atkCd from dex.spd; move = strongest of first 2 dex moves.
 */
import { register } from '../core/registry';

export interface BoardStats {
  dex: number;
  name: string;
  types: string[];
  rarity: number;
  gen: number;
  hp: number;
  atk: number;
  /** cells per second (chase) */
  spd: number;
  /** 1 = melee, 2 = ranged */
  range: number;
  /** seconds between attacks */
  atkCd: number;
  /** primary move id */
  move: string;
}

/** Star multiplier: 1★=1, 2★=1.8, 3★=3.2 */
export function starMul(star: number): number {
  if (star >= 3) return 3.2;
  if (star >= 2) return 1.8;
  return 1;
}

/** Clamp helper (local — avoids importing util for one call). */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Derive board stats. Dex entry shape matches PokedexEntry (src/types/data-globals.d.ts). */
export function boardStats(dex: number, star: number = 1): BoardStats | null {
  const DEX_BY: Record<string, any> = (G as any).DEX_BY;
  const Moves: any = (G as any).Moves;
  if (!DEX_BY) return null;
  const e = DEX_BY[String(dex)] || DEX_BY[dex];
  if (!e) return null;
  const m = starMul(star);
  // phys (pa>=sa) → melee range 1; spec → ranged 2
  const range = (e.pa ?? 1) >= (e.sa ?? 1) ? 1 : 2;
  const atkCd = clamp(1.2 - (e.spd ?? 50) / 400, 0.4, 1.6);
  // strongest of first 2 pool moves (power field p or base)
  let move = '';
  if (Moves?.poolFor) {
    const pool: string[] = Moves.poolFor(e).slice(0, 2);
    let best = -1;
    for (const id of pool) {
      const def = Moves.BY_ID?.[id];
      const p = (def?.dmg ?? 0) as number;
      if (p > best) { best = p; move = id; }
    }
  }
  return {
    dex,
    name: e.name,
    types: e.types || [],
    rarity: e.rarity || 1,
    gen: e.gen || 1,
    hp: Math.round(e.hp * m),
    atk: Math.round(e.atk * m),
    spd: clamp((e.spd ?? 50) / 50, 0.5, 3),
    range,
    atkCd,
    move,
  };
}

/** Unit cost from rarity: ★1=2 … ★5=10 */
export function unitCost(rarity: number): number {
  return clamp(rarity, 1, 5) * 2;
}

/** Sell price = ceil(cost/2) */
export function sellPrice(rarity: number): number {
  return Math.ceil(unitCost(rarity) / 2);
}

const UnitStats = { boardStats, starMul, unitCost, sellPrice };
register('UnitStats', UnitStats);
export { UnitStats };
export default UnitStats;
