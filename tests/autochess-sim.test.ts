/* Real-stat balance sim: 4 champs clear wave 1 (kills, no leak), center unit attacks. */
import { describe, it, expect, beforeAll } from 'vitest';
let Team: any, Board: any, WR: any, UnitStats: any, Path: any;
beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/moves.ts');
  await import('../src/data/types.ts');
  await import('../src/autochess/path.ts');
  ({ UnitStats } = await import('../src/autochess/unit-stats.ts'));
  await import('../src/autochess/synergy.ts');
  ({ Board } = await import('../src/autochess/board.ts'));
  await import('../src/autochess/unit.ts');
  await import('../src/autochess/unitAI.ts');
  ({ WaveDef: undefined });
  await import('../src/autochess/wave.ts');
  ({ Path } = await import('../src/autochess/path.ts'));
  Team = (await import('../src/autochess/team.ts')).default;
  WR = (await import('../src/autochess/wave-runner.ts')).default;
});
describe('sim', () => {
  it('wave 1: 4 champs clear without leak; center unit attacks', () => {
    const board: any = { units: [] };
    const picks = [1, 4, 7, 66]; // bulbasaur charmander squirtle machop
    const spots = [[1, 1], [0, 0], [2, 0], [0, 2]]; // center = melee (machop pa>sa)
    picks.forEach((d, i) => {
      const u = { dex: d, star: 1, x: null, y: null, bench: null };
      board.units.push(u);
      expect(Board.place(board, u, spots[i][0], spots[i][1])).toBe(true);
    });
    const units = Team.spawnUnits(board, Team.teamMods(board));
    const st = WR.createRun();
    WR.forceStart(st);
    let guard = 0;
    const killsBefore = () => st.kills;
    while (st.phase === 'combat' && guard++ < 3000) WR.tick(st, units, 0.1, Team.teamMods(board));
    console.log('phase', st.phase, 'wave', st.wave, 'kills', st.kills, 'baseHp', st.base.hp, 'gold', st.gold);
    const center = units.find((u: any) => u.x === 1 && u.y === 1); // Bulbasaur @ (1,1)
    console.log('center mana', center.mana, 'swing', center.swing, 'atk', center.atk, 'range', center.range);
    expect(st.kills).toBeGreaterThan(0);         // things actually die now
    expect(st.base.hp).toBe(45);                 // wave 1 fully cleared, no wipe (player heart full)
    expect(center.mana).toBeGreaterThan(0);      // center unit always in range → attacked
  });
});

describe('balance sim (S3)', () => {
  let WRTD: any, Buffs: any;
  beforeAll(async () => {
    ({ WaveRunnerTd: WRTD } = await import('../src/autochess/wave-runner-td.ts'));
    ({ Buffs } = await import('../src/autochess/buffs.ts'));
  });

  const buildBoard = (): any => {
    const board: any = { units: [] };
    const picks = [1, 4, 7, 66];
    const spots = [[1, 1], [0, 0], [2, 0], [0, 2]];
    picks.forEach((d, i) => {
      const u = { dex: d, star: 1, x: null, y: null, bench: null };
      board.units.push(u);
      Board.place(board, u, spots[i][0], spots[i][1]);
    });
    return board;
  };

  /** mainkan run penuh sampai won/lost; return { phase, wave, gold, baseHp, combatSec } */
  function playRun(st: any, Runner: any, units: any[], mods: any, guardMax: number): any {
    let guard = 0;
    st.combatSec = 0; // akumulasi detik fase combat (tempo P26)
    while (st.phase !== 'won' && st.phase !== 'lost' && guard++ < guardMax) {
      if (st.phase === 'prep') st.prepLeft = 0.01;
      else if (st.phase === 'buff') Runner.pickBuff(st, Buffs.rollBuffs()[0]);
      const inCombat = st.phase === 'combat';
      Runner.tick(st, units, 0.25, mods);
      if (inCombat) st.combatSec += 0.25;
      // invariants per tick
      expect(st.gold).toBeGreaterThanOrEqual(0);
      expect(st.base.hp).toBeGreaterThanOrEqual(0);
      expect(st.base.hp).toBeLessThanOrEqual(st.base.maxHp);
      expect(Number.isFinite(st.wave)).toBe(true);
    }
    return st;
  }

  it('50 dual runs seeded: semua berakhir won/lost, invariant gold/hp sehat', () => {
    let wins = 0, losses = 0, secSum = 0, waveSum = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const board = buildBoard();
      const units = Team.spawnUnits(board, Team.teamMods(board));
      const st = WR.createRun(undefined, undefined, seed);
      playRun(st, WR, units, Team.teamMods(board), 4000);
      expect(['won', 'lost']).toContain(st.phase);
      expect(st.wave).toBeLessThanOrEqual(10); // tanpa endless
      expect(st.gold).toBeGreaterThanOrEqual(0);
      if (st.phase === 'won') wins++; else losses++;
      secSum += st.combatSec; waveSum += st.wave;
    }
    console.log('dual balance: wins', wins, 'losses', losses, 'avg combat/wave:', (secSum / waveSum).toFixed(2), 's');
    expect(wins + losses).toBe(50);
    // P25 target: dual win-rate ≥90% (GDD balance band)
    expect(wins).toBeGreaterThanOrEqual(45);
  });

  it('50 TD runs seeded: semua berakhir won/lost, base HP sehat', () => {
    let wins = 0, losses = 0, secSum = 0, waveSum = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const board = buildBoard();
      const units = Team.spawnUnits(board, Team.teamMods(board));
      const st = WRTD.createRun(undefined, undefined, seed);
      playRun(st, WRTD, units, Team.teamMods(board), 4000);
      expect(['won', 'lost']).toContain(st.phase);
      expect(st.wave).toBeLessThanOrEqual(10);
      expect(st.base.hp).toBeGreaterThanOrEqual(0);
      if (st.phase === 'won') wins++; else losses++;
      secSum += st.combatSec; waveSum += st.wave;
    }
    console.log('td balance: wins', wins, 'losses', losses, 'avg combat/wave:', (secSum / waveSum).toFixed(2), 's');
    expect(wins + losses).toBe(50);
    // P25 target: TD win-rate ~95% (≥92% band; seeded but combat rolls Math.random → margin)
    expect(wins).toBeGreaterThanOrEqual(46);
  });
});
