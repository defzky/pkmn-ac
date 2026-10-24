/* ============ autochess/evo.ts — star → evolution form resolver ============
 * ★1 = base form, ★2 = stage 2, ★3 = stage 3 (EVO map, PokeAPI-generated).
 * Resolve at stat/render time only — BoardUnit.dex stays base (merge key,
 * sell price, champion skill/move all keyed on base dex).
 */
import { register } from '../core/registry';
import { EVO } from '../data/evo-map';

/** Base dex → evolved dex at this star (0 = no evolution / missing → base). */
export function evoDex(base: number, star: number): number {
  if (star < 2) return base;
  const e = EVO[base];
  if (!e) return base;
  const target = star >= 3 ? e[1] : e[0];
  return target || base;
}

/** Pokedex entry at this star (falls back to base entry). */
export function evoEntry(base: number, star: number): any {
  const DEX_BY: Record<string, any> = (G as any).DEX_BY || {};
  const d = evoDex(base, star);
  return DEX_BY[String(d)] || DEX_BY[d] || DEX_BY[String(base)] || DEX_BY[base] || null;
}

const Evo = { evoDex, evoEntry, EVO };
register('EvoAC', Evo);
export { Evo };
export default Evo;
