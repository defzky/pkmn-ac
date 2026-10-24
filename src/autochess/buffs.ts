/* ============ autochess/buffs.ts — permanent run buffs picked between waves (GDD Bagian 5) ============
 * Every 3rd wave cleared → phase 'buff': player picks 1 of 3 cards.
 * Buffs multiply team stats (merged into SynergyMods at combat start) or heal base.
 */
import { register } from '../core/registry';

/** Per-run accumulated buffs (multipliers start at 1). */
export interface RunBuffs {
  atkMul: number;
  hpMul: number;
  asMul: number;
}

export function initBuffs(): RunBuffs {
  return { atkMul: 1, hpMul: 1, asMul: 1 };
}

export interface BuffDef {
  id: string;
  name: string;
  desc: string;
  apply(st: { buffs: RunBuffs; gold: number; base: { hp: number; maxHp: number } }): void;
}

const clampHp = (hp: number, max: number): number => Math.max(0, Math.min(hp, max));

export const POOL: BuffDef[] = [
  { id: 'atk', name: 'Power Up', desc: '+10% team attack', apply: (st) => { st.buffs.atkMul *= 1.1; } },
  { id: 'hp', name: 'Tough Skin', desc: '+10% team max HP', apply: (st) => { st.buffs.hpMul *= 1.1; } },
  { id: 'as', name: 'Quick Feet', desc: '+10% team attack speed', apply: (st) => { st.buffs.asMul *= 1.1; } },
  { id: 'gold', name: 'Windfall', desc: '+5 gold', apply: (st) => { st.gold += 5; } },
  { id: 'heal', name: 'Repair', desc: 'Base heals 15 HP', apply: (st) => { st.base.hp = clampHp(st.base.hp + 15, st.base.maxHp); } },
];

/** 3 distinct random buffs for the overlay. */
export function rollBuffs(rnd: () => number = Math.random): BuffDef[] {
  const pool = POOL.slice();
  const out: BuffDef[] = [];
  while (out.length < 3 && pool.length) {
    out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  }
  return out;
}

const Buffs = { POOL, rollBuffs, initBuffs };
register('BuffsAC', Buffs);
export { Buffs };
export default Buffs;
