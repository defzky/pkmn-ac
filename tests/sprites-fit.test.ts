/** Fase I: encaje de sprite sin recortes (Sprites.fitDraw) para celdas/TD. */
import { describe, it, expect, beforeAll } from 'vitest';

let Sprites: any;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/sprites-meta.js');
  ({ Sprites } = await import('../src/core/sprites.ts'));
});

const STANCE = ['Idle', 'Walk', 'Charge', 'Hurt', 'Shoot', 'Faint'];
const stanceBox = (dex: string) => {
  let wmax = 0, hmax = 0;
  for (const a of STANCE) {
    const m = Sprites.animMeta(dex, a);
    if (m) { wmax = Math.max(wmax, m.w); hmax = Math.max(hmax, m.h); }
  }
  return { wmax, hmax };
};

describe('Sprites.fitDraw', () => {
  it('k ≤ prefer; whole stance box inside 96×96 canvas (no crop)', () => {
    for (const dex of ['1', '25', '484', '799']) {
      const f = Sprites.fitDraw(dex, 96, 96, 4.4);
      expect(f.k).toBeLessThanOrEqual(4.4);
      expect(f.fx).toBe(48);
      const { wmax, hmax } = stanceBox(dex);
      expect(wmax * f.k).toBeLessThanOrEqual(96 * 0.94 + 1e-6);
      expect(hmax * f.k).toBeLessThanOrEqual(96 * 0.92 + 1e-6);
      // feet anchor: top/bottom of box within canvas (fy = holgura/2 + up·k)
      for (const a of STANCE) {
        const m = Sprites.animMeta(dex, a);
        if (!m) continue;
        expect(f.fy - m.ay * f.k).toBeGreaterThanOrEqual(-1e-6);
        expect(f.fy + (m.h - m.ay) * f.k).toBeLessThanOrEqual(96 + 1e-6);
      }
    }
  });

  it('wide dex 799 (stance frames 128px) shrinks below 1 — would crop at k≥1', () => {
    const { wmax } = stanceBox('799');
    expect(wmax).toBe(128);
    const f = Sprites.fitDraw('799', 96, 96, 4.4);
    expect(f.k).toBeLessThan(1);
    expect(wmax * f.k).toBeLessThanOrEqual(96 * 0.94 + 1e-6);
  });

  it('tall dex 484 (stance frames 152px) fits height budget (92%)', () => {
    const { hmax } = stanceBox('484');
    expect(hmax).toBe(152);
    const f = Sprites.fitDraw('484', 96, 96, 4.4);
    expect(hmax * f.k).toBeLessThanOrEqual(96 * 0.92 + 1e-6);
  });

  it('mid dex 25 keeps float fit (1.38) — no size-destroying floor', () => {
    const { hmax } = stanceBox('25');
    const fit = (96 * 0.92) / hmax; // 88.32/64 = 1.38
    expect(fit).toBeGreaterThan(1);
    const f = Sprites.fitDraw('25', 96, 96, 4.4);
    expect(f.k).toBeCloseTo(fit, 5);
  });

  it('integer prefer passes through (crisp floor when exact)', () => {
    expect(Sprites.fitDraw('1', 96, 96, 1).k).toBe(1);
  });
});
