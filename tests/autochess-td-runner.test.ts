/**
 * TD runner tests — path walk + leak + win/lose:
 * prep → combat; base 100; mobs walk pathThroughBoard; leak = base damage (5/20);
 * round win = all dead + wave bonus; game won = wave 20; game lost = base 0.
 */
import { describe, it, expect, beforeAll } from 'vitest';

let WRTD: any;
let Path: any;
let Base: any;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/moves.ts');
  await import('../src/data/types.ts');
  const pathMod = await import('../src/autochess/path.ts');
  Path = pathMod.default;
  await import('../src/autochess/unit-stats.ts');
  await import('../src/autochess/wave.ts');
  await import('../src/autochess/synergy.ts');
  const baseMod = await import('../src/autochess/base.ts');
  Base = baseMod.default;
  await import('../src/autochess/unit.ts');
  await import('../src/autochess/unitAI.ts');
  const mod = await import('../src/autochess/wave-runner-td.ts');
  WRTD = mod.default;
});

/** hand-built strong unit that one-shots everything */
function godUnit(x = 1, y = 1) {
  return {
    dex: 1, star: 1, hp: 9999, hpCur: 9999,
    atk: 1e6, spd: 2, range: 99, atkCd: 0.01,
    move: null as any, x, y, cd: 0, alive: true,
    bonusAtk: 0, bonusHp: 0,
  };
}

describe('path through board (TD)', () => {
  it('serpentine: spawn top-center → base bottom-right, walks 9 board cells', () => {
    const cells = Path.pathThroughBoard();
    expect(cells.length).toBe(10); // spawn + 8 board + base (rasterized joins)
    expect(cells[0]).toEqual({ x: 1, y: -1 }); // spawn
    expect(cells[cells.length - 1]).toEqual({ x: 2, y: 3 }); // base
    // all board cells 0..2 unique except spawn/base outside
    const board = cells.filter((c: any) => c.x >= 0 && c.x < 3 && c.y >= 0 && c.y < 3);
    expect(board.length).toBe(8); // (0,0) skipped
    const xs = new Set(board.map((c: any) => `${c.x},${c.y}`));
    expect(xs.size).toBe(8);
    expect(xs.has('0,0')).toBe(false); // free anchor cell
  });
  it('contiguous (each step ±1 in x or y)', () => {
    const cells = Path.pathThroughBoard();
    for (let i = 1; i < cells.length; i++) {
      const dx = Math.abs(cells[i].x - cells[i - 1].x);
      const dy = Math.abs(cells[i].y - cells[i - 1].y);
      expect(dx + dy).toBe(1);
    }
  });
});

describe('createRun / economy', () => {
  it('base 100, no foe heart, start gold 5, prep 30', () => {
    const st = WRTD.createRun();
    expect(WRTD.TD_BASE_HP).toBe(100);
    expect(st.base.hp).toBe(100);
    expect(st.base.maxHp).toBe(100);
    expect((st as any).foe).toBeUndefined(); // no foe heart in TD
    expect(st.gold).toBe(5);
    expect(st.prepLeft).toBe(30);
    expect(st.wave).toBe(1);
    expect(st.phase).toBe('prep');
    expect(st.kills).toBe(0);
    expect(st.buffs).toEqual({ atkMul: 1, hpMul: 1, asMul: 1 });
  });
});

describe('startCombat', () => {
  it('rolls composition into spawn queue', () => {
    const st = WRTD.createRun();
    WRTD.startCombat(st);
    expect(st.phase).toBe('combat');
    const wave1 = (globalThis as any).G.WaveDef.compose(1);
    expect(st.spawnQ.length).toBe(wave1.mobs.length);
  });
  it('ignored outside prep', () => {
    const st = WRTD.createRun();
    st.phase = 'buff';
    WRTD.startCombat(st);
    expect(st.phase).toBe('buff');
  });
});

describe('combat: walk + leak', () => {
  it('spawned mobs have no cx/cy (walking) and progress increases', () => {
    const st = WRTD.createRun();
    WRTD.startCombat(st);
    WRTD.tick(st, [], 1); // spawn first mob (spawnT starts 0) + walk dt=1
    expect(st.mobs.length).toBeGreaterThan(0);
    const m = st.mobs[0];
    expect(m.cx).toBeUndefined();
    expect(m.cy).toBeUndefined();
    expect(m.progress).toBeGreaterThan(0); // already walked during first tick
    // advance time — progress keeps increasing
    const p = m.progress;
    WRTD.tick(st, [], 0.5);
    expect(m.progress).toBeGreaterThan(p);
  });

  it('leak at path end → base damage (normal 5); boss leak 20', () => {
    const st = WRTD.createRun();
    WRTD.startCombat(st);
    WRTD.tick(st, [], 1);
    const m = st.mobs[0] as any;
    // force walk to end
    m.progress = 999;
    const hpBefore = st.base.hp;
    WRTD.tick(st, [], 0.1);
    expect(st.base.hp).toBe(hpBefore - Base.LEAK_NORMAL);
    expect(m.alive).toBe(false);
  });

  it('boss leak costs more', () => {
    const st = WRTD.createRun();
    WRTD.startCombat(st);
    st.spawnQ = []; // no more spawns
    st.mobs = [{
      dex: 144, hp: 100, maxHp: 100, atk: 1, spd: 1, types: [], star: 3, boss: true,
      progress: 999, alive: true, bounty: 10,
      armor: 0, shield: 0, dodge: 0, regen: 0, barrier: 0,
      stunImmune: true, slowImmune: true, kbImmune: true,
      rest: false, rested: false, restT: 0, roar: false, roarCd: 10,
      disable: false, disT: 8, statuses: [], shred: 0, shredT: 0,
    }];
    const hpBefore = st.base.hp;
    WRTD.tick(st, [], 0.1);
    expect(st.base.hp).toBe(hpBefore - Base.LEAK_BOSS);
  });

  it('base hp 0 → lost', () => {
    const st = WRTD.createRun();
    WRTD.startCombat(st);
    st.spawnQ = [];
    st.base.hp = 4; // below normal leak (5)
    st.mobs = [{
      dex: 19, hp: 100, maxHp: 100, atk: 1, spd: 1, types: [], star: 1, boss: false,
      progress: 999, alive: true, bounty: 0,
      armor: 0, shield: 0, dodge: 0, regen: 0, barrier: 0,
      stunImmune: false, slowImmune: false, kbImmune: false,
      rest: false, rested: false, restT: 0, roar: false, roarCd: 10,
      disable: false, disT: 8, statuses: [], shred: 0, shredT: 0,
    }];
    WRTD.tick(st, [], 0.1);
    expect(st.base.hp).toBe(0);
    expect(st.phase).toBe('lost');
  });
});

describe('round win / game win', () => {
  it('all mobs dead → round won: +3 gold, advance wave (or buff every 3)', () => {
    const st = WRTD.createRun();
    st.wave = 1;
    WRTD.startCombat(st);
    // kill all instantly with god unit
    const god = godUnit(1, 1);
    WRTD.tick(st, [god], 1); // spawn + fight
    // force-clear remaining
    for (const m of st.mobs) m.alive = false;
    st.spawnQ = [];
    const goldBefore = st.gold;
    const changed = WRTD.tick(st, [god], 0.01);
    expect(changed).toBe(true);
    expect(st.gold).toBe(goldBefore + WRTD.waveBonus(1)); // wave 1 → 3
    expect(st.wave).toBe(2);
    expect(st.phase).toBe('prep');
  });

  it('wave 3 clear → buff phase (every 3)', () => {
    const st = WRTD.createRun();
    st.wave = 3;
    WRTD.startCombat(st);
    st.spawnQ = [];
    for (const m of st.mobs) m.alive = false;
    const god = godUnit();
    WRTD.tick(st, [god], 0.01);
    expect(st.phase).toBe('buff');
  });

  it('wave 20 clear → won', () => {
    const st = WRTD.createRun();
    st.wave = 20;
    WRTD.startCombat(st);
    st.spawnQ = [];
    for (const m of st.mobs) m.alive = false;
    const god = godUnit();
    WRTD.tick(st, [god], 0.01);
    expect(st.phase).toBe('won');
  });

  it('pickBuff: applies and advances', () => {
    const st = WRTD.createRun();
    st.phase = 'buff';
    st.wave = 3;
    const buff = { id: 'test', name: 'T', desc: '', apply: (s: any) => { s.gold += 7; } };
    const ok = WRTD.pickBuff(st, buff as any);
    expect(ok).toBe(true);
    expect(st.gold).toBe(12); // 5 + 7
    expect(st.wave).toBe(4);
    expect(st.phase).toBe('prep');
  });

  it('forceStart: prep → combat', () => {
    const st = WRTD.createRun();
    WRTD.forceStart(st);
    expect(st.phase).toBe('combat');
  });
});
