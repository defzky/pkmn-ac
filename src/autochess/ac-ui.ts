/**
 * ac-ui.ts — autochess TD screen: 3x3 rock board + ring lane, bench, shop, HUD, phase loop.
 *
 * P17 → 3x3 compact rework (docs/ui-chessboard-3x3.md): stage 5x5 (16 path nodes
 * + 9 rock cells), mobs walk the ring as animated sprites (per-frame transform).
 * Loop: prep countdown → combat rAF tick(WaveRunner) → buff pick (every 3rd) → … .
 * Placement = drag shop card onto cell/bench, or tap unit → tap cell (mobile-friendly).
 * Styles live in public/css/style.css (`/* autochess *\/` section).
 */
import { register } from '../core/registry';
import { UI } from '../ui/ui';
import { Icons } from '../ui/icons';
import { Audio } from '../core/audio';
import { U, LIFT } from '../core/util';
import { Sprites } from '../core/sprites';
import { FX } from '../entities/fx';
import { VFX } from '../entities/vfx';
import { Tiles } from '../world/tiles';
import { Board, type BoardState, type BoardUnit } from './board';
import { Path } from './path';
import { Shop, type ShopState } from './shop';
import { Synergy, type SynergyMods } from './synergy';
import { Team } from './team';
import { WaveRunner, type RunState } from './wave-runner';
import { WaveDef } from './wave';
import { Buffs, type BuffDef } from './buffs';
import type { UnitBattle } from './unit';
import type { MobBattle } from './unitAI';

const LEVEL = 8; // boardCap = min(8, 1+floor(l/2)) = 5

interface ACInternal {
  run: RunState;
  shop: ShopState;
  board: BoardState;
  sel: BoardUnit | null;
  units: UnitBattle[];
  open: boolean;
  paused: boolean;
  last: number;
}

const st: ACInternal = {
  run: WaveRunner.createRun(),
  shop: Shop.createShop(),
  board: { units: [] },
  sel: null,
  units: [],
  open: false,
  paused: false,
  last: 0,
};

const $ = UI.$ as (id: string) => HTMLElement;
const esc = (s: any) => U.esc(s);

// ---------------- DOM skeleton (built once) ----------------

function ensureDom(): HTMLElement {
  let sec = document.getElementById('scr-ac');
  if (sec) return sec;
  sec = document.createElement('section');
  sec.id = 'scr-ac';
  sec.className = 'scr hidden';
  sec.innerHTML = `
    <div class="ac-hud">
      <span id="ac-hp">♥ <b>100/100</b></span>
      <span id="ac-wave">Wave <b>1/20</b></span>
      <span id="ac-phase">Prep</span>
      <span id="ac-gold"><b>5</b> <span class="coin"></span></span>
      <span class="ac-base"><i id="ac-base-hp" style="width:100%"></i></span>
      <button id="ac-start" class="btn gold small">Start</button>
      <button id="ac-pause-btn" class="btn ghost small" aria-label="Pause">II</button>
      <button id="ac-close" class="btn ghost small">Exit</button>
    </div>
    <div class="ac-synbar" id="ac-syn"></div>
    <div class="ac-mid">
      <div class="ac-left">
        <div class="ac-stage" id="ac-board"></div>
        <div class="ac-bench" id="ac-bench"></div>
        <div class="ac-shop" id="ac-shop"></div>
        <div class="ac-btns">
          <button id="ac-reroll" class="btn small" data-sfx="none">↻ 2 <span class="coin"></span></button>
          <button id="ac-sell" class="btn small hidden">Sell ★</button>
          <span class="kbd-hint ac-kbd">[1]–[3] buy · [R] reroll · [Esc] pause</span>
        </div>
      </div>
    </div>
    <div class="ac-over hidden" id="ac-over"></div>
    <div class="ac-over hidden" id="ac-pause">
      <div class="box center">
        <h3>Paused</h3>
        <div id="ac-pause-sound" class="ac-snd"></div>
        <div class="ac-btns">
          <button class="btn gold small" id="ac-resume">Resume</button>
          <button class="btn small" id="ac-quit">Menu</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(sec);
  wire();
  return sec;
}

// ---------------- rendering ----------------

function phaseText(): string {
  const r = st.run;
  if (r.phase === 'prep') return `Prep ${Math.ceil(r.prepLeft)}s`;
  if (r.phase === 'combat') return 'Combat!';
  if (r.phase === 'buff') return 'Buff!';
  if (r.phase === 'won') return 'Victory!';
  return 'Defeat';
}

function renderHud(): void {
  const r = st.run;
  $('ac-wave').innerHTML = `Wave <b>${r.wave}/${WaveDef.MAX_WAVE}</b>`;
  $('ac-phase').textContent = phaseText();
  $('ac-gold').innerHTML = `<b>${r.gold}</b> <span class="coin"></span>`;
  $('ac-hp').innerHTML = `♥ <b>${r.base.hp}/${r.base.maxHp}</b>`;
  $('ac-base-hp').style.width = Math.max(0, (r.base.hp / r.base.maxHp) * 100) + '%';
  $('ac-start').classList.toggle('hidden', r.phase !== 'prep');
}

function unitAt(x: number, y: number): BoardUnit | null {
  return st.board.units.find((u) => u.x === x && u.y === y) || null;
}

// ---------------- stage: path ring + 3x3 rocks + mob walkers ----------------

/** dir row facing east (right) — mobs walk left→right along the ring */
const WALK_DIR = Sprites.dirFromAngle(0);

interface Walker {
  root: HTMLElement;
  fill: HTMLElement;
  shBox: HTMLElement;
  shFill: HTMLElement;
  ico: HTMLElement;
  key: string;
  /** stage canvas (hurt flash) + last hp seen (hit detection) */
  cv: HTMLCanvasElement;
  lastHp: number;
}
const walkers = new Map<MobBattle, Walker>();

/** placed unit cell → stage sprite canvas (Attack flourish target) */
const unitCv = new Map<string, HTMLCanvasElement>();

// ---------------- stage fx (dungeon combat resources: VFX projectiles + FX particles) ----------------
/** art-px canvas over the stage (80×80 = 5×Tiles.T); null until renderStage */
let fxCanvas: HTMLCanvasElement | null = null;
/** jsdom (tests) has no 2d context → skip pixel painting there */
const CTX_OK = (() => { try { return !!document.createElement('canvas').getContext('2d'); } catch { return false; } })();
interface AcProj {
  x: number; y: number; vx: number; vy: number; t: number; life: number;
  vis: { proj: string; pal: string; trail?: string | null };
  dmg: number; hx: number; hy: number; col: string;
}
interface AcImpact {
  t: number; x: number; y: number; dmg: number; col: string;
  pal: string; melee?: string | null; angle: number;
}
const acProjs: AcProj[] = [];
const acImpacts: AcImpact[] = [];
/** cell index → art px center (same domain as Tiles paint: tile = 16 art px) */
const cellA = (v: number): number => (v + 1.5) * Tiles.T;
/** move kinds that fly a dungeon VFX projectile (others: slash / beam / flourish) */
const PROJ_KINDS = new Set(['projectile', 'chain', 'cone', 'boomerang', 'meteor', 'mine', 'orbit']);

function clearWalkers(): void {
  for (const w of walkers.values()) w.root.remove();
  walkers.clear();
}

function statusKey(m: MobBattle): string {
  let s = '';
  const sts = m.statuses || [];
  if (sts.some((x) => x.type === 'burn')) s += '🔥';
  if (sts.some((x) => x.type === 'poison')) s += '☠️';
  if (sts.some((x) => x.type === 'slow')) s += '❄️';
  if (sts.some((x) => x.type === 'stun')) s += '⚡';
  if (m.barrier > 0) s += '🛡';
  if (m.restT > 0) s += '💤';
  return s;
}

function createWalker(m: MobBattle): Walker {
  const box = $('ac-mobs');
  const root = document.createElement('div');
  root.className = 'ac-walk' + (m.boss ? ' boss' : '');
  const cv = UI.spriteCanvas(m.dex, 44, 44, { scale: 2, anim: 'Walk', dir: WALK_DIR, shadow: true });
  root.appendChild(cv);
  root.insertAdjacentHTML('beforeend',
    `<span class="whp"><i></i></span><span class="wsh"><i></i></span><span class="wico"></span>`);
  box.appendChild(root);
  return {
    root,
    fill: root.querySelector('.whp i') as HTMLElement,
    shBox: root.querySelector('.wsh') as HTMLElement,
    shFill: root.querySelector('.wsh i') as HTMLElement,
    ico: root.querySelector('.wico') as HTMLElement,
    key: '',
    cv,
    lastHp: m.hp,
  };
}

/** Sync walker sprites with run.mobs: spawn, position (progress → px), bars, cleanup. */
function syncWalkers(): void {
  const box = document.getElementById('ac-mobs');
  if (!box) return;
  const alive = new Set<MobBattle>();
  if (st.run.phase === 'combat') {
    const cellW = box.clientWidth / 5, cellH = box.clientHeight / 5;
    for (const m of st.run.mobs) {
      if (!m.alive) continue;
      alive.add(m);
      let w = walkers.get(m);
      if (!w) { w = createWalker(m); walkers.set(m, w); }
      const cells = Path.branchCells(typeof m.branch === 'number' ? m.branch : 0);
      const maxI = cells.length - 1;
      const i = Math.min(maxI - 1, Math.max(0, Math.floor(m.progress)));
      const t = Math.min(1, Math.max(0, m.progress - i));
      const a = cells[i], b = cells[Math.min(maxI, i + 1)];
      const gx = a.x + (b.x - a.x) * t, gy = a.y + (b.y - a.y) * t;
      const px = (gx + 1.5) * cellW, py = (gy + 1.5) * cellH;
      w.root.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)`;
      w.fill.style.width = Math.max(0, (m.hp / Math.max(1, m.maxHp)) * 100) + '%';
      const shPct = m.shield > 0 ? Math.min(100, (m.shield / Math.max(1, m.maxHp)) * 100) : 0;
      w.shBox.classList.toggle('on', shPct > 0);
      if (shPct > 0) w.shFill.style.width = shPct + '%';
      const key = statusKey(m);
      if (key !== w.key) { w.key = key; w.ico.textContent = key; }
      // hurt flash when hp dropped since last sync (dungeon-style hit feedback)
      if (m.hp < w.lastHp) {
        w.cv.classList.remove('hurt');
        void w.cv.offsetWidth; // reflow → restart animation
        w.cv.classList.add('hurt');
      }
      w.lastHp = m.hp;
    }
  }
  for (const [m, w] of walkers) {
    if (!alive.has(m)) {
      // death burst at last walker cell (dungeon FX)
      if (st.run.phase === 'combat') {
        const cells = Path.branchCells(typeof m.branch === 'number' ? m.branch : 0);
        const maxI = cells.length - 1;
        const i = Math.min(maxI - 1, Math.max(0, Math.floor(m.progress)));
        const t = Math.min(1, Math.max(0, m.progress - i));
        const a = cells[i], b = cells[Math.min(maxI, i + 1)];
        const gx = a.x + (b.x - a.x) * t, gy = a.y + (b.y - a.y) * t;
        FX.burst(cellA(gx), cellA(gy), (U as any).TYPE_COLOR[m.types?.[0]] || '#fff', 9, 130);
      }
      w.root.remove(); walkers.delete(m);
    }
  }
}

function renderStage(): void {
  clearWalkers();
  unitCv.clear();
  acProjs.length = 0;
  acImpacts.length = 0;
  FX.clear();
  const box = $('ac-board');
  box.innerHTML = '';
  // dungeon-world terrain: autotiled floor ring + rock platform (Tiles.paintChunk)
  const N = Path.W + 2; // 5×5 grid
  const tc = document.createElement('canvas');
  tc.className = 'ac-tiles';
  tc.width = N * Tiles.T; tc.height = N * Tiles.T;
  if (CTX_OK) {
    const tg = tc.getContext('2d');
    if (tg) {
      tg.imageSmoothingEnabled = false;
      const at = (tx: number, ty: number) =>
        tx >= 1 && tx <= 3 && ty >= 1 && ty <= 3 ? 'wall' : 'floor';
      tg.drawImage(Tiles.paintChunk(0, 0, N, at, () => 0.5, 0, 1337), 0, 0);
    }
  }
  box.appendChild(tc);
  // ring: 16 unique cells across both branches
  const seen = new Set<string>();
  for (const branch of [0, 1]) {
    for (const c of Path.branchCells(branch)) {
      const k = c.x + ',' + c.y;
      if (seen.has(k)) continue;
      seen.add(k);
      const n = document.createElement('div');
      n.className = 'ac-path-node';
      n.dataset.xy = k;
      n.style.gridColumn = String(c.x + 2);
      n.style.gridRow = String(c.y + 2);
      if (c.x === Path.SPAWN.x && c.y === Path.SPAWN.y) { n.classList.add('spawn'); n.textContent = 'SPAWN'; }
      else if (c.x === Path.BASE.x && c.y === Path.BASE.y) { n.classList.add('base'); n.textContent = 'BASE'; }
      else if (CTX_OK && U.hash(c.x, c.y, 7) < 0.4) {
        // dungeon grass tuft prop on the path (visual only)
        const gr = Tiles.propSprite(0, 'grass', Math.floor(U.hash(c.x, c.y, 8) * 3));
        gr.className = 'ac-prop';
        n.appendChild(gr);
      }
      box.appendChild(n);
    }
  }
  // rocks: 3x3 placement grid
  const rocks = document.createElement('div');
  rocks.className = 'ac-rocks';
  for (let y = 0; y < Path.H; y++) {
    for (let x = 0; x < Path.W; x++) {
      const cell = document.createElement('div');
      cell.className = 'ac-cell';
      cell.dataset.xy = x + ',' + y;
      const u = unitAt(x, y);
      if (u) {
        if (st.sel === u) cell.classList.add('sel');
        const cv = UI.spriteCanvas(u.dex, 44, 44, { scale: 2, lively: true });
        cell.appendChild(cv);
        unitCv.set(x + ',' + y, cv);
        if (u.star > 1) cell.insertAdjacentHTML('beforeend', `<span class="st">${'★'.repeat(u.star)}</span>`);
        cell.insertAdjacentHTML('beforeend', `<span class="hp"><i style="width:100%"></i></span>`);
      }
      cell.onclick = () => onCell(x, y);
      rocks.appendChild(cell);
    }
  }
  box.appendChild(rocks);
  // walker layer (mobs)
  const mobLayer = document.createElement('div');
  mobLayer.className = 'ac-mobs';
  mobLayer.id = 'ac-mobs';
  box.appendChild(mobLayer);
  // fx overlay: dungeon projectiles/particles (art-px canvas, CSS-upscaled)
  const fc = document.createElement('canvas');
  fc.className = 'ac-fx';
  fc.width = N * Tiles.T; fc.height = N * Tiles.T;
  box.appendChild(fc);
  fxCanvas = fc;
}

function renderBench(): void {
  const box = $('ac-bench');
  box.innerHTML = '';
  for (let i = 0; i < Board.BENCH_SIZE; i++) {
    const slot = document.createElement('div');
    slot.className = 'ac-slot';
    const u = st.board.units.find((x) => x.bench === i) || null;
    if (u) {
      if (st.sel === u) slot.classList.add('sel');
      slot.appendChild(UI.spriteCanvas(u.dex, 40, 40, { scale: 2, lively: true }));
      if (u.star > 1) slot.insertAdjacentHTML('beforeend', `<span class="st">${'★'.repeat(u.star)}</span>`);
      slot.onclick = () => onBench(i);
    }
    box.appendChild(slot);
  }
}

function renderShop(): void {
  const box = $('ac-shop');
  box.innerHTML = '';
  st.shop.slots.forEach((slot, i) => {
    const card = document.createElement('div');
    if (!slot) { card.className = 'ac-card'; box.appendChild(card); return; }
    const cost = Shop.slotCost(slot);
    card.className = 'ac-card' + (st.run.gold < cost ? ' off' : '');
    card.dataset.sfx = 'none'; // buy/error played explicitly in onBuy
    card.appendChild(UI.spriteCanvas(slot.dex, 40, 40, { scale: 2, lively: true }));
    const e = ((G as any).DEX_BY || {})[slot.dex] || {};
    card.insertAdjacentHTML(
      'beforeend',
      `<span class="cost">${cost} <span class="coin"></span></span><span>${esc(e.name || '?')}</span>` +
      `<span class="st">${'★'.repeat(slot.star)}</span>`
    );
    card.onclick = () => { if (dragClick) { dragClick = false; return; } onBuy(i); };
    card.addEventListener('pointerdown', (ev) => startDrag(i, ev));
    box.appendChild(card);
  });
  const rr = document.createElement('button');
  rr.className = 'ac-card reroll';
  rr.dataset.sfx = 'none'; // buy/error played explicitly in onReroll
  rr.innerHTML = `↻<br>2 <span class="coin"></span>`;
  rr.onclick = () => onReroll();
  box.appendChild(rr);
}

// ---------------- drag & drop buy (pointer) ----------------
/** px before a pointerdown becomes a real drag (below = tap → click buys) */
const DRAG_THRESH = 6;
let drag: { idx: number; x0: number; y0: number; ghost: HTMLDivElement } | null = null;
let dragMoved = false;
/** set after real drag end so the follow-up click on the card doesn't double-buy */
let dragClick = false;

function startDrag(i: number, e: any): void {
  if (drag || (e.button ?? 0) > 0) return;
  dragClick = false; // fresh gesture — never inherit a stale suppress flag
  const slot = st.shop.slots[i];
  if (!slot) return;
  const ghost = document.createElement('div');
  ghost.className = 'ac-drag';
  const cost = Shop.slotCost(slot);
  const d = ((G as any).DEX_BY || {})[slot.dex] || {};
  ghost.innerHTML = `<b>${cost} <span class="coin"></span></b><span>${esc(d.name || '?')}</span>`;
  ghost.style.left = (e.clientX ?? 0) + 'px';
  ghost.style.top = (e.clientY ?? 0) + 'px';
  document.body.appendChild(ghost);
  drag = { idx: i, x0: e.clientX ?? 0, y0: e.clientY ?? 0, ghost };
  dragMoved = false;
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp);
  window.addEventListener('pointercancel', onDragCancel);
}

function onDragMove(e: any): void {
  if (!drag) return;
  drag.ghost.style.left = (e.clientX ?? 0) + 'px';
  drag.ghost.style.top = (e.clientY ?? 0) + 'px';
  if (Math.hypot((e.clientX ?? 0) - drag.x0, (e.clientY ?? 0) - drag.y0) > DRAG_THRESH) dragMoved = true;
}

function stopDrag(): void {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
  window.removeEventListener('pointercancel', onDragCancel);
  drag?.ghost.remove();
  drag = null;
}

function onDragCancel(): void { stopDrag(); }

function onDragUp(e: any): void {
  const d = drag;
  stopDrag();
  if (!d || !dragMoved) return; // tap → plain click path buys
  dragClick = true;
  setTimeout(() => { dragClick = false; }, 50);
  // touch = implicit pointer capture on card → resolve real element under cursor
  const el = ((document as any).elementFromPoint?.(e.clientX, e.clientY) as Element | null)
    || (e.target as Element | null);
  const cellEl = el && typeof el.closest === 'function' ? el.closest('.ac-cell') : null;
  if (!cellEl) { onBuy(d.idx); return; } // drop elsewhere (bench/empty/UI): buy to bench
  // drop on board cell: buy → auto-place the fresh unit there (prep only, empty cell, no merge)
  const before = new Set(st.board.units);
  const r = onBuy(d.idx);
  if (!r || !r.ok || r.merged) return;
  const u = st.board.units.find((x) => !before.has(x));
  if (!u || st.run.phase === 'combat') return;
  const xy = (cellEl as HTMLElement).dataset?.xy || '';
  const [x, y] = xy.split(',').map(Number);
  if (!unitAt(x, y) && Board.place(st.board, u, x, y, LEVEL)) afterBoardChange();
}

const SYN_ICO: Record<string, string> = {
  fire: '🔥', water: '💧', grass: '🌿', electric: '⚡', psychic: '🌀',
};

function renderSyn(): void {
  const counts = Synergy.counts(Board.placed(st.board));
  const box = $('ac-syn');
  box.innerHTML = Synergy.DEFS.map((d) => {
    const n = counts[d.id] || 0;
    const cls = n >= 3 ? 't3' : n >= 2 ? 't2' : 'off';
    return `<span class="syn-chip ${cls}">${SYN_ICO[d.id] || '✦'} ${n}/3</span>`;
  }).join('');
}

function renderAll(): void {
  renderHud();
  renderStage();
  renderBench();
  renderShop();
  renderSyn();
  $('ac-sell').classList.toggle('hidden', !st.sel);
}

// ---------------- interactions ----------------

function onCell(x: number, y: number): void {
  if (st.run.phase === 'combat') return; // lock board mid-fight (P17 rule)
  const here = unitAt(x, y);
  if (st.sel) {
    if (here === st.sel) return;
    if (here) { st.sel = here; renderAll(); return; } // swap select
    if (Board.place(st.board, st.sel, x, y, LEVEL)) {
      st.sel = null;
      afterBoardChange();
    } else {
      Audio.sfx('error', undefined);
      UI.toast("Can't place there");
    }
  } else if (here) {
    st.sel = here;
    renderAll();
  }
}

function onBench(i: number): void {
  const u = st.board.units.find((x) => x.bench === i);
  if (!u) return;
  if (st.sel && st.sel !== u && st.sel.x !== null) {
    // recall selected board unit → swap into bench
    Board.toBench(st.board, st.sel);
    st.sel = u;
  } else {
    st.sel = st.sel === u ? null : u;
  }
  afterBoardChange();
}

/** Buy champion i. Returns Shop.buy result (drag-drop drop handler checks ok/merged). */
function onBuy(i: number) {
  const r = Shop.buy(st.shop, i, st.board, st.run.gold);
  if (!r.ok) {
    Audio.sfx('error', undefined);
    UI.toast('Not enough gold or bench full');
    return r;
  }
  st.run.gold = r.gold;
  Audio.sfx('buy', undefined);
  if (r.merged) UI.toast(`★ merge ×${r.merged}`);
  afterBoardChange();
  return r;
}

function onReroll(): void {
  const r = Shop.reroll(st.shop, st.run.gold, st.run.wave);
  if (!r.ok) {
    Audio.sfx('error', undefined);
    UI.toast('Not enough gold');
    return;
  }
  st.run.gold = r.gold;
  Audio.sfx('buy', undefined);
  renderAll();
}

function onSell(): void {
  if (!st.sel) return;
  const name = st.sel;
  st.run.gold = Shop.sell(st.board, name, st.run.gold);
  st.sel = null;
  Audio.sfx('coin', undefined);
  UI.toast('Sold');
  afterBoardChange();
}

function afterBoardChange(): void {
  renderAll();
  // invalidate battle units mid-prep (rebuilt at combat start anyway)
}

function onStart(): void {
  WaveRunner.forceStart(st.run);
  enterCombat();
}

function onBuffPick(buff: BuffDef): void {
  WaveRunner.pickBuff(st.run, buff);
  UI.toast(`${buff.name}: ${buff.desc}`);
  Audio.sfx('confirm', undefined);
  hideOver();
  renderAll();
  if (st.open) requestAnimationFrame(loop); // resume after buff overlay
}

function onExit(): void {
  close();
}

function showOver(icon: string, sub: string): void {
  const ov = $('ac-over');
  ov.classList.remove('hidden');
  ov.innerHTML = `
    <div class="box center">
      <div class="ac-over-ico">${Icons.html(icon, 34)}</div>
      <p class="sub">${esc(sub)}</p>
      <div class="ac-btns">
        <button class="btn gold small" id="ac-again">Play again</button>
        <button class="btn small" id="ac-menu">Menu</button>
      </div>
    </div>`;
  $('ac-again').onclick = () => { hideOver(); reset(); if (st.open) requestAnimationFrame(loop); };
  $('ac-menu').onclick = () => close();
}

function hideOver(): void {
  $('ac-over').classList.add('hidden');
}

// ---------------- pause + keyboard ----------------

function togglePause(force?: boolean): void {
  if (!st.open || !$('scr-ac')) return;
  // reward / game-over overlay owns the screen
  if ($('ac-over') && !$('ac-over').classList.contains('hidden')) return;
  const ov = $('ac-pause');
  const next = force ?? ov.classList.contains('hidden');
  ov.classList.toggle('hidden', !next);
  st.paused = next;
  if (next) {
    UI.soundControls($('ac-pause-sound'));
    Audio.sfx('select', undefined);
  } else {
    st.last = performance.now();
    Audio.sfx('click', undefined);
  }
}

function onKey(e: KeyboardEvent): void {
  if (!st.open) return;
  const k = e.key;
  if (k === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (st.paused) return;
  if (k >= '1' && k <= '3') { e.preventDefault(); onBuy(+k - 1); }
  else if (k === 'r' || k === 'R') { e.preventDefault(); onReroll(); }
  else if (k === ' ' || k === 'Enter') {
    if (st.run.phase === 'prep' && $('ac-over').classList.contains('hidden')) {
      e.preventDefault();
      onStart();
    }
  }
}

// ---------------- loop ----------------

/** teamMods × run.buffs (permanent buff-pick multipliers) */
function battleMods(): SynergyMods {
  const t = Team.teamMods(st.board);
  const b = st.run.buffs;
  return {
    ...t,
    atkMul: t.atkMul * b.atkMul,
    baseHpMul: t.baseHpMul * b.hpMul,
    atkSpdMul: t.atkSpdMul * b.asMul,
  };
}

function enterCombat(): void {
  st.sel = null;
  st.units = Team.spawnUnits(st.board, battleMods());
  renderAll();
}

function loop(ts: number): void {
  if (!st.open) return;
  if (st.paused) { st.last = ts; requestAnimationFrame(loop); return; }
  const dt = Math.min(0.1, (ts - st.last) / 1000 || 0);
  st.last = ts;
  const r = st.run;
  if (r.phase === 'combat' || r.phase === 'prep') {
    const prev = r.phase;
    const changed = WaveRunner.tick(r, st.units, dt, battleMods());
    const after: string = r.phase;
    if (changed) {
      if (prev === 'prep' && after === 'combat') enterCombat();
      else if (after === 'buff') {
        st.shop = Shop.createShop(r.wave); // wave cleared → free shop refresh
        renderAll(); offerBuff(); return;
      }
      else if (after === 'lost') { renderAll(); showOver('ban', `Wave ${r.wave} — the base fell`); return; }
      else {
        if (prev === 'combat' && after === 'prep') {
          st.shop = Shop.createShop(r.wave); // wave cleared → free shop refresh
          UI.toast(`+${WaveRunner.WAVE_BONUS} gold`);
        }
        renderAll();
      }
    }
    if (after === 'combat') { renderHud(); syncWalkers(); playSwings(); stepFx(dt); updateCombatBars(); }
    else if (after === 'prep') renderHud();
  } else if (r.phase === 'won') {
    renderAll();
    showOver('trophy', `${WaveDef.MAX_WAVE} waves cleared! Gold: ${r.gold}`);
    return;
  }
  requestAnimationFrame(loop);
}

let buffPending = false;
function offerBuff(): void {
  if (buffPending) return;
  buffPending = true;
  const ov = $('ac-over');
  ov.classList.remove('hidden');
  const choices = Buffs.rollBuffs();
  ov.innerHTML = `
    <div class="box center">
      <h3>Wave ${st.run.wave} cleared — pick a buff</h3>
      <div class="ac-buff-3">
        ${choices.map((b, i) => `
          <button class="ac-buff" data-i="${i}">
            <b>${esc(b.name)}</b><span>${esc(b.desc)}</span>
          </button>`).join('')}
      </div>
    </div>`;
  ov.querySelectorAll<HTMLElement>('.ac-buff').forEach((el) => {
    el.onclick = () => { buffPending = false; onBuffPick(choices[+el.dataset.i!]); };
  });
}

/** Fire pending unit move flourishes (flag set by unitAI on each attack = anim name). */
function playSwings(): void {
  for (const b of st.units) {
    const anim = b.swing;
    if (!anim) continue;
    b.swing = undefined;
    const cv = unitCv.get(b.x + ',' + b.y);
    if (cv) UI.spriteHit(cv, anim, b.face);
    spawnMoveFx(b);
  }
}

/** Dungeon-style combat vfx for one attack: VFX projectile / FX beam / FX.slash + dmg number. */
function spawnMoveFx(b: UnitBattle): void {
  const hit = b.hit;
  b.hit = undefined;
  if (!hit) return;
  const move = (b as any).move || '';
  const M = move ? ((globalThis as any).G?.Moves?.BY_ID?.[move] ?? null) : null;
  const kind: string = M?.kind || 'melee';
  const type: string = M?.type || 'normal';
  const v: any = M ? VFX.forMove(M) : VFX.forType(type);
  const col = ((U as any).TYPE_COLOR[type] || '#fff') as string;
  const fx0 = cellA(b.x), fy0 = cellA(b.y) - LIFT;
  const hx = cellA(hit.x), hy = cellA(hit.y) - LIFT * 0.5;
  const dx = hx - fx0, dy = hy - fy0;
  const dist = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  const impact = (t: number, melee?: string | null) =>
    acImpacts.push({ t, x: hx, y: hy, dmg: hit.dmg, col, pal: v.pal || type, melee, angle: ang });
  if (v.beam || kind === 'beam') {
    // straight beam from caster to target (dungeon FX.beam pattern)
    FX.beam(fx0, fy0, ang, dist, 6, col, { pal: v.pal || type, beam: v.beam ?? null });
    impact(0.14);
  } else if (PROJ_KINDS.has(kind)) {
    const SPD = 150; // art px/s — short board hops read as ~0.1–0.3s
    acProjs.push({
      x: fx0, y: fy0, vx: (dx / dist) * SPD, vy: (dy / dist) * SPD,
      t: 0, life: Math.max(0.1, dist / SPD),
      vis: { proj: v.proj || VFX.forType(type).proj, pal: v.pal || type, trail: v.trail },
      dmg: hit.dmg, hx, hy, col,
    });
  } else if (kind === 'melee' || kind === 'dash') {
    impact(0.09, v.melee || 'impact'); // windup ≈ swing anim, then slash at target
  } else {
    // buff/aura/trail: flourish at caster + impact number at target
    FX.burst(fx0, fy0, col, 6, 90);
    impact(0.12);
  }
}

/** Advance + draw stage fx (call each combat frame; ctx null in tests). */
function stepFx(dt: number): void {
  if (!fxCanvas) return;
  const g = fxCanvas.getContext('2d');
  if (!g) return;
  // pending impacts: slash/burst + damage number
  for (let i = acImpacts.length - 1; i >= 0; i--) {
    const p = acImpacts[i];
    p.t -= dt;
    if (p.t > 0) continue;
    acImpacts.splice(i, 1);
    if (p.melee) FX.slash(p.x, p.y, p.angle, 11, 1.7, p.col, { pal: p.pal, melee: p.melee });
    else FX.burst(p.x, p.y, p.col, 7, 100);
    FX.dmgText(p.x, p.y - 6, Math.round(p.dmg), '#ffffff');
  }
  // projectiles: fly, trail, impact
  for (let i = acProjs.length - 1; i >= 0; i--) {
    const p = acProjs[i];
    p.t += dt;
    if (p.t >= p.life) {
      acProjs.splice(i, 1);
      FX.burst(p.hx, p.hy, p.col, 7, 110);
      FX.dmgText(p.hx, p.hy - 6, Math.round(p.dmg), '#ffffff');
      continue;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.vis.trail) FX.trail(p.vis.trail, p.vis.pal, p.x, p.y - LIFT, p.vx, p.vy);
  }
  // draw projectiles (dungeon Projectiles.draw: shadow, then VFX shape)
  g.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  g.fillStyle = 'rgba(0,0,0,.25)';
  for (const p of acProjs) {
    g.beginPath(); g.ellipse(p.x, p.y, 5, 2.2, 0, 0, 6.2832); g.fill();
  }
  for (const p of acProjs) {
    let angle = 0;
    if (VFX.isDir(p.vis.proj)) angle = Math.atan2(p.vy, p.vx);
    else if (VFX.spins(p.vis.proj)) angle = p.t * 9;
    VFX.draw(g, p.vis.proj, p.vis.pal, p.x, p.y - LIFT, {
      angle, alpha: Math.min(1, (p.life - p.t) * 6), scale: 1, frame: Math.floor(p.t * 12),
    });
  }
  // dungeon FX layer (particles, slashes, beams, dmg numbers)
  FX.update(dt);
  FX.draw(g);
}

function updateCombatBars(): void {
  // unit hp fills
  const cells = $('ac-board').querySelectorAll('.ac-cell');
  for (const cell of cells) {
    const xy = (cell as HTMLElement).dataset.xy!;
    const [x, y] = xy.split(',').map(Number);
    const u = unitAt(x, y);
    if (!u) continue;
    const fill = cell.querySelector('.hp i') as HTMLElement;
    if (!fill) continue;
    const b = st.units.find((bu) => bu.x === x && bu.y === y && bu.alive);
    fill.style.width = b ? Math.max(0, (b.hpCur / b.hp) * 100) + '%' : '0%';
  }
  renderHud();
}

// ---------------- lifecycle ----------------

function reset(): void {
  buffPending = false;
  st.run = WaveRunner.createRun();
  st.shop = Shop.createShop(1);
  st.board = { units: [] };
  st.sel = null;
  st.units = [];
  renderAll();
}

function wire(): void {
  $('ac-start').onclick = onStart;
  $('ac-close').onclick = onExit;
  $('ac-sell').onclick = onSell;
  $('ac-reroll').onclick = () => onReroll();
  $('ac-pause-btn').onclick = () => togglePause();
  $('ac-resume').onclick = () => togglePause(false);
  $('ac-quit').onclick = () => { togglePause(false); close(); };
  document.addEventListener('keydown', onKey);
}

function open(): void {
  ensureDom();
  reset();
  st.open = true;
  st.paused = false;
  st.last = performance.now();
  $('ac-pause').classList.add('hidden');
  $('ac-over').classList.add('hidden');
  UI.chrome(false);
  UI.show('scr-ac');
  Audio.sfx('confirm', undefined);
  requestAnimationFrame(loop);
}

function close(): void {
  st.open = false;
  st.paused = false;
  buffPending = false;
  $('ac-pause')?.classList.add('hidden');
  $('ac-over')?.classList.add('hidden');
  Audio.sfx('back', undefined);
  UI.show('scr-menu');
  UI.chrome(true);
}

const ACUI = {
  open, close, reset, syncWalkers,
  step: loop, // exported for tests: call manually (rAF stubbed)
  get run() { return st.run; }, get board() { return st.board; }, get shop() { return st.shop; },
};
register('AutochessUI', ACUI);
export { ACUI };
export default ACUI;
