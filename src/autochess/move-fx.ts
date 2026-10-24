/* ============ autochess/move-fx.ts — move → visual behaviour plan ============
 * Pure mapping used by ac-ui. Keeps combat data (MoveDef.kind) separate from
 * canvas execution so projectile/fan/boomerang rules are testable in jsdom.
 */
import { register } from '../core/registry';

export type FxMode =
  | 'projectile' | 'boomerang' | 'cone' | 'beam' | 'slash'
  | 'radial' | 'aura' | 'charge' | 'trail' | 'meteor' | 'mine' | 'chain' | 'orbit';

export interface MoveFxPlan {
  mode: FxMode;
  /** projectiles spawned per cast (1 for single effects) */
  count: number;
  /** radians between projectiles when count > 1 */
  spread: number;
  /** world px per second for flying pieces (fx canvas is world-px) */
  speed: number;
}

const MODES: Record<string, FxMode> = {
  projectile: 'projectile',
  boomerang: 'boomerang',
  cone: 'cone',
  beam: 'beam',
  melee: 'slash',
  dash: 'slash',
  nova: 'radial',
  aura: 'aura',
  buff: 'charge',
  turret: 'charge',
  trail: 'trail',
  meteor: 'meteor',
  mine: 'mine',
  chain: 'chain',
  orbit: 'orbit',
};

const int = (v: any, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

/** Resolve move kind → animation behaviour + projectile fan parameters. */
export function planMoveFx(move: any): MoveFxPlan {
  const kind = String(move?.kind || 'melee');
  const mode = MODES[kind] || 'slash';
  let count = 1;
  let spread = 0;
  switch (mode) {
    case 'projectile':
      count = int(move?.count, 1, 6, 1);
      spread = Math.max(0, Number(move?.spread) || 0.18);
      break;
    case 'boomerang':
      count = int(move?.count, 1, 6, 1);
      spread = Math.max(0, Number(move?.spread) || 0.5);
      break;
    case 'cone':
      count = int(move?.count, 1, 9, 4);
      spread = Math.max(0.12, Number(move?.spread) || 0.45);
      break;
    case 'meteor':
    case 'mine':
    case 'chain':
    case 'orbit':
      count = int(move?.count, 1, 6, 1);
      spread = Math.max(0, Number(move?.spread) || 0);
      break;
    default:
      break;
  }
  const rawSpeed = Number(move?.speed);
  // fx canvas is world-px (same units as dungeon projectiles) → use dungeon speeds directly
  const speed = Math.max(160, Math.min(420, Number.isFinite(rawSpeed) && rawSpeed > 20 ? rawSpeed : 300));
  return { mode, count, spread, speed };
}

const MoveFx = { planMoveFx };
register('MoveFxAC', MoveFx);
export { MoveFx };
export default MoveFx;
