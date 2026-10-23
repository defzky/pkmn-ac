/**
 * shop.ts — autochess shop: 5 slots, reroll 2g, buy → bench → auto-merge stars.
 *
 * P15. Pool odds reuse Gacha.RATES (1:45, 2:30, 3:17, 4:6.5, 5:1.5).
 * Unit cost = rarity × 2 (unit-stats.unitCost); sell = ceil(cost/2).
 * Gold lives on caller (RunState) — functions return updated gold.
 */
import { register } from '../core/registry';
import { Gacha } from '../systems/gacha';
import { Board, type BoardState, type BoardUnit } from './board';
import { unitCost, sellPrice } from './unit-stats';

export const SHOP_SIZE = 5;
export const REROLL_COST = 2;

export interface ShopState {
  slots: Array<BoardUnit | null>;
}

/** weighted rarity pick from Gacha.RATES (weights sum 100) */
export function rollRarity(rnd: () => number = Math.random): number {
  const rates = Gacha.RATES as Array<[number, number]>;
  let roll = rnd() * 100;
  for (const [r, w] of rates) {
    roll -= w;
    if (roll < 0) return r;
  }
  return rates[rates.length - 1][0];
}

/** random dex of given rarity from G.DEX (legs allowed, like banners) */
function pickDex(rarity: number, rnd: () => number): number | null {
  const pool: any[] = ((G as any).DEX || []).filter(
    (e: any) => e && e.rarity === rarity
  );
  if (!pool.length) return null;
  return pool[Math.floor(rnd() * pool.length)].dex;
}

/** one fresh unit card (star 1, unplaced) */
export function rollSlot(rnd: () => number = Math.random): BoardUnit | null {
  for (let tries = 0; tries < 6; tries++) {
    const dex = pickDex(rollRarity(rnd), rnd);
    if (dex !== null) return { dex, star: 1, x: null, y: null, bench: null };
  }
  // rarity pool miss fallback: any dex
  const all: any[] = (G as any).DEX || [];
  if (!all.length) return null;
  const e = all[Math.floor(rnd() * all.length)];
  return { dex: e.dex, star: 1, x: null, y: null, bench: null };
}

export function createShop(rnd: () => number = Math.random): ShopState {
  const slots: Array<BoardUnit | null> = [];
  for (let i = 0; i < SHOP_SIZE; i++) slots.push(rollSlot(rnd));
  return { slots };
}

/** reroll all slots for 2g — ok=false leaves gold untouched */
export function reroll(shop: ShopState, gold: number, rnd: () => number = Math.random): { ok: boolean; gold: number } {
  if (gold < REROLL_COST) return { ok: false, gold };
  const slots: Array<BoardUnit | null> = [];
  for (let i = 0; i < SHOP_SIZE; i++) slots.push(rollSlot(rnd));
  shop.slots = slots;
  return { ok: true, gold: gold - REROLL_COST };
}

export function slotCost(slot: BoardUnit | null): number {
  if (!slot) return 0;
  return unitCost(rarityOf(slot.dex));
}

function rarityOf(dex: number): number {
  const e = ((G as any).DEX_BY || {})[dex];
  return e && typeof e.rarity === 'number' ? e.rarity : 1;
}

/**
 * buy slot → board bench (auto-merges stars). slot consumed on success.
 * ok=false: insufficient gold (slot kept) or bench full (gold untouched).
 */
export function buy(
  shop: ShopState,
  idx: number,
  board: BoardState,
  gold: number
): { ok: boolean; gold: number; merged: number } {
  const slot = shop.slots[idx];
  if (!slot) return { ok: false, gold, merged: 0 };
  const cost = unitCost(rarityOf(slot.dex));
  if (gold < cost) return { ok: false, gold, merged: 0 };
  const u = Board.add(board, slot.dex, slot.star);
  if (!u) return { ok: false, gold, merged: 0 }; // bench full 9
  shop.slots[idx] = null; // consumed
  const merged = Board.mergeAll(board);
  return { ok: true, gold: gold - cost, merged };
}

/** sell board/bench unit at half cost */
export function sell(board: BoardState, unit: BoardUnit, gold: number): number {
  const g = gold + sellPrice(rarityOf(unit.dex));
  Board.remove(board, unit);
  return g;
}

const Shop = {
  SHOP_SIZE,
  REROLL_COST,
  createShop,
  rollRarity,
  rollSlot,
  reroll,
  buy,
  sell,
  slotCost,
};
register('ShopAC', Shop);
export { Shop };
export default Shop;
