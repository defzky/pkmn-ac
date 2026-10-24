/* ============ autochess/base.ts — base HP + leak penalty ============ */
import { register } from '../core/registry';

export interface BaseState {
  hp: number;
  maxHp: number;
}

export const START_HP = 100;
/** D2c 5-min sprint: leak 6 / boss 15 (GDD td §4) */
export const LEAK_NORMAL = 6;
export const LEAK_BOSS = 15;

export function create(maxHp: number = START_HP): BaseState {
  return { hp: maxHp, maxHp };
}

/** Leak: deduct; boss leaks cost more. mul = augment (Fortified 0.5 normal).
 * Returns true if base destroyed. */
export function leak(b: BaseState, boss: boolean = false, mul: number = 1): boolean {
  b.hp = Math.max(0, b.hp - Math.round((boss ? LEAK_BOSS : LEAK_NORMAL) * mul));
  return b.hp <= 0;
}

export function repair(b: BaseState, n: number): void {
  b.hp = Math.min(b.maxHp, b.hp + n);
}

/** Run score (GDD common §6): wave ×100 + remaining HP ×5 + banked gold. */
export function runScore(wave: number, hp: number, gold: number): number {
  return wave * 100 + Math.max(0, hp) * 5 + gold;
}

const Base = { create, leak, repair, runScore, START_HP, LEAK_NORMAL, LEAK_BOSS };
register('BaseAC', Base);
export { Base };
export default Base;
