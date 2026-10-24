/* ============ autochess/skills.ts — champion Skill Dasar (GDD Bagian 1) ============
 * Cast on full mana (100). Target = current attack target (or lowest-HP for burstLowest).
 * AoE = nearby mobs via cellDist. Damage honors mods.skillDmgMul.
 */
import { register } from '../core/registry';
import { cellDist, mobPos, type MobBattle, addBurn, addSlow, addStun, applyDamage } from './unitAI';
import type { UnitBattle } from './unit';

export const MANA_MAX = 100;
export const MANA_PER_ATTACK = 10;

/** Cast skill. Returns true when a skill fired. */
export function cast(
  u: UnitBattle,
  mobs: MobBattle[],
  target: MobBattle | null,
  cells: Array<{ x: number; y: number }>,
  skillDmgMul = 1
): boolean {
  const base = (u.atk + u.bonusAtk) * skillDmgMul;
  const alive = () => mobs.filter((m) => m.alive);
  switch (u.skillId) {
    case 'poisonDoT': { // Bulbasaur: poison DoT 3s
      if (!target) return false;
      addBurn(target, 'poison', 3, base * 0.15);
      return true;
    }
    case 'burnAoE': { // Charmander: AoE 1-cell + burn
      const c = target && mobPos(target, cells);
      if (!c) return false;
      for (const m of alive()) {
        const mc = mobPos(m, cells);
        if (cellDist(c.x, c.y, mc.x, mc.y) <= 1) {
          applyDamage(m, base * 0.8);
          addBurn(m, 'burn', 3, base * 0.12);
        }
      }
      return true;
    }
    case 'knockback': { // Squirtle: push 2 cells (kb-immune bosses resist)
      if (!target) return false;
      if (!target.kbImmune) target.progress = Math.max(0, target.progress - 2);
      applyDamage(target, base * 0.6);
      return true;
    }
    case 'chainStun': { // Mareep: bounce 2 + 25% stun 1s
      if (!target) return false;
      applyDamage(target, base * 0.7);
      if (Math.random() < 0.25) addStun(target, 1);
      const tc = mobPos(target, cells);
      let bounced = 0;
      for (const m of alive()) {
        if (bounced >= 2 || m === target) continue;
        const mc = mobPos(m, cells);
        if (cellDist(tc.x, tc.y, mc.x, mc.y) <= 2) {
          applyDamage(m, base * 0.4);
          if (Math.random() < 0.25) addStun(m, 1);
          bounced++;
        }
      }
      return true;
    }
    case 'armorShred': { // Machop: big hit + shred 40% 4s
      if (!target) return false;
      applyDamage(target, base * 1.5);
      target.shred = Math.min(1, target.shred + 0.4);
      target.shredT = Math.max(target.shredT, 4);
      return true;
    }
    case 'burstLowest': { // Gastly: burst lowest-HP mob
      const list = alive();
      if (!list.length) return false;
      let low = list[0];
      for (const m of list) if (m.hp < low.hp) low = m;
      applyDamage(low, base * 2);
      return true;
    }
    case 'bossBurst': { // Abra: single-target magic, ×2 vs boss
      if (!target) return false;
      applyDamage(target, base * (target.boss ? 3 : 1.5));
      return true;
    }
    case 'slowArea': { // Swinub: slow 40% 2s radius 1 around target
      const c = target && mobPos(target, cells);
      if (!c) return false;
      for (const m of alive()) {
        const mc = mobPos(m, cells);
        if (cellDist(c.x, c.y, mc.x, mc.y) <= 1) {
          applyDamage(m, base * 0.5);
          addSlow(m, 2, 0.4);
        }
      }
      return true;
    }
    case 'asAura': { // Ralts: +30% AS to nearby allies 3s
      for (const ally of [u]) { // v1: self + could extend to allies by distance
        ally.asBuffT = 3;
      }
      if (target) applyDamage(target, base * 0.5);
      return true;
    }
    case 'meteorAoE': { // Dratini: wide AoE radius 2, huge damage
      const c = target && mobPos(target, cells);
      if (!c) return false;
      for (const m of alive()) {
        const mc = mobPos(m, cells);
        if (cellDist(c.x, c.y, mc.x, mc.y) <= 2) applyDamage(m, base * 2.5);
      }
      return true;
    }
    default:
      return false; // 'none' / tank passive
  }
}

const Skills = { cast, MANA_MAX, MANA_PER_ATTACK };
register('SkillsAC', Skills);
export { Skills };
export default Skills;
