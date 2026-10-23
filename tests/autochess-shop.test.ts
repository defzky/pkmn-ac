/**
 * P15 tests — shop: roll odds, buy/sell/reroll gold clamp, bench full, star merge.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

let Shop: any;
let Board: any;
let Gacha: any;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/moves.ts');
  await import('../src/data/types.ts');
  await import('../src/autochess/path.ts');
  await import('../src/autochess/unit-stats.ts');
  await import('../src/autochess/synergy.ts');
  await import('../src/autochess/board.ts');
  await import('../src/systems/gacha.ts');
  Shop = (await import('../src/autochess/shop.ts')).default;
  Board = (await import('../src/autochess/board.ts')).default;
  Gacha = (await import('../src/systems/gacha.ts')).default;
});

const seeded = (seq: number[]) => () => seq.shift() ?? 0.5;

describe('rollRarity', () => {
  it('uses Gacha.RATES weights', () => {
    // total 100; roll 0.001*100=0.1 → first band r1 (45)
    expect(Shop.rollRarity(seeded([0.001]))).toBe(1);
    // 0.5*100=50 → past r1(45) → r2 (30) band
    expect(Shop.rollRarity(seeded([0.5]))).toBe(2);
    // 0.99*100=99 → last band r5
    expect(Shop.rollRarity(seeded([0.99]))).toBe(5);
  });
  it('matches Gacha.RATES export', () => {
    expect(Gacha.RATES).toEqual([[1, 45], [2, 30], [3, 17], [4, 6.5], [5, 1.5]]);
  });
});

describe('createShop', () => {
  it('5 slots, star 1, unplaced', () => {
    const shop = Shop.createShop();
    expect(shop.slots.length).toBe(5);
    for (const s of shop.slots) {
      if (!s) continue;
      expect(s.star).toBe(1);
      expect(s.x).toBeNull();
      expect(s.bench).toBeNull();
    }
  });
  it('dex rarity within 1..5', () => {
    const shop = Shop.createShop();
    for (const s of shop.slots) {
      if (!s) continue;
      const r = (G as any).DEX_BY[s.dex].rarity;
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(5);
    }
  });
});

describe('buy / gold clamp', () => {
  it('deducts rarity×2, slot consumed, unit on bench', () => {
    const shop = Shop.createShop();
    const board = { units: [] };
    const idx = shop.slots.findIndex((s: any) => s);
    const cost = Shop.slotCost(shop.slots[idx]);
    expect(cost).toBeGreaterThanOrEqual(2);
    const r = Shop.buy(shop, idx, board, 100);
    expect(r.ok).toBe(true);
    expect(r.gold).toBe(100 - cost);
    expect(shop.slots[idx]).toBeNull();
    expect(board.units.length).toBe(1);
    expect(board.units[0].bench).not.toBeNull();
  });
  it('insufficient gold → refuse, slot kept', () => {
    const shop = Shop.createShop();
    const board = { units: [] };
    const idx = shop.slots.findIndex((s: any) => s && Shop.slotCost(s) > 1);
    // force high cost if cheap
    shop.slots[idx].dex = (G as any).DEX.find((e: any) => e.rarity === 5).dex;
    const r = Shop.buy(shop, idx, board, 1);
    expect(r.ok).toBe(false);
    expect(r.gold).toBe(1);
    expect(shop.slots[idx]).not.toBeNull();
  });
  it('bench full → refuse, gold untouched', () => {
    const shop = Shop.createShop();
    const board = { units: [] };
    for (let i = 0; i < 9; i++) board.units.push({ dex: 999 + i, star: 1, x: null, y: null, bench: i });
    const idx = shop.slots.findIndex((s: any) => s);
    const r = Shop.buy(shop, idx, board, 100);
    expect(r.ok).toBe(false);
    expect(r.gold).toBe(100);
  });
});

describe('star merge via buy', () => {
  it('3 same dex → 2★', () => {
    const board = { units: [] };
    const dex = 25;
    for (let i = 0; i < 3; i++) Board.add(board, dex, 1);
    const merged = Board.mergeAll(board);
    expect(merged).toBe(1);
    expect(board.units.length).toBe(1);
    expect(board.units[0].star).toBe(2);
  });
  it('shop buy of dup triggers auto-merge', () => {
    const board = { units: [] };
    Board.add(board, 1, 1);
    Board.add(board, 1, 1);
    const shop = { slots: [{ dex: 1, star: 1, x: null, y: null, bench: null }, null, null, null, null] };
    const r = Shop.buy(shop, 0, board, 100);
    expect(r.ok).toBe(true);
    expect(r.merged).toBe(1);
    expect(board.units.length).toBe(1);
    expect(board.units[0].star).toBe(2);
  });
});

describe('reroll', () => {
  it('costs 2g', () => {
    const shop = Shop.createShop();
    const r = Shop.reroll(shop, 10);
    expect(r.ok).toBe(true);
    expect(r.gold).toBe(8);
    expect(shop.slots.length).toBe(5);
  });
  it('refuse below 2g', () => {
    const shop = Shop.createShop();
    const r = Shop.reroll(shop, 1);
    expect(r.ok).toBe(false);
    expect(r.gold).toBe(1);
  });
});

describe('sell', () => {
  it('refund = ceil(cost/2), unit removed', () => {
    const board = { units: [] };
    const u = Board.add(board, 25, 1);
    const r = (G as any).DEX_BY[25].rarity;
    const g = Shop.sell(board, u, 10);
    expect(g).toBe(10 + Math.ceil((r * 2) / 2));
    expect(board.units.length).toBe(0);
  });
  it('5★ refund 5', () => {
    const board = { units: [] };
    const leg = (G as any).DEX.find((e: any) => e.rarity === 5);
    const u = Board.add(board, leg.dex, 1);
    const g = Shop.sell(board, u, 0);
    expect(g).toBe(5); // cost 10 → ceil(10/2)
  });
});
