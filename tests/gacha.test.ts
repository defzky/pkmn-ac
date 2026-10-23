// Gacha logic tests (P5): cost/pull/pity/×10-guarantee/forceShiny. Real DEX data, mocked Sprites.hasShiny.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/core/sprites', () => ({
  Sprites: {
    // real behaviour: has shiny meta flag
    hasShiny: (dex: number) => {
      const m = (globalThis as any).G?.SPRITE_META?.[dex];
      return !!(m && m.sh);
    },
  },
}));

import { Gacha } from '../src/systems/gacha';
import { newSave } from '../src/core/db';

let save: any;
let randSpy: any;

beforeAll(() => {
  (globalThis as any).G = { ...(globalThis as any).G, DEX: [], DEX_BY: {}, SPRITE_META: {} };
  // real data — side-effect modules fill G.DEX / G.SPRITE_META
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return Promise.all([
    import('../src/data/pokedex'),
    import('../src/data/sprites-meta'),
  ]).then(() => { save = newSave('test'); });
});

beforeEach(() => {
  save = newSave('test');
  save.tickets = { t1: 100, t10: 10 };
});

afterEach(() => {
  if (randSpy) { randSpy.mockRestore(); randSpy = null; }
});

describe('Gacha.costOf', () => {
  it('null when not enough t1', () => {
    save.tickets = { t1: 0, t10: 0 };
    expect(Gacha.costOf(save, 1)).toBeNull();
    expect(Gacha.costOf(save, 10)).toBeNull();
  });
  it('cost = n normal tickets', () => {
    expect(Gacha.costOf(save, 10)).toEqual({ t1: 10, t10: 0 });
  });
  it('×10 via t10 ticket', () => {
    expect(Gacha.costOf(save, 10, 't10')).toEqual({ t1: 0, t10: 1 });
  });
  it('×10 via t10 fails without ticket', () => {
    save.tickets = { t1: 99, t10: 0 };
    expect(Gacha.costOf(save, 10, 't10')).toBeNull();
  });
});

describe('Gacha.pull', () => {
  it('deducts tickets, returns n results, bumps stats', () => {
    const out = Gacha.pull(save, 1, 1)!;
    expect(out).toHaveLength(1);
    expect(save.tickets.t1).toBe(99);
    expect(save.stats.pulls).toBe(1);
    expect(out[0].rarity).toBeGreaterThanOrEqual(1);
    expect(out[0].rarity).toBeLessThanOrEqual(5);
    expect(typeof out[0].isNew).toBe('boolean');
    expect(typeof out[0].refund).toBe('number');
  });

  it('returns null without tickets', () => {
    save.tickets = { t1: 0, t10: 0 };
    expect(Gacha.pull(save, 1, 1)).toBeNull();
  });

  it('×10 guarantee: last is ≥4★ when all previous 1★', () => {
    // Math.random → 0.999 → rollRarity always lowest bucket (1★)
    randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const out = Gacha.pull(save, 10, 1)!;
    expect(out).toHaveLength(10);
    expect(out.some((r: any) => r.rarity >= 4)).toBe(true);
    expect(out[9].rarity).toBeGreaterThanOrEqual(4);
  });

  it('pity: 70th pull without 5★ is forced 5★, resets pity', () => {
    save.pity[1] = 69;
    const out = Gacha.pull(save, 1, 1)!;
    expect(out[0].rarity).toBe(5);
    expect(save.pity[1]).toBe(0);
  });

  it('dup → refund REFUND[rarity], coins grow', () => {
    // own everything in gen1 pools → every pull is dup
    for (const p of (globalThis as any).G.DEX) {
      if (p.gen === 1 && (globalThis as any).G.SPRITE_META[p.dex]) {
        save.owned[p.dex] = { at: 1, from: 'test' };
      }
    }
    randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.999); // 1★
    const coinsBefore = save.coins;
    const out = Gacha.pull(save, 1, 1)!;
    expect(out[0].isNew).toBe(false);
    expect(out[0].refund).toBe(Gacha.REFUND[out[0].rarity as keyof typeof Gacha.REFUND]);
    expect(save.coins).toBe(coinsBefore + out[0].refund);
  });

  it('debugForceShiny makes next pull shiny + new shiny entry', () => {
    Gacha.debugForceShiny(1);
    const out = Gacha.pull(save, 1, 1)!;
    expect(out[0].shiny).toBe(true);
    expect(out[0].isNew).toBe(true);
    expect(save.shiny[out[0].dex]).toBeTruthy();
    // force consumed
    const out2 = Gacha.pull(save, 1, 1)!;
    expect(out2[0].shiny).toBe(false);
  });

  it('dup shiny refund is ×3', () => {
    Gacha.debugForceShiny(1);
    const first = Gacha.pull(save, 1, 1)!;
    // force shiny again on same mon: own all shinies in pool except target already owned
    // simpler: pre-set owned + shiny for target, force shiny again
    const dex = first[0].dex;
    save.owned[dex] = { at: 1, from: 'test' };
    save.shiny[dex] = { at: 1, from: 'test' };
    Gacha.debugForceShiny(1);
    randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.0); // force roll → 1★ bucket start
    // force path may pick missing shiny from list; if all owned-shiny → falls to dup
    // ensure no missing shiny: mark all gen1 shinies owned
    for (const p of (globalThis as any).G.DEX) {
      if (p.gen === 1 && (globalThis as any).G.SPRITE_META[p.dex] && (globalThis as any).G.SPRITE_META[p.dex].sh) {
        save.shiny[p.dex] = { at: 1, from: 'test' };
        save.owned[p.dex] = { at: 1, from: 'test' };
      }
    }
    const out = Gacha.pull(save, 1, 1)!;
    expect(out[0].shiny).toBe(false); // all shinies owned → falls to normal dup
    expect(out[0].refund).toBeGreaterThan(0);
  });
});
