/**
 * P14 tests — wave-runner phase machine, income, spawn, reward, leak, win/lose.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

let WR: any;

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

describe('income', () => {
  it('base = 5 + floor(w/3)', () => {
    expect(WR.income(1, 0)).toBe(5);
    expect(WR.income(3, 0)).toBe(6);
    expect(WR.income(9, 0)).toBe(8);
  });
  it('interest floor(g/10) cap 5, none below 10', () => {
    expect(WR.income(1, 9)).toBe(5);
    expect(WR.income(1, 50)).toBe(10);
    expect(WR.income(1, 999)).toBe(10); // cap 5 interest
  });
});

describe('createRun', () => {
  it('wave 1, prep, gold 20, base 100', () => {
    const st = WR.createRun();
    expect(st.wave).toBe(1);
    expect(st.phase).toBe('prep');
    expect(st.prepLeft).toBe(WR.PREP_SECONDS);
    expect(st.gold).toBe(20);
    expect(st.base.hp).toBe(100);
    expect(st.kills).toBe(0);
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
    st.phase = 'reward';
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
  it('god unit clears wave → reward, kills counted, gold bounty added', () => {
    const st = WR.createRun();
    WR.startCombat(st);
    const u = godUnit();
    const g0 = st.gold;
    let guard = 0;
    while (st.phase === 'combat' && guard++ < 600) WR.tick(st, [u], 0.1);
    expect(st.phase).toBe('reward');
    expect(st.kills).toBe(3);
    expect(st.gold).toBeGreaterThan(g0); // bounty ≥ 1+1 per mob
  });
  it('no units → mobs leak → base hp drops → eventually lost', () => {
    const st = WR.createRun();
    WR.forceStart(st);
    let guard = 0;
    while (st.phase !== 'lost' && guard++ < 6000) {
      WR.tick(st, [], 0.5);
      if (st.phase === 'reward') WR.claimReward(st); // waves keep coming
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
      boss: true, progress: 99, alive: true, bounty: 30,
    }];
    WR.tick(st, [], 0.1);
    expect(st.base.hp).toBe(80);
  });
});

describe('claimReward', () => {
  it('adds income, wave++ back to prep', () => {
    const st = WR.createRun();
    WR.startCombat(st);
    st.phase = 'reward'; // skip combat
    const g0 = st.gold;
    const gain = WR.claimReward(st);
    expect(gain).toBe(WR.income(1, g0));
    expect(st.gold).toBe(g0 + gain);
    expect(st.wave).toBe(2);
    expect(st.phase).toBe('prep');
  });
  it('final wave → won', () => {
    const st = WR.createRun();
    st.wave = 30;
    st.phase = 'reward';
    WR.claimReward(st);
    expect(st.phase).toBe('won');
    expect(st.wave).toBe(30);
  });
  it('ignored outside reward', () => {
    const st = WR.createRun();
    expect(WR.claimReward(st)).toBe(0);
  });
});

describe('forceStart', () => {
  it('prep → combat immediately', () => {
    const st = WR.createRun();
    WR.forceStart(st);
    expect(st.phase).toBe('combat');
  });
});
