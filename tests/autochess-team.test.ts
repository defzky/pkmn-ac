/**
 * P16 tests — team glue: board → synergy mods / UI list / battle units.
 */
import { describe, it, expect, beforeAll } from 'vitest';

let Team: any, Board: any, Synergy: any, WR: any;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/moves.ts');
  await import('../src/data/types.ts');
  await import('../src/autochess/path.ts');
  await import('../src/autochess/unit-stats.ts');
  await import('../src/autochess/synergy.ts');
  await import('../src/autochess/board.ts');
  await import('../src/autochess/base.ts');
  await import('../src/autochess/unit.ts');
  await import('../src/autochess/unitAI.ts');
  await import('../src/autochess/wave.ts');
  Team = (await import('../src/autochess/team.ts')).default;
  Board = (await import('../src/autochess/board.ts')).default;
  Synergy = (await import('../src/autochess/synergy.ts'));
  WR = (await import('../src/autochess/wave-runner.ts')).default;
});

function dexWithType(t: string): number {
  return (G as any).DEX.find((e: any) => !e.leg && (e.types || []).includes(t)).dex;
}

/** push unit into state then place (place() expects unit already in units[]) */
function placeAt(board: any, dex: number, x: number, y: number, star = 1): boolean {
  const u = { dex, star, x: null, y: null, bench: null };
  board.units.push(u);
  return Board.place(board, u, x, y, 8);
}

describe('teamMods', () => {
  it('empty board → NONE (identity)', () => {
    const m = Team.teamMods({ units: [] });
    expect(m.atkMul).toBe(1);
    expect(m.dmgReduce).toBe(0);
  });
  it('2 fire units → elemental T2 atkMul 1.1', () => {
    const board = { units: [] };
    const f1 = dexWithType('fire');
    let f2 = dexWithType('water');
    if (f2 === f1) f2 = dexWithType('grass'); // elemental shares water/grass
    expect(placeAt(board, f1, 0, 0)).toBe(true);
    expect(placeAt(board, f2, 1, 0)).toBe(true);
    const m = Team.teamMods(board);
    expect(m.atkMul).toBeCloseTo(1.1, 5);
    expect(m.typeBoostMul).toBeCloseTo(1.3, 5);
  });
  it('bench units do NOT count', () => {
    const board = { units: [] };
    Board.add(board, dexWithType('fire'), 1);
    Board.add(board, dexWithType('water'), 1);
    const m = Team.teamMods(board);
    expect(m.atkMul).toBe(1);
  });
});

describe('teamActive', () => {
  it('tier0 filtered: 1 unit → empty list', () => {
    const board = { units: [] };
    placeAt(board, dexWithType('fire'), 0, 0);
    expect(Team.teamActive(board).length).toBe(0);
  });
  it('2 units → elemental T2 listed', () => {
    const board = { units: [] };
    placeAt(board, dexWithType('fire'), 0, 0);
    placeAt(board, dexWithType('water'), 1, 0);
    const list = Team.teamActive(board);
    const el = list.find((a: any) => a.def.id === 'elemental');
    expect(el).toBeTruthy();
    expect(el.count).toBe(2);
    expect(el.tier).toBe(2);
  });
});

describe('spawnUnits', () => {
  it('only placed units, x/y carried', () => {
    const board = { units: [] };
    placeAt(board, 25, 0, 0);
    Board.add(board, dexWithType('fire'), 1); // bench
    const units = Team.spawnUnits(board);
    expect(units.length).toBe(1);
    expect(units[0].x).toBe(0);
    expect(units[0].y).toBe(0);
    expect(units[0].hpCur).toBe(units[0].hp);
  });
  it('mods baked: atkMul raises bonusAtk', () => {
    const board = { units: [] };
    placeAt(board, dexWithType('fire'), 0, 0);
    placeAt(board, dexWithType('water'), 1, 0);
    const units = Team.spawnUnits(board);
    const m = Team.teamMods(board);
    expect(m.atkMul).toBeCloseTo(1.1, 5); // wiring proven
    expect(units[0].bonusAtk).toBe(Math.round(units[0].atk * (m.atkMul - 1)));
  });
});

describe('full loop integration', () => {
  it('spawnUnits + wave-runner tick clears wave 1 with strong board', () => {
    const board = { units: [] };
    // place several high-atk units across rows
    const picks = [dexWithType('fire'), dexWithType('water'), dexWithType('grass')];
    let x = 0;
    for (const d of picks) {
      placeAt(board, d, x, 0, 3); // ★3
      x++;
    }
    const mods = Team.teamMods(board);
    const units = Team.spawnUnits(board, mods);
    expect(units.length).toBe(3);
    // buff to guarantee clear
    for (const u of units) { u.atk = 1e6; u.atkCd = 0.01; u.range = 99; }
    const st = WR.createRun();
    WR.forceStart(st);
    let guard = 0;
    while (st.phase === 'combat' && guard++ < 600) WR.tick(st, units, 0.1, mods);
    expect(st.phase).toBe('reward');
    expect(st.kills).toBeGreaterThan(0);
  });
});
