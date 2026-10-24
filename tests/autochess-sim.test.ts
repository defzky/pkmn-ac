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
      expect(Board.place(board, u, spots[i][0], spots[i][1], 8)).toBe(true);
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
