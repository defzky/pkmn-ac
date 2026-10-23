/* data invariants — the big unconverted .js data files loaded onto global G.
 * pokedex / sprites-meta / moves / gacha / achievements / enemies / changelog.
 * (lang-en.js skipped: it needs G.I18n at module scope, already covered by i18n.) */
import { beforeAll, describe, expect, it } from 'vitest';

/* G stub: the data files assign onto the global G when they load. */
const g: any = {};

beforeAll(async () => {
  (globalThis as any).G = g;
  if (typeof window !== 'undefined') (window as any).G = g;
  await import('../src/core/util'); // G.U — enemies.rollRun() hashes with it
  await import('../src/data/pokedex.js');
  await import('../src/data/sprites-meta.js');
  await import('../src/data/moves.js');
  await import('../src/data/changelog.js');
  await import('../src/data/achievements.js');
  await import('../src/data/enemies.js');
  await import('../src/systems/gacha.js');
});

describe('pokedex.js', () => {
  it('G.DEX: entradas con dex numérico, nombre y tipos no vacíos', () => {
    expect(g.DEX.length).toBeGreaterThan(0);
    for (const p of g.DEX) {
      expect(typeof p.dex).toBe('number');
      expect(Number.isInteger(p.dex)).toBe(true);
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
      expect(Array.isArray(p.types)).toBe(true);
      expect(p.types.length).toBeGreaterThan(0);
      for (const t of p.types) expect(typeof t).toBe('string');
      expect(p.rarity).toBeGreaterThanOrEqual(1);
      expect(p.rarity).toBeLessThanOrEqual(5);
      expect(typeof p.bst).toBe('number');
      expect(typeof p.gen).toBe('number');
    }
  });

  it('dex ascendente sin huecos en la lista (dex !== índice + 1)', () => {
    const dexes = g.DEX.map((p: any) => p.dex);
    expect(new Set(dexes).size).toBe(dexes.length); // sin duplicados
    expect(dexes[0]).toBe(1);
    expect(dexes.at(-1)).toBeGreaterThan(dexes.length); // hay huecos reales
    expect(dexes.every((d: number, i: number) => i === 0 || d > dexes[i - 1])).toBe(true);
  });

  it('G.DEX_BY: una clave por entrada y misma referencia', () => {
    const keys = Object.keys(g.DEX_BY);
    expect(keys.length).toBe(g.DEX.length);
    for (const p of g.DEX) expect(g.DEX_BY[p.dex]).toBe(p);
  });

  it('G.getPokemon: round-trip y desconocido → undefined', () => {
    expect(g.getPokemon(25).name).toBe('Pikachu');
    expect(g.getPokemon(g.DEX[0].dex)).toBe(g.DEX[0]);
    expect(g.getPokemon(999999)).toBeUndefined();
  });
});

describe('sprites-meta.js', () => {
  it('G.SPRITE_META: claves numéricas, todas existen en la dex', () => {
    const keys = Object.keys(g.SPRITE_META);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(Number.isNaN(Number(k))).toBe(false);
      expect(g.DEX_BY[Number(k)]).toBeTruthy();
    }
  });

  it('cada sprite trae su diccionario de animaciones', () => {
    for (const k of Object.keys(g.SPRITE_META)) {
      const m = g.SPRITE_META[k];
      expect(typeof m).toBe('object');
      expect(m).toBeTruthy();
      expect(typeof m.a).toBe('object');
      expect(Object.keys(m.a).length).toBeGreaterThan(0);
      expect(m.a.Idle.n).toBeGreaterThan(0);
    }
  });
});

describe('moves.js', () => {
  it('G.Moves.BY_ID no vacío y sin ids duplicados en ALL', () => {
    expect(Object.keys(g.Moves.BY_ID).length).toBeGreaterThan(0);
    expect(g.Moves.ALL.length).toBe(Object.keys(g.Moves.BY_ID).length);
    const ids = g.Moves.ALL.map((m: any) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(g.Moves.BY_ID[id]).toBeTruthy();
  });

  it('G.Moves.POOL: cada tipo agrupa ids existentes', () => {
    const pools = Object.values(g.Moves.POOL);
    expect(pools.length).toBeGreaterThan(0);
    for (const ids of pools as any[]) {
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(g.Moves.BY_ID[id]).toBeTruthy();
    }
    expect(g.Moves.POOL.normal).toContain('tackle');
  });

  it('poolFor: movimientos aprendibles; instance escala con el nivel', () => {
    const ids = g.Moves.poolFor(g.DEX[0]);
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(g.Moves.BY_ID[id]).toBeTruthy();

    const base = g.Moves.instance('tackle', 1);
    const up = g.Moves.instance('tackle', 3);
    expect(up.lvl).toBe(3);
    expect(up.dmg).toBeGreaterThan(base.dmg);
    expect(up.def).toBe(g.Moves.BY_ID['tackle']);
  });
});

describe('gacha.js — pool por rareza', () => {
  it('pool(rarity, gen) → array para rarezas 1-5 × gens 1-9', () => {
    for (let r = 1; r <= 5; r++) {
      for (let gen = 1; gen <= 9; gen++) {
        const pool = g.Gacha.pool(r, gen);
        expect(Array.isArray(pool)).toBe(true);
        for (const p of pool) {
          expect(p.rarity).toBe(r);
          expect(p.gen).toBe(gen);
        }
      }
    }
  });

  it('cada rareza 1-5 tiene Pokémon con sprite en cada banner', () => {
    for (let r = 1; r <= 5; r++) {
      for (let gen = 1; gen <= 9; gen++) {
        expect(g.Gacha.pool(r, gen).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('achievements.js', () => {
  it('G.AchDefs: { CATS, LIST, BY } con ids únicos y BY completo', () => {
    expect(Array.isArray(g.AchDefs.CATS)).toBe(true);
    expect(g.AchDefs.CATS.length).toBeGreaterThan(0);
    expect(Array.isArray(g.AchDefs.LIST)).toBe(true);
    expect(g.AchDefs.LIST.length).toBeGreaterThan(0);
    expect(typeof g.AchDefs.BY).toBe('object');

    const ids = g.AchDefs.LIST.map((a: any) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(g.AchDefs.BY).length).toBe(ids.length);
    for (const a of g.AchDefs.LIST) expect(g.AchDefs.BY[a.id]).toBe(a);
  });

  it('cada logro: value() función, goal ≥ 1, tier 1-3, reward objeto', () => {
    for (const a of g.AchDefs.LIST) {
      expect(typeof a.value).toBe('function');
      expect(typeof a.goal).toBe('number');
      expect(a.goal).toBeGreaterThanOrEqual(1);
      expect(a.tier).toBeGreaterThanOrEqual(1);
      expect(a.tier).toBeLessThanOrEqual(3);
      expect(typeof a.reward).toBe('object');
      expect(a.reward).toBeTruthy();
      expect(typeof a.name).toBe('string');
      expect(typeof a.desc).toBe('string');
    }
    const v = g.AchDefs.LIST[0].value({});
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  });

  it('un logro por legendario con sprite', () => {
    const legs = g.DEX.filter((p: any) => p.leg && g.SPRITE_META[p.dex]);
    expect(legs.length).toBeGreaterThan(0);
    for (const p of legs) expect(g.AchDefs.BY['leg_' + p.dex]).toBeTruthy();
    expect(g.AchDefs.BY.legAll.goal).toBe(legs.length);
  });
});

describe('changelog.js', () => {
  it('G.CHANGELOG: entradas con d, title [es,en] y secciones de pares', () => {
    expect(Array.isArray(g.CHANGELOG)).toBe(true);
    expect(g.CHANGELOG.length).toBeGreaterThan(0);
    for (const e of g.CHANGELOG) {
      expect(typeof e.d).toBe('string');
      expect(/^\d{4}-\d{2}-\d{2}$/.test(e.d)).toBe(true);
      expect(Array.isArray(e.title)).toBe(true);
      expect(e.title.length).toBe(2);
      for (const t of e.title) expect(typeof t).toBe('string');

      const sections = [e.new, e.chg, e.fix].filter(Boolean);
      expect(sections.length).toBeGreaterThan(0);
      for (const sec of sections) {
        expect(Array.isArray(sec)).toBe(true);
        for (const line of sec) {
          expect(Array.isArray(line)).toBe(true);
          expect(line.length).toBe(2);
          for (const half of line) expect(typeof half).toBe('string');
        }
      }
    }
  });
});

describe('enemies.js', () => {
  it('G.Enemies expone su API', () => {
    for (const k of ['TIERS', 'rollRun', 'bagAt', 'upcomingDex', 'candidates', 'scale', 'bossScale']) {
      expect(g.Enemies[k]).toBeTruthy();
    }
    expect(Array.isArray(g.Enemies.TIERS)).toBe(true);
    expect(g.Enemies.TIERS.length).toBeGreaterThan(0);
  });

  it('bagAt(0) y upcomingDex(0) → no vacíos (con G.U cargado)', () => {
    const bag = g.Enemies.bagAt(0);
    expect(Array.isArray(bag)).toBe(true);
    expect(bag.length).toBeGreaterThan(0);
    for (const e of bag) expect(g.DEX_BY[e.dex]).toBeTruthy();

    const up = g.Enemies.upcomingDex(0);
    expect(Array.isArray(up)).toBe(true);
    expect(up.length).toBeGreaterThan(0);
    for (const dex of up) expect(g.DEX_BY[dex]).toBeTruthy();

    expect(g.Enemies.cast.length).toBeGreaterThan(0);
    expect(g.Enemies.BOSSES.length).toBeGreaterThan(0);
  });
});
