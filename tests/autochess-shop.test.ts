/**
 * P15 tests — shop: wave-banded cost odds, buy/sell/reroll gold clamp, bench full, merge-2 stars.
 * GDD Bagian 5: odds band by wave, sell = star-based refund (★1 full, ★2 2c−1, ★3 3c).
 */
import { describe, it, expect, beforeAll } from 'vitest';

let Shop: any;
let Board: any;
let Champions: any;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/moves.ts');
  await import('../src/data/types.ts');
  await import('../src/autochess/path.ts');
  await import('../src/autochess/unit-stats.ts');
  await import('../src/autochess/champions.ts');
  await import('../src/autochess/synergy.ts');
  await import('../src/autochess/board.ts');
  Shop = (await import('../src/autochess/shop.ts')).default;
  Board = (await import('../src/autochess/board.ts')).default;
  Champions = (await import('../src/autochess/champions.ts')).default;
});

const seeded = (seq: number[]) => () => seq.shift() ?? 0.5;

describe('rollCost — wave-banded odds (GDD Bagian 5)', () => {
  it('bands: w1-4 80/20/0/0, w5-9 55/30/15/0, w10-14 35/35/25/5, w15+ 20/30/35/15', () => {
    expect(Champions.costWeights(1)).toEqual([[1, 80], [2, 20], [3, 0], [4, 0]]);
    expect(Champions.costWeights(4)).toEqual([[1, 80], [2, 20], [3, 0], [4, 0]]);
    expect(Champions.costWeights(5)).toEqual([[1, 55], [2, 30], [3, 15], [4, 0]]);
    expect(Champions.costWeights(9)).toEqual([[1, 55], [2, 30], [3, 15], [4, 0]]);
    expect(Champions.costWeights(10)).toEqual([[1, 35], [2, 35], [3, 25], [4, 5]]);
    expect(Champions.costWeights(15)).toEqual([[1, 20], [2, 30], [3, 35], [4, 15]]);
    expect(Champions.costWeights(20)).toEqual([[1, 20], [2, 30], [3, 35], [4, 15]]);
  });
  it('wave 1: 0.001 → 1g, 0.85 → 2g, never 3/4 cost', () => {
    expect(Shop.rollCost(1, seeded([0.001]))).toBe(1);
    expect(Shop.rollCost(1, seeded([0.85]))).toBe(2);
    expect(Shop.rollCost(1, seeded([0.99]))).toBe(2); // 80/20 → max 2 cost
  });
  it('wave 6: 0.6 → 2g, 0.9 → 3g, 4g never (band 55/30/15/0)', () => {
    expect(Shop.rollCost(6, seeded([0.6]))).toBe(2);
    expect(Shop.rollCost(6, seeded([0.9]))).toBe(3);
    expect(Shop.rollCost(6, seeded([0.999]))).toBe(3);
  });
  it('wave 20: 0.5 → 3g, 0.95 → 4g', () => {
    expect(Shop.rollCost(20, seeded([0.5]))).toBe(3);
    expect(Shop.rollCost(20, seeded([0.95]))).toBe(4);
  });
});

describe('createShop', () => {
  it('3 slots, star 1, unplaced, all champions, wave-1 odds only', () => {
    const shop = Shop.createShop(1);
    expect(shop.slots.length).toBe(3);
    for (const s of shop.slots) {
      if (!s) continue;
      expect(s.star).toBe(1);
      expect(s.x).toBeNull();
      expect(s.bench).toBeNull();
      expect(Champions.isChampion(s.dex)).toBe(true);
      expect(Champions.costOf(s.dex)).toBeLessThanOrEqual(2); // w1 band
    }
  });
  it('cost within band', () => {
    const shop = Shop.createShop(15);
    for (const s of shop.slots) {
      if (!s) continue;
      const c = Shop.slotCost(s);
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(4);
    }
  });
});

describe('buy / gold clamp', () => {
  it('deducts champion cost, slot consumed, unit placed on board (no bench)', () => {
    const shop = Shop.createShop(1);
    const board = { units: [] };
    const idx = shop.slots.findIndex((s: any) => s);
    const cost = Shop.slotCost(shop.slots[idx]);
    expect(cost).toBeGreaterThanOrEqual(1);
    const r = Shop.buy(shop, idx, board, 100);
    expect(r.ok).toBe(true);
    expect(r.gold).toBe(100 - cost);
    expect(shop.slots[idx]).toBeNull();
    expect(board.units.length).toBe(1);
    expect(board.units[0].bench).toBeNull();
    expect(board.units[0].x).not.toBeNull();
    expect(board.units[0].y).not.toBeNull();
  });
  it('insufficient gold → refuse, slot kept', () => {
    const shop = Shop.createShop(1);
    const board = { units: [] };
    // force a 4-cost slot (Dratini 147)
    shop.slots[0] = { dex: 147, star: 1, x: null, y: null, bench: null };
    expect(Shop.slotCost(shop.slots[0])).toBe(4);
    const r = Shop.buy(shop, 0, board, 1);
    expect(r.ok).toBe(false);
    expect(r.gold).toBe(1);
    expect(shop.slots[0]).not.toBeNull();
  });
  it('board full → refuse, gold untouched', () => {
    const shop = Shop.createShop(1);
    const board = { units: [] };
    // fill entire 3×3 grid (9 cells) — no unit cap, grid is the limit
    for (let i = 0; i < 9; i++) board.units.push({ dex: 999 + i, star: 1, x: i % 3, y: Math.floor(i / 3), bench: null });
    const idx = shop.slots.findIndex((s: any) => s);
    const r = Shop.buy(shop, idx, board, 100);
    expect(r.ok).toBe(false);
    expect(r.gold).toBe(100);
  });
});

describe('buyMerge — consume slot without placing (merge-drop)', () => {
  it('deducts gold + consumes slot, NO unit added (works with full board)', () => {
    const shop = Shop.createShop(1);
    const board = { units: [] };
    for (let i = 0; i < 9; i++) board.units.push({ dex: 999 + i, star: 1, x: i % 3, y: Math.floor(i / 3), bench: null });
    const idx = shop.slots.findIndex((s: any) => s);
    const cost = Shop.slotCost(shop.slots[idx]);
    const r = Shop.buyMerge(shop, idx, 100);
    expect(r.ok).toBe(true);
    expect(r.gold).toBe(100 - cost);
    expect(shop.slots[idx]).toBeNull();
    expect(r.slot).toBeTruthy();
    expect(r.slot!.dex).toBeTruthy();
    expect(board.units.length).toBe(9); // untouched — merge caller supplies the temp unit
  });
  it('insufficient gold → refuse, slot kept, gold untouched', () => {
    const shop = Shop.createShop(1);
    shop.slots[0] = { dex: 147, star: 1, x: null, y: null, bench: null }; // 4-cost
    const r = Shop.buyMerge(shop, 0, 1);
    expect(r.ok).toBe(false);
    expect(r.gold).toBe(1);
    expect(r.slot).toBeNull();
    expect(shop.slots[0]).not.toBeNull();
  });
});

describe('merge-2 stars (same-cell drop only)', () => {
  it('buying 2 same champs → 2 units in different cells (NO auto-merge)', () => {
    const board = { units: [] };
    Board.add(board, 25, 1);
    Board.add(board, 25, 1);
    expect(board.units.length).toBe(2);
    expect(board.units.every((u: any) => u.star === 1)).toBe(true);
  });
  it('buy dup → then drop onto existing → ★2 (merge trigger = tryMergeAt)', () => {
    const board = { units: [] };
    const first = Board.add(board, 1, 1);
    const shop = { slots: [{ dex: 1, star: 1, x: null, y: null, bench: null }, null, null] };
    const r = Shop.buy(shop, 0, board, 100);
    expect(r.ok).toBe(true);
    expect(board.units.length).toBe(2); // both on board, ★1
    const second = board.units.find((u: any) => u !== first)!;
    expect(Board.tryMergeAt(board, second, first.x as number, first.y as number)).toBe(true);
    expect(board.units.length).toBe(1);
    expect(board.units[0].star).toBe(2);
  });
  it('drop sequence to ★3 works', () => {
    const s: any = { units: [] };
    const a = Board.add(s, 4, 2); // ★2 at first free cell
    Board.add(s, 4, 2);
    const second = s.units[1];
    expect(Board.tryMergeAt(s, second, a.x as number, a.y as number)).toBe(true);
    expect(s.units.length).toBe(1);
    expect(s.units[0].star).toBe(3);
  });
});

describe('reroll', () => {
  it('costs 1g', () => {
    const shop = Shop.createShop(1);
    const r = Shop.reroll(shop, 10, 1);
    expect(r.ok).toBe(true);
    expect(r.gold).toBe(9);
    expect(shop.slots.length).toBe(3);
  });
  it('refuse below 1g', () => {
    const shop = Shop.createShop(1);
    const r = Shop.reroll(shop, 0, 1);
    expect(r.ok).toBe(false);
    expect(r.gold).toBe(0);
  });
});

describe('sell — star refund (GDD Bagian 5)', () => {
  it('★1 = full cost', () => {
    expect(Shop.sellPrice(1)).toBe(1); // Bulbasaur cost 1
    expect(Shop.sellPrice(1, 1)).toBe(1);
    expect(Shop.sellPrice(147, 1)).toBe(4); // Dratini cost 4
  });
  it('★2 = 2c−1, ★3 = 3c', () => {
    expect(Shop.sellPrice(1, 2)).toBe(1); // 2*1-1
    expect(Shop.sellPrice(147, 2)).toBe(7); // 2*4-1
    expect(Shop.sellPrice(147, 3)).toBe(12); // 3*4
    expect(Shop.sellPrice(1, 3)).toBe(3);
  });
  it('sell uses unit star: ★1 full refund, unit removed', () => {
    const board = { units: [] };
    const u = Board.add(board, 147, 1); // Dratini cost 4
    const g = Shop.sell(board, u, 0);
    expect(g).toBe(4);
    expect(board.units.length).toBe(0);
  });
  it('sell ★2 unit refunds 2c−1', () => {
    const board = { units: [] };
    const u = Board.add(board, 147, 2);
    const g = Shop.sell(board, u, 0);
    expect(g).toBe(7);
    expect(board.units.length).toBe(0);
  });
});

describe('D2d shop bias', () => {
  it('rollSlot bias hit: 15% re-pick within same tier picks biased dex', async () => {
    const { poolByCost } = await import('../src/autochess/champions.ts');
    const pool = poolByCost(1);
    const dex = pool[0].dex;
    const seq = [0.01, 0.1, 0.0]; // cost1 roll, bias hit (<0.15), index 0
    const rnd = () => seq.shift() ?? 0.99;
    const slot = Shop.rollSlot(5, rnd as any, [dex]);
    expect(slot).toBeTruthy();
    expect(slot!.dex).toBe(dex);
  });

  it('rollSlot bias miss (>0.15): normal pick path still valid', async () => {
    const { poolByCost } = await import('../src/autochess/champions.ts');
    const pool = poolByCost(1);
    const seq = [0.01, 0.5, 0.0]; // bias roll 0.5 → miss
    const rnd = () => seq.shift() ?? 0.99;
    const slot = Shop.rollSlot(5, rnd as any, [pool[pool.length - 1].dex]);
    expect(slot).toBeTruthy();
  });
});
