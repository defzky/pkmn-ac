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

describe('star merge (merge-2 per GDD)', () => {
  it('2 identical 1★ → one 2★ at first position', () => {
    const s = st();
    push(s, { dex: 25, x: 1, y: 0 });
    push(s, { dex: 25 });
    expect(Board.mergeAll(s)).toBe(1);
    expect(s.units).toHaveLength(1);
    expect(s.units[0].star).toBe(2);
    expect(s.units[0].dex).toBe(25);
    expect(s.units[0].x).toBe(1); // kept first unit position
    expect(s.units[0].bench).toBeNull();
  });

  it('different dex do not merge', () => {
    const s = st();
    push(s, { dex: 25 }); push(s, { dex: 1 }); push(s, { dex: 4 });
    expect(Board.mergeAll(s)).toBe(0);
    expect(s.units).toHaveLength(3);
  });

  it('merge cascades 1★→2★→3★ when 4 copies', () => {
    const s = st();
    for (let i = 0; i < 4; i++) push(s, { dex: 6 });
    const n = Board.mergeAll(s);
    expect(n).toBe(3); // 4→2×2★ (2 merges), 2×2★→1×3★ (1 merge)
    expect(s.units).toHaveLength(1);
    expect(s.units[0].star).toBe(3);
  });

  it('9 copies: 6 merges → 2×3★ + 1×1★ remainder', () => {
    const s = st();
    for (let i = 0; i < 9; i++) push(s, { dex: 6 });
    const n = Board.mergeAll(s);
    expect(n).toBe(6); // 4 pairs → 4×2★, 2 pairs → 2×3★, 1×1★ left
    expect(s.units).toHaveLength(3);
    const stars = s.units.map((u: any) => u.star).sort();
    expect(stars).toEqual([1, 3, 3]);
  });

  it('MAX_STAR units do not merge further', () => {
    const s = st();
    push(s, { dex: 6, star: 3 });
    push(s, { dex: 6, star: 3 });
    expect(Board.mergeAll(s)).toBe(0);
    expect(s.units).toHaveLength(2);
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
    const a = push(s, { dex: 25 }); a.items = ['x'];
    const b = push(s, { dex: 25 }); b.items = ['y', 'z', 'w'];
    Board.applyMerge(s, Board.mergeCandidates(s)[0]);
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
