/**
 * P18 dual-board tests — autochess screen: portrait arenas (foe 3×3 + me 3×3),
 * badges (Round/heart/power/gold), shop cards, footer (reroll/ready/timer),
 * click buy/place/reroll/start/sell, enemy sync lifecycle.
 * UI + Audio mocked; rAF stubbed (loop never runs → deterministic, ACUI.step drives one frame).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { UI } from '../src/ui/ui';

vi.mock('../src/ui/ui', () => ({
  UI: {
    $: (id: string) => document.getElementById(id),
    show: vi.fn(),
    hide: vi.fn(),
    chrome: vi.fn(),
    toast: vi.fn(),
    tick: vi.fn(),
    spriteCanvas: () => document.createElement('canvas'),
    sprite: () => ({ a: { play: vi.fn(), loop: vi.fn(), dir: 0, busy: () => false, progress: () => 1 } }),
    spriteHit: vi.fn(),
    soundControls: vi.fn(),
  },
}));
vi.mock('../src/core/audio', () => ({
  Audio: { sfx: vi.fn() },
  default: { sfx: vi.fn() },
}));
vi.stubGlobal('requestAnimationFrame', () => 0);

let ACUI: any, WaveRunner: any, WaveRunnerTd: any;

const $ = (s: string) => document.querySelector(s) as HTMLElement;

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/sprites-meta.js');
  await import('../src/data/moves.ts');
  await import('../src/data/types.ts');
  ACUI = (await import('../src/autochess/ac-ui.ts')).default;
  WaveRunner = (await import('../src/autochess/wave-runner.ts')).default;
  WaveRunnerTd = (await import('../src/autochess/wave-runner-td.ts')).default;
  ACUI.open();
});

beforeEach(() => { vi.mocked(UI.toast).mockClear(); ACUI.reset(); });

describe('open / render — dual arenas', () => {
  it('two 3×3 grids: foe (y −1..−3) + me (y 0..2), no path/bench/legacy', () => {
    expect(document.getElementById('scr-ac')).toBeTruthy();
    expect(document.querySelectorAll('.ac-grid').length).toBe(2);
    const me = document.querySelectorAll('#ac-me-grid .ac-cell');
    const foe = document.querySelectorAll('#ac-foe-grid .ac-cell');
    expect(me.length).toBe(9);
    expect(foe.length).toBe(9);
    expect(document.querySelector('#ac-me-grid [data-xy="0,0"]')).toBeTruthy();
    expect(document.querySelector('#ac-me-grid [data-xy="2,2"]')).toBeTruthy();
    expect(document.querySelector('#ac-foe-grid [data-xy="0,-1"]')).toBeTruthy();
    expect(document.querySelector('#ac-foe-grid [data-xy="2,-3"]')).toBeTruthy();
    // legacy gone
    expect(document.querySelectorAll('.ac-path-node').length).toBe(0);
    expect(document.querySelectorAll('.ac-slot').length).toBe(0);
    expect(document.querySelectorAll('.ac-bench').length).toBe(0);
    expect(document.querySelectorAll('.ac-mobs').length).toBe(0);
    expect(document.querySelectorAll('canvas.ac-tiles').length).toBe(0);
    expect(document.querySelectorAll('canvas.ac-fx').length).toBe(1);
  });
  it('badges: Round 1, foe heart 20, player heart 45, power score, gold 5', () => {
    expect(($('#ac-round').textContent || '')).toContain('Round 1');
    expect(($('#ac-foe-hp').textContent || '')).toContain('20');
    expect(($('#ac-hp').textContent || '')).toContain('45');
    expect(($('#ac-power').textContent || '')).toContain('⚔️');
    expect(($('#ac-gold').textContent || '')).toContain('5');
  });
  it('footer: reroll circle (cost 1), Ready button, timer fill', () => {
    expect($('#ac-reroll')).toBeTruthy();
    expect(($('#ac-reroll').textContent || '')).toContain('1');
    expect($('#ac-start').classList.contains('ac-ready')).toBe(true);
    expect(($('#ac-start').textContent || '')).toBe('Ready');
    expect(document.getElementById('ac-timer-fill')).toBeTruthy();
    expect(document.querySelector('.ac-kbd')!.textContent).toContain('1');
  });
  it('prep: ghost preview on foe grid = wave-1 mobs; 2 buff tiles on me grid', () => {
    const ghosts = document.querySelectorAll('#ac-foe-grid .ac-cell.ghost');
    expect(ghosts.length).toBe(3); // 3 + floor(1/2)
    expect(ghosts[0].querySelector('canvas')).toBeTruthy();
    expect(ghosts[0].querySelector('.ac-pill')).toBeTruthy();
    expect(document.querySelectorAll('#ac-me-grid .ac-cell.buff').length).toBe(2);
  });
  it('synergy bar chips: 5 elements with n/3', () => {
    expect(document.querySelectorAll('.syn-chip').length).toBe(5);
    expect(($('.ac-synbar').textContent || '')).toContain('/3');
  });
  it('shop: 3 cards with cost badge + atk strip', () => {
    const cards = document.querySelectorAll('.ac-card');
    expect(cards.length).toBe(3);
    expect(document.querySelectorAll('.ac-cost').length).toBe(3);
    expect(($('.ac-strip').textContent || '')).toContain('⚔️');
  });
});

describe('buy click', () => {
  it('click shop card → unit auto-placed on board (0,0), gold deducted', () => {
    const g0 = ACUI.run.gold;
    const card = $('.ac-card') as HTMLElement; // slot 0 ≤2g (wave-1 band) ≤ 5 start gold
    card.click();
    expect(ACUI.board.units.length).toBe(1);
    expect(ACUI.board.units[0].bench).toBeNull();
    expect(ACUI.board.units[0].x).toBe(0);
    expect(ACUI.board.units[0].y).toBe(0);
    expect(ACUI.run.gold).toBeLessThan(g0);
    expect(ACUI.shop.slots[0]).toBeNull();
    // unit pill shows on its cell
    const cell = $('#ac-me-grid [data-xy="0,0"]') as HTMLElement;
    expect(cell.querySelector('.ac-pill')).toBeTruthy();
    expect(cell.querySelector('.ac-pill b')!.textContent).toContain('★');
  });
});

describe('placement click', () => {
  function buyFirst() { $('.ac-card').click(); }
  it('tap placed unit → selected; tap empty cell → moves there', () => {
    buyFirst(); // lands (0,0)
    ($('[data-xy="0,0"]') as HTMLElement).click(); // select
    expect($('[data-xy="0,0"]').classList.contains('sel')).toBe(true);
    ($('[data-xy="1,2"]') as HTMLElement).click(); // move
    const u = ACUI.board.units[0];
    expect(u.x).toBe(1);
    expect(u.y).toBe(2);
    expect(ACUI.shop); // sanity
    expect($('[data-xy="1,2"]').classList.contains('sel')).toBe(false); // move clears sel
  });
  it('foe-grid cells are not clickable targets (no handler on enemy board)', () => {
    buyFirst();
    const foeCell = $('#ac-foe-grid [data-xy="0,-1"]') as HTMLElement;
    foeCell.click(); // no onclick → nothing happens
    expect(ACUI.board.units[0].x).toBe(0);
  });
});

describe('reroll / sell', () => {
  it('reroll costs 1g', () => {
    const g0 = ACUI.run.gold;
    $('#ac-reroll').click();
    expect(ACUI.run.gold).toBe(g0 - 1);
  });
  it('sell selected → full ★1 refund = gold back to start', () => {
    const g0 = ACUI.run.gold; // before buy
    $('.ac-card').click(); // buy → (0,0)
    ($('[data-xy="0,0"]') as HTMLElement).click(); // select
    $('#ac-sell').click();
    expect(ACUI.board.units.length).toBe(0);
    expect(ACUI.run.gold).toBe(g0); // ★1 sell = full cost back
  });
});

describe('same-cell merge via taps (merge-2, board-direct)', () => {
  it('buy 2 same dex → 2 units different cells; select + tap same → ★2', () => {
    const dex = (G as any).DEX.find((e: any) => !e.leg && e.rarity === 1).dex;
    ACUI.shop.slots[0] = { dex, star: 1, x: null, y: null, bench: null };
    ACUI.shop.slots[1] = { dex, star: 1, x: null, y: null, bench: null };
    const cards = document.querySelectorAll('.ac-card');
    (cards[0] as HTMLElement).click(); // → (0,0)
    (cards[1] as HTMLElement).click(); // → (1,0) — NO auto-merge now
    expect(ACUI.board.units.length).toBe(2);
    expect(ACUI.board.units.every((u: any) => u.star === 1)).toBe(true);
    // select (0,0), tap (1,0) → same dex+star → merge into target cell
    document.querySelector('[data-xy="0,0"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('[data-xy="1,0"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ACUI.board.units.length).toBe(1);
    expect(ACUI.board.units[0].star).toBe(2);
    expect(ACUI.board.units[0].x).toBe(1); // result at TARGET cell
  });
});

describe('start combat', () => {
  it('empty board → toast "Place units first", stays prep', () => {
    $('#ac-start').click();
    expect(ACUI.run.phase).toBe('prep');
    expect(vi.mocked(UI.toast)).toHaveBeenCalledWith('Place units first');
  });
  it('with unit → phase combat, spawn queue rolled, Ready disabled label', () => {
    $('.ac-card').click(); // place one
    $('#ac-start').click();
    expect(ACUI.run.phase).toBe('combat');
    expect(ACUI.run.spawnQ.length).toBeGreaterThan(0);
    expect(ACUI.units.length).toBe(1);
    expect(($('#ac-start').textContent || '')).toBe('Fighting…');
    expect(($('#ac-start') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Bulbasaur attack queues Razor Leaf projectile visual', () => {
    ACUI.board.units.push({ dex: 1, star: 1, x: 0, y: 1, bench: null, items: [] });
    $('#ac-start').click();
    const u = ACUI.units[0];
    expect(u.move).toBe('razor-leaf');
    WaveRunner.tick(ACUI.run, ACUI.units, 0.1); // spawn + first auto-attack
    ACUI.step(performance.now() + 32);
    expect(ACUI.projs).toBeGreaterThan(0);
  });
});

describe('wave clear → shop refresh', () => {
  it('combat cleared → fresh shop stock, prep wave 2, foe heart damaged', () => {
    $('.ac-card').click();
    $('#ac-start').click();
    const oldShop = ACUI.shop;
    const foe0 = ACUI.run.foe.hp;
    // force instant clear: no queued mobs, none alive
    ACUI.run.spawnQ.length = 0;
    ACUI.run.mobs.length = 0;
    ACUI.step(performance.now() + 50);
    expect(ACUI.run.phase).toBe('prep');
    expect(ACUI.run.wave).toBe(2);
    expect(ACUI.foe ? ACUI.foe.hp : ACUI.run.foe.hp).toBeLessThan(foe0); // round win damages enemy heart
    expect(ACUI.shop).not.toBe(oldShop);
    expect(ACUI.shop.slots.length).toBe(3);
  });
});

describe('enemy sync (dual-board walkers → grid cells)', () => {
  it('combat spawn → canvas on foe front cell; all dead → cell cleared', () => {
    $('.ac-card').click();
    $('#ac-start').click();
    WaveRunner.tick(ACUI.run, ACUI.units, 0.1); // spawn first mob at FOE_SLOTS[0]
    expect(ACUI.run.mobs.length).toBe(1);
    const first = ACUI.run.mobs[0];
    first.hp = first.maxHp = 999; // keep it alive regardless of the random shop champion
    first.alive = true;
    ACUI.syncEnemies();
    const cell = $('#ac-foe-grid [data-xy="0,-1"]') as HTMLElement;
    expect(cell.querySelector('canvas')).toBeTruthy();
    expect(cell.querySelector('.ac-pill')).toBeTruthy();
    expect(cell.querySelector('.hp i')).toBeTruthy();
    // mob dies → cleanup on next sync
    for (const m of ACUI.run.mobs) m.alive = false;
    ACUI.syncEnemies();
    expect(cell.querySelector('canvas')).toBeNull();
  });
  it('hp bar tracks mob hp', () => {
    $('.ac-card').click();
    $('#ac-start').click();
    WaveRunner.tick(ACUI.run, ACUI.units, 0.1);
    const m = ACUI.run.mobs[0];
    m.hp = m.maxHp; // unit may have chipped it during the tick
    ACUI.syncEnemies();
    const cell = $(`#ac-foe-grid [data-xy="${m.cx},${m.cy}"]`);
    const fill = cell.querySelector('.hp i') as HTMLElement;
    expect(fill.style.width).toBe('100%');
    m.hp = m.maxHp * 0.4;
    ACUI.syncEnemies();
    expect(parseFloat(fill.style.width)).toBeCloseTo(40, 0);
  });
});

describe('drag & drop shop buy', () => {
  const pt = (type: string, x: number, y: number) =>
    new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  const card = () => $('.ac-card') as HTMLElement;

  it('drag card → ghost appears → drop off-board → buy auto-places on board', () => {
    card().dispatchEvent(pt('pointerdown', 10, 10));
    window.dispatchEvent(pt('pointermove', 10, 90)); // beyond 6px threshold
    expect(document.querySelector('.ac-drag')).toBeTruthy(); // ghost follows
    ($('#ac-syn') as HTMLElement).dispatchEvent(pt('pointerup', 30, 300)); // drop elsewhere
    expect(document.querySelector('.ac-drag')).toBeNull(); // ghost cleaned
    expect(ACUI.board.units.length).toBe(1);
    expect(ACUI.board.units[0].bench).toBeNull(); // no bench — board-direct
    expect(ACUI.board.units[0].x).not.toBeNull();
  });

  it('drag card → drop on board cell → buys + places there (prep)', () => {
    card().dispatchEvent(pt('pointerdown', 10, 10));
    window.dispatchEvent(pt('pointermove', 10, 90));
    ($('[data-xy="2,2"]') as HTMLElement).dispatchEvent(pt('pointerup', 5, 5));
    // jsdom elementFromPoint may be missing → falls back to event target = the cell
    const u = ACUI.board.units[0];
    expect(u).toBeTruthy();
    expect(u.x).not.toBeNull();
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

describe('TD mode: mob walk animation (dungeon-style)', () => {
  it('td mob spawns with own canvas + Walk loop while progress advances', () => {
    // jsdom has no layout → fake rects so tdCellHostPos resolves
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      return { width: 134, height: 134, left: 0, top: 0, right: 134, bottom: 134, x: 0, y: 0, toJSON: () => ({}) } as any;
    };
    try {
      ACUI.open('td');
      $('.ac-card').click();
      $('#ac-start').click();
      expect(ACUI.run.phase).toBe('combat');
      WaveRunnerTd.tick(ACUI.run, ACUI.units, 0.1); // spawn + walk
      expect(ACUI.run.mobs.length).toBeGreaterThan(0);
      const m = ACUI.run.mobs[0];
      m.hp = m.maxHp = 9999;
      m.alive = true;
      ACUI.syncEnemies(0.16);
      const mob = document.querySelector('.ac-td-mob') as HTMLElement;
      expect(mob).toBeTruthy();
      expect(mob.querySelector('canvas')).toBeTruthy(); // own canvas, not cell sprite
      expect(mob.dataset.anim).toBe('Walk'); // progress advanced → Walk loop
      // combat step again: tick moves mobs → still Walk (no random Attack flourish)
      WaveRunnerTd.tick(ACUI.run, ACUI.units, 0.16);
      ACUI.syncEnemies(0.16);
      expect(mob.dataset.anim).toBe('Walk');
      // no tick between frames (progress frozen, e.g. stunned) → Idle
      ACUI.syncEnemies(0.16);
      expect(mob.dataset.anim).toBe('Idle');
      expect(m.alive).toBe(true);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = orig;
      ACUI.open('auto');
    }
  });
});

describe('drag shop → merge onto occupied cell', () => {
  const pt = (type: string, x: number, y: number) =>
    new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  const cards = () => document.querySelectorAll('.ac-card');
  const injectSlot = (i: number, dex: number) => {
    ACUI.shop.slots[i] = { dex, star: 1, x: null, y: null, bench: null };
    ACUI.render();
  };

  it('drag card onto same champ ★1 → ★2 + merge-ok hint, no separate placement', () => {
    injectSlot(0, 1); // Bulbasaur
    (cards()[0] as HTMLElement).click(); // buy → auto-place (0,0)
    expect(ACUI.board.units.length).toBe(1);
    injectSlot(1, 1); // second Bulbasaur in slot 1
    const g0 = ACUI.run.gold;
    (cards()[1] as HTMLElement).dispatchEvent(pt('pointerdown', 10, 10));
    window.dispatchEvent(pt('pointermove', 10, 90));
    const cell = document.querySelector('#ac-me-grid [data-xy="0,0"]') as HTMLElement;
    expect(cell.classList.contains('merge-ok')).toBe(true); // hint while dragging
    cell.dispatchEvent(pt('pointerup', 5, 5));
    expect(document.querySelector('.ac-cell.merge-ok')).toBeNull(); // cleared after drop
    expect(ACUI.board.units.length).toBe(1);
    expect(ACUI.board.units[0].star).toBe(2);
    expect(ACUI.shop.slots[1]).toBeNull();
    expect(ACUI.run.gold).toBeLessThan(g0);
  });

  it('board full (9 cells) → drag merge still works, no 10th unit', () => {
    ACUI.run.gold = 100;
    let guard = 0;
    while (ACUI.board.units.length < 9 && guard++ < 15) {
      injectSlot(1, 1);
      (cards()[1] as HTMLElement).click();
    }
    expect(ACUI.board.units.length).toBe(9);
    injectSlot(1, 1);
    const g0 = ACUI.run.gold;
    (cards()[1] as HTMLElement).dispatchEvent(pt('pointerdown', 10, 10));
    window.dispatchEvent(pt('pointermove', 10, 90));
    const cell = document.querySelector('#ac-me-grid [data-xy="0,0"]') as HTMLElement;
    expect(cell.classList.contains('merge-ok')).toBe(true);
    cell.dispatchEvent(pt('pointerup', 5, 5));
    expect(ACUI.shop.slots[1]).toBeNull(); // consumed
    expect(ACUI.run.gold).toBeLessThan(g0);
    // card never occupied a cell → merge replaces target: still 9 cells filled, no 10th unit
    expect(ACUI.board.units.length).toBe(9);
    expect(ACUI.board.units.filter((u: any) => u.star === 2).length).toBe(1);
    expect(ACUI.board.units.filter((u: any) => u.star === 1).length).toBe(8);
    expect(ACUI.board.units.every((u: any) => u.x < 3 && u.y < 3)).toBe(true);
  });

  it('star mismatch → no hint, cell occupied error', () => {
    injectSlot(0, 1);
    (cards()[0] as HTMLElement).click(); // ★1 Bulbasaur on board
    injectSlot(1, 4); // different champ (Charmeleon line)
    (cards()[1] as HTMLElement).dispatchEvent(pt('pointerdown', 10, 10));
    window.dispatchEvent(pt('pointermove', 10, 90));
    const cell = document.querySelector('#ac-me-grid [data-xy="0,0"]') as HTMLElement;
    expect(cell.classList.contains('merge-ok')).toBe(false);
    cell.dispatchEvent(pt('pointerup', 5, 5));
    expect(ACUI.board.units.length).toBe(1); // no merge, no buy
    expect(ACUI.board.units[0].star).toBe(1);
    expect(ACUI.shop.slots[1]).not.toBeNull(); // slot kept
  });
});
