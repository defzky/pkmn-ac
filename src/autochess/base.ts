/* ============ autochess/base.ts — base HP + leak penalty ============ */
import { register } from '../core/registry';

export interface BaseState {
  hp: number;
  maxHp: number;
}

export const START_HP = 100;
export const LEAK_NORMAL = 5;
export const LEAK_BOSS = 20;

export function create(maxHp: number = START_HP): BaseState {
  return { hp: maxHp, maxHp };
}

/** Leak: deduct; boss leaks cost more. Returns true if base destroyed. */
export function leak(b: BaseState, boss: boolean = false): boolean {
  b.hp = Math.max(0, b.hp - (boss ? LEAK_BOSS : LEAK_NORMAL));
  return b.hp <= 0;
}

export function repair(b: BaseState, n: number): void {
  b.hp = Math.min(b.maxHp, b.hp + n);
}

const Base = { create, leak, repair, START_HP, LEAK_NORMAL, LEAK_BOSS };
register('BaseAC', Base);
export { Base };
export default Base;
