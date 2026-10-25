/* Daily seed RNG (GDD common §6): determinisme per-wave/per-batch. */
import { describe, it, expect, beforeAll } from 'vitest';

let Rng: any;
beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  ({ default: Rng } = await import('../src/autochess/rng.ts'));
});

describe('daily seed rng', () => {
  it('dailyKey YYYY-MM-DD lokal, seedFromDate stabil', () => {
    const k = Rng.dailyKey(new Date(2026, 9, 25)); // bulan 0-based
    expect(k).toBe('2026-10-25');
    expect(Rng.seedFromDate(new Date(2026, 9, 25))).toBe(Rng.seedFromDate(new Date(2026, 9, 25)));
    expect(Rng.seedFromDate(new Date(2026, 9, 25))).not.toBe(Rng.seedFromDate(new Date(2026, 9, 26)));
  });

  it('mulberry32 deterministik + beda seed beda urutan', () => {
    const a1 = Rng.mulberry32(42), a2 = Rng.mulberry32(42), b = Rng.mulberry32(43);
    const s1 = [a1(), a1(), a1()], s2 = [a2(), a2(), a2()], s3 = [b(), b(), b()];
    expect(s1).toEqual(s2);
    expect(s1).not.toEqual(s3);
    expect(s1.every((v: number) => v >= 0 && v < 1)).toBe(true);
  });

  it('waveRnd: panggilan berulang = hasil sama (preview === startCombat)', () => {
    const r1 = Rng.waveRnd(7, 3), r2 = Rng.waveRnd(7, 3);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
    // beda wave → beda seri
    expect(Rng.waveRnd(7, 3)()).not.toBe(Rng.waveRnd(7, 4)());
  });

  it('shopRnd: batch n beda → beda seri', () => {
    const a = Rng.shopRnd(7, 1, 0), b = Rng.shopRnd(7, 1, 1);
    expect(a()).not.toBe(b());
    // deterministik per batch
    expect(Rng.shopRnd(7, 1, 0)()).toBe(Rng.shopRnd(7, 1, 0)());
  });
});
