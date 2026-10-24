/* P11 data spec tests: path, unit-stats, wave, synergy */
import { describe, it, expect, beforeAll } from 'vitest';

let Path: any, UnitStats: any, WaveDef: any, Synergy: any;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/sprites-meta.js');
  await import('../src/data/moves.ts');
  ({ Path } = await import('../src/autochess/path.ts'));
  ({ UnitStats } = await import('../src/autochess/unit-stats.ts'));
  ({ WaveDef } = await import('../src/autochess/wave.ts'));
  ({ Synergy } = await import('../src/autochess/synergy.ts'));
});

describe('path', () => {
  it('ring: 2 branches × 9 cells, spawn top → base bottom', () => {
    const L = Path.branchCells(0), R = Path.branchCells(1);
    expect(L).toHaveLength(9);
    expect(R).toHaveLength(9);
    expect(L[0]).toEqual({ x: 1, y: -1 }); // spawn top-center
    expect(L[8]).toEqual({ x: 1, y: 3 });  // base bottom-center
    expect(R[0]).toEqual({ x: 1, y: -1 });
    expect(R[8]).toEqual({ x: 1, y: 3 });
    // branches are distinct routes (left vs right side)
    expect(L).not.toEqual(R);
    expect(L[2]).toEqual({ x: -1, y: -1 });
    expect(R[2]).toEqual({ x: 3, y: -1 });
  });

  it('laneCells = default (left) branch; laneLen = 8', () => {
    expect(Path.laneCells()).toEqual(Path.branchCells(0));
    expect(Path.laneLen()).toBe(8);
  });

  it('ring has 16 unique cells; rocks never on ring', () => {
    const all = new Set([...Path.branchCells(0), ...Path.branchCells(1)].map((c) => c.x + ',' + c.y));
    expect(all.size).toBe(16);
    for (const k of all) {
      const [x, y] = k.split(',').map(Number);
      expect(Path.inside(x, y)).toBe(false); // ring not placeable
    }
  });

  it('spawn/base exports', () => {
    expect(Path.SPAWN).toEqual({ x: 1, y: -1 });
    expect(Path.BASE).toEqual({ x: 1, y: 3 });
  });

  it('inside = rock bounds 0..2', () => {
    expect(Path.inside(0, 0)).toBe(true);
    expect(Path.inside(2, 2)).toBe(true);
    expect(Path.inside(3, 0)).toBe(false);
    expect(Path.inside(0, 3)).toBe(false);
    expect(Path.inside(-1, 0)).toBe(false);
    expect(Path.inside(1.5, 2)).toBe(false);
  });
});

describe('unit-stats', () => {
  it('derives stats for pikachu (25)', () => {
    const s = UnitStats.boardStats(25, 1);
    expect(s).not.toBeNull();
    expect(s.dex).toBe(25);
    expect(s.hp).toBeGreaterThan(0);
    expect(s.atk).toBeGreaterThan(0);
    expect(s.spd).toBeGreaterThanOrEqual(0.5);
    expect(s.spd).toBeLessThanOrEqual(3);
    expect([2, 3]).toContain(s.range); // melee 2 / ranged 3 (ring dist from center = 2)
    expect(s.atkCd).toBeGreaterThanOrEqual(0.4);
    expect(s.atkCd).toBeLessThanOrEqual(1.6);
    expect(typeof s.move).toBe('string');
  });

  it('star multipliers scale hp/atk (GDD: ★3 = 3.5, faster AS)', () => {
    const s1 = UnitStats.boardStats(25, 1);
    const s2 = UnitStats.boardStats(25, 2);
    const s3 = UnitStats.boardStats(25, 3);
    expect(s2.hp).toBeGreaterThan(s1.hp);
    expect(s3.hp).toBeGreaterThan(s2.hp);
    expect(UnitStats.starMul(1)).toBe(1);
    expect(UnitStats.starMul(2)).toBe(1.8);
    expect(UnitStats.starMul(3)).toBe(3.5);
    expect(UnitStats.starMul(5)).toBe(3.5); // cap
    expect(UnitStats.starAsMul(1)).toBe(1);
    expect(UnitStats.starAsMul(2)).toBe(1.2);
    expect(UnitStats.starAsMul(3)).toBe(1.5);
    expect(s3.atkCd).toBeLessThan(s1.atkCd); // higher star attacks faster
  });

  it('all 966 dex derive valid stats', () => {
    const DEX: any[] = (globalThis as any).G.DEX;
    let ok = 0;
    for (const e of DEX) {
      const s = UnitStats.boardStats(e.dex, 1);
      expect(s, `dex ${e.dex}`).not.toBeNull();
      expect(s.hp).toBeGreaterThan(0);
      expect(s.atk).toBeGreaterThan(0);
      ok++;
    }
    expect(ok).toBe(DEX.length);
    expect(ok).toBeGreaterThanOrEqual(900);
  });

  it('unit cost/sell from rarity', () => {
    expect(UnitStats.unitCost(1)).toBe(2);
    expect(UnitStats.unitCost(5)).toBe(10);
    expect(UnitStats.sellPrice(1)).toBe(1);
    expect(UnitStats.sellPrice(5)).toBe(5);
    expect(UnitStats.sellPrice(2)).toBe(2); // ceil(4/2)
  });

  it('unknown dex returns null', () => {
    expect(UnitStats.boardStats(999999)).toBeNull();
  });
});

describe('wave', () => {
  it('wave 1: 3 mobs, no boss', () => {
    const c = WaveDef.compose(1);
    expect(c.wave).toBe(1);
    expect(c.boss).toBe(false);
    expect(c.mobs.length).toBe(3);
    expect(c.mobs.every((m: any) => !m.boss)).toBe(true);
  });

  it('count formula 3+floor(w/2) cap 16 (non-boss waves)', () => {
    expect(WaveDef.compose(2).mobs.length).toBe(4);
    expect(WaveDef.compose(9).mobs.length).toBe(7);
    expect(WaveDef.compose(19).mobs.length).toBe(12); // 3+9
  });

  it('fixed boss every 5th wave (5/10/15/20): single named boss star 3', () => {
    for (const w of [5, 10, 15, 20]) {
      const c = WaveDef.compose(w);
      expect(c.boss, `wave ${w}`).toBe(true);
      expect(c.mobs).toHaveLength(1);
      expect(c.mobs[0].boss).toBe(true);
      expect(c.mobs[0].star).toBe(3);
    }
    expect(WaveDef.compose(5).mobs[0].dex).toBe(95);   // Onix
    expect(WaveDef.compose(10).mobs[0].dex).toBe(143); // Snorlax
    expect(WaveDef.compose(15).mobs[0].dex).toBe(130); // Gyarados
    expect(WaveDef.compose(20).mobs[0].dex).toBe(150); // Mewtwo
  });

  it('boss abilities flagged', () => {
    expect(WaveDef.compose(5).mobs[0].stunImmune).toBe(true);   // Onix
    expect(WaveDef.compose(10).mobs[0].rest).toBe(true);        // Snorlax
    expect(WaveDef.compose(15).mobs[0].roar).toBe(true);        // Gyarados
    const m20 = WaveDef.compose(20).mobs[0];
    expect(m20.barrier).toBeGreaterThan(0);
    expect(m20.disable).toBe(true);
  });

  it('non-boss waves have no boss flag', () => {
    for (const w of [1, 2, 3, 4, 6, 7]) {
      expect(WaveDef.compose(w).boss, `wave ${w}`).toBe(false);
    }
  });

  it('role pools: w1-9 EARLY dex, w11-19 MID dex', () => {
    const EARLY = new Set([19, 41, 50, 74]);
    const MID = new Set([20, 42, 75, 123, 93, 109, 81]);
    for (let i = 0; i < 20; i++) {
      for (const m of WaveDef.compose(3).mobs) expect(EARLY.has(m.dex)).toBe(true);
      for (const m of WaveDef.compose(17).mobs) expect(MID.has(m.dex)).toBe(true);
    }
  });

  it('hp/atk scale with wave (GDD: hp = 1+wave*0.25)', () => {
    expect(WaveDef.waveMul(1).hp).toBeCloseTo(1.25);
    expect(WaveDef.waveMul(4).hp).toBeCloseTo(2);
    expect(WaveDef.waveMul(11).hp).toBeGreaterThan(WaveDef.waveMul(1).hp);
    expect(WaveDef.waveMul(11).atk).toBeGreaterThan(WaveDef.waveMul(1).atk);
    const w1 = WaveDef.compose(1).mobs[0];
    const w11 = WaveDef.compose(11).mobs[0];
    expect(w1.hp).toBeGreaterThan(0);
    expect(w11.hp).toBeGreaterThan(0);
  });

  it('elite flag: waves 1-9 not elite, 10+ elite (GDD bounty 2)', () => {
    expect(WaveDef.compose(3).mobs.every((m: any) => m.elite === false)).toBe(true);
    expect(WaveDef.compose(11).mobs.every((m: any) => m.elite === true)).toBe(true);
    expect(WaveDef.compose(5).mobs[0].elite).toBe(false); // boss not elite
  });

  it('isFinal only at 20', () => {
    expect(WaveDef.isFinal(19)).toBe(false);
    expect(WaveDef.isFinal(20)).toBe(true);
  });

  it('clamps wave input to 20', () => {
    expect(WaveDef.compose(0).wave).toBe(1);
    expect(WaveDef.compose(99).wave).toBe(20);
    expect(WaveDef.compose(3.7).wave).toBe(3);
  });
});

describe('synergy', () => {
  const mk = (dex: number, types: string[]) => ({ dex, types });

  it('empty board: zero counts, identity mods', () => {
    const c = Synergy.counts([]);
    expect(Object.values(c).every((n) => n === 0)).toBe(true);
    const m = Synergy.mods([]);
    expect(m.atkMul).toBe(1);
    expect(m.dmgReduce).toBe(0);
    expect(m.bountyMul).toBe(1);
  });

  it('5 GDD type synergies only (old groups removed)', () => {
    expect(Synergy.DEFS.map((d: any) => d.id)).toEqual(['fire', 'water', 'grass', 'electric', 'psychic']);
  });

  it('T2 threshold: 2 unique fire → fire active atkMul 1.1 + burnOnHit', () => {
    const units = [mk(4, ['fire']), mk(6, ['fire'])];
    const c = Synergy.counts(units);
    expect(c.fire).toBe(2);
    const m = Synergy.mods(units);
    expect(m.atkMul).toBeCloseTo(1.1);
    expect(m.burnOnHit).toBeCloseTo(0.2);
  });

  it('T3 threshold overrides T2: 3 fire → atkMul 1.25 burnOnHit 0.4', () => {
    const units = [mk(4, ['fire']), mk(5, ['fire']), mk(6, ['fire'])];
    const m = Synergy.mods(units);
    expect(m.atkMul).toBeCloseTo(1.25);
    expect(m.burnOnHit).toBeCloseTo(0.4);
    // 4 fire still T3 (max)
    const m4 = Synergy.mods([...units, mk(37, ['fire'])]);
    expect(m4.atkMul).toBeCloseTo(1.25);
  });

  it('water T2 → manaRegenMul 1.2', () => {
    const units = [mk(7, ['water']), mk(8, ['water'])];
    expect(Synergy.mods(units).manaRegenMul).toBeCloseTo(1.2);
  });

  it('grass T2 → regen 0.01', () => {
    const units = [mk(1, ['grass']), mk(2, ['grass'])];
    expect(Synergy.mods(units).regen).toBeCloseTo(0.01);
  });

  it('unique dex counting (copies do not stack)', () => {
    const units = [mk(4, ['fire']), mk(4, ['fire']), mk(4, ['fire'])];
    expect(Synergy.counts(units).fire).toBe(1);
  });

  it('dual-type counts per matching type only', () => {
    const units = [mk(6, ['fire', 'flying']), mk(9, ['water'])];
    const c = Synergy.counts(units);
    expect(c.fire).toBe(1);
    expect(c.water).toBe(1);
    expect(c.grass).toBe(0);
  });

  it('all 5 types can activate; fire T2 wired', () => {
    const types = ['fire', 'water', 'grass', 'electric', 'psychic'];
    const units: any[] = [];
    let dex = 1;
    for (const t of types) units.push(mk(dex++, [t]), mk(dex++, [t]));
    const act = Synergy.active(units);
    expect(act.length).toBe(5);
    const m = Synergy.mods(units);
    expect(m.atkMul).toBeCloseTo(1.1); // fire T2
    expect(m.manaRegenMul).toBeCloseTo(1.2); // water T2
    expect(m.regen).toBeCloseTo(0.01); // grass T2
    expect(m.chainChance).toBeCloseTo(0.15); // electric T2
    expect(m.skillDmgMul).toBeCloseTo(1.15); // psychic T2
  });

  it('active() returns tier labels: 2 → t2, 3 → t3', () => {
    const units = [mk(4, ['fire']), mk(6, ['fire'])];
    const act = Synergy.active(units);
    expect(act[0].def.id).toBe('fire');
    expect(act[0].tier).toBe(2);
    expect(act[0].count).toBe(2);
    const act3 = Synergy.active([...units, mk(5, ['fire'])]);
    expect(act3[0].tier).toBe(3);
    expect(act3[0].count).toBe(3);
  });
});
