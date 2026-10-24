/* star evolution tests: evoDex map, stats/types/name follow evo, identity stays base */
import { describe, it, expect, beforeAll } from 'vitest';

let Evo: any, UnitStats: any, Board: any, Shop: any, Champions: any;

const CHAMPS: Array<[number, number, number]> = [
  [1, 2, 3], [4, 5, 6], [7, 8, 9], [16, 17, 18],
  [63, 64, 65], [66, 67, 68], [92, 93, 94], [147, 148, 149],
  [179, 180, 181], [220, 221, 473], [280, 281, 282], [304, 305, 306],
];

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/sprites-meta.js');
  await import('../src/data/moves.ts');
  ({ Evo } = await import('../src/autochess/evo.ts'));
  ({ UnitStats } = await import('../src/autochess/unit-stats.ts'));
  ({ Board } = await import('../src/autochess/board.ts'));
  ({ Shop } = await import('../src/autochess/shop.ts'));
  ({ Champions } = await import('../src/autochess/champions.ts'));
});

describe('evoDex', () => {
  it('maps all 12 champion lines (star2/star3)', () => {
    for (const [b, s2, s3] of CHAMPS) {
      expect(Evo.evoDex(b, 2), `${b} ★2`).toBe(s2);
      expect(Evo.evoDex(b, 3), `${b} ★3`).toBe(s3);
      expect(Evo.evoDex(b, 1), `${b} ★1`).toBe(b);
    }
  });

  it('220 Swinub: ★3 = 473 Mamoswine (4-stage-chain pick)', () => {
    expect(Evo.evoDex(220, 3)).toBe(473);
  });

  it('non-evo mon stays base at any star', () => {
    expect(Evo.evoDex(128, 2)).toBe(128); // Tauros
    expect(Evo.evoDex(128, 3)).toBe(128);
  });

  it('evoEntry resolves pokedex entry of evolved form', () => {
    expect(Evo.evoEntry(4, 3).name).toBe('Charizard');
    expect(Evo.evoEntry(4, 1).name).toBe('Charmander');
  });
});

describe('boardStats follows evolution', () => {
  it('types change at ★3 (Charmander fire → Charizard fire+flying)', () => {
    expect(UnitStats.boardStats(4, 1).types).toEqual(['fire']);
    expect(UnitStats.boardStats(4, 3).types).toEqual(['fire', 'flying']);
  });

  it('name follows evolution form', () => {
    expect(UnitStats.boardStats(1, 2).name).toBe('Ivysaur');
    expect(UnitStats.boardStats(1, 3).name).toBe('Venusaur');
  });

  it('base stats use evo entry × star multiplier', () => {
    const DEX_BY = (globalThis as any).G.DEX_BY;
    const base = UnitStats.boardStats(1, 3);
    const venusaur = DEX_BY[3];
    expect(base.hp).toBe(Math.round(venusaur.hp * 3.5));
    expect(base.atk).toBe(Math.round(venusaur.atk * 3.5 * 40));
  });

  it('champion identity stays base: move, sell price', () => {
    const move1 = UnitStats.boardStats(1, 1).move;
    expect(UnitStats.boardStats(1, 3).move).toBe(move1);
    expect(Shop.sellPrice(1, 3)).toBe(3 * Shop.effectiveCost(1));
    expect(Champions.skillOf(1)).toBeTruthy();
    expect(Champions.skillOf(1)).not.toBe('none');
  });
});

describe('placed() synergy uses evolution types', () => {
  it('★3 Charizard counts fire + flying', () => {
    const st = { units: [] as any[] };
    const u = Board.add(st, 4, 1);
    u.x = 1; u.y = 1;
    expect(Board.placed(st)[0].types).toEqual(['fire']);
    u.star = 3;
    expect(Board.placed(st)[0].types).toEqual(['fire', 'flying']);
  });
});
