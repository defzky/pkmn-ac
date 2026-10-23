/* P12 board tests: placement, bench, merge stars */
import { describe, it, expect, beforeAll } from 'vitest';

let Board: any, Path: any;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  ({ Path } = await import('../src/autochess/path.ts'));
  ({ Board } = await import('../src/autochess/board.ts'));
});

const st = () => ({ units: [] as any[] });

describe('board placement', () => {
  it('add → bench slot 0; second → slot 1', () => {
    const s = st();
    const a = Board.add(s, 25);
    const b = Board.add(s, 1);
    expect(a.bench).toBe(0);
    expect(b.bench).toBe(1);
    expect(a.x).toBeNull();
    expect(s.units).toHaveLength(2);
  });

  it('bench full at 9', () => {
    const s = st();
    for (let i = 0; i < 9; i++) expect(Board.add(s, 1)).not.toBeNull();
    expect(Board.add(s, 1)).toBeNull();
  });

  it('place on free cell succeeds; lane cell blocked', () => {
    const s = st();
    const a = Board.add(s, 25);
    expect(Board.place(s, a, 3, 1, 8)).toBe(true);
    expect(a.x).toBe(3);
    expect(a.y).toBe(1);
    expect(a.bench).toBeNull();
    // lane row 2 blocked
    const b = Board.add(s, 1);
    expect(Board.place(s, b, 3, 2, 8)).toBe(false);
    // try another lane cell
    expect(Board.place(s, b, 0, 2, 8)).toBe(false);
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
    expect(Board.place(s, a, 8, 0, 8)).toBe(false);
    expect(Board.place(s, a, 1.5, 1, 8)).toBe(false);
  });

  it('board cap by level: level 1 → 1 unit', () => {
    const s = st();
    const a = Board.add(s, 25);
    const b = Board.add(s, 1);
    expect(Board.place(s, a, 1, 0, 1)).toBe(true);
    expect(Board.place(s, b, 3, 0, 1)).toBe(false); // cap 1
    expect(Board.place(s, b, 3, 0, 2)).toBe(true);  // cap 2
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

  it('isPlacementCell: lane false, other true', () => {
    expect(Board.isPlacementCell(0, 2)).toBe(false);
    expect(Board.isPlacementCell(4, 2)).toBe(false);
    expect(Board.isPlacementCell(0, 1)).toBe(true);
    expect(Board.isPlacementCell(0, 4)).toBe(true);
  });
});

describe('star merge', () => {
  it('3 identical 1★ → one 2★ at first position', () => {
    const s = st();
    const a = Board.add(s, 25);
    const b = Board.add(s, 25);
    const c = Board.add(s, 25);
    Board.place(s, a, 1, 0, 8);
    expect(Board.mergeAll(s)).toBe(1);
    expect(s.units).toHaveLength(1);
    expect(s.units[0].star).toBe(2);
    expect(s.units[0].dex).toBe(25);
    expect(s.units[0].x).toBe(1); // kept first unit position
    expect(s.units[0].bench).toBeNull();
  });

  it('different dex do not merge', () => {
    const s = st();
    Board.add(s, 25); Board.add(s, 1); Board.add(s, 4);
    expect(Board.mergeAll(s)).toBe(0);
    expect(s.units).toHaveLength(3);
  });

  it('merge cascades 1★→2★→3★ when 9 copies', () => {
    const s = st();
    for (let i = 0; i < 9; i++) Board.add(s, 6);
    const n = Board.mergeAll(s);
    expect(n).toBe(4); // 3+1 first round, then 1 more (3 of 2★... wait 9→3 merges →3×2★; 3×2★→1 merge = 4 total)
    expect(s.units).toHaveLength(1);
    expect(s.units[0].star).toBe(3);
  });

  it('MAX_STAR units do not merge further', () => {
    const s = st();
    for (let i = 0; i < 3; i++) {
      const u = Board.add(s, 6);
      u.star = 3;
    }
    expect(Board.mergeAll(s)).toBe(0);
    expect(s.units).toHaveLength(3);
  });

  it('mergeCandidates needs ≥3', () => {
    const s = st();
    Board.add(s, 25); Board.add(s, 25);
    expect(Board.mergeCandidates(s)).toHaveLength(0);
    Board.add(s, 25);
    expect(Board.mergeCandidates(s)).toHaveLength(1);
  });

  it('merged unit carries items from all 3 (cap 3)', () => {
    const s = st();
    const a = Board.add(s, 25); a.items = ['x'];
    const b = Board.add(s, 25); b.items = ['y'];
    const c = Board.add(s, 25); c.items = ['z', 'w'];
    Board.applyMerge(s, Board.mergeCandidates(s)[0]);
    expect(s.units[0].items).toEqual(['x', 'y', 'z']);
  });
});

describe('placed (synergy view)', () => {
  it('returns board units with types from pokedex', () => {
    const s = st();
    const a = Board.add(s, 4); // charmander fire
    Board.place(s, a, 1, 0, 8);
    Board.add(s, 7); // bench — excluded
    const p = Board.placed(s);
    expect(p).toHaveLength(1);
    expect(p[0].dex).toBe(4);
    expect(p[0].types).toContain('fire');
  });
});
