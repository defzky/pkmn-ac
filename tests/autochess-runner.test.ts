/**
 * P14 tests — wave-runner phase machine (GDD Bagian 5):
 * start 5g, +3 per wave clear (no interest), buff pick every 3rd wave, boss leak −20.
 */
import { describe, it, expect, beforeAll } from 'vitest';

let WR: any;
let Buffs: any;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/moves.ts');
  await import('../src/data/types.ts');
  await import('../src/autochess/path.ts');
  await import('../src/autochess/unit-stats.ts');
  await import('../src/autochess/wave.ts');
  await import('../src/autochess/synergy.ts');
  await import('../src/autochess/base.ts');
  await import('../src/autochess/unit.ts');
  await import('../src/autochess/unitAI.ts');
  const mod = await import('../src/autochess/wave-runner.ts');
  WR = mod.default;
  Buffs = (await import('../src/autochess/buffs.ts')).default;
});

/** hand-built strong unit that one-shots everything */
function godUnit() {
  return {
    dex: 1, star: 1, hp: 9999, hpCur: 9999,
    atk: 1e6, spd: 2, range: 99, atkCd: 0.01,
    move: null as any, x: 1, y: 1, cd: 0, alive: true,
    bonusAtk: 0, bonusHp: 0,
  };
}

describe('economy (GDD Bagian 5)', () => {
  it('start gold 5, wave bonus 3 flat (no interest formula)', () => {
    expect(WR.START_GOLD).toBe(5);
    expect(WR.WAVE_BONUS).toBe(3);
    expect(WR.income).toBeUndefined(); // interest removed
  });
  it('createRun: wave 1, prep 30s (buy window), gold 5, base 100', () => {
    const st = WR.createRun();
    expect(WR.PREP_SECONDS).toBe(30);
    expect(st.wave).toBe(1);
    expect(st.phase).toBe('prep');
    expect(st.prepLeft).toBe(WR.PREP_SECONDS);
    expect(st.gold).toBe(5);
    expect(st.base.hp).toBe(100);
    expect(st.kills).toBe(0);
    expect(st.buffs).toEqual({ atkMul: 1, hpMul: 1, asMul: 1 });
  });
});

describe('startCombat', () => {
  it('rolls composition into spawn queue', () => {
    const st = WR.createRun();
    WR.startCombat(st);
    expect(st.phase).toBe('combat');
    const wave1 = (globalThis as any).G.WaveDef.compose(1);
    expect(st.spawnQ.length).toBe(wave1.mobs.length);
    expect(st.spawnQ.length).toBe(3); // 3 + floor(1/2)
  });
  it('ignored outside prep', () => {
    const st = WR.createRun();
    st.phase = 'buff';
    WR.startCombat(st);
    expect(st.spawnQ.length).toBe(0);
  });
});

describe('tick', () => {
  it('prep auto-starts combat at 0', () => {
    const st = WR.createRun();
    const changed = WR.tick(st, [], WR.PREP_SECONDS + 0.1);
    expect(changed).toBe(true);
    expect(st.phase).toBe('combat');
    expect(st.spawnQ.length).toBeGreaterThan(0);
  });
  it('spawns queue gradually', () => {
    const st = WR.createRun();
    WR.startCombat(st);
    WR.tick(st, [], 0.1); // one spawn at t=0, next at 0.4
    expect(st.mobs.length).toBe(1);
    expect(st.spawnQ.length).toBe(2);
  });
  it('wave 1 cleared → +3 bonus, wave 2 prep (not a buff wave)', () => {
    const st = WR.createRun();
    WR.startCombat(st);
    const u = godUnit();
    const g0 = st.gold;
    let guard = 0;
    while (st.phase === 'combat' && guard++ < 600) WR.tick(st, [u], 0.1);
    expect(st.phase).toBe('prep');
    expect(st.wave).toBe(2);
    expect(st.prepLeft).toBe(WR.PREP_SECONDS);
    expect(st.gold).toBeGreaterThanOrEqual(g0 + 3); // +3 bonus + random coin drops
    expect(st.kills).toBe(3);
  });
  it('wave 3 cleared → buff phase', () => {
    const st = WR.createRun();
    st.wave = 3;
    WR.startCombat(st);
    const u = godUnit();
    let guard = 0;
    while (st.phase === 'combat' && guard++ < 600) WR.tick(st, [u], 0.1);
    expect(st.phase).toBe('buff');
    expect(st.wave).toBe(3);
  });
  it('no units → mobs leak → base hp drops → eventually lost', () => {
    const st = WR.createRun();
    WR.forceStart(st);
    let guard = 0;
    while (st.phase !== 'lost' && guard++ < 6000) {
      WR.tick(st, [], 0.5);
      if (st.phase === 'buff') WR.pickBuff(st, Buffs.POOL[0]); // waves keep coming
      if (st.phase === 'prep') WR.forceStart(st);
    }
    expect(st.phase).toBe('lost');
    expect(st.base.hp).toBeLessThanOrEqual(0);
  });
  it('boss leak = −20', () => {
    const st = WR.createRun();
    st.phase = 'combat';
    st.spawnQ = [];
    st.mobs = [{
      dex: 150, hp: 10, atk: 1, spd: 3, types: ['grass'], star: 3,
      boss: true, progress: 99, alive: true, bounty: 10,
    }];
    WR.tick(st, [], 0.1);
    expect(st.base.hp).toBe(80);
  });
});

describe('pickBuff', () => {
  it('applies buff, advances to next wave prep', () => {
    const st = WR.createRun();
    st.wave = 3;
    st.phase = 'buff';
    const g0 = st.gold;
    const ok = WR.pickBuff(st, Buffs.POOL.find((b: any) => b.id === 'gold'));
    expect(ok).toBe(true);
    expect(st.gold).toBe(g0 + 5);
    expect(st.wave).toBe(4);
    expect(st.phase).toBe('prep');
  });
  it('attack buff mutates run buffs', () => {
    const st = WR.createRun();
    st.phase = 'buff';
    WR.pickBuff(st, Buffs.POOL.find((b: any) => b.id === 'atk'));
    expect(st.buffs.atkMul).toBeCloseTo(1.1);
  });
  it('final wave cleared → won (no buff)', () => {
    const st = WR.createRun();
    st.wave = 20;
    st.phase = 'combat';
    st.spawnQ = [];
    st.mobs = [];
    WR.tick(st, [], 0.1); // clear with nothing alive
    expect(st.phase).toBe('won');
    expect(st.wave).toBe(20);
    expect(st.gold).toBe(5 + 3); // start + bonus
  });
  it('ignored outside buff phase', () => {
    const st = WR.createRun();
    expect(WR.pickBuff(st, Buffs.POOL[0])).toBe(false);
  });
});

describe('forceStart', () => {
  it('prep → combat immediately', () => {
    const st = WR.createRun();
    WR.forceStart(st);
    expect(st.phase).toBe('combat');
  });
});
