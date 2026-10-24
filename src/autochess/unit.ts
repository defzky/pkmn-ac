/* ============ autochess/unit.ts — battle instance of a board unit ============ */
import { register } from '../core/registry';
import { BoardUnit } from './board';
import { boardStats, BoardStats } from './unit-stats';
import { SynergyMods, NONE } from './synergy';
import { skillOf } from './champions';

export interface UnitBattle extends BoardStats {
  hpCur: number;
  x: number;
  y: number;
  /** star grade (GDD: ★3 = max skill effect ×2) */
  star: number;
  /** attack cooldown remaining (s) */
  cd: number;
  alive: boolean;
  /** item stat bonuses */
  bonusAtk: number;
  bonusHp: number;
  // ---- mana / skill (GDD) ----
  /** current mana 0..100; full → cast skillId */
  mana: number;
  skillId: string;
  // ---- temporary combat state ----
  /** mewtwo disable: >0 = cannot attack */
  disabledT: number;
  /** koffing death-slow: >0 = attack speed halved */
  slowT: number;
  /** gyarados roar: >0 = attack −30% */
  roarT: number;
  /** ralts asAura: >0 = attack speed +30% */
  asBuffT: number;
  /** UI: set by unitAI on attack fire → sprite anim name ('Attack'/'Shoot'/'Charge', dungeon move kind) */
  swing?: string;
  /** UI: set with swing → facing angle toward target cell (atan2 dy,dx, y down); Sprites.dirFromAngle */
  face?: number;
  /** UI: set with swing → impact point + damage (projectile/slash vfx + dmg number) */
  hit?: { x: number; y: number; dmg: number };
  /** UI: skill fired this tick → charge flourish in addition to attack fx */
  skillFx?: boolean;
}

/** Build battle unit from board placement + synergy mods + items. */
export function makeUnit(bu: BoardUnit, mods: SynergyMods = NONE): UnitBattle | null {
  const s = boardStats(bu.dex, bu.star);
  if (!s) return null;
  const skillId = skillOf(bu.dex);
  // items: +15% atk / +15 flat hp each (scales with ATK_SCALE board atk)
  const bonusAtk = (bu.items || []).length * Math.max(1, Math.round(s.atk * 0.15));
  const bonusHp = (bu.items || []).length * 15;
  let hp = Math.round(s.hp * mods.baseHpMul) + bonusHp;
  if (skillId === 'tank') hp = Math.round(hp * 1.3); // Aron passive
  return {
    ...s,
    hp,                 // effective max (synergy baseHpMul + items + tank)
    hpCur: hp,
    // place unit at its cell center; battle x/y kept in cells
    x: bu.x as number,
    y: bu.y as number,
    star: bu.star,
    cd: 0,
    alive: true,
    bonusAtk: Math.round(s.atk * (mods.atkMul - 1)) + bonusAtk,
    bonusHp,
    mana: 0,
    skillId,
    disabledT: 0,
    slowT: 0,
    roarT: 0,
    asBuffT: 0,
  };
}

/** Effective attack with synergy atkMul folded in at make time (bonusAtk).
 * Gyarados roar: −30% while roarT > 0. */
export function totalAtk(u: UnitBattle): number {
  const a = u.atk + u.bonusAtk;
  return u.roarT > 0 ? a * 0.7 : a;
}

/** Effective attack cooldown after atkSpd synergy (cd / mul),
 * koffing slow (÷2 while slowT>0), ralts asAura (×1.3 while asBuffT>0). */
export function effCd(u: UnitBattle, mods: SynergyMods): number {
  let mul = Math.max(0.1, mods.atkSpdMul);
  if (u.slowT > 0) mul *= 0.5;
  if (u.asBuffT > 0) mul *= 1.3;
  return u.atkCd / mul;
}

const Unit = { makeUnit, totalAtk, effCd };
register('UnitAC', Unit);
export { Unit };
export default Unit;
