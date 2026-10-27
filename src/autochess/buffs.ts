/* ============ autochess/buffs.ts — permanent run buffs picked between waves (GDD Bagian 5) ============
 * Every 3rd wave cleared → phase 'buff': player picks 1 of 3 cards.
 * D2e: pool = rule-changer augments (GDD common §5) + 2 stat-stick basics.
 * Rule effects ride on RunBuffs (merged into battleMods / runners), not raw stats.
 */
import { register } from '../core/registry';

/** Per-run accumulated buffs (multipliers start at 1). */
export interface RunBuffs {
  atkMul: number;
  hpMul: number;
  asMul: number;
  // ---- D2e rule-changers ----
  /** Flank Master: flank ATK bonus × (default FLANK_ATK_MUL stays base) */
  flankAtkMul: number;
  /** Compound: interest cap (default 5, +8) */
  interestCap: number;
  /** Fortified: leak damage multipliers (normal/boss) */
  leakNormalMul: number;
  leakBossMul: number;
  /** Blood Money: kill bounty multiplier */
  bountyMul: number;
  /** Second Wind: seconds until first death/wave auto-respawns (0 = off) */
  secondWindT: number;
  /** Frontline Bond: adjacent units take 8% less damage */
  frontlineBond: boolean;
  /** Elementalist: typeBoost applies stronger (skill cast gets it too) */
  elementalistMul: number;
  /** Slipstream: first unit +30% atk speed for 5s at combat start */
  slipstream: boolean;
  /** P25 Eagle Eye: flat +range (additive with synergy rangeAdd) */
  rangeAdd: number;
}

export function initBuffs(): RunBuffs {
  return {
    atkMul: 1, hpMul: 1, asMul: 1,
    flankAtkMul: 1, interestCap: 5,
    leakNormalMul: 1, leakBossMul: 1,
    bountyMul: 1, secondWindT: 0,
    frontlineBond: false, elementalistMul: 1, slipstream: false,
    rangeAdd: 0,
  };
}

export interface BuffDef {
  id: string;
  name: string;
  desc: string;
  /** TD-only effect — never offered in auto mode (AU-3: no leaks / no flank there) */
  tdOnly?: boolean;
  apply(st: { buffs: RunBuffs; gold: number; base: { hp: number; maxHp: number } }): void;
}

const clampHp = (hp: number, maxHp: number): number => Math.max(0, Math.min(hp, maxHp));

export const POOL: BuffDef[] = [
  // ---- rule-changers (GDD common §5) ----
  { id: 'flank-master', name: 'Maestro de flanco', desc: 'Bonus de flanco +25% ATQ (antes +10%)', tdOnly: true,
    apply: (st) => { st.buffs.flankAtkMul = 1.25 / 1.1; } },
  { id: 'fortified', name: 'Fortificado', desc: 'Las fugas hacen la mitad de daño (las de jefe no cambian)', tdOnly: true,
    apply: (st) => { st.buffs.leakNormalMul = 0.5; st.buffs.leakBossMul = 1; } },
  { id: 'second-wind', name: 'Segundo aire', desc: 'La primera muerte de unidad por ola revive a los 4 s',
    apply: (st) => { st.buffs.secondWindT = 4; } },
  { id: 'compound', name: 'Interés compuesto', desc: 'Tope de interés +5 → +8 de oro',
    apply: (st) => { st.buffs.interestCap = 8; } },
  { id: 'frontline-bond', name: 'Vínculo de primera línea', desc: 'Las unidades adyacentes reciben un 8% menos de daño',
    apply: (st) => { st.buffs.frontlineBond = true; } },
  { id: 'elementalist', name: 'Elementalista', desc: '+15% de daño con bonificación de tipo al lanzar',
    apply: (st) => { st.buffs.elementalistMul *= 1.15; } },
  { id: 'slipstream', name: 'Estela', desc: 'Primera unidad: +30% de velocidad de ataque durante 5 s al empezar',
    apply: (st) => { st.buffs.slipstream = true; } },
  { id: 'blood-money', name: 'Dinero de sangre', desc: 'Recompensas por baja ×1.5',
    apply: (st) => { st.buffs.bountyMul *= 1.5; } },
  // ---- P25 pool 13 → 16 (trade-off rule-changers) ----
  { id: 'overclock', name: 'Sobreimpulso', desc: '+20% ATQ, +15% velocidad, −15% PS',
    apply: (st) => { st.buffs.atkMul *= 1.2; st.buffs.asMul *= 1.15; st.buffs.hpMul *= 0.85; } },
  { id: 'bulwark', name: 'Baluarte', desc: '+35% de PS del equipo pero −10% de velocidad de ataque',
    apply: (st) => { st.buffs.hpMul *= 1.35; st.buffs.asMul *= 0.9; } },
  { id: 'eagle-eye', name: 'Ojo de águila', desc: 'Todas las unidades +1 de alcance',
    apply: (st) => { st.buffs.rangeAdd += 1; } },
  // ---- basics (kept) ----
  { id: 'atk', name: 'Potenciación', desc: '+10% de ataque del equipo', apply: (st) => { st.buffs.atkMul *= 1.1; } },
  { id: 'hp', name: 'Piel dura', desc: '+10% de PS máximos del equipo', apply: (st) => { st.buffs.hpMul *= 1.1; } },
  { id: 'as', name: 'Pies ligeros', desc: '+10% de velocidad de ataque del equipo', apply: (st) => { st.buffs.asMul *= 1.1; } },
  { id: 'gold', name: 'Fortuna', desc: '+5 de oro', apply: (st) => { st.gold += 5; } },
  { id: 'heal', name: 'Reparación', desc: 'La base cura 15 PS', apply: (st) => { st.base.hp = clampHp(st.base.hp + 15, st.base.maxHp); } },
];

/** 3 distinct random buffs for the overlay.
 * AU-3: opts.noTdOnly drops tdOnly cards (Fortified/Flank Master) — auto mode. */
export function rollBuffs(
  rnd: () => number = Math.random,
  opts?: { noTdOnly?: boolean },
): BuffDef[] {
  const pool = POOL.filter((b) => !(opts?.noTdOnly && b.tdOnly));
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
