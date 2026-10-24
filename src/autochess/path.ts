/* ============ autochess/path.ts — 3x3 rock board + ring lane (shared TD/autochess) ============
 * Rock placement grid: 3x3 cells (0..2, 0..2) — units stand here.
 * Enemy/TD ring lane wraps the rocks (spawn −1..3): spawn top-center →
 * two symmetric branches (left / right, 9 cells each) → base bottom-center.
 * TD mobs alternate branches (wave-runner-td sets m.branch) — the lane NEVER
 * crosses a board cell, so minions and pokemon never overlap.
 */
import { register } from '../core/registry';

export interface Cell { x: number; y: number }

/** Rock board size (placement bounds). */
const W = 3, H = 3;

/** Spawn gate (top center) / Base (bottom center) on the ring. */
const SPAWN: Cell = { x: 1, y: -1 };
const BASE: Cell = { x: 1, y: 3 };

/** Branch waypoints: spawn → around → base. Same length (9 cells each). */
const BRANCH_WP: Cell[][] = [
  // left branch
  [
    { x: 1, y: -1 }, { x: 0, y: -1 }, { x: -1, y: -1 },
    { x: -1, y: 0 }, { x: -1, y: 1 }, { x: -1, y: 2 },
    { x: -1, y: 3 }, { x: 0, y: 3 }, { x: 1, y: 3 },
  ],
  // right branch
  [
    { x: 1, y: -1 }, { x: 2, y: -1 }, { x: 3, y: -1 },
    { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 },
    { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 },
  ],
];

/** Rasterize waypoint polyline into cell list (no duplicate joins). */
function rasterize(wps: Cell[]): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1];
    const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
    let x = a.x, y = a.y;
    if (i === 0) cells.push({ x, y }); // only first segment pushes its start
    while (x !== b.x || y !== b.y) { x += dx; y += dy; cells.push({ x, y }); }
  }
  return cells;
}

/** Cached branch cell lists (9 cells each). */
const BRANCHES: Cell[][] = BRANCH_WP.map(rasterize);

/** Cells of one branch (0 = left, 1 = right). */
function branchCells(branch: number): Cell[] {
  return BRANCHES[branch === 1 ? 1 : 0];
}

/** Default branch (compat callers). */
function laneCells(): Cell[] {
  return BRANCHES[0];
}

/** Travel length in cells (cells − 1). */
function laneLen(): number {
  return Math.max(1, BRANCHES[0].length - 1);
}

/** Placement bounds: rock cells only (ring never placeable). */
function inside(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < W && y >= 0 && y < H;
}

const Path = { W, H, SPAWN, BASE, BRANCH_WP, branchCells, laneCells, laneLen, inside };
// 'BoardPath' — avoids clobbering legacy systems/pathing.js registered as 'Path'
register('BoardPath', Path);
export { Path };
export default Path;
