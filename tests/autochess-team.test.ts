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
  it('2 unique fire units → fire T2 atkMul 1.1 + burnOnHit', () => {
    const board = { units: [] };
    const DEX: any[] = (G as any).DEX;
    const f = DEX.filter((e: any) => !e.leg && (e.types || []).includes('fire')).slice(0, 2);
    expect(f.length).toBe(2);
    expect(placeAt(board, f[0].dex, 0, 0)).toBe(true);
    expect(placeAt(board, f[1].dex, 1, 0)).toBe(true);
    const m = Team.teamMods(board);
    expect(m.atkMul).toBeCloseTo(1.1, 5);
    expect(m.burnOnHit).toBeCloseTo(0.2, 5);
  });
  it('off-board units do NOT count', () => {
    const board = { units: [] };
    const DEX: any[] = (G as any).DEX;
    const f = DEX.filter((e: any) => !e.leg && (e.types || []).includes('fire')).slice(0, 2);
    board.units.push({ dex: f[0].dex, star: 1, x: null, y: null, bench: null });
    board.units.push({ dex: f[1].dex, star: 1, x: null, y: null, bench: null });
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
  it('2 unique fire units → fire T2 listed', () => {
    const board = { units: [] };
    const DEX: any[] = (G as any).DEX;
    const f = DEX.filter((e: any) => !e.leg && (e.types || []).includes('fire')).slice(0, 2);
    placeAt(board, f[0].dex, 0, 0);
    placeAt(board, f[1].dex, 1, 0);
    const list = Team.teamActive(board);
    const el = list.find((a: any) => a.def.id === 'fire');
    expect(el).toBeTruthy();
    expect(el.count).toBe(2);
    expect(el.tier).toBe(2);
  });
});

describe('spawnUnits', () => {
  it('only placed units, x/y carried', () => {
    const board = { units: [] };
    placeAt(board, 25, 0, 0);
    board.units.push({ dex: dexWithType('fire'), star: 1, x: null, y: null, bench: null }); // off-board
    const units = Team.spawnUnits(board);
    expect(units.length).toBe(1);
    expect(units[0].x).toBe(0);
    expect(units[0].y).toBe(0);
    expect(units[0].hpCur).toBe(units[0].hp);
  });
  it('mods baked: atkMul raises bonusAtk', () => {
    const board = { units: [] };
    const DEX: any[] = (G as any).DEX;
    const f = DEX.filter((e: any) => !e.leg && (e.types || []).includes('fire')).slice(0, 2);
    placeAt(board, f[0].dex, 0, 0);
    placeAt(board, f[1].dex, 1, 0);
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
    expect(st.phase).toBe('prep'); // wave 1 not a buff wave (every 3rd)
    expect(st.wave).toBe(2);
    expect(st.kills).toBeGreaterThan(0);
  });
});
