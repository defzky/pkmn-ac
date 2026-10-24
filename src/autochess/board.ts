/* ============ autochess/board.ts — placement grid + bench + star merge ============
 * Board cells: 3x3 rocks (0..2) — ring lane cells never placeable. Bench: 2 slots.
 * Merge: 3 identical (dex+star) anywhere on board+bench → next star (cap 3★).
 */
import { register } from '../core/registry';
import { Path } from './path';

export interface BoardUnit {
  dex: number;
  star: number;
  /** board position, or null if on bench */
  x: number | null;
  y: number | null;
  /** bench slot 0..1, or null if on board */
  bench: number | null;
  /** optional equipped item ids */
  items?: string[];
}

export interface BoardState {
  units: BoardUnit[];
}

export const BENCH_SIZE = 2;
export const BOARD_MAX_UNITS = 8;
export const MAX_STAR = 3;

/** Board capacity by player level: min(8, 1+floor(level/2)) */
export function boardCap(level: number): number {
  return Math.min(BOARD_MAX_UNITS, 1 + Math.floor(level / 2));
}

function onBoard(u: BoardUnit): boolean { return u.x !== null && u.y !== null; }
function onBench(u: BoardUnit): boolean { return u.bench !== null; }

/** Cell occupancy check (board only). */
function occupied(state: BoardState, x: number, y: number): boolean {
  return state.units.some((u) => u.x === x && u.y === y);
}

/** Placement cell = rock cell (ring lane is outside rock bounds). */
function isPlacementCell(x: number, y: number): boolean {
  return Path.inside(x, y);
}

/** Place from bench → board cell. Returns false if invalid. */
function place(state: BoardState, unit: BoardUnit, x: number, y: number, level = 8): boolean {
  if (!Path.inside(x, y)) return false; // rock bounds only — ring lane excluded
  if (occupied(state, x, y)) return false;
  const boardCount = state.units.filter(onBoard).length;
  if (unit.x === null && boardCount >= boardCap(level)) return false;
  unit.x = x; unit.y = y; unit.bench = null;
  return true;
}

/** Move board unit → first free bench slot. */
function toBench(state: BoardState, unit: BoardUnit): boolean {
  const taken = new Set(state.units.filter(onBench).map((u) => u.bench as number));
  for (let i = 0; i < BENCH_SIZE; i++) {
    if (!taken.has(i)) {
      unit.x = null; unit.y = null; unit.bench = i;
      return true;
    }
  }
  return false; // bench full
}

/** Add unit (buy): try bench first; returns false if bench full. */
function add(state: BoardState, dex: number, star = 1): BoardUnit | null {
  const taken = new Set(state.units.filter(onBench).map((u) => u.bench as number));
  let slot = -1;
  for (let i = 0; i < BENCH_SIZE; i++) if (!taken.has(i)) { slot = i; break; }
  if (slot < 0) return null;
  const u: BoardUnit = { dex, star, x: null, y: null, bench: slot };
  state.units.push(u);
  return u;
}

/** Remove unit entirely (sell). */
function remove(state: BoardState, unit: BoardUnit): void {
  const i = state.units.indexOf(unit);
  if (i >= 0) state.units.splice(i, 1);
}

/** Find merge candidates: groups of 2 identical (dex,star<MAX_STAR) — GDD merge-2. */
function mergeCandidates(state: BoardState): Array<{ dex: number; star: number; units: BoardUnit[] }> {
  const groups: Record<string, BoardUnit[]> = {};
  for (const u of state.units) {
    if (u.star >= MAX_STAR) continue;
    const k = `${u.dex}:${u.star}`;
    (groups[k] = groups[k] || []).push(u);
  }
  const out: Array<{ dex: number; star: number; units: BoardUnit[] }> = [];
  for (const g of Object.values(groups)) {
    if (g.length >= 2) out.push({ dex: g[0].dex, star: g[0].star, units: g.slice(0, 2) });
  }
  return out;
}

/** Apply one merge: consume 2 units, place upgraded where the first was. */
function applyMerge(state: BoardState, m: { dex: number; star: number; units: BoardUnit[] }): BoardUnit {
  const [a, b] = m.units;
  const target: BoardUnit = {
    dex: m.dex, star: m.star + 1,
    x: a.x, y: a.y, bench: a.bench,
    items: [...(a.items || []), ...(b.items || [])].slice(0, 3),
  };
  remove(state, b); remove(state, a);
  state.units.push(target);
  return target;
}

/** Merge all possible (loop until none). Returns count of merges. */
function mergeAll(state: BoardState): number {
  let n = 0;
  for (;;) {
    const ms = mergeCandidates(state);
    if (!ms.length) break;
    for (const m of ms) { applyMerge(state, m); n++; }
  }
  return n;
}

/** Synergy view: board units only, with types from pokedex. */
function placed(state: BoardState): Array<{ dex: number; types: string[] }> {
  const DEX_BY: Record<string, any> = (G as any).DEX_BY || {};
  return state.units.filter(onBoard).map((u) => {
    const e = DEX_BY[String(u.dex)] || DEX_BY[u.dex] || {};
    return { dex: u.dex, types: e.types || [] };
  });
}

const Board = {
  BENCH_SIZE, BOARD_MAX_UNITS, MAX_STAR,
  boardCap, occupied, isPlacementCell,
  place, toBench, add, remove,
  mergeCandidates, applyMerge, mergeAll, placed,
  onBoard, onBench,
};
register('BoardAC', Board);
export { Board };
export default Board;
