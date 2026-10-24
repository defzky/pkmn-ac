/**
 * P18 tests — wave-runner phase machine (dual-board, no path):
 * prep → combat; player heart 45, enemy heart 20; round win = damage foe,
 * round loss (team wipe / empty board) = damage player; buff pick every 3rd wave.
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
function godUnit(x = 1, y = 1) {
  return {
    dex: 1, star: 1, hp: 9999, hpCur: 9999,
    atk: 1e6, spd: 2, range: 99, atkCd: 0.01,
    move: null as any, x, y, cd: 0, alive: true,
    bonusAtk: 0, bonusHp: 0,
  };
}

describe('economy (D2c — interest/streak/wave bonus)', () => {
  it('start gold 5, wave bonus scales 2 + floor(w/2)', () => {
    expect(WR.START_GOLD).toBe(5);
    expect(WR.waveBonus(1)).toBe(2);
    expect(WR.waveBonus(2)).toBe(3);
    expect(WR.waveBonus(10)).toBe(7);
    expect(WR.waveBonus(20)).toBe(12);
  });
  it('createRun: wave 1, prep 25s (buy window), gold 5, player 45, enemy 20', () => {
    const st = WR.createRun();
    expect(WR.PREP_SECONDS).toBe(25);
    expect(st.wave).toBe(1);
    expect(st.phase).toBe('prep');
    expect(st.prepLeft).toBe(WR.PREP_SECONDS);
    expect(st.gold).toBe(5);
    expect(st.base.hp).toBe(45);
    expect(st.foe.hp).toBe(20);
    expect(st.kills).toBe(0);
    expect(st.buffs).toMatchObject({ atkMul: 1, hpMul: 1, asMul: 1 });
  });
});

describe('FOE_SLOTS / startCombat', () => {
  it('9 enemy slots front-first (y −1 … −3)', () => {
    expect(WR.FOE_SLOTS).toHaveLength(9);
    expect(WR.FOE_SLOTS[0]).toEqual({ x: 0, y: -1 });
    expect(WR.FOE_SLOTS[2]).toEqual({ x: 2, y: -1 });
    expect(WR.FOE_SLOTS[8]).toEqual({ x: 2, y: -3 });
  });
  it('rolls composition into spawn queue (capped to MAX_FIELD)', () => {
    const st = WR.createRun();
    WR.startCombat(st);
    expect(st.phase).toBe('combat');
    const wave1 = (globalThis as any).G.WaveDef.compose(1);
    expect(st.spawnQ.length).toBe(wave1.mobs.length);
    expect(st.spawnQ.length).toBe(3); // 3 + floor(1/2)
    // high wave capped at 9 (wave 13 rolls 9; boss waves 5/10/15/20 are single-boss)
    const st2 = WR.createRun();
    st2.wave = 13;
    WR.startCombat(st2);
    expect(st2.spawnQ.length).toBe(WR.MAX_FIELD);
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
  it('spawns queue gradually into fixed front slot (cx/cy)', () => {
    const st = WR.createRun();
    WR.startCombat(st);
    WR.tick(st, [], 0.1); // one spawn at t=0, next at 0.4
    expect(st.mobs.length).toBe(1);
    expect(st.mobs[0].cx).toBe(0);
    expect(st.mobs[0].cy).toBe(-1);
    expect(st.spawnQ.length).toBe(2);
  });
  it('wave 1 cleared → +2 bonus, foe heart −(1+survivors), wave 2 prep (15s)', () => {
    const st = WR.createRun();
    WR.startCombat(st);
    const u = godUnit();
    const g0 = st.gold;
    const foe0 = st.foe.hp;
    let guard = 0;
    while (st.phase === 'combat' && guard++ < 600) WR.tick(st, [u], 0.1);
    expect(st.phase).toBe('prep');
    expect(st.wave).toBe(2);
    expect(st.prepLeft).toBe(15); // D2c: wave 2+ = 15s
    expect(st.gold).toBeGreaterThanOrEqual(g0 + 2); // +2 bonus + random coin drops
    expect(st.kills).toBe(3);
    expect(st.foe.hp).toBe(foe0 - (1 + 1)); // 1 survivor
  });
  it('round win with 2 survivors → foe −3', () => {
    const st = WR.createRun();
    WR.startCombat(st);
    const a = godUnit(0, 1), b = godUnit(2, 1);
    const foe0 = st.foe.hp;
    let guard = 0;
    while (st.phase === 'combat' && guard++ < 600) WR.tick(st, [a, b], 0.1);
    expect(st.phase).not.toBe('combat');
    expect(st.foe.hp).toBe(foe0 - 3);
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
  it('empty board → wipe each wave → player heart drains → eventually lost', () => {
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
  it('team wipe round loss: base −(LOSS_DMG + floor(wave/4))', () => {
    const st = WR.createRun();
    st.wave = 4;
    st.phase = 'combat';
    st.spawnQ = [];
    st.mobs = [{
      dex: 150, hp: 10, maxHp: 10, atk: 1, spd: 3, types: ['grass'], star: 3,
      boss: false, progress: 0, alive: true, bounty: 10, cx: 1, cy: -1,
      statuses: [], shred: 0, shredT: 0,
    }];
    const dead = godUnit();
    dead.alive = false;
    const before = st.base.hp;
    const changed = WR.tick(st, [dead], 0.1);
    expect(changed).toBe(true);
    expect(st.base.hp).toBe(before - (WR.LOSS_DMG + 1)); // floor(4/4)=1
    expect(st.phase).toBe('prep');
    expect(st.wave).toBe(5);
  });
  it('player heart at 0 on loss → phase lost', () => {
    const st = WR.createRun();
    st.base.hp = 1;
    st.phase = 'combat';
    st.spawnQ = [];
    st.mobs = [];
    const dead = godUnit();
    dead.alive = false;
    expect(WR.tick(st, [dead], 0.1)).toBe(true);
    expect(st.phase).toBe('lost');
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
  it('final wave (10) cleared → won (D2c)', () => {
    const st = WR.createRun();
    st.wave = 10;
    st.phase = 'combat';
    st.spawnQ = [];
    st.mobs = [];
    WR.tick(st, [godUnit()], 0.1); // clear with nothing alive
    expect(st.phase).toBe('won');
    expect(st.wave).toBe(10);
    expect(st.gold).toBe(5 + WR.waveBonus(10)); // interest 0 + streak 1 → no bonus yet
  });
  it('endless: final wave cleared past MAX_WAVE keeps playing', () => {
    const st = WR.createRun();
    st.wave = 10;
    st.endless = true;
    st.phase = 'combat';
    st.spawnQ = [];
    st.mobs = [];
    WR.tick(st, [godUnit()], 0.1);
    expect(st.phase).toBe('prep');
    expect(st.wave).toBe(11);
  });
  it('foe heart at 0 on win → phase won', () => {
    const st = WR.createRun();
    st.foe.hp = 1;
    st.phase = 'combat';
    st.spawnQ = [];
    st.mobs = [];
    WR.tick(st, [godUnit()], 0.1);
    expect(st.phase).toBe('won');
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

describe('D2a respawn at prep (dual)', () => {
  it('dead unit respawns full HP on prep tick', () => {
    const st = WR.createRun();
    const u = godUnit();
    u.alive = false; u.hpCur = 0;
    WR.tick(st, [u], 0.1); // phase prep
    expect(u.alive).toBe(true);
    expect(u.hpCur).toBe(u.hp);
  });
});
