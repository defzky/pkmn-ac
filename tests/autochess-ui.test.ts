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
    spriteCanvas: (_dex: string, w?: number, h?: number) => {
      const cv = document.createElement('canvas');
      if (w != null) cv.width = w;
      if (h != null) cv.height = h;
      return cv;
    },
    sprite: () => ({ a: { play: vi.fn(), loop: vi.fn(), dir: 0, busy: () => false, progress: () => 1 } }),
    spriteHit: vi.fn(),
    spriteFaint: vi.fn(),
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
    const gold = document.getElementById('ac-gold')!;
    expect(gold.closest('.ac-arena')).toBeNull(); // outside arena → visible in TD too
    // dock restructure: gold + footer + shop unified in .ac-dock (display:contents portrait)
    expect(gold.closest('.ac-dock')).toBeTruthy();
    expect(gold.nextElementSibling?.className).toContain('ac-footer');
    expect(document.querySelector('.ac-dock')!.contains(document.getElementById('ac-shop')!)).toBe(true);
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
    expect((cell.querySelector('canvas') as HTMLCanvasElement).width).toBe(96); // internal res ×2, CSS display unchanged
    expect(cell.querySelector('.ac-pill')).toBeTruthy();
    expect(cell.querySelector('.hp i')).toBeTruthy();
    // mob dies → cleanup on next sync
    for (const m of ACUI.run.mobs) m.alive = false;
    ACUI.syncEnemies();
    expect(cell.querySelector('canvas')).toBeNull();
  });
  it('death fades: canvas kept with .ac-dying until 0.9s, then cleared', () => {
    $('.ac-card').click();
    $('#ac-start').click();
    WaveRunner.tick(ACUI.run, ACUI.units, 0.1);
    const m = ACUI.run.mobs[0];
    m.hp = m.maxHp = 999; m.alive = true;
    ACUI.syncEnemies(0.16);
    const cell = $(`#ac-foe-grid [data-xy="${m.cx},${m.cy}"]`) as HTMLElement;
    expect(cell.querySelector('canvas')).toBeTruthy();
    for (const mm of ACUI.run.mobs) mm.alive = false;
    ACUI.syncEnemies(0.16); // first dead frame → Faint hold + fade timer
    expect(cell.querySelector('canvas')).toBeTruthy();
    expect(cell.classList.contains('ac-dying')).toBe(true);
    ACUI.syncEnemies(0.7); // t = 0.86 → still fading
    expect(cell.querySelector('canvas')).toBeTruthy();
    expect(cell.classList.contains('ac-dying')).toBe(true);
    ACUI.syncEnemies(0.1); // t = 0.96 → cleared
    expect(cell.querySelector('canvas')).toBeNull();
    expect(cell.classList.contains('ac-dying')).toBe(false);
  });
  it('hp bar tracks mob hp', () => {
    $('.ac-card').click();
    $('#ac-start').click();
    WaveRunner.tick(ACUI.run, ACUI.units, 0.1);
    const m = ACUI.run.mobs[0];
    m.hp = m.maxHp; m.alive = true; // unit may have chipped/kill-shot it during the random tick
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
      expect((mob.querySelector('canvas') as HTMLCanvasElement).width).toBe(80); // res ×2 (display 40 via CSS)
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

  it('td mob death → Faint hold + .ac-dying fade, element removed at 0.9s', () => {
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      return { width: 134, height: 134, left: 0, top: 0, right: 134, bottom: 134, x: 0, y: 0, toJSON: () => ({}) } as any;
    };
    try {
      ACUI.open('td');
      $('.ac-card').click();
      $('#ac-start').click();
      WaveRunnerTd.tick(ACUI.run, ACUI.units, 0.1);
      const m = ACUI.run.mobs[0];
      m.hp = m.maxHp = 9999; m.alive = true;
      ACUI.syncEnemies(0.16);
      const mob = document.querySelector('.ac-td-mob') as HTMLElement;
      expect(mob).toBeTruthy();
      m.alive = false;
      ACUI.syncEnemies(0.16); // first dead frame → dying
      expect(mob.isConnected).toBe(true);
      expect(mob.classList.contains('ac-dying')).toBe(true);
      ACUI.syncEnemies(0.7); // t = 0.86 → still fading
      expect(mob.isConnected).toBe(true);
      ACUI.syncEnemies(0.1); // t = 0.96 → removed
      expect(mob.isConnected).toBe(false);
      expect(document.querySelector('.ac-td-mob')).toBeNull();
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

describe('TD mode: ring lane layout', () => {
  it('lane tiles render outside grid (16 dedup cells), cells never marked td-path', () => {
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      const el = this as HTMLElement;
      const xy = (typeof el.closest === 'function' ? el.closest('[data-xy]') : null) as HTMLElement | null;
      if (xy && xy.dataset?.xy) {
        const [x, y] = xy.dataset.xy.split(',').map(Number);
        return { width: 134, height: 134, left: 200 + x * 134, top: 50 + y * 134,
                 right: 334 + x * 134, bottom: 184 + y * 134, x: 0, y: 0, toJSON: () => ({}) } as any;
      }
      return { width: 800, height: 700, left: 0, top: 0, right: 800, bottom: 700, x: 0, y: 0, toJSON: () => ({}) } as any;
    };
    try {
      ACUI.open('td');
      const lanes = document.querySelectorAll('.ac-td-lane');
      // union of both branches: 9 + 9 − shared {(1,-1),(1,3)} = 16 tiles
      expect(lanes.length).toBe(16);
      expect((document.getElementById('ac-td-lanes') as HTMLElement).hidden).toBe(false);
      // ring lane never touches board cells
      expect(document.querySelectorAll('.ac-cell.td-path').length).toBe(0);
      const xs = new Set([...lanes].map((l) => (l as HTMLElement).style.left));
      expect(xs.size).toBeGreaterThan(0);
      // base marker at ring end (1,3): px = 200 + 1.5*134 + 1*134 − 0 = 468
      const base = document.getElementById('ac-td-base') as HTMLElement;
      expect(base.hidden).toBe(false);
      expect(base.style.left).toBe('401px'); // 200 + 67 + 1*134
      expect(base.style.top).toBe('519px');  // 50 + 67 + 3*134
    } finally {
      HTMLElement.prototype.getBoundingClientRect = orig;
      ACUI.open('auto');
    }
  });
});

describe('TD landscape layout + dungeon bg', () => {
  it('toggles td-land on #scr-ac (td on, auto off)', () => {
    ACUI.open('td');
    expect(document.getElementById('scr-ac')!.classList.contains('td-land')).toBe(true);
    ACUI.open('auto');
    expect(document.getElementById('scr-ac')!.classList.contains('td-land')).toBe(false);
  });

  it('sets --ac-pitch / --ac-lane-pad from cell pitch; bg canvas present, paint guarded in jsdom', () => {
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      const el = this as HTMLElement;
      const xy = (typeof el.closest === 'function' ? el.closest('[data-xy]') : null) as HTMLElement | null;
      if (xy && xy.dataset?.xy) {
        const [x, y] = xy.dataset.xy.split(',').map(Number);
        return { width: 134, height: 134, left: 200 + x * 134, top: 50 + y * 134,
                 right: 334 + x * 134, bottom: 184 + y * 134, x: 0, y: 0, toJSON: () => ({}) } as any;
      }
      return { width: 800, height: 700, left: 0, top: 0, right: 800, bottom: 700, x: 0, y: 0, toJSON: () => ({}) } as any;
    };
    try {
      ACUI.open('td');
      const host = document.getElementById('ac-arenas')!;
      expect(host.style.getPropertyValue('--ac-pitch')).toBe('134px');
      expect(host.style.getPropertyValue('--ac-lane-pad')).toBe('38px');
      // dungeon-forest backdrop canvas lives in the arenas host (paint = Tiles.paintChunk,
      // guarded: jsdom getContext('2d') may be null → early return, no throw)
      expect(document.getElementById('ac-bg')).toBeTruthy();
    } finally {
      HTMLElement.prototype.getBoundingClientRect = orig;
      ACUI.open('auto');
    }
  });
});

describe('Fase J — combat juice (banner / leak / timer)', () => {
  it('wave-start banner shows on prep→combat (step drives loop hook)', () => {
    ACUI.open('td');
    const el = document.getElementById('ac-banner')!;
    ACUI.run.prepLeft = 0.01;
    ACUI.step(performance.now() + 50);
    expect(el.hidden).toBe(false);
    expect(el.innerHTML).toMatch(/Wave/);
  });

  it('leak → base flash + heart pulse + red banner', () => {
    ACUI.open('td');
    ACUI.run.phase = 'combat';
    ACUI.run.base.hp -= 5; // simulate leak — renderHud detects the drop
    ACUI.step(performance.now() + 50);
    expect(document.getElementById('ac-td-base')!.classList.contains('flash')).toBe(true);
    expect(document.querySelector('.ac-heart.blue')!.classList.contains('pulse')).toBe(true);
    const el = document.getElementById('ac-banner')!;
    expect(el.hidden).toBe(false);
    expect(el.classList.contains('leak')).toBe(true);
  });

  it('wave clear → gold-clear banner + gold pill pop', () => {
    ACUI.open('td');
    const gold = document.getElementById('ac-gold')!;
    gold.classList.remove('pop');
    ACUI.run.phase = 'combat';
    ACUI.run.spawnQ = []; ACUI.run.mobs = [];
    ACUI.step(performance.now() + 50); // tick detects clear → prep, loop fires banner
    expect(gold.classList.contains('pop')).toBe(true);
    expect(document.getElementById('ac-banner')!.innerHTML).toMatch(/cleared/i);
  });

  it('prep timer blinks in last 3s', () => {
    ACUI.open('td');
    const tf = document.getElementById('ac-timer-fill')!;
    ACUI.run.phase = 'prep'; ACUI.run.prepLeft = 2;
    ACUI.step(performance.now() + 50);
    expect(tf.classList.contains('blink')).toBe(true);
    ACUI.run.prepLeft = 5;
    ACUI.step(performance.now() + 100);
    expect(tf.classList.contains('blink')).toBe(false);
  });
});

describe('Fase K — interaction juice (land/merge/sell pop, drag ghost sprite)', () => {
  it('buy → auto-placed cell canvas gets squash-pop class', () => {
    $('.ac-card').click();
    const cv = $('#ac-me-grid [data-xy="0,0"] canvas');
    expect(cv).toBeTruthy();
    expect(cv!.classList.contains('ac-pop')).toBe(true);
  });

  it('tap-merge → target cell mergeflash + sprite pop, result ★2', () => {
    const dex = (G as any).DEX.find((e: any) => !e.leg && e.rarity === 1).dex;
    ACUI.shop.slots[0] = { dex, star: 1, x: null, y: null, bench: null };
    ACUI.shop.slots[1] = { dex, star: 1, x: null, y: null, bench: null };
    const cards = document.querySelectorAll('.ac-card');
    (cards[0] as HTMLElement).click(); // (0,0)
    (cards[1] as HTMLElement).click(); // (1,0)
    document.querySelector('[data-xy="0,0"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('[data-xy="1,0"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ACUI.board.units.length).toBe(1);
    expect(ACUI.board.units[0].star).toBe(2);
    const cell = $('#ac-me-grid [data-xy="1,0"]') as HTMLElement;
    expect(cell.classList.contains('mergeflash')).toBe(true);
    expect(cell.querySelector('canvas')!.classList.contains('ac-pop')).toBe(true);
  });

  it('sell → toast + gold back, no crash (placeFx sell path)', () => {
    const g0 = ACUI.run.gold;
    $('.ac-card').click(); // buy → (0,0)
    ($('#ac-me-grid [data-xy="0,0"]') as HTMLElement).click(); // select
    $('#ac-sell').click();
    expect(ACUI.board.units.length).toBe(0);
    expect(ACUI.run.gold).toBe(g0);
    expect(document.querySelector('#ac-me-grid canvas')).toBeNull();
  });

  it('drag ghost carries live mini-sprite canvas', () => {
    const card = $('.ac-card') as HTMLElement;
    card.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    const ghost = document.querySelector('.ac-drag');
    expect(ghost).toBeTruthy();
    expect(ghost!.querySelector('canvas')).toBeTruthy();
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, clientY: 11, bubbles: true }));
    expect(document.querySelector('.ac-drag')).toBeNull();
  });
});

describe('Fase L — dirt lanes, spawn portal, base HP ring, round pulse', () => {
  it('lane tiles are dirt-path styled + portal marker at spawn (1,-1) + base HP ring', () => {
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      const el = this as HTMLElement;
      const xy = (typeof el.closest === 'function' ? el.closest('[data-xy]') : null) as HTMLElement | null;
      if (xy && xy.dataset?.xy) {
        const [x, y] = xy.dataset.xy.split(',').map(Number);
        return { width: 134, height: 134, left: 200 + x * 134, top: 50 + y * 134,
                 right: 334 + x * 134, bottom: 184 + y * 134, x: 0, y: 0, toJSON: () => ({}) } as any;
      }
      return { width: 800, height: 700, left: 0, top: 0, right: 800, bottom: 700, x: 0, y: 0, toJSON: () => ({}) } as any;
    };
    try {
      ACUI.open('td');
      const lane = document.querySelector('.ac-td-lane') as HTMLElement;
      expect(lane).toBeTruthy();
      const portal = document.getElementById('ac-td-portal') as HTMLElement;
      expect(portal).toBeTruthy();
      expect(portal.className).toContain('ac-td-portal');
      expect(portal.style.left).toBe('401px'); // x=1 same column as base
      expect(portal.style.top).toBe('-17px');  // y=−1: 50 + 67 − 134
      // base now wraps 🏰 in a conic HP ring; renderHud seeds --hp
      const ring = document.getElementById('ac-base-ring') as HTMLElement;
      expect(ring).toBeTruthy();
      expect(ring.querySelector('b')!.textContent).toBe('🏰');
      expect(ring.style.getPropertyValue('--hp')).toBe('100');
      expect(ring.style.getPropertyValue('--hp-col')).toBe('#7dff9b');
      // leak → ring drops + band color flips (≤25% → red)
      ACUI.run.phase = 'combat';
      ACUI.run.base.hp = Math.min(ACUI.run.base.hp, 10);
      ACUI.step(performance.now() + 50);
      expect(ring.style.getPropertyValue('--hp')).toBe(String(Math.round(ACUI.run.base.hp / ACUI.run.base.maxHp * 100)));
      expect(ring.style.getPropertyValue('--hp-col')).toBe('#ff6b6b');
    } finally {
      HTMLElement.prototype.getBoundingClientRect = orig;
      ACUI.open('auto');
    }
  });

  it('wave++ pulses the Round pill', () => {
    ACUI.open('td');
    const rnd = document.getElementById('ac-round')!;
    rnd.classList.remove('pulse');
    ACUI.run.phase = 'combat';
    ACUI.run.spawnQ = []; ACUI.run.mobs = []; // clear → advanceWave bumps wave in tick
    ACUI.run.wave = ACUI.run.wave + 1; // direct bump — renderHud (step) sees the change
    ACUI.step(performance.now() + 50);
    expect(rnd.classList.contains('pulse')).toBe(true);
    expect(rnd.textContent).toMatch(/Round/);
  });
});

describe('Fase P — HUD polish hooks', () => {
  beforeEach(() => { vi.mocked(UI.toast).mockClear(); ACUI.reset(); });
  it('ready button flips to fighting class during combat', () => {
    ACUI.open('td');
    ACUI.board.units.push({ dex: 1, star: 1, x: 1, y: 1, bench: false, items: [] } as any);
    ACUI.render();
    const ready = document.getElementById('ac-start')!;
    expect(ready.classList.contains('fighting')).toBe(false);
    ready.click(); // real user path: startCombat → renderHud
    expect(ready.classList.contains('fighting')).toBe(true);
    expect(ready.textContent).toContain('Fighting');
  });
  it('2-star unit paints gold ★ chip in its board cell', () => {
    ACUI.open('auto');
    ACUI.board.units.push({ dex: 1, star: 2, x: 0, y: 0, bench: false, items: [] } as any);
    ACUI.render();
    const cell = document.querySelector('#ac-me-grid .ac-cell[data-xy="0,0"]')!;
    const st = cell.querySelector('.ac-pill b');
    expect(st).toBeTruthy();
    expect(st!.textContent).toContain('★★');
  });
});

describe('Fase Q — proportion polish', () => {
  beforeEach(() => { vi.mocked(UI.toast).mockClear(); ACUI.reset(); });
  it('castle HP pill (#ac-td-hptext) sits inside base + renderHud writes hp', () => {
    ACUI.open('td');
    const base = document.getElementById('ac-td-base')!;
    const pill = document.getElementById('ac-td-hptext')!;
    expect(pill).toBeTruthy();
    expect(base.contains(pill)).toBe(true);
    ACUI.run.base.hp = 7;
    ACUI.step(performance.now() + 50);
    expect(pill.innerHTML).toContain('7');
  });
  it('synergy bar lives inside #ac-arenas via .ac-arow wrapper', () => {
    ACUI.open('td');
    const syn = document.getElementById('ac-syn')!;
    expect(syn.closest('#ac-arenas')).toBeTruthy();
    expect(syn.closest('.ac-arow')).toBeTruthy();
  });
});

describe('mode switch cleanup — TD DOM must not leak into autochess', () => {
  /** cell rects → pitch 134 so renderTdLanes lays real tiles; else 800×700 */
  const stubRects = () => {
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      const xy = (typeof this.closest === 'function' ? this.closest('[data-xy]') : null) as HTMLElement | null;
      if (xy && xy.dataset?.xy) {
        const [x, y] = xy.dataset.xy.split(',').map(Number);
        return { width: 134, height: 134, left: 200 + x * 134, top: 50 + y * 134,
                 right: 334 + x * 134, bottom: 184 + y * 134, x: 0, y: 0, toJSON: () => ({}) } as any;
      }
      return { width: 800, height: 700, left: 0, top: 0, right: 800, bottom: 700, x: 0, y: 0, toJSON: () => ({}) } as any;
    };
    return () => { HTMLElement.prototype.getBoundingClientRect = orig; };
  };

  it('open(td) → open(auto): lanes+portal wiped, base hidden, pitch vars removed', () => {
    const restore = stubRects();
    try {
      ACUI.open('td');
      expect(document.querySelectorAll('.ac-td-lane').length).toBe(16);
      expect(document.getElementById('ac-td-portal')).toBeTruthy();
      const host = document.getElementById('ac-arenas')!;
      expect(host.style.getPropertyValue('--ac-pitch')).toBe('134px');

      ACUI.open('auto');
      expect(document.querySelectorAll('.ac-td-lane').length).toBe(0);
      expect(document.getElementById('ac-td-portal')).toBeNull();
      const lanes = document.getElementById('ac-td-lanes')!;
      expect(lanes.hidden).toBe(true);
      expect(lanes.innerHTML).toBe('');
      expect(document.getElementById('ac-td-base')!.hidden).toBe(true);
      expect(document.getElementById('ac-td-base')!.style.left).toBe('');
      expect(document.getElementById('ac-td-wave')!.innerHTML).toBe('');
      expect(host.style.getPropertyValue('--ac-pitch')).toBe('');
      expect(host.style.getPropertyValue('--ac-lane-pad')).toBe('');
      // mob sprites cleared too
      expect(document.querySelectorAll('.ac-td-mob').length).toBe(0);
    } finally {
      restore();
      ACUI.open('auto');
    }
  });

  it('close() wipes TD layers while back at menu', () => {
    const restore = stubRects();
    try {
      ACUI.open('td');
      expect(document.querySelectorAll('.ac-td-lane').length).toBe(16);
      ACUI.close();
      expect(document.querySelectorAll('.ac-td-lane').length).toBe(0);
      expect(document.getElementById('ac-td-lanes')!.hidden).toBe(true);
    } finally {
      restore();
      ACUI.open('auto');
    }
  });

  it('toggles .mode-td / .mode-autochess scoping classes on #scr-ac', () => {
    ACUI.open('td');
    const scr = document.getElementById('scr-ac')!;
    expect(scr.classList.contains('mode-td')).toBe(true);
    expect(scr.classList.contains('mode-autochess')).toBe(false);
    ACUI.open('auto');
    expect(scr.classList.contains('mode-td')).toBe(false);
    expect(scr.classList.contains('mode-autochess')).toBe(true);
  });
});

describe('auto layout — topbar HP badges + responsive --ac-tile', () => {
  it('Round, ♥ player, ♥ foe, ⚔ power all sit inside .ac-topbar', () => {
    ACUI.open('auto');
    const tb = document.querySelector('.ac-topbar')!;
    expect(tb).toBeTruthy();
    expect(tb.contains(document.getElementById('ac-round'))).toBe(true);
    expect(tb.contains(document.getElementById('ac-hp'))).toBe(true);
    expect(tb.contains(document.getElementById('ac-foe-hp'))).toBe(true);
    expect(tb.contains(document.getElementById('ac-power'))).toBe(true);
    expect(document.getElementById('ac-hp')!.textContent).toContain('45');
    expect(document.getElementById('ac-foe-hp')!.textContent).toContain('20');
  });

  it('fitAutoTiles sizes square tiles from arena rect (clamp 36–76px)', () => {
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.id === 'ac-arena-foe') {
        // content = rect − 28 (padding+border) → side 200 → tile floor(200/3) = 66
        return { width: 300, height: 240, left: 0, top: 0, right: 300, bottom: 240, x: 0, y: 0, toJSON: () => ({}) } as any;
      }
      return { width: 800, height: 700, left: 0, top: 0, right: 800, bottom: 700, x: 0, y: 0, toJSON: () => ({}) } as any;
    };
    try {
      ACUI.open('auto');
      expect(document.getElementById('ac-arenas')!.style.getPropertyValue('--ac-tile')).toBe('66px');
      // tiny arena → clamps at floor 36
      HTMLElement.prototype.getBoundingClientRect = function () {
        if (this.id === 'ac-arena-foe') {
          return { width: 80, height: 80, left: 0, top: 0, right: 80, bottom: 80, x: 0, y: 0, toJSON: () => ({}) } as any;
        }
        return { width: 800, height: 700, left: 0, top: 0, right: 800, bottom: 700, x: 0, y: 0, toJSON: () => ({}) } as any;
      };
      ACUI.render();
      expect(document.getElementById('ac-arenas')!.style.getPropertyValue('--ac-tile')).toBe('36px');
      // TD mode never sizes auto tiles
      ACUI.open('td');
      ACUI.render();
      expect(document.getElementById('ac-arenas')!.style.getPropertyValue('--ac-tile')).toBe('36px');
    } finally {
      HTMLElement.prototype.getBoundingClientRect = orig;
      ACUI.open('auto');
    }
  });
});

describe('D2a — unit death visual + respawn', () => {
  it('dead unit → cell ac-dead + spriteFaint; prep tick respawns full HP', () => {
    vi.mocked(UI.spriteFaint).mockClear();
    ACUI.open('auto');
    const cards = document.querySelectorAll('.ac-card');
    (cards[0] as HTMLElement).click();
    (cards[1] as HTMLElement).click(); // 2 units so wipe-check doesn't end the round
    $('#ac-start').click();
    expect(ACUI.units.length).toBe(2);
    const u = ACUI.units[1];
    u.alive = false; u.hpCur = 0; // companion (units[0]) still alive
    ACUI.step(performance.now() + 50); // combat frame → updateCombatBars
    expect(ACUI.run.phase).toBe('combat');
    const cell = $(`#ac-me-grid [data-xy="${u.x},${u.y}"]`);
    expect(cell.classList.contains('ac-dead')).toBe(true);
    expect(UI.spriteFaint).toHaveBeenCalled();
    ACUI.run.phase = 'prep';
    WaveRunner.tick(ACUI.run, ACUI.units, 0.1);
    expect(u.alive).toBe(true);
    expect(u.hpCur).toBe(u.hp);
  });
});

describe('D2b — flank highlight + wave preview chips', () => {
  it('prep: flank cells (not center) get .flank; wave strip has side + type chips', () => {
    ACUI.open('td');
    const flankCell = $('#ac-me-grid [data-xy="0,0"]');
    const centerCell = $('#ac-me-grid [data-xy="1,1"]');
    expect(flankCell).toBeTruthy();
    expect(flankCell!.classList.contains('flank')).toBe(true);
    expect(centerCell!.classList.contains('flank')).toBe(false);
    // preview strip: per-mob side arrows + type chips + side summary
    const strip = $('#ac-td-wave');
    expect(strip!.querySelectorAll('.ac-td-side').length).toBeGreaterThan(0);
    const types = strip!.querySelector('.ac-td-types');
    expect(types).toBeTruthy();
    expect(types!.querySelectorAll('i').length).toBeGreaterThan(0);
    expect(types!.querySelector('em')!.textContent).toMatch(/kiri|kanan|both/);
  });
});

describe('D2d — affix badge in wave strip', () => {
  it('wave 3 (swarm): strip shows .ac-td-affix "Swarm"; wave 1: none', () => {
    ACUI.open('td');
    expect($('#ac-td-wave .ac-td-affix')).toBe(null); // wave 1, no affix
    ACUI.run.wave = 3;
    ACUI.render();
    const badge = $('#ac-td-wave .ac-td-affix');
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toBe('Swarm');
    expect(badge!.className).toContain('a-swarm');
  });
});
