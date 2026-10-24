/* Move FX planner: kind → visual mode / fan counts (no canvas needed). */
import { describe, it, expect, beforeAll } from 'vitest';

let planMoveFx: any;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  ({ planMoveFx } = await import('../src/autochess/move-fx.ts'));
});

describe('move-fx plan', () => {
  it('razor leaf is a two-piece spinning boomerang', () => {
    const p = planMoveFx({ kind: 'boomerang', count: 2, spread: 0.5, speed: 330 });
    expect(p.mode).toBe('boomerang');
    expect(p.count).toBe(2);
    expect(p.spread).toBe(0.5);
    expect(p.speed).toBeGreaterThan(100);
  });

  it('projectile keeps count but clamps absurd fan size', () => {
    expect(planMoveFx({ kind: 'projectile', count: 1 }).count).toBe(1);
    expect(planMoveFx({ kind: 'projectile', count: 99 }).count).toBe(6);
  });

  it('cone fans multiple shots', () => {
    const p = planMoveFx({ kind: 'cone' });
    expect(p.mode).toBe('cone');
    expect(p.count).toBe(4);
    expect(p.spread).toBeGreaterThan(0);
  });

  it('non-projectile kinds map to their own visual mode', () => {
    expect(planMoveFx({ kind: 'beam' }).mode).toBe('beam');
    expect(planMoveFx({ kind: 'melee' }).mode).toBe('slash');
    expect(planMoveFx({ kind: 'dash' }).mode).toBe('slash');
    expect(planMoveFx({ kind: 'nova' }).mode).toBe('radial');
    expect(planMoveFx({ kind: 'aura' }).mode).toBe('aura');
    expect(planMoveFx({ kind: 'buff' }).mode).toBe('charge');
    expect(planMoveFx({ kind: 'trail' }).mode).toBe('trail');
    expect(planMoveFx({ kind: 'meteor' }).mode).toBe('meteor');
    expect(planMoveFx({ kind: 'mine' }).mode).toBe('mine');
    expect(planMoveFx({ kind: 'chain' }).mode).toBe('chain');
    expect(planMoveFx({ kind: 'orbit' }).mode).toBe('orbit');
  });

  it('unknown kind falls back to slash', () => {
    expect(planMoveFx({ kind: 'nope' }).mode).toBe('slash');
    expect(planMoveFx(null).mode).toBe('slash');
  });
});
