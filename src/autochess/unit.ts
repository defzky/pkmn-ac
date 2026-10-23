/* ============ autochess/unit.ts — battle instance of a board unit ============ */
import { register } from '../core/registry';
import { BoardUnit } from './board';
import { boardStats, BoardStats } from './unit-stats';
import { SynergyMods, NONE } from './synergy';

export interface UnitBattle extends BoardStats {
  hpCur: number;
  x: number;
  y: number;
  /** attack cooldown remaining (s) */
  cd: number;
  alive: boolean;
  /** item stat bonuses */
  bonusAtk: number;
  bonusHp: number;
}

/** Build battle unit from board placement + synergy mods + items. */
export function makeUnit(bu: BoardUnit, mods: SynergyMods = NONE): UnitBattle | null {
  const s = boardStats(bu.dex, bu.star);
  if (!s) return null;
  const bonusAtk = (bu.items || []).length * 2; // placeholder item bonus: +2 atk each
  const bonusHp = (bu.items || []).length * 15;
  const hp = Math.round(s.hp * mods.baseHpMul) + bonusHp;
  return {
    ...s,
    hp,                 // effective max (synergy baseHpMul + items)
    hpCur: hp,
    // place unit at its cell center; battle x/y kept in cells
    x: bu.x as number,
    y: bu.y as number,
    cd: 0,
    alive: true,
    bonusAtk: Math.round(s.atk * (mods.atkMul - 1)) + bonusAtk,
    bonusHp,
  };
}

/** Effective attack with synergy atkMul folded in at make time (bonusAtk). */
export function totalAtk(u: UnitBattle): number {
  return u.atk + u.bonusAtk;
}

/** Effective attack cooldown after atkSpd synergy (cd / mul). */
export function effCd(u: UnitBattle, mods: SynergyMods): number {
  return u.atkCd / Math.max(0.1, mods.atkSpdMul);
}

const Unit = { makeUnit, totalAtk, effCd };
register('UnitAC', Unit);
export { Unit };
export default Unit;
