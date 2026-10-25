/* db invariants — sanitize/merge/migrate/newSave (P2). */
import { beforeAll, describe, expect, it } from 'vitest';

/* G stub: sanitize consulta G.DEX_BY / G.Moves / G.Upgrades (definidos en el bundle). */
beforeAll(() => {
  (globalThis as any).G = {
    DEX_BY: { 1: true, 2: true, 25: true },
    Moves: { BY_ID: { 'tackle': true, 'scratch': true } },
    Upgrades: { BY: { hp: { max: 10 }, atk: { max: 10 }, magnet: { max: 6 } } },
  };
});

import { newSave, migrate, sanitize, merge } from '../src/core/db';
import type { Save } from '../src/types/save';

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

describe('newSave', () => {
  it('partida nueva: 500 monedas, v4, tickets a 0, ac meta', () => {
    const s = newSave('Test');
    expect(s.coins).toBe(500);
    expect(s.v).toBe(4);
    expect(s.tickets).toEqual({ t1: 0, t10: 0 });
    expect(s.owned).toEqual({});
    expect(s.stats.runs).toBe(0);
    expect(s.ac).toEqual({ bestScore: 0, bestWave: 0, bestEndless: 0, runs: 0, daily: {} });
  });
});

describe('sanitize', () => {
  it('recorta monedas/tickets negativas o raras a 0 (entero positivo)', () => {
    const s: any = newSave('X');
    s.coins = -5; s.tickets.t1 = 'abc'; s.tickets.t10 = 3.9;
    sanitize(s);
    expect(s.coins).toBe(0);
    expect(s.tickets.t1).toBe(0);
    expect(s.tickets.t10).toBe(3);
  });

  it('borra Pokémon que no existen en la dex', () => {
    const s: any = newSave('X');
    s.owned[1] = { at: 1, from: 'gacha' };
    s.owned[9999] = { at: 1, from: 'gacha' };
    s.shiny[9999] = { at: 1, from: 'gacha' };
    sanitize(s);
    expect(s.owned[1]).toBeTruthy();
    expect(s.owned[9999]).toBeUndefined();
    expect(s.shiny[9999]).toBeUndefined();
  });

  it('recorta mejoras por encima del máximo', () => {
    const s: any = newSave('X');
    s.pupg[1] = { hp: 99, magnet: 99, noexiste: 5 };
    sanitize(s);
    expect(s.pupg[1].hp).toBe(10);
    expect(s.pupg[1].magnet).toBe(6);
    expect(s.pupg[1].noexiste).toBeUndefined();
  });
});

describe('migrate', () => {
  it('v1: pity número → objeto { 1: n }', () => {
    const s: any = clone(newSave('Old'));
    s.pity = 42;
    migrate(s, 'Old');
    expect(s.pity).toEqual({ 1: 42 });
  });

  it('rellena campos que falten (partida de versión anterior)', () => {
    const s: any = { v: 1, name: 'Old', coins: 10 };
    migrate(s, 'Old');
    expect(s.tickets).toEqual({ t1: 0, t10: 0 });
    expect(s.stats).toBeTruthy();
    expect(s.stats.runs).toBe(0);
    expect(s.v).toBe(4);
    // v3→v4: ac meta diisi default
    expect(s.ac).toEqual({ bestScore: 0, bestWave: 0, bestEndless: 0, runs: 0, daily: {} });
  });

  it('v4 sanitize: ac.clamp + daily cap 30', () => {
    const s: any = clone(newSave('Old'));
    s.ac.bestScore = 'x'; s.ac.bestWave = -9; s.ac.runs = 2.7;
    for (let i = 0; i < 40; i++) s.ac.daily['2026-01-' + String(i + 1).padStart(2, '0')] = { score: i, wave: 1, at: 1000 + i };
    s.ac.daily['bad'] = null;
    sanitize(s);
    expect(s.ac.bestScore).toBe(0);
    expect(s.ac.bestWave).toBe(0);
    expect(s.ac.runs).toBe(2);
    expect(Object.keys(s.ac.daily).length).toBe(30);
    expect(s.ac.daily['bad']).toBeUndefined();
    expect(s.ac.daily['2026-01-40'].score).toBe(39); // newest kept
  });

  it('v2→v3: mejoras de cuenta pasan al compañero', () => {
    const s: any = clone(newSave('Old'));
    s.partner = 1;
    s.upgrades = { hp: 3, atk: 2 };
    delete s.pupgDone;
    migrate(s, 'Old');
    expect(s.pupg[1]).toEqual({ hp: 3, atk: 2 });
    expect(s.pupgDone).toBe(true);
  });
});

describe('merge', () => {
  it('null handling: merge(null, b) = b, merge(a, null) = a', () => {
    const a = newSave('A');
    expect(merge(null, a)).toBe(a);
    expect(merge(a, null)).toBe(a);
  });

  it('unión de colecciones: nunca se pierde un Pokémon', () => {
    const a = newSave('A'), b = newSave('B');
    a.owned[1] = { at: 100, from: 'starter' };
    b.owned[25] = { at: 200, from: 'gacha' };
    b.shiny[25] = { at: 200, from: 'gacha' };
    const r = merge(a, b);
    expect(r.owned[1]).toBeTruthy();
    expect(r.owned[25]).toBeTruthy();
    expect(r.shiny[25]).toBeTruthy();
  });

  it('stats/upgrades/pupg: el máximo de cada uno', () => {
    const a = newSave('A'), b = newSave('B');
    a.stats.runs = 10; b.stats.runs = 3;
    a.stats.bestLevel = 2; b.stats.bestLevel = 7;
    b.pupg[1] = { hp: 5 };
    a.pupg[1] = { hp: 2 };
    const r = merge(a, b);
    expect(r.stats.runs).toBe(10);
    expect(r.stats.bestLevel).toBe(7);
    expect(r.pupg[1].hp).toBe(5);
  });

  it('idempotente: fusionar dos veces da lo mismo', () => {
    const a = newSave('A'), b = newSave('B');
    a.coins = 1200; b.coins = 800;
    a.owned[1] = { at: 1, from: 'starter' };
    b.owned[25] = { at: 2, from: 'gacha' };
    b.stats.runs = 5;
    const once = merge(clone(a), clone(b));
    const twice = merge(clone(once), clone(b));
    expect(twice.coins).toBe(once.coins);
    expect(twice.stats.runs).toBe(once.stats.runs);
    expect(Object.keys(twice.owned).sort()).toEqual(Object.keys(once.owned).sort());
  });

  it('logros/arenas/objetos: unión (lo conseguido no se pierde)', () => {
    const a = newSave('A'), b = newSave('B');
    a.ach['first_blood'] = 1;
    b.ach['rich'] = 2;
    b.arenas['forest'] = 3;
    b.itemsFound['focussash'] = 4;
    const r = merge(a, b);
    expect(r.ach['first_blood']).toBe(1);
    expect(r.ach['rich']).toBe(2);
    expect(r.arenas['forest']).toBe(3);
    expect(r.itemsFound['focussash']).toBe(4);
  });

  it('favoritos: gana la acción más reciente en valor absoluto', () => {
    const a = newSave('A'), b = newSave('B');
    a.updated = 2000; b.updated = 1000;
    a.dfav[1] = 5000;      // puesto
    b.dfav[1] = -4000;     // quitado antes
    const r = merge(a, b);
    expect(r.dfav[1]).toBe(5000);
  });

  it('created = min, updated = max', () => {
    const a = newSave('A'), b = newSave('B');
    a.created = 111; a.updated = 500;
    b.created = 222; b.updated = 900;
    const r = merge(a, b);
    expect(r.created).toBe(111);
    expect(r.updated).toBe(900);
  });
});
