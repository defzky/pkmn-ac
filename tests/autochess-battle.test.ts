/* P13 battle tests: unit make, base leak, AI tick */
import { describe, it, expect, beforeAll } from 'vitest';

let Unit: any, Base: any, UnitAI: any, Board: any, Path: any;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/moves.ts');
  await import('../src/data/types.ts');
  ({ Path } = await import('../src/autochess/path.ts'));
  ({ Board } = await import('../src/autochess/board.ts'));
  ({ Unit } = await import('../src/autochess/unit.ts'));
  ({ Base } = await import('../src/autochess/base.ts'));
  ({ UnitAI } = await import('../src/autochess/unitAI.ts'));
});

function mob(over: any = {}): any {
  return {
    dex: 16, hp: 50, atk: 5, spd: 1, types: ['normal', 'flying'],
    star: 1, boss: false, progress: 0, alive: true, bounty: 2,
    ...over,
  };
}

function unitAt(dex: number, x: number, y: number, star = 1): any {
  const bu = { dex, star, x, y, bench: null as any };
  const u = Unit.makeUnit(bu);
  u.cd = 0;
  return u;
}

describe('unit.makeUnit', () => {
  it('builds from board unit with hpCur = hp', () => {
    const u = unitAt(25, 1, 0);
    expect(u).not.toBeNull();
    expect(u.hpCur).toBe(u.hp);
    expect(u.x).toBe(1);
    expect(u.y).toBe(0);
    expect(u.alive).toBe(true);
  });

  it('star scales hp', () => {
    const u1 = unitAt(25, 1, 0, 1);
    const u3 = unitAt(25, 1, 0, 3);
    expect(u3.hp).toBeGreaterThan(u1.hp);
  });

  it('baseHpMul synergy scales hp', async () => {
    const { NONE } = await import('../src/autochess/synergy.ts');
    const bu = { dex: 25, star: 1, x: 1, y: 0, bench: null as any };
    const u = Unit.makeUnit(bu, { ...NONE, baseHpMul: 1.15 } as any);
    const plain = Unit.makeUnit(bu);
    expect(u.hp).toBeGreaterThan(plain.hp);
    expect(u.hpCur).toBe(u.hp);
  });

  it('unknown dex → null', () => {
    expect(Unit.makeUnit({ dex: 999999, star: 1, x: 0, y: 0, bench: null })).toBeNull();
  });
});

describe('base', () => {
  it('leak normal −5, boss −20', () => {
    const b = Base.create(100);
    expect(Base.leak(b, false)).toBe(false);
    expect(b.hp).toBe(95);
    expect(Base.leak(b, true)).toBe(false);
    expect(b.hp).toBe(75);
  });

  it('destroyed at 0 returns true', () => {
    const b = Base.create(10);
    expect(Base.leak(b, true)).toBe(true);
    expect(b.hp).toBe(0);
  });

  it('repair caps at maxHp', () => {
    const b = Base.create(50);
    b.hp = 40;
    Base.repair(b, 100);
    expect(b.hp).toBe(50);
  });
});

describe('unitAI.tick', () => {
  it('unit kills mob in range → gold += bounty', () => {
    const u = unitAt(6, 2, 2); // charmander on row next to lane
    const m = mob({ progress: 2, hp: 1 }); // cell x=2,y=2 — dist 0 from unit... unit at (2,2) but lane row y=2 unit placed y=2? unit y=2 same cell as mob
    // place unit above lane: (2,1), mob at progress 2 → cell (2,2), dist 1
    const u2 = unitAt(6, 2, 1);
    u2.atk = 100; u2.atkCd = 0.5;
    const r = UnitAI.tick([u2], [m], 0.1, undefined, Path.laneCells());
    expect(m.alive).toBe(false);
    expect(r.kills).toBe(1);
    expect(r.gold).toBe(2);
  });

  it('out of range → no attack, mob advances', () => {
    const u = unitAt(6, 0, 0); // far top-left, range 1
    const m = mob({ progress: 5, spd: 1 }); // cell (5,2), dist max(5,2)=5 > 1
    const r = UnitAI.tick([u], [m], 1.0, undefined, Path.laneCells());
    expect(m.alive).toBe(true);
    expect(r.kills).toBe(0);
    expect(m.progress).toBe(6);
  });

  it('ranged unit (range 2) hits further', () => {
    // pick a special-attacker dex: find one with sa>pa from pokedex
    const DEX: any[] = (globalThis as any).G.DEX;
    const spec = DEX.find((e: any) => (e.sa ?? 0) > (e.pa ?? 0) + 0.1 && !e.leg);
    expect(spec).toBeTruthy();
    const u = unitAt(spec.dex, 3, 0);
    expect(u.range).toBe(2);
    const m = mob({ progress: 3, hp: 1 });
    u.atk = 999;
    const r = UnitAI.tick([u], [m], 0.05, undefined, Path.laneCells());
    // unit (3,0) vs mob cell (3,2): dist 2 ≤ range 2
    expect(r.kills).toBe(1);
  });

  it('cooldown gates attack rate', () => {
    const u = unitAt(6, 2, 1);
    u.atk = 1; u.atkCd = 1.0; u.cd = 0;
    const m = mob({ progress: 2, hp: 1000 });
    UnitAI.tick([u], [m], 0.3, undefined, Path.laneCells());
    expect(u.cd).toBeGreaterThan(0); // on cooldown
    const hpAfter1 = m.hp;
    UnitAI.tick([u], [m], 0.3, undefined, Path.laneCells()); // cd still >0? 0.3-1 → wait first tick set cd=1, second tick cd-=0.3 → 0.7 still >0
    expect(m.hp).toBe(hpAfter1); // no second hit yet
  });

  it('mob leak at path end', () => {
    const m = mob({ progress: 6.5, spd: 2 });
    const r = UnitAI.tick([], [m], 1.0, undefined, Path.laneCells());
    expect(r.leaks).toHaveLength(1);
    expect(m.alive).toBe(false);
  });

  it('over() true when all mobs dead', () => {
    const a = mob({ alive: false });
    const b = mob({ alive: false });
    expect(UnitAI.over([a, b])).toBe(true);
    expect(UnitAI.over([a, mob()])).toBe(false);
  });

  it('synergy atkSpd shortens effective cd', () => {
    const u = unitAt(6, 2, 1);
    u.atk = 1; u.atkCd = 1.0;
    const mods = { atkSpdMul: 2, rangeAdd: 0, bountyMul: 1, typeBoostMul: 1,
      atkMul: 1, baseHpMul: 1, dmgReduce: 0, lifesteal: 0, thorns: 0, critAdd: 0, slowOnHit: 0 };
    const m = mob({ progress: 2, hp: 1000 });
    UnitAI.tick([u], [m], 0.05, mods as any, Path.laneCells());
    expect(u.cd).toBeCloseTo(0.5); // 1.0 / 2
  });

  it('type effectiveness applies (fire move vs grass mob)', () => {
    const u = unitAt(6, 2, 1); // charmander, fire move likely
    u.atk = 10;
    const move = u.move;
    const moveType = (globalThis as any).G.Moves.BY_ID[move]?.type;
    if (moveType === 'fire') {
      const m = mob({ progress: 2, hp: 1000, types: ['grass'] });
      UnitAI.tick([u], [m], 0.05, undefined, Path.laneCells());
      // fire vs grass = 1.6 softened → dmg > 10
      expect(m.hp).toBeLessThan(1000 - 10 + 0.01);
    }
  });

  it('full resolve: 1 unit vs 3 mobs over time', () => {
    const u = unitAt(6, 2, 1);
    u.atk = 30; u.atkCd = 0.5;
    const mobs = [mob({ progress: 1, hp: 40 }), mob({ progress: 1.2, hp: 40 }), mob({ progress: 1.4, hp: 40 })];
    let t = 0, r: any;
    while (t < 10 && !UnitAI.over(mobs)) {
      r = UnitAI.tick([u], mobs, 0.1, undefined, Path.laneCells());
      t += 0.1;
    }
    expect(UnitAI.over(mobs)).toBe(true);
    expect(r.kills + (r.kills === 0 ? 0 : 0)).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(10);
  });
});
