/* ============ autochess/champions.ts — fixed 12-champion pool (GDD Bagian 1) ============
 * Shop only sells these 12 lines. Cost 1–4 gold (not rarity×2).
 * Skill id dispatched by skills.ts during battle.
 */
import { register } from '../core/registry';

export interface ChampionDef {
  dex: number;
  name: string;
  cost: number;
  skill: string;
  /** signature move id (visual identity + type matchup) */
  move?: string;
}

export const DEFS: ChampionDef[] = [
  { dex: 1, name: 'Bulbasaur', cost: 1, skill: 'poisonDoT', move: 'razor-leaf' },
  { dex: 4, name: 'Charmander', cost: 1, skill: 'burnAoE', move: 'ember' },
  { dex: 7, name: 'Squirtle', cost: 1, skill: 'knockback', move: 'water-gun' },
  { dex: 16, name: 'Pidgey', cost: 1, skill: 'none', move: 'wing-attack' }, // passive: fast AS via stats
  { dex: 179, name: 'Mareep', cost: 2, skill: 'chainStun', move: 'thunder-shock' },
  { dex: 66, name: 'Machop', cost: 2, skill: 'armorShred', move: 'karate-chop' },
  { dex: 92, name: 'Gastly', cost: 2, skill: 'burstLowest', move: 'shadow-ball' },
  { dex: 63, name: 'Abra', cost: 3, skill: 'bossBurst', move: 'confusion' },
  { dex: 304, name: 'Aron', cost: 3, skill: 'tank', move: 'metal-claw' }, // passive: HP×1.3
  { dex: 220, name: 'Swinub', cost: 3, skill: 'slowArea', move: 'ice-beam' },
  { dex: 280, name: 'Ralts', cost: 4, skill: 'asAura', move: 'psybeam' },
  { dex: 147, name: 'Dratini', cost: 4, skill: 'meteorAoE', move: 'dragon-rage' },
];

/** Wave-banded shop odds (GDD Bagian 5). Returns [[cost, weight]…] summing 100. */
export function costWeights(wave: number): Array<[number, number]> {
  if (wave <= 4) return [[1, 80], [2, 20], [3, 0], [4, 0]];
  if (wave <= 9) return [[1, 55], [2, 30], [3, 15], [4, 0]];
  if (wave <= 14) return [[1, 35], [2, 35], [3, 25], [4, 5]];
  return [[1, 20], [2, 30], [3, 35], [4, 15]];
}

const BY_DEX: Record<number, ChampionDef> = {};
for (const d of DEFS) BY_DEX[d.dex] = d;

const BY_COST: Record<number, ChampionDef[]> = { 1: [], 2: [], 3: [], 4: [] };
for (const d of DEFS) BY_COST[d.cost].push(d);

/** Champion cost for dex, or 0 if not in pool. */
export function costOf(dex: number): number {
  return BY_DEX[dex]?.cost ?? 0;
}

/** Skill id for dex ('none' if not a champion). */
export function skillOf(dex: number): string {
  return BY_DEX[dex]?.skill ?? 'none';
}

/** Signature move id for a champion, or null when dex is not in the pool. */
export function moveOf(dex: number): string | null {
  return BY_DEX[dex]?.move ?? null;
}

/** Champions of given cost. */
export function poolByCost(cost: number): ChampionDef[] {
  return BY_COST[cost] || [];
}

/** True when dex is one of the 12 champions. */
export function isChampion(dex: number): boolean {
  return !!BY_DEX[dex];
}

const Champions = { DEFS, costWeights, costOf, skillOf, moveOf, poolByCost, isChampion };
register('ChampionsAC', Champions);
export { Champions };
export default Champions;
