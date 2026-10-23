/* ============ autochess/path.ts — board grid + lane waypoints ============
 * Board 8x5 cells. Enemy lane runs row 2 (0-indexed) left→right.
 * Rift arena: serpentine 3-leg path.
 */
import { register } from '../core/registry';

export interface Cell { x: number; y: number }
export interface PathDef { name: string; waypoints: Cell[]; w: number; h: number }

const W = 8, H = 5;

/** Default lane: straight row 2. */
const LANE: PathDef = {
  name: 'lane',
  waypoints: [{ x: 0, y: 2 }, { x: W - 1, y: 2 }],
  w: W, h: H,
};

/** Rift serpentine: row 1 → row 3 → row 1, 3 legs. */
const SERPENTINE: PathDef = {
  name: 'serpentine',
  waypoints: [
    { x: 0, y: 1 }, { x: W - 1, y: 1 },
    { x: W - 1, y: 3 }, { x: 0, y: 3 },
    { x: 0, y: 2 }, { x: W - 1, y: 2 },
  ],
  w: W, h: H,
};

const BY_NAME: Record<string, PathDef> = { lane: LANE, serpentine: SERPENTINE };

/** In-bounds check. */
function inside(x: number, y: number, path?: PathDef): boolean {
  const p = path || LANE;
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < p.w && y < p.h;
}

/** Cells occupied by the lane (units may not place on lane). */
function laneCells(path?: PathDef): Cell[] {
  const p = path || LANE;
  const cells: Cell[] = [];
  for (let i = 0; i < p.waypoints.length - 1; i++) {
    const a = p.waypoints[i], b = p.waypoints[i + 1];
    const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
    let x = a.x, y = a.y;
    cells.push({ x, y });
    while (x !== b.x || y !== b.y) { x += dx; y += dy; cells.push({ x, y }); }
  }
  return cells;
}

/** Total lane length in cells (for travel time). */
function laneLen(path?: PathDef): number {
  const cells = laneCells(path);
  return Math.max(1, cells.length - 1);
}

const Path = { W, H, LANE, SERPENTINE, BY_NAME, inside, laneCells, laneLen };
// 'BoardPath' — avoids clobbering legacy systems/pathing.js registered as 'Path'
register('BoardPath', Path);
export { Path };
export default Path;
