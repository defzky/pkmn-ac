/* ============ autochess/synergy.ts — 5 GDD type synergies ============
 * Fire / Water / Grass / Electric / Psychic (GDD Bagian 1 "Sinergi Tipe Dasar").
 * Thresholds count UNIQUE dex (not copies). T2 at 2, T4 at 4.
 * Old 6-group synergies removed 2026-10-24 (decision: hapus total).
 */
import { register } from '../core/registry';

export interface SynergyMods {
  atkMul: number;
  atkSpdMul: number;   // scales atkCd inversely: cd / atkSpdMul
  baseHpMul: number;
  dmgReduce: number;   // 0..1 additive cap later by unit reduction
  bountyMul: number;
  rangeAdd: number;    // extra cells
  lifesteal: number;   // 0..1
  thorns: number;      // fraction of dmg reflected
  critAdd: number;     // 0..1
  slowOnHit: number;   // 0..1 chance × slow amount
  typeBoostMul: number; // damage of matching-type moves
  // ---- GDD type-synergy additions ----
  manaRegenMul: number;  // water: mana gain multiplier
  burnOnHit: number;     // fire: chance to apply burn
  poisonOnHit: number;   // grass T4: chance to apply poison
  chainChance: number;   // electric: chance to bounce attack
  skillDmgMul: number;   // psychic: skill damage multiplier
  regen: number;         // grass: hp regen fraction per second
}

export interface SynergyDef {
  id: string;
  name: string;
  types: string[];
  t2: Partial<SynergyMods>;
  t3: Partial<SynergyMods>;
}

const NONE: SynergyMods = {
  atkMul: 1, atkSpdMul: 1, baseHpMul: 1, dmgReduce: 0, bountyMul: 1,
  rangeAdd: 0, lifesteal: 0, thorns: 0, critAdd: 0, slowOnHit: 0, typeBoostMul: 1,
  manaRegenMul: 1, burnOnHit: 0, poisonOnHit: 0, chainChance: 0, skillDmgMul: 1, regen: 0,
};

/** additive-vs-multiplicative key sets */
const ADDITIVE = new Set(['dmgReduce', 'lifesteal', 'thorns', 'critAdd', 'slowOnHit',
  'rangeAdd', 'burnOnHit', 'poisonOnHit', 'chainChance', 'regen']);

const DEFS: SynergyDef[] = [
  {
    id: 'fire', name: 'Fire', types: ['fire'],
    t2: { atkMul: 1.1, burnOnHit: 0.2 },
    t3: { atkMul: 1.25, burnOnHit: 0.4 },
  },
  {
    id: 'water', name: 'Water', types: ['water'],
    t2: { manaRegenMul: 1.2 },
    t3: { manaRegenMul: 1.5 },
  },
  {
    id: 'grass', name: 'Grass', types: ['grass'],
    t2: { regen: 0.01 },
    t3: { regen: 0.02, poisonOnHit: 0.3 },
  },
  {
    id: 'electric', name: 'Electric', types: ['electric'],
    t2: { chainChance: 0.15 },
    t3: { chainChance: 0.3 },
  },
  {
    id: 'psychic', name: 'Psychic', types: ['psychic'],
    t2: { skillDmgMul: 1.15 },
    t3: { skillDmgMul: 1.35 },
  },
];

const BY_ID: Record<string, SynergyDef> = {};
for (const d of DEFS) BY_ID[d.id] = d;

/**
 * Count unique dex per synergy from placed units.
 * units: array of { dex, types } (types from pokedex).
 */
export function counts(units: Array<{ dex: number; types: string[] }>): Record<string, number> {
  const seen: Record<string, Set<number>> = {};
  for (const d of DEFS) seen[d.id] = new Set();
  for (const u of units) {
    for (const d of DEFS) {
      if (u.types.some((t) => d.types.includes(t))) seen[d.id].add(u.dex);
    }
  }
  const out: Record<string, number> = {};
  for (const d of DEFS) out[d.id] = seen[d.id].size;
  return out;
}

/** Merge mods for active tiers (top-6 active by count desc, ties by DEFS order). */
export function mods(units: Array<{ dex: number; types: string[] }>): SynergyMods {
  const c = counts(units);
  const active = DEFS
    .map((d, i) => ({ d, n: c[d.id], i }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, 6);
  const out: SynergyMods = { ...NONE };
  for (const { d, n } of active) {
    const tier = n >= 3 ? d.t3 : d.t2;
    for (const [k, v] of Object.entries(tier)) {
      const key = k as keyof SynergyMods;
      if (ADDITIVE.has(key)) {
        (out[key] as number) += v as number;
      } else {
        (out[key] as number) *= v as number;
      }
    }
  }
  return out;
}

/** Active synergy list for UI: [{def, count, tier}] */
export function active(units: Array<{ dex: number; types: string[] }>) {
  const c = counts(units);
  return DEFS
    .map((d) => ({ def: d, count: c[d.id], tier: c[d.id] >= 3 ? 3 : c[d.id] >= 2 ? 2 : 0 }))
    .filter((x) => x.tier > 0)
    .sort((a, b) => b.count - a.count);
}

const Synergy = { DEFS, BY_ID, counts, mods, active };
register('Synergy', Synergy);
export { Synergy, NONE };
export default Synergy;
