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
  it('leak normal −6, boss −15 (D2c)', () => {
    const b = Base.create(100);
    expect(Base.leak(b, false)).toBe(false);
    expect(b.hp).toBe(94);
    expect(Base.leak(b, true)).toBe(false);
    expect(b.hp).toBe(79);
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
  // ring branch 0 (Path.laneCells): prog0 (1,-1) 1 (0,-1) 2 (-1,-1) 3 (-1,0)
  //                                 4 (-1,1) 5 (-1,2) 6 (-1,3) 7 (0,3) 8 (1,3)
  it('unit kills mob in range → gold += bounty', () => {
    const u = unitAt(6, 0, 1); // dex6 ranged (3), edge rock
    const m = mob({ progress: 4, hp: 1 }); // moves to 4.1 → cell (-1,1): dist 1 from (0,1)
    u.atk = 100; u.atkCd = 0.5;
    const r = UnitAI.tick([u], [m], 0.1, undefined, Path.laneCells());
    expect(m.alive).toBe(false);
    expect(r.kills).toBe(1);
    expect(r.gold).toBe(2);
  });

  it('out of range → no attack, mob advances', () => {
    const u = unitAt(66, 0, 0); // machop melee range 2, corner rock
    const m = mob({ progress: 5, spd: 1 }); // → 6 → cell (-1,3), dist max(1,3)=3 > 2
    const r = UnitAI.tick([u], [m], 1.0, undefined, Path.laneCells());
    expect(m.alive).toBe(true);
    expect(r.kills).toBe(0);
    expect(m.progress).toBe(6);
  });

  it('ranged unit (range 3) hits further', () => {
    const DEX: any[] = (globalThis as any).G.DEX;
    const spec = DEX.find((e: any) => (e.sa ?? 0) > (e.pa ?? 0) + 0.1 && !e.leg);
    expect(spec).toBeTruthy();
    const u = unitAt(spec.dex, 2, 0);
    expect(u.range).toBe(3);
    const m = mob({ progress: 1, hp: 1 });
    u.atk = 999;
    const r = UnitAI.tick([u], [m], 0.05, undefined, Path.laneCells());
    // unit (2,0) vs mob cell (0,-1): dist max(2,1) = 2 ≤ range 3
    expect(r.kills).toBe(1);
  });

  it('targets frontmost mob (terdepan = max progress), not nearest cell', () => {
    const u = unitAt(6, 2, 0); // ranged range 3
    const back = mob({ progress: 1, hp: 999 });  // cell (0,-1) dist 2
    const front = mob({ progress: 5, hp: 1 });   // cell (-1,2) dist 3 — farther but LEADING
    u.atk = 999; u.atkCd = 0.5;
    const r = UnitAI.tick([u], [back, front], 0.01, undefined, Path.laneCells());
    expect(r.kills).toBe(1);
    expect(front.alive).toBe(false); // front minion dies first
    expect(back.alive).toBe(true);
  });

  it('attack sets swing to dungeon move anim name (string)', () => {
    const u = unitAt(6, 2, 0);
    const m = mob({ progress: 1, hp: 1 });
    u.atk = 999; u.atkCd = 0.5;
    UnitAI.tick([u], [m], 0.01, undefined, Path.laneCells());
    expect(typeof u.swing).toBe('string');
    expect(['Attack', 'Shoot', 'Charge', 'Walk']).toContain(u.swing);
    expect(u.hit).toEqual({ x: 0, y: -1, dmg: expect.any(Number), eff: null }); // impact cell (1,-1)→(0,-1)
  });

  it('Bulbasaur attack uses Razor Leaf projectile flags', () => {
    const u = unitAt(1, 0, 1);
    expect(u.move).toBe('razor-leaf');
    expect((globalThis as any).G.Moves.BY_ID[u.move].kind).toBe('boomerang');
    const m = mob({ progress: 4.5, hp: 1 });
    u.atk = 999; u.atkCd = 0.5;
    UnitAI.tick([u], [m], 0.01, undefined, Path.laneCells());
    expect(u.swing).toBe('Shoot');
    expect(u.hit).toEqual({ x: -1, y: 1, dmg: expect.any(Number), eff: 'weak' }); // razor leaf (grass) vs flying → 0.5
  });

  it('hit.eff = type effectiveness (super / weak → dmgText color)', () => {
    const u = unitAt(6, 0, 1); // charmander, fire move, range 3 → mob cell (1,-1)
    expect((globalThis as any).G.Moves.BY_ID[u.move]?.type).toBe('fire');
    u.atk = 5; u.atkCd = 0.5;
    const grassMob = mob({ progress: 0, hp: 9999, types: ['grass'] });
    UnitAI.tick([u], [grassMob], 0.01, undefined, Path.laneCells());
    expect(u.hit?.eff).toBe('super'); // fire > grass → #ffe14d

    const u2 = unitAt(6, 0, 1);
    u2.atk = 5; u2.atkCd = 0.5;
    const fireMob = mob({ progress: 0, hp: 9999, types: ['fire'] });
    UnitAI.tick([u2], [fireMob], 0.01, undefined, Path.laneCells());
    expect(u2.hit?.eff).toBe('weak'); // fire vs fire → #a3abb8
  });

  it('attack sets facing angle toward mob cell (west → π)', () => {
    const u = unitAt(6, 0, 1);
    const m = mob({ progress: 4.5, hp: 1 }); // cell (-1,1), directly west of (0,1)
    u.atk = 999; u.atkCd = 0.5;
    UnitAI.tick([u], [m], 0.01, undefined, Path.laneCells());
    expect(typeof u.face).toBe('number');
    expect(u.face).toBeCloseTo(Math.PI, 5); // atan2(0, -1)
  });

  it('cooldown gates attack rate', () => {
    const u = unitAt(6, 0, 1);
    u.atk = 1; u.atkCd = 1.0; u.cd = 0;
    const m = mob({ progress: 4, hp: 1000 }); // cell (-1,1), dist 1
    UnitAI.tick([u], [m], 0.3, undefined, Path.laneCells());
    expect(u.cd).toBeGreaterThan(0); // on cooldown
    const hpAfter1 = m.hp;
    UnitAI.tick([u], [m], 0.3, undefined, Path.laneCells());
    expect(m.hp).toBe(hpAfter1); // no second hit yet
  });

  it('mob leak at path end', () => {
    const m = mob({ progress: 6.5, spd: 2 }); // → 8.5 ≥ length-1 (8)
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
    const u = unitAt(6, 0, 1);
    u.atk = 1; u.atkCd = 1.0;
    const mods = { atkSpdMul: 2, rangeAdd: 0, bountyMul: 1, typeBoostMul: 1,
      atkMul: 1, baseHpMul: 1, dmgReduce: 0, lifesteal: 0, thorns: 0, critAdd: 0, slowOnHit: 0 };
    const m = mob({ progress: 4, hp: 1000 });
    UnitAI.tick([u], [m], 0.05, mods as any, Path.laneCells());
    expect(u.cd).toBeCloseTo(0.5); // 1.0 / 2
  });

  it('type effectiveness applies (fire move vs grass mob)', () => {
    const u = unitAt(6, 0, 1); // charmander, fire move likely
    u.atk = 10;
    const move = u.move;
    const moveType = (globalThis as any).G.Moves.BY_ID[move]?.type;
    if (moveType === 'fire') {
      const m = mob({ progress: 4, hp: 1000, types: ['grass'] });
      UnitAI.tick([u], [m], 0.05, undefined, Path.laneCells());
      // fire vs grass = 1.6 softened → dmg > 10
      expect(m.hp).toBeLessThan(1000 - 10 + 0.01);
    }
  });

  it('full resolve: 1 unit vs 3 mobs over time', () => {
    const u = unitAt(6, 0, 0);
    u.atk = 30; u.atkCd = 0.5;
    const mobs = [mob({ progress: 1, hp: 40 }), mob({ progress: 1.2, hp: 40 }), mob({ progress: 1.4, hp: 40 })];
    let t = 0, r: any;
    while (t < 10 && !UnitAI.over(mobs)) {
      r = UnitAI.tick([u], mobs, 0.1, undefined, Path.laneCells());
      t += 0.1;
    }
    expect(UnitAI.over(mobs)).toBe(true);
    expect(r.kills).toBeGreaterThanOrEqual(1);
    expect(t).toBeLessThan(10);
  });

  it('branch-aware: mob on right branch resolves its own cells', () => {
    // right branch prog 1 → (2,-1); unit at (2,0) melee dist 1
    const u = unitAt(6, 2, 0);
    u.atk = 100; u.atkCd = 0.5;
    const m = mob({ progress: 1, hp: 1, branch: 1 });
    const r = UnitAI.tick([u], [m], 0.1, undefined, Path.laneCells()); // fallback = left branch
    expect(r.kills).toBe(1);
  });
});

describe('dual-board mobs (cx/cy — P18)', () => {
  it('cx mob never walks and never leaks', () => {
    const m = mob({ progress: 0, spd: 3, cx: 1, cy: -1 });
    const r = UnitAI.tick([], [m], 2.0, undefined, Path.laneCells());
    expect(m.progress).toBe(0);
    expect(m.alive).toBe(true);
    expect(r.leaks).toHaveLength(0);
  });

  it('fixed cell targeting: unit hits front-row mob at (1,-1)', () => {
    const u = unitAt(6, 1, 1);
    u.atk = 999; u.atkCd = 0.5;
    const m = mob({ hp: 1, cx: 1, cy: -1 });
    const r = UnitAI.tick([u], [m], 0.05, undefined, []);
    expect(r.kills).toBe(1);
    expect(u.hit).toEqual({ x: 1, y: -1, dmg: expect.any(Number), eff: null });
  });

  it('targeting prefers front row (cy −1) over back row (cy −3)', () => {
    const u = unitAt(6, 1, 1); // range 3 covers back row (tdist 3)
    u.atk = 999; u.atkCd = 0.5;
    const front = mob({ hp: 1, cx: 1, cy: -1 });
    const back = mob({ hp: 999, cx: 1, cy: -3 });
    const r = UnitAI.tick([u], [front, back], 0.01, undefined, []);
    expect(r.kills).toBe(1);
    expect(front.alive).toBe(false);
    expect(back.alive).toBe(true);
  });

  it('tdist: front-to-front 0, back rows compressed vs plain Chebyshev', () => {
    expect(UnitAI.tdist(1, 2, 1, -1)).toBe(0); // player front ↔ enemy front
    expect(UnitAI.tdist(1, 2, 1, -2)).toBe(1);
    expect(UnitAI.tdist(1, 2, 1, -3)).toBe(2);
    expect(UnitAI.tdist(0, 0, 2, -1)).toBe(2); // dx 2 dominates
    expect(UnitAI.tdist(0, 0, 2, 1)).toBe(2);  // same-board = plain Chebyshev
  });

  it('back-row mob out of melee range 2, in ranged range 3', () => {
    const u = unitAt(66, 1, 1); // machop melee range 2
    u.atk = 999; u.atkCd = 0.5;
    const m = mob({ hp: 1, cx: 1, cy: -3 }); // tdist 3
    const r = UnitAI.tick([u], [m], 0.05, undefined, []);
    expect(r.kills).toBe(0);
    expect(m.alive).toBe(true);
  });
});

describe('statuses / roles / skills (GDD)', () => {
  it('burn DoT ticks hp down over time', () => {
    const m = mob({ hp: 100 });
    UnitAI.addBurn(m, 'burn', 2, 10); // 10 dps
    UnitAI.tick([], [m], 1.0, undefined, Path.laneCells());
    expect(m.hp).toBeLessThan(100);
  });
  it('stun halts movement', () => {
    const m = mob({ progress: 1, spd: 2 });
    UnitAI.addStun(m, 2);
    const p0 = m.progress;
    UnitAI.tick([], [m], 0.5, undefined, Path.laneCells());
    expect(m.progress).toBe(p0);
  });
  it('slow-immune mob ignores slow', () => {
    const m: any = mob({ progress: 1, spd: 2, slowImmune: true });
    UnitAI.addSlow(m, 2, 0.9);
    const p0 = m.progress;
    UnitAI.tick([], [m], 0.5, undefined, Path.laneCells());
    expect(m.progress).toBeGreaterThan(p0); // moved full speed
  });
  it('stun-immune mob ignores stun', () => {
    const m: any = mob({ progress: 1, spd: 2, stunImmune: true });
    UnitAI.addStun(m, 2);
    const p0 = m.progress;
    UnitAI.tick([], [m], 0.5, undefined, Path.laneCells());
    expect(m.progress).toBeGreaterThan(p0);
  });
  it('armor reduces direct attack damage', () => {
    const u = unitAt(6, 0, 1);
    u.atk = 100; u.atkCd = 0.5;
    const armored: any = mob({ progress: 4, hp: 10000, armor: 0.4 }); // cell (-1,1), dist 1
    UnitAI.tick([u], [armored], 0.05, undefined, Path.laneCells());
    expect(armored.hp).toBeGreaterThan(10000 - 100); // reduced by 40%
    expect(armored.hp).toBeLessThan(10000);
  });
  it('shield absorbs before hp', () => {
    const u = unitAt(6, 0, 1);
    u.atk = 50; u.atkCd = 0.5;
    const sh: any = mob({ progress: 4, hp: 100, shield: 200 });
    UnitAI.tick([u], [sh], 0.05, undefined, Path.laneCells());
    expect(sh.hp).toBe(100); // hp untouched
    expect(sh.shield).toBeLessThan(200); // shield took hit
  });
  it('unit gains mana per attack; full mana casts skill', () => {
    const u = unitAt(1, 0, 1); // bulbasaur poisonDoT, edge rock
    u.atk = 10; u.atkCd = 0.2; u.mana = 95;
    const m = mob({ progress: 4, hp: 10000 });
    UnitAI.tick([u], [m], 0.05, undefined, Path.laneCells());
    // cast consumed mana → reset to 0, poison applied
    expect(u.mana).toBeLessThan(100);
    expect(m.statuses.length).toBeGreaterThan(0);
  });
  it('squirtle knockback pushes mob back', () => {
    const u = unitAt(7, 0, 1); // squirtle knockback
    u.atk = 10; u.atkCd = 0.2; u.mana = 100;
    const m = mob({ progress: 4, hp: 10000 });
    UnitAI.tick([u], [m], 0.05, undefined, Path.laneCells());
    expect(m.progress).toBeLessThan(3); // pushed back ~2 cells from 4
  });
  it('kb-immune (graveler) resists knockback', () => {
    const u = unitAt(7, 0, 1);
    u.atk = 10; u.atkCd = 0.2; u.mana = 100;
    const m: any = mob({ progress: 4, hp: 10000, kbImmune: true });
    UnitAI.tick([u], [m], 0.05, undefined, Path.laneCells());
    expect(m.progress).toBeGreaterThanOrEqual(4 - 0.05); // only moved forward
  });
  it('snorlax rest: at 50% halts then heals 20%', () => {
    const m: any = mob({ progress: 1, spd: 2, maxHp: 1000, rest: true });
    m.hp = 499; m.rested = false; m.restT = 0;
    UnitAI.tick([], [m], 0.1, undefined, Path.laneCells()); // triggers rest
    expect(m.rested).toBe(true);
    const p = m.progress;
    UnitAI.tick([], [m], 0.5, undefined, Path.laneCells()); // still resting
    expect(m.progress).toBe(p); // halted
    UnitAI.tick([], [m], 2.0, undefined, Path.laneCells()); // rest ends + heal
    expect(m.hp).toBeGreaterThan(499);
  });
});

describe('mobs fight back (D2a — Pilar 1)', () => {
  it('dual slot-war: front-row mob damages front unit (tdist 0), arms atkT', () => {
    const u = unitAt(25, 1, 2); // player front row
    const m = mob({ cx: 1, cy: -1, atk: 10 }); // enemy front row
    const before = u.hpCur;
    UnitAI.tick([u], [m], 0.5);
    expect(u.hpCur).toBeLessThan(before);
    expect(u.alive).toBe(true);
    expect(m.atkT).toBeGreaterThan(0); // cooldown armed after the hit
  });
  it('dual slot-war: falls back to back rows (y0, tdist 2 ≤ 3)', () => {
    const u = unitAt(25, 1, 0); // player back row
    const m = mob({ cx: 1, cy: -1, atk: 10 });
    const before = u.hpCur;
    UnitAI.tick([u], [m], 0.5);
    expect(u.hpCur).toBeLessThan(before);
  });
  it('TD runner lane (branch 0): chips 50% while walking, never stops', () => {
    const u = unitAt(25, 0, 1);
    const m: any = mob({ branch: 0, progress: 0, spd: 2, atk: 10 });
    const before = u.hpCur;
    UnitAI.tick([u], [m], 0.5, undefined, Path.laneCells());
    expect(m.progress).toBeGreaterThan(0); // still walking
    expect(m.stopT || 0).toBe(0);
    // chip = atk × 0.5 × dt × typeMult(normal vs electric=1) ≈ 2.5
    expect(before - u.hpCur).toBeGreaterThan(0);
    expect(before - u.hpCur).toBeLessThan(4);
  });
  it('TD bulwark lane (branch 1): stop & fight, progress held while halted', () => {
    const u = unitAt(25, 2, 1);
    const m: any = mob({ branch: 1, progress: 4, spd: 1, atk: 10, hp: 10000 }); // cell (3,1), unit (2,1) → dist 1
    const before = u.hpCur;
    UnitAI.tick([u], [m], 0.06, undefined, Path.laneCells());
    expect(m.stopT).toBeGreaterThan(0); // engaged
    expect(u.hpCur).toBeLessThan(before); // first hit (atkT starts 0)
    const p = m.progress;
    UnitAI.tick([u], [m], 0.06, undefined, Path.laneCells());
    expect(m.progress).toBe(p); // halted inside stop cap
  });
  it('TD bulwark anti-stall: walks on after STOP_CAP even in range', () => {
    const u = unitAt(25, 2, 1);
    const m: any = mob({ branch: 1, progress: 4, spd: 1, atk: 10, stopT: 1.95, hp: 10000 });
    UnitAI.tick([u], [m], 0.1, undefined, Path.laneCells()); // fight phase: stopT → ~2.05; movement still saw 1.95
    const p = m.progress;
    UnitAI.tick([u], [m], 0.1, undefined, Path.laneCells()); // movement now sees stopT ≥ cap → walks
    expect(m.progress).toBeGreaterThan(p); // resumed walking
  });
  it('unit death → alive=false, hpCur 0; respawnUnits restores full HP', () => {
    const u = unitAt(25, 1, 2);
    u.hpCur = 1;
    const m = mob({ cx: 1, cy: -1, atk: 50 });
    UnitAI.tick([u], [m], 0.05);
    expect(u.alive).toBe(false);
    expect(u.hpCur).toBe(0);
    UnitAI.respawnUnits([u]);
    expect(u.alive).toBe(true);
    expect(u.hpCur).toBe(u.hp);
  });
  it('stunned mob does not attack', () => {
    const u = unitAt(25, 1, 2);
    u.hpCur = 100;
    const m = mob({ cx: 1, cy: -1, atk: 50, statuses: [{ type: 'stun', t: 1 }] });
    UnitAI.tick([u], [m], 0.2);
    expect(u.hpCur).toBe(100);
  });
});

describe('D2b — flank bonus (unit.ts isFlank/isCorner + unitAI)', () => {
  it('flank cell gets +10% atk vs center cell', () => {
    const flankU = unitAt(6, 0, 1); // edge column — touches lane
    const midU = unitAt(6, 1, 1);   // center — no flank
    expect(flankU.flankAtk).toBe(true);
    expect(midU.flankAtk).toBe(false);
    flankU.atk = 100; midU.atk = 100;
    flankU.atkCd = 0; midU.atkCd = 0;
    const m1 = mob({ progress: 4, hp: 1e9, atk: 0 }); // cell (-1,1): dist1 to (0,1), dist2 to (1,1)
    const m2 = mob({ progress: 4, hp: 1e9, atk: 0 });
    UnitAI.tick([flankU], [m1], 0.01, undefined, Path.laneCells());
    UnitAI.tick([midU], [m2], 0.01, undefined, Path.laneCells());
    const dFlank = 1e9 - m1.hp, dMid = 1e9 - m2.hp;
    expect(dFlank).toBeGreaterThan(dMid);
    expect(dFlank / dMid).toBeCloseTo(1.1, 2);
  });

  it('corner cell +1 range: hits cell at chebyshev 3, edge cell does not', () => {
    const corner = unitAt(66, 2, 0); // machop melee range 2, corner → 3
    const edge = unitAt(66, 2, 1);   // edge, no corner → range 2
    expect(corner.flankRange).toBe(true);
    expect(edge.flankRange).toBe(false);
    corner.atk = 999; corner.atkCd = 0.5;
    edge.atk = 999; edge.atkCd = 0.5;
    const m1 = mob({ progress: 4, hp: 1, atk: 0 }); // cell (-1,1): dist to (2,0)=3, to (2,1)=3
    const m2 = mob({ progress: 4, hp: 1, atk: 0 });
    const r1 = UnitAI.tick([corner], [m1], 0.05, undefined, Path.laneCells());
    const r2 = UnitAI.tick([edge], [m2], 0.05, undefined, Path.laneCells());
    expect(r1.kills).toBe(1);
    expect(r2.kills).toBe(0);
    expect(m2.alive).toBe(true);
  });

  it('center cell is not flank; corners are', () => {
    expect(Unit.isFlank(1, 1)).toBe(false);
    expect(Unit.isFlank(0, 0)).toBe(true);
    expect(Unit.isFlank(2, 2)).toBe(true);
    expect(Unit.isCorner(0, 0)).toBe(true);
    expect(Unit.isCorner(0, 1)).toBe(false);
  });
});

describe('D2d elemental affix (unitAI)', () => {
  it('elemental mob: +25% attack vs unit, immune to burn/poison', () => {
    const u = unitAt(4, 1, 1); // normal type → tm 1.0 vs fire
    u.types = ['normal'];
    u.hpCur = 100;
    const m = mob({ types: ['fire'], atk: 40, affix: 'elemental' });
    UnitAI.hitUnit(m, u, 40);
    expect(u.hpCur).toBeCloseTo(100 - 40 * 1.25, 5);
    UnitAI.addBurn(m, 'burn', 2, 10);
    UnitAI.addBurn(m, 'poison', 2, 10);
    expect((m.statuses || []).length).toBe(0);
  });

  it('non-elemental mob still burns', () => {
    const m = mob({ types: ['fire'] });
    UnitAI.addBurn(m, 'burn', 2, 10);
    expect((m.statuses || []).length).toBe(1);
  });
});

describe('D2e — augment runtime effects', () => {
  it('base.leak mul: normal half = −3, boss full = −15', () => {
    const b = Base.create(60);
    Base.leak(b, false, 0.5);
    expect(b.hp).toBe(57);
    Base.leak(b, true, 1);
    expect(b.hp).toBe(42);
  });

  it('flankAtkMul from mods: Flank Master 1.25/1.1 → ratio ≈1.25', () => {
    const flankU = unitAt(6, 0, 1); flankU.atk = 100; flankU.atkCd = 0;
    const midU = unitAt(6, 1, 1); midU.atk = 100; midU.atkCd = 0;
    const mods = { flankAtkMul: 1.25 } as any;
    const m1 = mob({ progress: 4, hp: 1e9, atk: 0 });
    const m2 = mob({ progress: 4, hp: 1e9, atk: 0 });
    UnitAI.tick([flankU], [m1], 0.01, mods, Path.laneCells());
    UnitAI.tick([midU], [m2], 0.01, mods, Path.laneCells());
    expect((1e9 - m1.hp) / (1e9 - m2.hp)).toBeCloseTo(1.25, 2);
  });

  it('effCd: slipT ×1.3 vs normal', () => {
    const u = unitAt(1, 1, 1);
    const mods = { atkSpdMul: 1 } as any;
    const normal = Unit.effCd(u, mods);
    u.slipT = 3;
    expect(Unit.effCd(u, mods)).toBeCloseTo(normal / 1.3, 5);
  });

  it('second wind: dead unit with respawnT respawns full after countdown', () => {
    const u = unitAt(1, 1, 1);
    u.alive = false; u.hpCur = 0; u.respawnT = 4;
    UnitAI.tick([u], [], 2.0, undefined, []);
    expect(u.alive).toBe(false);
    UnitAI.tick([u], [], 2.0, undefined, []);
    expect(u.alive).toBe(true);
    expect(u.hpCur).toBe(u.hp);
  });

  it('frontline bond: dmgReduce 0.08 → 100 dmg becomes 92', () => {
    const u = unitAt(4, 1, 1);
    u.types = ['normal']; // tm 1.0 vs fire
    u.hpCur = 100; u.dmgReduce = 0.08;
    UnitAI.hitUnit(mob({ types: ['fire'], atk: 0 }), u, 100);
    expect(u.hpCur).toBeCloseTo(8, 5); // 100 − 100×0.92
  });
});
