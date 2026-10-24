/**
 * 3x3 compact tests — autochess screen: stage (9 rocks + 16 path nodes),
 * click buy/place/reroll/start/sell, walker lifecycle.
 * UI + Audio mocked; rAF stubbed (loop never runs → deterministic).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../src/ui/ui', () => ({
  UI: {
    $: (id: string) => document.getElementById(id),
    show: vi.fn(),
    hide: vi.fn(),
    chrome: vi.fn(),
    toast: vi.fn(),
    tick: vi.fn(),
    spriteCanvas: () => document.createElement('canvas'),
    spriteHit: vi.fn(),
    soundControls: vi.fn(),
  },
}));
vi.mock('../src/core/audio', () => ({
  Audio: { sfx: vi.fn() },
  default: { sfx: vi.fn() },
}));
vi.stubGlobal('requestAnimationFrame', () => 0);

let ACUI: any, WaveRunner: any;

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const cells = () => document.querySelectorAll('.ac-cell');

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/sprites-meta.js');
  await import('../src/data/moves.ts');
  await import('../src/data/types.ts');
  ACUI = (await import('../src/autochess/ac-ui.ts')).default;
  WaveRunner = (await import('../src/autochess/wave-runner.ts')).default;
  ACUI.open();
});

beforeEach(() => ACUI.reset());

describe('open / render', () => {
  it('stage: 9 rock cells, 16 ring path nodes (spawn+base), bench 2, shop 3+reroll', () => {
    expect(document.getElementById('scr-ac')).toBeTruthy();
    expect(cells().length).toBe(9);
    expect(document.querySelectorAll('.ac-path-node').length).toBe(16);
    expect(document.querySelectorAll('.ac-path-node.spawn').length).toBe(1);
    expect(document.querySelectorAll('.ac-path-node.base').length).toBe(1);
    expect(document.querySelectorAll('.ac-mobs').length).toBe(1); // walker layer present
    expect(document.querySelectorAll('canvas.ac-tiles').length).toBe(1); // dungeon terrain backdrop
    expect(document.querySelectorAll('canvas.ac-fx').length).toBe(1); // projectile/particle overlay
    expect(document.querySelectorAll('.ac-slot').length).toBe(2);
    expect(document.querySelectorAll('.ac-card').length).toBe(4); // 3 slots + reroll
    // no legacy lane cells / badges
    expect(document.querySelectorAll('.ac-cell.lane').length).toBe(0);
    expect(document.querySelectorAll('.ac-mob').length).toBe(0);
  });
  it('hud shows hp, wave 1/20, prep, gold 5 (GDD start 5g)', () => {
    expect(($('#ac-hp').textContent || '')).toContain('100/100');
    expect(($('#ac-wave').textContent || '')).toContain('1/20');
    expect(($('#ac-phase').textContent || '')).toContain('Prep');
    expect(($('#ac-gold').textContent || '')).toContain('5');
  });
  it('synergy bar chips: 5 elements with n/3', () => {
    const chips = document.querySelectorAll('.syn-chip');
    expect(chips.length).toBe(5);
    expect(($('.ac-synbar').textContent || '')).toContain('/3');
  });
});

describe('buy click', () => {
  it('click shop card → unit on bench, gold deducted', () => {
    const g0 = ACUI.run.gold;
    const card = $('.ac-card') as HTMLElement; // slot 0 ≤2g (wave-1 band) ≤ 5 start gold
    card.click();
    expect(ACUI.board.units.length).toBe(1);
    expect(ACUI.board.units[0].bench).not.toBeNull();
    expect(ACUI.run.gold).toBeLessThan(g0);
    expect(ACUI.shop.slots[0]).toBeNull();
  });
});

describe('placement click', () => {
  function buyFirst() { $('.ac-card').click(); }
  function clickBenchWithUnit() {
    const slots = document.querySelectorAll('.ac-slot');
    for (const s of slots) if (s.querySelector('canvas')) { (s as HTMLElement).click(); break; }
  }
  it('tap bench unit → tap rock cell → placed at x,y', () => {
    buyFirst();
    clickBenchWithUnit();
    ($('[data-xy="0,0"]') as HTMLElement).click();
    const u = ACUI.board.units[0];
    expect(u.x).toBe(0);
    expect(u.y).toBe(0);
    expect(u.bench).toBeNull();
  });
  it('ring path node is not clickable (stays on bench)', () => {
    buyFirst();
    clickBenchWithUnit();
    const node = document.querySelector('[data-xy="1,-1"]') as HTMLElement;
    expect(node).toBeTruthy(); // spawn node exists
    expect(node.classList.contains('ac-path-node')).toBe(true);
    node.click(); // no handler → nothing happens
    expect(ACUI.board.units[0].x).toBeNull();
    expect(ACUI.board.units[0].bench).not.toBeNull();
  });
  it('tap placed unit → selected (outline class)', () => {
    buyFirst();
    clickBenchWithUnit();
    ($('[data-xy="1,0"]') as HTMLElement).click(); // place (clears sel)
    ($('[data-xy="1,0"]') as HTMLElement).click(); // tap again → select
    const cell = $('[data-xy="1,0"]') as HTMLElement;
    expect(cell.classList.contains('sel')).toBe(true);
  });
});

describe('reroll / sell', () => {
  it('reroll costs 2g', () => {
    const g0 = ACUI.run.gold;
    $('#ac-reroll').click();
    expect(ACUI.run.gold).toBe(g0 - 2);
  });
  it('sell selected → full ★1 refund = gold back to start', () => {
    const g0 = ACUI.run.gold; // before buy
    $('.ac-card').click();
    const slots = document.querySelectorAll('.ac-slot');
    for (const s of slots) if (s.querySelector('canvas')) { (s as HTMLElement).click(); break; }
    $('#ac-sell').click();
    expect(ACUI.board.units.length).toBe(0);
    expect(ACUI.run.gold).toBe(g0); // ★1 sell = full cost back
  });
});

describe('star merge via shop clicks (merge-2, bench 2 flow)', () => {
  it('buy 2 same dex → auto-merge ★2 on bench', () => {
    const dex = (G as any).DEX.find((e: any) => !e.leg && e.rarity === 1).dex;
    ACUI.shop.slots[0] = { dex, star: 1, x: null, y: null, bench: null };
    ACUI.shop.slots[1] = { dex, star: 1, x: null, y: null, bench: null };
    const cards = document.querySelectorAll('.ac-card');
    (cards[0] as HTMLElement).click(); // bench slot 0
    (cards[1] as HTMLElement).click(); // bench slot 1 → merge-2
    expect(ACUI.board.units.length).toBe(1);
    expect(ACUI.board.units[0].star).toBe(2);
  });
});

describe('start combat', () => {
  it('click Start → phase combat, spawn queue rolled', () => {
    $('#ac-start').click();
    expect(ACUI.run.phase).toBe('combat');
    expect(ACUI.run.spawnQ.length).toBeGreaterThan(0);
  });
});

describe('wave clear → shop refresh', () => {
  it('combat cleared → free fresh shop stock, prep wave 2', () => {
    $('#ac-start').click();
    const oldShop = ACUI.shop;
    // force instant clear: no queued mobs, none alive
    ACUI.run.spawnQ.length = 0;
    ACUI.run.mobs.length = 0;
    ACUI.step(performance.now() + 50);
    expect(ACUI.run.phase).toBe('prep');
    expect(ACUI.run.wave).toBe(2);
    expect(ACUI.shop).not.toBe(oldShop); // replaced with new roll
    expect(ACUI.shop.slots.length).toBe(3);
    for (const s of ACUI.shop.slots) expect(s).not.toBeNull();
  });
});

describe('walker sprites (mobber jalan)', () => {
  it('spawn during combat → canvas on stage; all dead → removed', () => {
    $('#ac-start').click();
    WaveRunner.tick(ACUI.run, [], 0.1); // spawn first mob
    expect(ACUI.run.mobs.length).toBe(1);
    ACUI.syncWalkers();
    const walks = document.querySelectorAll('.ac-walk');
    expect(walks.length).toBe(1);
    expect((walks[0] as HTMLElement).style.transform).toContain('translate3d');
    expect(walks[0].querySelector('canvas')).toBeTruthy();
    // mob dies → cleanup on next sync
    for (const m of ACUI.run.mobs) m.alive = false;
    ACUI.syncWalkers();
    expect(document.querySelectorAll('.ac-walk').length).toBe(0);
  });
  it('walker shows hp bar and status icons from mob state', () => {
    $('#ac-start').click();
    WaveRunner.tick(ACUI.run, [], 0.1);
    const m = ACUI.run.mobs[0];
    m.statuses.push({ type: 'burn', t: 2, dps: 1 });
    m.shield = 50;
    ACUI.syncWalkers();
    const w = document.querySelector('.ac-walk')!;
    expect(w.querySelector('.whp i')).toBeTruthy();
    expect(w.querySelector('.wico')!.textContent).toContain('🔥');
    expect(w.querySelector('.wsh')!.classList.contains('on')).toBe(true);
  });
});

describe('drag & drop shop buy', () => {
  const pt = (type: string, x: number, y: number) =>
    new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  const card = () => $('.ac-card') as HTMLElement;

  it('drag card → ghost appears → drop off-board → buy to bench', () => {
    card().dispatchEvent(pt('pointerdown', 10, 10));
    window.dispatchEvent(pt('pointermove', 10, 90)); // beyond 6px threshold
    expect(document.querySelector('.ac-drag')).toBeTruthy(); // ghost follows
    (document.querySelectorAll('.ac-slot')[0] as HTMLElement)
      .dispatchEvent(pt('pointerup', 30, 300)); // drop on bench (not a cell)
    expect(document.querySelector('.ac-drag')).toBeNull(); // ghost cleaned
    expect(ACUI.board.units.length).toBe(1);
    expect(ACUI.board.units[0].bench).not.toBeNull();
    expect(ACUI.board.units[0].x).toBeNull(); // bench, not placed
  });

  it('drag card → drop on board cell → buys + places there (prep)', () => {
    card().dispatchEvent(pt('pointerdown', 10, 10));
    window.dispatchEvent(pt('pointermove', 10, 90));
    ($('[data-xy="0,0"]') as HTMLElement).dispatchEvent(pt('pointerup', 5, 5));
    expect(ACUI.board.units.length).toBe(1);
    const u = ACUI.board.units[0];
    expect(u.x).toBe(0);
    expect(u.y).toBe(0);
    expect(u.bench).toBeNull();
    expect(document.querySelector('.ac-drag')).toBeNull();
  });

  it('tap (down+up, no move) does NOT drag-buy; plain click still buys', () => {
    card().dispatchEvent(pt('pointerdown', 10, 10));
    window.dispatchEvent(pt('pointerup', 11, 11)); // < 6px → tap path
    expect(ACUI.board.units.length).toBe(0); // no buy from pointer path
    card().click(); // legacy click path (tests + desktop click)
    expect(ACUI.board.units.length).toBe(1);
  });
});
