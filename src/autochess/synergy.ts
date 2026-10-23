/* ============ autochess/synergy.ts — type-count team buffs ============
 * Thresholds count UNIQUE dex (not copies). Cap 6 active synergies (top-6).
 * T2 / T4 tiers by total count of units whose types include the group.
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
}

export interface SynergyDef {
  id: string;
  name: string;
  types: string[];
  t2: Partial<SynergyMods>;
  t4: Partial<SynergyMods>;
}

const NONE: SynergyMods = {
  atkMul: 1, atkSpdMul: 1, baseHpMul: 1, dmgReduce: 0, bountyMul: 1,
  rangeAdd: 0, lifesteal: 0, thorns: 0, critAdd: 0, slowOnHit: 0, typeBoostMul: 1,
};

const DEFS: SynergyDef[] = [
  {
    id: 'elemental', name: 'Elemental', types: ['fire', 'water', 'grass'],
    t2: { atkMul: 1.1, typeBoostMul: 1.3 },
    t4: { atkMul: 1.25, typeBoostMul: 1.3 },
  },
  {
    id: 'charged', name: 'Charged', types: ['electric', 'ice', 'rock'],
    t2: { atkSpdMul: 1.08, critAdd: 0.1 },
    t4: { atkSpdMul: 1.2, critAdd: 0.1 },
  },
  {
    id: 'aegis', name: 'Aegis', types: ['normal', 'psychic', 'fairy'],
    t2: { baseHpMul: 1.15, lifesteal: 0.05 },
    t4: { baseHpMul: 1.35, lifesteal: 0.05 },
  },
  {
    id: 'bulwark', name: 'Bulwark', types: ['fighting', 'ground', 'steel'],
    t2: { dmgReduce: 0.1, thorns: 0.2 },
    t4: { dmgReduce: 0.25, thorns: 0.2 },
  },
  {
    id: 'shadow', name: 'Shadow', types: ['dark', 'ghost', 'dragon'],
    t2: { bountyMul: 1.2 },
    t4: { bountyMul: 1.5 },
  },
  {
    id: 'skirmisher', name: 'Skirmisher', types: ['flying', 'bug', 'poison'],
    t2: { rangeAdd: 1, slowOnHit: 0.2 },
    t4: { rangeAdd: 1, slowOnHit: 0.2 },
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
    const tier = n >= 4 ? d.t4 : d.t2;
    for (const [k, v] of Object.entries(tier)) {
      const key = k as keyof SynergyMods;
      if (key === 'dmgReduce' || key === 'lifesteal' || key === 'thorns' ||
          key === 'critAdd' || key === 'slowOnHit') {
        (out[key] as number) += v as number;
      } else if (key === 'rangeAdd') {
        out.rangeAdd += v as number;
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
    .map((d) => ({ def: d, count: c[d.id], tier: c[d.id] >= 4 ? 4 : c[d.id] >= 2 ? 2 : 0 }))
    .filter((x) => x.tier > 0)
    .sort((a, b) => b.count - a.count);
}

const Synergy = { DEFS, BY_ID, counts, mods, active };
register('Synergy', Synergy);
export { Synergy, NONE };
export default Synergy;
