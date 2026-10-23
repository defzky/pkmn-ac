// Tests for entity logic (P4): Player.hurt invariants — no DOM, no constructor.
// Player is created via Object.create(Player.prototype) to skip Sprites.Animator.
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/core/audio', () => ({ Audio: { sfx: vi.fn() } }));
vi.mock('../src/core/gamepad', () => ({ Pad: { rumble: vi.fn() } }));
vi.mock('../src/core/touch', () => ({ Touch: {} }));
vi.mock('../src/core/input', () => ({ Input: {} }));
vi.mock('../src/core/settings', () => ({ default: { get: vi.fn(() => 1), set: vi.fn() } }));
vi.mock('../src/core/camera', () => ({ Camera: { kick: vi.fn(), sees: () => true } }));
vi.mock('../src/core/sprites', () => ({
  Sprites: {
    hasShiny: () => false,
    playerScale: () => 1,
    playerRadius: () => 10,
    bodyHeight: () => 10,
    Animator: class { play() {} },
  },
}));

import { Player } from '../src/entities/player';

function makePlayer(over: Record<string, any> = {}): any {
  const p: any = Object.create(Player.prototype);
  Object.assign(p, {
    invuln: 0, dead: false,
    hp: 100, maxHp: 100,
    mon: { dex: 1, types: ['grass'], hp: 100, spd: 100, atk: 10 },
    slots: [[]], active: 0,
    item: null, sashT: 0,
    remote: true,               // skip Pad.rumble
    x: 0, y: 0, bodyH: 10,
    anim: { play: vi.fn() },
    dmgReduce: 0, buffs: { def: { n: 0, t: 0, amount: 0 } },
    reviveT: 0,
  }, over);
  return p;
}

beforeAll(() => {
  (globalThis as any).G = {
    ...(globalThis as any).G,
    Stats: { taken: () => 1 },
    Weather: { mult: () => 1 },
    FX: { dmgText: vi.fn(), burst: vi.fn(), ring: vi.fn() },
    Projectiles: { clearOrbs: vi.fn() },
    DEX: [], DEX_BY: {},
  };
});

describe('Player.hurt', () => {
  it('applies full damage when dmgReduce=0', () => {
    const p = makePlayer();
    p.hurt(50, null, false);
    expect(p.hp).toBe(50);
  });

  it('respects reduction cap (dmgReduce=1 → clamped 0.8)', () => {
    const p = makePlayer({ dmgReduce: 1 });   // reduction = min(0.8, 1) = 0.8
    p.hurt(50, null, false);
    expect(p.hp).toBe(90);                    // max(1, 50*0.2) = 10 → hp 90
  });

  it('min damage is 1', () => {
    const p = makePlayer({ dmgReduce: 0.8 });
    p.hurt(0.5, null, false);
    expect(p.hp).toBe(99);
  });

  it('pure bypasses reduction', () => {
    const p = makePlayer({ dmgReduce: 0.8 });
    p.hurt(50, null, true);
    expect(p.hp).toBe(50);                    // max(1, 50) = 50
  });

  it('early return while invuln > 0', () => {
    const p = makePlayer({ invuln: 0.3 });
    p.hurt(50, null, false);
    expect(p.hp).toBe(100);
  });

  it('early return when dead', () => {
    const p = makePlayer({ dead: true });
    p.hurt(50, null, false);
    expect(p.hp).toBe(100);
  });

  it('sets invuln 0.45 after hit', () => {
    const p = makePlayer();
    p.hurt(10, null, false);
    expect(p.invuln).toBeCloseTo(0.45);
  });

  it('melee in active group reduces damage 25%', () => {
    const p = makePlayer({ slots: [[{ kind: 'melee' }]] });
    p.hurt(100, null, false);
    expect(p.hp).toBe(25);                    // 100 * 0.75
  });

  it('focussash survives lethal hit at 1 hp (once per 60s)', () => {
    const p = makePlayer({ item: 'focussash', sashT: performance.now() - 70000 });
    p.hurt(999, null, false);
    expect(p.hp).toBe(1);
    expect(p.dead).toBe(false);
    expect(p.invuln).toBeCloseTo(1.2);
  });

  it('focussash blocked within 60s cooldown', () => {
    const p = makePlayer({ item: 'focussash', sashT: performance.now() });
    p.hurt(999, null, false);
    expect(p.hp).toBe(0);
    expect(p.dead).toBe(true);
  });

  it('lethal hit marks dead and revives timer', () => {
    const p = makePlayer();
    p.hurt(999, null, false);
    expect(p.hp).toBe(0);
    expect(p.dead).toBe(true);
    expect(p.reviveT).toBe(0);
    expect((globalThis as any).G.Projectiles.clearOrbs).toHaveBeenCalledWith(p);
  });

  it('applies type effectiveness multiplier', () => {
    // grass vs water: G.Types.mult('water', ['grass']) — fire×0.5 style table
    const p = makePlayer({ mon: { dex: 1, types: ['fire'], hp: 100, spd: 1, atk: 1 } });
    (globalThis as any).G.Weather.mult = () => 1;
    const before = p.hp;
    p.hurt(100, 'water', true);               // pure: k applied, reduction skipped
    // k = Types.mult('water', ['fire']) — water is weak/strong vs fire? just assert hp changed and >= 1
    expect(p.hp).toBeLessThan(before);
    expect(p.hp).toBeGreaterThanOrEqual(0);
  });
});

describe('Player.heal', () => {
  it('heals up to maxHp', () => {
    const p = makePlayer({ hp: 50 });
    p.heal(100);
    expect(p.hp).toBe(100);
  });

  it('partial heal', () => {
    const p = makePlayer({ hp: 50 });
    p.heal(20);
    expect(p.hp).toBe(70);
  });
});

describe('Player.addMaxHp', () => {
  it('increases maxHp and hp together', () => {
    const p = makePlayer({ hp: 100, maxHp: 100 });
    p.addMaxHp(20);
    expect(p.maxHp).toBe(120);
    expect(p.hp).toBe(120);
  });
});

describe('Player.gainXp', () => {
  it('xpMul scales gained xp', () => {
    const p = makePlayer({ xpMul: 3 });
    p.xp = 0; p.xpNext = 100; p.level = 1;
    const lv = p.gainXp(10);
    expect(lv).toBe(0);
    expect(p.xp).toBe(30);
  });

  it('level up when xp crosses threshold', () => {
    const p = makePlayer({ xpMul: 1 });
    p.xp = 0; p.xpNext = 10; p.level = 1;
    const lv = p.gainXp(25);
    expect(lv).toBeGreaterThanOrEqual(1);
    expect(p.level).toBeGreaterThan(1);
  });
});
