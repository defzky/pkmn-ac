/* P18 dual-board: placement (3x3 rocks, no bench), board-cap, merge stars */
import { describe, it, expect, beforeAll } from 'vitest';

let Board: any, Path: any;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  ({ Path } = await import('../src/autochess/path.ts'));
  ({ Board } = await import('../src/autochess/board.ts'));
});

const st = () => ({ units: [] as any[] });

/** push unit directly (bypasses board capacity — for merge tests) */
function push(s: any, over: any = {}): any {
  const u = { dex: 25, star: 1, x: null, y: null, bench: null, ...over };
  s.units.push(u);
  return u;
}

describe('board placement', () => {
  it('add → first free cell (0,0); second → (1,0); no bench', () => {
    const s = st();
    const a = Board.add(s, 25);
    const b = Board.add(s, 1);
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(a.bench).toBeNull();
    expect(b.x).toBe(1);
    expect(b.y).toBe(0);
    expect(b.bench).toBeNull();
    expect(s.units).toHaveLength(2);
  });

  it('refuse when board cap reached (level 8 → 5 units)', () => {
    const s = st();
    for (let i = 0; i < 5; i++) expect(Board.add(s, 1)).not.toBeNull();
    expect(Board.add(s, 1)).toBeNull();
    expect(s.units).toHaveLength(5);
  });

  it('place on free rock cell succeeds; ring cell blocked', () => {
    const s = st();
    const a = Board.add(s, 25);
    expect(Board.place(s, a, 1, 1, 8)).toBe(true);
    expect(a.x).toBe(1);
    expect(a.y).toBe(1);
    expect(a.bench).toBeNull();
    // ring cells rejected (top / right / bottom)
    const b = Board.add(s, 1);
    expect(Board.place(s, b, 1, -1, 8)).toBe(false); // spawn row
    expect(Board.place(s, b, 3, 1, 8)).toBe(false);  // right lane col
    expect(Board.place(s, b, 1, 3, 8)).toBe(false);  // base row
  });

  it('occupied cell rejected', () => {
    const s = st();
    const a = Board.add(s, 25);
    const b = Board.add(s, 1);
    expect(Board.place(s, a, 2, 0, 8)).toBe(true);
    expect(Board.place(s, b, 2, 0, 8)).toBe(false);
  });

  it('out of bounds rejected', () => {
    const s = st();
    const a = Board.add(s, 25);
    expect(Board.place(s, a, -1, 0, 8)).toBe(false);
    expect(Board.place(s, a, 3, 0, 8)).toBe(false);
    expect(Board.place(s, a, 0, 3, 8)).toBe(false);
    expect(Board.place(s, a, 1.5, 1, 8)).toBe(false);
  });

  it('board cap by level: level 1 → 1 unit', () => {
    const s = st();
    const a = { dex: 25, star: 1, x: null, y: null, bench: null };
    const b = { dex: 1, star: 1, x: null, y: null, bench: null };
    s.units.push(a, b); // off-board; place() enforces cap
    expect(Board.place(s, a, 1, 0, 1)).toBe(true);
    expect(Board.place(s, b, 2, 0, 1)).toBe(false); // cap 1
    expect(Board.place(s, b, 2, 0, 2)).toBe(true);  // cap 2
  });

  it('boardCap formula', () => {
    expect(Board.boardCap(1)).toBe(1);
    expect(Board.boardCap(2)).toBe(2);
    expect(Board.boardCap(8)).toBe(5);
    expect(Board.boardCap(14)).toBe(8);
    expect(Board.boardCap(20)).toBe(8); // cap
  });

  it('toBench returns unit to first free slot', () => {
    const s = st();
    const a = Board.add(s, 25);
    Board.place(s, a, 1, 0, 8);
    expect(Board.toBench(s, a)).toBe(true);
    expect(a.bench).toBe(0);
    expect(a.x).toBeNull();
  });

  it('remove deletes unit', () => {
    const s = st();
    const a = Board.add(s, 25);
    Board.remove(s, a);
    expect(s.units).toHaveLength(0);
  });

  it('isPlacementCell: rock true, ring false', () => {
    expect(Board.isPlacementCell(0, 0)).toBe(true);
    expect(Board.isPlacementCell(2, 2)).toBe(true);
    expect(Board.isPlacementCell(0, -1)).toBe(false); // ring
    expect(Board.isPlacementCell(1, 3)).toBe(false);  // base row
    expect(Board.isPlacementCell(3, 1)).toBe(false);  // right lane
  });
});

describe('same-cell merge (merge-2 on drop — GDD)', () => {
  it('drop same dex+star onto target cell → ★2 at target cell', () => {
    const s = st();
    const a = push(s, { dex: 25, x: 1, y: 0 });
    const b = push(s, { dex: 25, x: 2, y: 1 });
    expect(Board.tryMergeAt(s, b, 1, 0)).toBe(true);
    expect(s.units).toHaveLength(1);
    expect(s.units[0].star).toBe(2);
    expect(s.units[0].dex).toBe(25);
    expect(s.units[0].x).toBe(1); // merged into TARGET cell (a's spot)
    expect(s.units[0].y).toBe(0);
    expect(s.units[0].bench).toBeNull();
    expect(s.units.includes(b)).toBe(false); // moving unit consumed
  });

  it('2 identical in different cells do NOT auto-merge', () => {
    const s = st();
    push(s, { dex: 25, x: 1, y: 0 });
    push(s, { dex: 25, x: 2, y: 1 });
    expect(s.units).toHaveLength(2);
    expect(Board.mergeCandidates(s)).toHaveLength(1); // candidate exists, no trigger
  });

  it('different dex / different star do not merge', () => {
    const s = st();
    push(s, { dex: 25, x: 0, y: 0 }); push(s, { dex: 1, x: 1, y: 0 });
    push(s, { dex: 4, x: 2, y: 0 });
    expect(Board.tryMergeAt(s, s.units[1], 0, 0)).toBe(false);
    const s2 = st();
    push(s2, { dex: 6, star: 1, x: 0, y: 0 });
    push(s2, { dex: 6, star: 2, x: 1, y: 0 });
    expect(Board.tryMergeAt(s2, s2.units[1], 0, 0)).toBe(false);
    expect(s2.units).toHaveLength(2);
  });

  it('empty cell / own cell / MAX_STAR → false', () => {
    const s = st();
    const a = push(s, { dex: 25, x: 0, y: 0 });
    expect(Board.tryMergeAt(s, a, 1, 1)).toBe(false); // empty
    expect(Board.tryMergeAt(s, a, 0, 0)).toBe(false); // own cell
    const s2 = st();
    push(s2, { dex: 6, star: 3, x: 0, y: 0 });
    const t = push(s2, { dex: 6, star: 3, x: 1, y: 0 });
    expect(Board.tryMergeAt(s2, t, 0, 0)).toBe(false); // max star
    expect(s2.units).toHaveLength(2);
  });

  it('drop sequence 1★+1★ → ★2, +1★ → ★3', () => {
    const s = st();
    const a = push(s, { dex: 6, x: 0, y: 0 });
    const b = push(s, { dex: 6, x: 1, y: 0 });
    expect(Board.tryMergeAt(s, b, 0, 0)).toBe(true);
    expect(s.units).toHaveLength(1);
    expect(s.units[0].star).toBe(2);
    const c = push(s, { dex: 6, star: 2, x: 2, y: 2 });
    expect(Board.tryMergeAt(s, c, a.x as number, a.y as number)).toBe(true);
    expect(s.units).toHaveLength(1);
    expect(s.units[0].star).toBe(3);
  });

  it('mergeCandidates needs ≥2', () => {
    const s = st();
    push(s, { dex: 25 });
    expect(Board.mergeCandidates(s)).toHaveLength(0);
    push(s, { dex: 25 });
    expect(Board.mergeCandidates(s)).toHaveLength(1);
  });

  it('merged unit carries items from both (cap 3)', () => {
    const s = st();
    const a = push(s, { dex: 25, x: 0, y: 0 }); a.items = ['x'];
    const b = push(s, { dex: 25, x: 1, y: 0 }); b.items = ['y', 'z', 'w'];
    expect(Board.tryMergeAt(s, b, 0, 0)).toBe(true);
    expect(s.units[0].items).toEqual(['x', 'y', 'z']);
  });
});

describe('placed (synergy view)', () => {
  it('returns board units with types from pokedex', () => {
    const s = st();
    const a = Board.add(s, 4); // charmander fire
    Board.place(s, a, 1, 0, 8);
    push(s, { dex: 7 }); // off-board — excluded
    const p = Board.placed(s);
    expect(p).toHaveLength(1);
    expect(p[0].dex).toBe(4);
    expect(p[0].types).toContain('fire');
  });
});
