/**
 * P17 tests — autochess screen: DOM render, click buy/place/reroll/start/sell.
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
  },
}));
vi.mock('../src/core/audio', () => ({
  Audio: { sfx: vi.fn() },
  default: { sfx: vi.fn() },
}));
vi.stubGlobal('requestAnimationFrame', () => 0);

let ACUI: any;

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const cells = () => document.querySelectorAll('.ac-cell');

beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  await import('../src/data/pokedex.js');
  await import('../src/data/moves.ts');
  await import('../src/data/types.ts');
  ACUI = (await import('../src/autochess/ac-ui.ts')).default;
  ACUI.open();
});

beforeEach(() => ACUI.reset());

describe('open / render', () => {
  it('builds section with board 8x5 (40 cells, 8 lane), bench 9, shop 5+reroll', () => {
    expect(document.getElementById('scr-ac')).toBeTruthy();
    expect(cells().length).toBe(40);
    expect(document.querySelectorAll('.ac-cell.lane').length).toBe(8);
    expect(document.querySelectorAll('.ac-slot').length).toBe(9);
    expect(document.querySelectorAll('.ac-card').length).toBe(6); // 5 slots + reroll
  });
  it('hud shows wave 1/30 + prep + gold 20', () => {
    expect(($('#ac-wave').textContent || '')).toContain('1/30');
    expect(($('#ac-phase').textContent || '')).toContain('Preparación');
    expect(($('#ac-gold').textContent || '')).toContain('20');
  });
});

describe('buy click', () => {
  it('click shop card → unit on bench, gold deducted', () => {
    const g0 = ACUI.run.gold;
    const card = $('.ac-card') as HTMLElement; // slot 0 always ≤10g ≤20
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
  it('tap bench unit → tap cell → placed at x,y', () => {
    buyFirst();
    clickBenchWithUnit();
    ($('[data-xy="0,0"]') as HTMLElement).click();
    const u = ACUI.board.units[0];
    expect(u.x).toBe(0);
    expect(u.y).toBe(0);
    expect(u.bench).toBeNull();
  });
  it('lane cell rejected (row 2)', () => {
    buyFirst();
    clickBenchWithUnit();
    ($('[data-xy="3,2"]') as HTMLElement).click();
    expect(ACUI.board.units[0].x).toBeNull();
    expect(ACUI.board.units[0].bench).not.toBeNull(); // still bench
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
  it('sell selected → refund + empty board', () => {
    $('.ac-card').click();
    const slots = document.querySelectorAll('.ac-slot');
    for (const s of slots) if (s.querySelector('canvas')) { (s as HTMLElement).click(); break; }
    const g0 = ACUI.run.gold;
    $('#ac-sell').click();
    expect(ACUI.board.units.length).toBe(0);
    expect(ACUI.run.gold).toBeGreaterThan(g0);
  });
});

describe('star merge via shop clicks', () => {
  it('3 same dex buys → one ★2 unit', () => {
    const dex = (G as any).DEX.find((e: any) => !e.leg && e.rarity === 1).dex;
    for (let i = 0; i < 3; i++)
      ACUI.shop.slots[i] = { dex, star: 1, x: null, y: null, bench: null };
    // re-render to attach fresh handlers (indices unchanged)
    (ACUI as any);
    const cards = document.querySelectorAll('.ac-card');
    // handlers were built for old slots — call onBuy path by clicking after forced render:
    // reset DOM handlers: use exported internals via click on bench… instead re-open shop render:
    // simple path: cards still point at slots index 0..2 of st.shop (same object) → works
    (cards[0] as HTMLElement).click();
    (cards[1] as HTMLElement).click();
    (cards[2] as HTMLElement).click();
    expect(ACUI.board.units.length).toBe(1);
    expect(ACUI.board.units[0].star).toBe(2);
  });
});

describe('start combat', () => {
  it('click Empezar → phase combat, spawn queue rolled', () => {
    $('#ac-start').click();
    expect(ACUI.run.phase).toBe('combat');
    expect(ACUI.run.spawnQ.length).toBeGreaterThan(0);
  });
});
