/**
 * shop.ts — autochess shop: 3 cards + reroll 1g, buy → board auto-place (merge-2 only on same-cell drop).
 *
 * P15 (updated 2026-10-24): pool = 12 GDD champions (champions.ts).
 * Cost = champion cost 1–4 (wave-banded odds per GDD Bagian 5).
 * Sell = star-based full-ish refund: ★1 = cost, ★2 = 2c−1, ★3 = 3c.
 * Gold lives on caller (RunState) — functions return updated gold.
 */
import { register } from '../core/registry';
import { Board, type BoardState, type BoardUnit } from './board';
import { costWeights, costOf, poolByCost } from './champions';

export const SHOP_SIZE = 3;
export const REROLL_COST = 1;

export interface ShopState {
  slots: Array<BoardUnit | null>;
}

/** weighted cost pick from wave-banded weights (sum 100) */
export function rollCost(wave = 1, rnd: () => number = Math.random): number {
  let roll = rnd() * 100;
  for (const [c, w] of costWeights(wave)) {
    roll -= w;
    if (roll < 0) return c;
  }
  return 1;
}

/** one fresh champion card (star 1, unplaced) of rolled cost */
export function rollSlot(wave = 1, rnd: () => number = Math.random): BoardUnit | null {
  const cost = rollCost(wave, rnd);
  const pool = poolByCost(cost);
  if (!pool.length) return null;
  const e = pool[Math.floor(rnd() * pool.length)];
  return { dex: e.dex, star: 1, x: null, y: null, bench: null };
}

export function createShop(wave = 1, rnd: () => number = Math.random): ShopState {
  const slots: Array<BoardUnit | null> = [];
  for (let i = 0; i < SHOP_SIZE; i++) slots.push(rollSlot(wave, rnd));
  return { slots };
}

/** reroll all slots for 2g — ok=false leaves gold untouched */
export function reroll(
  shop: ShopState,
  gold: number,
  wave = 1,
  rnd: () => number = Math.random
): { ok: boolean; gold: number } {
  if (gold < REROLL_COST) return { ok: false, gold };
  const slots: Array<BoardUnit | null> = [];
  for (let i = 0; i < SHOP_SIZE; i++) slots.push(rollSlot(wave, rnd));
  shop.slots = slots;
  return { ok: true, gold: gold - REROLL_COST };
}

/** effective cost: champion table first; fallback rarity×2 for non-champions */
export function effectiveCost(dex: number): number {
  const c = costOf(dex);
  if (c) return c;
  const e = ((globalThis as any).G?.DEX_BY || {})[dex];
  const r = e && typeof e.rarity === 'number' ? e.rarity : 1;
  return r * 2;
}

export function slotCost(slot: BoardUnit | null): number {
  if (!slot) return 0;
  return effectiveCost(slot.dex);
}

/**
 * sell refund (GDD Bagian 5): ★1 = full cost, ★2 = 2c−1, ★3 = 3c (~75% of 4c).
 */
export function sellPrice(dex: number, star = 1): number {
  const c = effectiveCost(dex);
  if (star >= 3) return 3 * c;
  if (star === 2) return 2 * c - 1;
  return c;
}

/**
 * buy slot → first free board cell (no auto-merge: 2 same champs sit in
 * different cells until one is dropped onto the other — Board.tryMergeAt).
 * ok=false: insufficient gold or board full (gold untouched).
 */
export function buy(
  shop: ShopState,
  idx: number,
  board: BoardState,
  gold: number
): { ok: boolean; gold: number } {
  const slot = shop.slots[idx];
  if (!slot) return { ok: false, gold };
  const cost = slotCost(slot);
  if (gold < cost) return { ok: false, gold };
  const u = Board.add(board, slot.dex, slot.star);
  if (!u) return { ok: false, gold }; // board full
  shop.slots[idx] = null; // consumed
  return { ok: true, gold: gold - cost };
}

/** sell board/bench unit at star-based refund */
export function sell(board: BoardState, unit: BoardUnit, gold: number): number {
  const g = gold + sellPrice(unit.dex, unit.star);
  Board.remove(board, unit);
  return g;
}

const Shop = {
  SHOP_SIZE,
  REROLL_COST,
  createShop,
  rollCost,
  rollSlot,
  reroll,
  buy,
  sell,
  slotCost,
  sellPrice,
  effectiveCost,
};
register('ShopAC', Shop);
export { Shop };
export default Shop;
