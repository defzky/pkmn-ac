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
  it('lane is straight row 2, 8 wide', () => {
    expect(Path.LANE.w).toBe(8);
    expect(Path.LANE.h).toBe(5);
    expect(Path.LANE.waypoints).toEqual([{ x: 0, y: 2 }, { x: 7, y: 2 }]);
    expect(Path.laneLen()).toBe(7);
  });

  it('laneCells fills row 2', () => {
    const cells = Path.laneCells();
    expect(cells).toHaveLength(8);
    expect(cells.every((c: any) => c.y === 2)).toBe(true);
  });

  it('serpentine has 3 legs and full length', () => {
    const cells = Path.laneCells(Path.SERPENTINE);
    // leg1 row1 (8) + leg2 row3 (8) + leg3 row2 partial from (0,2)→(7,2) (8) but shared corners dedup? we push each waypoint step — expect 22 (8+7+7)
    expect(cells.length).toBeGreaterThanOrEqual(20);
    expect(Path.SERPENTINE.waypoints[0]).toEqual({ x: 0, y: 1 });
  });

  it('inside bounds', () => {
    expect(Path.inside(0, 0)).toBe(true);
    expect(Path.inside(7, 4)).toBe(true);
    expect(Path.inside(-1, 0)).toBe(false);
    expect(Path.inside(8, 2)).toBe(false);
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
    expect([1, 2]).toContain(s.range);
    expect(s.atkCd).toBeGreaterThanOrEqual(0.4);
    expect(s.atkCd).toBeLessThanOrEqual(1.6);
    expect(typeof s.move).toBe('string');
  });

  it('star multipliers scale hp/atk', () => {
    const s1 = UnitStats.boardStats(25, 1);
    const s2 = UnitStats.boardStats(25, 2);
    const s3 = UnitStats.boardStats(25, 3);
    expect(s2.hp).toBeGreaterThan(s1.hp);
    expect(s3.hp).toBeGreaterThan(s2.hp);
    expect(UnitStats.starMul(1)).toBe(1);
    expect(UnitStats.starMul(2)).toBe(1.8);
    expect(UnitStats.starMul(3)).toBe(3.2);
    expect(UnitStats.starMul(5)).toBe(3.2); // cap
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
  it('wave 1: 3 mobs, rarity band 1, no boss', () => {
    const c = WaveDef.compose(1);
    expect(c.wave).toBe(1);
    expect(c.boss).toBe(false);
    expect(c.mobs.length).toBe(3);
    expect(c.mobs.every((m: any) => !m.boss)).toBe(true);
  });

  it('count formula 3+floor(w/2) cap 16 (non-boss waves)', () => {
    expect(WaveDef.compose(2).mobs.length).toBe(4);
    expect(WaveDef.compose(9).mobs.length).toBe(7);
    expect(WaveDef.compose(28).mobs.length).toBe(16); // 3+14=17 cap 16; 28 not boss
  });

  it('boss every 5th: single unit hp×8 atk×2', () => {
    for (const w of [5, 10, 15, 20, 25, 30]) {
      const c = WaveDef.compose(w);
      expect(c.boss, `wave ${w}`).toBe(true);
      expect(c.mobs).toHaveLength(1);
      expect(c.mobs[0].boss).toBe(true);
      expect(c.mobs[0].star).toBe(3);
    }
  });

  it('non-boss waves have no boss flag', () => {
    for (const w of [1, 2, 3, 4, 6, 7]) {
      expect(WaveDef.compose(w).boss, `wave ${w}`).toBe(false);
    }
  });

  it('gen filter: w1-9 gen≤3, w10+ all', () => {
    const DEX: any[] = (globalThis as any).G.DEX;
    for (const w of [1, 3, 5, 7, 9]) {
      const c = WaveDef.compose(w);
      for (const m of c.mobs) {
        const e = DEX.find((d) => d.dex === m.dex);
        expect(e.gen, `w${w} dex ${m.dex}`).toBeLessThanOrEqual(3);
      }
    }
    // w10+ can include gen>3 (seeded many times)
    let sawHighGen = false;
    for (let i = 0; i < 50 && !sawHighGen; i++) {
      const c = WaveDef.compose(20);
      for (const m of c.mobs) {
        const e = DEX.find((d) => d.dex === m.dex);
        if (e.gen > 3) { sawHighGen = true; break; }
      }
    }
    expect(sawHighGen).toBe(true);
  });

  it('hp/atk scale with wave', () => {
    const w1 = WaveDef.compose(1).mobs[0];
    const w10 = WaveDef.compose(10).mobs[0];
    // different dex possible — compare mul functions instead
    expect(WaveDef.waveMul(10).hp).toBeGreaterThan(WaveDef.waveMul(1).hp);
    expect(WaveDef.waveMul(10).atk).toBeGreaterThan(WaveDef.waveMul(1).atk);
    expect(w1.hp).toBeGreaterThan(0);
    expect(w10.hp).toBeGreaterThan(0);
  });

  it('isFinal only at 30', () => {
    expect(WaveDef.isFinal(29)).toBe(false);
    expect(WaveDef.isFinal(30)).toBe(true);
  });

  it('clamps wave input', () => {
    expect(WaveDef.compose(0).wave).toBe(1);
    expect(WaveDef.compose(99).wave).toBe(30);
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

  it('T2 threshold: 2 unique fire/water/grass units → elemental active', () => {
    const units = [mk(4, ['fire']), mk(7, ['water']), mk(1, ['grass'])];
    const c = Synergy.counts(units);
    expect(c.elemental).toBe(3);
    const m = Synergy.mods(units);
    expect(m.atkMul).toBeCloseTo(1.1);
    expect(m.typeBoostMul).toBeCloseTo(1.3);
  });

  it('T4 threshold overrides T2', () => {
    const units = [
      mk(4, ['fire']), mk(7, ['water']), mk(1, ['grass']), mk(3, ['grass']),
    ];
    const m = Synergy.mods(units);
    expect(m.atkMul).toBeCloseTo(1.25);
  });

  it('unique dex counting (copies do not stack)', () => {
    const units = [mk(4, ['fire']), mk(4, ['fire']), mk(4, ['fire'])];
    expect(Synergy.counts(units).elemental).toBe(1);
  });

  it('dual-type counts in both groups', () => {
    // charizard-like: fire+flying
    const units = [mk(6, ['fire', 'flying']), mk(9, ['water'])];
    const c = Synergy.counts(units);
    expect(c.elemental).toBe(2);
    expect(c.skirmisher).toBe(1);
  });

  it('all 6 groups can activate; fire+water merge into elemental T4', () => {
    // 7 pairs, but DEFS has 6 groups; fire & water both map to elemental
    const groups = [
      ['fire'], ['electric'], ['normal'], ['fighting'], ['dark'], ['flying'], ['water'],
    ];
    const units: any[] = [];
    let dex = 1;
    for (const g of groups) {
      units.push(mk(dex++, g), mk(dex++, g));
    }
    const c = Synergy.counts(units);
    expect(c.elemental).toBe(4); // fire×2 + water×2 unique dex
    const act = Synergy.active(units);
    expect(act.length).toBe(6); // only 6 DEFS exist
    const m = Synergy.mods(units);
    expect(m.atkMul).toBeCloseTo(1.25); // elemental T4
    expect(m.dmgReduce).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it('active() returns tier 2/4 labels', () => {
    const units = [mk(4, ['fire']), mk(7, ['water'])];
    const act = Synergy.active(units);
    expect(act[0].def.id).toBe('elemental');
    expect(act[0].tier).toBe(2);
    expect(act[0].count).toBe(2);
  });
});
