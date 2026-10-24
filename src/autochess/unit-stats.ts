/* ============ autochess/unit-stats.ts — derive board stats from pokedex ============
 * Unit on board: hp/atk scale with star; spd = cell/s; range from phys vs spec;
 * atkCd from dex.spd; move = champion signature or best type-appropriate move.
 */
import { register } from '../core/registry';
import { moveOf } from './champions';

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
  /** 2 = melee (Chebyshev vs ring: center rock needs 2), 3 = ranged */
  range: number;
  /** seconds between attacks */
  atkCd: number;
  /** primary move id */
  move: string;
}

/** Star multiplier: 1★=1, 2★=1.8, 3★=3.5 (GDD Bagian 5). */
export function starMul(star: number): number {
  if (star >= 3) return 3.5;
  if (star >= 2) return 1.8;
  return 1;
}

/** Star attack-speed divisor: higher star attacks faster. 1 / 1.2 / 1.5. */
export function starAsMul(star: number): number {
  if (star >= 3) return 1.5;
  if (star >= 2) return 1.2;
  return 1;
}

/** Clamp helper (local — avoids importing util for one call). */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Pokedex atk is a ~1.0 relative stat (0.76–1.7); mobs are e.hp × waveMul
 * (70–185 × 1.25+). Board atk must be scaled to DPS that can clear waves.
 * 40 → solo ★1 ≈ 45 dps; 4-unit board clears wave-1 without leaks. */
const ATK_SCALE = 40;

/** Shot/beam/bounce families that read as a visible ranged move. */
const RANGED_KINDS = new Set(['projectile', 'boomerang', 'beam', 'chain', 'cone']);
/** Contact families for physical units. */
const MELEE_KINDS = new Set(['melee', 'dash']);

/** Pick champion signature first, then the strongest type-appropriate move.
 * The common `normal` pool is ignored so units keep their elemental identity. */
export function moveFor(e: any, range: number, Moves: any): string {
  const sig = moveOf(e.dex);
  if (sig && Moves?.BY_ID?.[sig]) return sig;
  if (!Moves?.poolFor) return '';
  const defs: any[] = (Moves.poolFor(e) as string[])
    .map((id) => Moves.BY_ID?.[id])
    .filter((d) => d && d.type !== 'normal' && d.kind !== 'buff');
  const pref = defs.filter((d) => (range === 3 ? RANGED_KINDS : MELEE_KINDS).has(d.kind));
  const list = pref.length ? pref : defs;
  let best: any = null;
  for (const d of list) {
    if (!best) { best = d; continue; }
    const dd = (d.dmg ?? 0) - (best.dmg ?? 0);
    if (dd > 0 || (dd === 0 && (d.cd ?? Infinity) < (best.cd ?? Infinity))) best = d;
  }
  if (best) return best.id;
  return Moves.startFor?.(e) || 'tackle';
}

/** Derive board stats. Dex entry shape matches PokedexEntry (src/types/data-globals.d.ts). */
export function boardStats(dex: number, star: number = 1): BoardStats | null {
  const DEX_BY: Record<string, any> = (G as any).DEX_BY;
  const Moves: any = (G as any).Moves;
  if (!DEX_BY) return null;
  const e = DEX_BY[String(dex)] || DEX_BY[dex];
  if (!e) return null;
  const m = starMul(star);
  // phys (pa>=sa) → melee range 2; spec → ranged 3.
  // Rock board = cells 0..2, ring = cells -1..3: center (1,1) is dist 2 from
  // every ring cell — melee range 1 made center units permanently idle.
  const range = (e.pa ?? 1) >= (e.sa ?? 1) ? 2 : 3;
  const atkCd = clamp(1.2 - (e.spd ?? 50) / 400, 0.4, 1.6) / starAsMul(star);
  const move = moveFor(e, range, Moves);
  return {
    dex,
    name: e.name,
    types: e.types || [],
    rarity: e.rarity || 1,
    gen: e.gen || 1,
    hp: Math.round(e.hp * m),
    atk: Math.round(e.atk * m * ATK_SCALE),
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

const UnitStats = { boardStats, moveFor, starMul, starAsMul, unitCost, sellPrice };
register('UnitStats', UnitStats);
export { UnitStats };
export default UnitStats;
