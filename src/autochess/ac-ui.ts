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
import { boardStats } from './unit-stats';
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
    <div class="ac-app">
      <div class="ac-topbar">
        <button id="ac-pause-btn" class="ac-x" aria-label="Pause">II</button>
        <button id="ac-close" class="ac-x" aria-label="Exit">✕</button>
      </div>
      <div class="ac-arenas" id="ac-arenas">
        <div class="ac-arena foe" id="ac-arena-foe">
          <span class="ac-round" id="ac-round">Round 1</span>
          <div class="ac-foehud">
            <span class="ac-heart red">♥ <b id="ac-foe-hp">20</b></span>
            <span class="ac-cap" id="ac-foe-cap"></span>
          </div>
          <div class="ac-grid" id="ac-foe-grid"></div>
        </div>
        <div class="ac-power" id="ac-power">⚔️ 0</div>
        <div class="ac-arena me" id="ac-arena-me">
          <div class="ac-goldsun" id="ac-gold">☀️ <b>5</b></div>
          <button id="ac-sell" class="ac-trash" title="Sell selected">🗑</button>
          <div class="ac-me-hud">
            <span class="ac-heart blue">♥ <b id="ac-hp">45</b></span>
            <span class="ac-cap" id="ac-p-cap"></span>
          </div>
          <div class="ac-grid" id="ac-me-grid"></div>
        </div>
        <canvas class="ac-fx" id="ac-fx"></canvas>
      </div>
      <div class="ac-synbar" id="ac-syn"></div>
      <div class="ac-shoprow" id="ac-shop"></div>
      <div class="ac-footer">
        <button id="ac-reroll" class="ac-reroll" data-sfx="none"><span>↻</span><i>1</i></button>
        <div class="ac-readywrap">
          <button id="ac-start" class="ac-ready">Ready</button>
          <div class="ac-timer"><i id="ac-timer-fill"></i><span>⏳</span></div>
        </div>
      </div>
      <div class="ac-kbd">[1]–[3] buy · [R] reroll · [Space] start · [Esc] pause</div>
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

let lastFoeCap = -1;
let lastPCap = -1;

function playerPower(): number {
  let p = 0;
  for (const u of st.board.units) {
    if (u.x === null) continue;
    const s = boardStats(u.dex, u.star);
    if (s) p += s.atk + Math.round(s.hp / 20);
  }
  return p;
}

function setCap(id: string, dex: number | null, last: number): number {
  const box = $(id);
  if (dex === last) return last;
  box.innerHTML = '';
  if (dex != null && dex > 0) box.appendChild(UI.spriteCanvas(dex, 32, 32, { scale: 2 }));
  return dex ?? -1;
}

function renderHud(): void {
  const r = st.run;
  $('ac-round').textContent = `Round ${r.wave}`;
  $('ac-foe-hp').textContent = String(r.foe.hp);
  $('ac-hp').innerHTML = `♥ <b>${r.base.hp}</b>`;
  $('ac-gold').innerHTML = `☀️ <b>${r.gold}</b>`;
  $('ac-power').innerHTML = `⚔️ ${playerPower()}`;
  // prep timer bar
  const tf = $('ac-timer-fill');
  const pct = r.phase === 'prep' ? Math.max(0, Math.min(100, (r.prepLeft / WaveRunner.PREP_SECONDS) * 100)) : 0;
  tf.style.width = pct + '%';
  // Ready button state
  const btn = $('ac-start') as HTMLButtonElement;
  if (r.phase === 'prep') { btn.textContent = 'Ready'; btn.disabled = false; btn.classList.remove('fighting'); }
  else if (r.phase === 'combat') { btn.textContent = 'Fighting…'; btn.disabled = true; btn.classList.add('fighting'); }
  // avatars: first player unit / first enemy
  const fu = st.board.units.find((u) => u.x !== null);
  lastPCap = setCap('ac-p-cap', fu ? fu.dex : null, lastPCap);
  const fe = st.run.mobs.find((m) => m.alive) || null;
  lastFoeCap = setCap('ac-foe-cap', fe ? fe.dex : null, lastFoeCap);
}

function unitAt(x: number, y: number): BoardUnit | null {
  return st.board.units.find((u) => u.x === x && u.y === y) || null;
}

// ---------------- dual arenas: enemy grid (top) + player grid (bottom) ----------------

/** placed unit cell → stage sprite canvas (Attack flourish target) */
const unitCv = new Map<string, HTMLCanvasElement>();

// ---- combat fx canvas (dungeon VFX/FX) stretched over both arenas ----
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
/** move kinds that fly a dungeon VFX projectile (others: slash / beam / flourish) */
const PROJ_KINDS = new Set(['projectile', 'chain', 'cone', 'boomerang', 'meteor', 'mine', 'orbit']);
let fxCanvas: HTMLCanvasElement | null = null;

/** global cell (enemy y −1..−3, player y 0..2) → art px on the 3×7 fx canvas:
 *  enemy rows 0..2, gap row 3, player rows 4..6. */
function mfx(x: number, y: number): { x: number; y: number } {
  const row = y < 0 ? -y - 1 : 4 + y;
  return { x: (x + 0.5) * Tiles.T, y: (row + 0.5) * Tiles.T };
}

/** star + attack pill above a unit head (both arenas) */
function pill(star: number, atk: number): string {
  return `<span class="ac-pill"><b>${'★'.repeat(Math.max(1, star))}</b><i>⚔️ ${Math.round(atk)}</i></span>`;
}

/** 2 special buff tiles per round (deterministic from wave) */
function buffCells(wave: number): Set<string> {
  const a = Math.floor(U.hash(0, 0, wave * 97 + 1) * 9);
  const b = (a + 4 + Math.floor(U.hash(1, 2, wave * 31 + 7) * 4)) % 9;
  return new Set([`${a % 3},${Math.floor(a / 3)}`, `${b % 3},${Math.floor(b / 3)}`]);
}

function renderStage(): void {
  unitCv.clear();
  acProjs.length = 0;
  acImpacts.length = 0;
  FX.clear();
  const meBox = $('ac-me-grid');
  const foeBox = $('ac-foe-grid');
  meBox.innerHTML = '';
  foeBox.innerHTML = '';

  // enemy arena: prep = ghost preview of next round, combat = live handled by syncEnemies
  const preview = st.run.phase === 'combat' ? [] : WaveDef.compose(st.run.wave).mobs.slice(0, WaveRunner.MAX_FIELD);
  preview.forEach((spec, i) => {
    const slot = WaveRunner.FOE_SLOTS[i];
    const cell = document.createElement('div');
    cell.className = 'ac-cell ghost';
    cell.dataset.xy = slot.x + ',' + slot.y;
    cell.appendChild(UI.spriteCanvas(spec.dex, 40, 40, { scale: 2 }));
    cell.insertAdjacentHTML('beforeend', pill(spec.star, spec.atk));
    foeBox.appendChild(cell);
  });
  // fill empty foe cells (keep grid shape)
  if (foeBox.children.length < 9) {
    foeBox.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = WaveRunner.FOE_SLOTS[i];
      const cell = document.createElement('div');
      cell.className = 'ac-cell';
      cell.dataset.xy = slot.x + ',' + slot.y;
      const spec = preview[i];
      if (spec) {
        cell.classList.add('ghost');
        cell.appendChild(UI.spriteCanvas(spec.dex, 40, 40, { scale: 2 }));
        cell.insertAdjacentHTML('beforeend', pill(spec.star, spec.atk));
      }
      foeBox.appendChild(cell);
    }
  }

  // player arena 3×3
  const buffs = buffCells(st.run.wave);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const cell = document.createElement('div');
      cell.className = 'ac-cell';
      cell.dataset.xy = x + ',' + y;
      if (buffs.has(x + ',' + y)) cell.classList.add('buff');
      const u = unitAt(x, y);
      if (u) {
        if (st.sel === u) cell.classList.add('sel');
        const cv = UI.spriteCanvas(u.dex, 44, 44, { scale: 2, lively: true });
        cell.appendChild(cv);
        unitCv.set(x + ',' + y, cv);
        const st2 = boardStats(u.dex, u.star);
        cell.insertAdjacentHTML('beforeend', pill(u.star, st2 ? st2.atk : 0) + `<span class="hp"><i style="width:100%"></i></span>`);
      }
      cell.onclick = () => onCell(x, y);
      meBox.appendChild(cell);
    }
  }

  // fx overlay: stretched art-px canvas (3 cols × 7 rows) over both arenas
  const fc = $('ac-fx') as HTMLCanvasElement;
  fc.width = 3 * Tiles.T;
  fc.height = 7 * Tiles.T;
  fxCanvas = fc;
}

/** sync enemy sprites into foe-grid cells (spawn / hp / death) each combat frame */
const foeLastHp = new Map<MobBattle, number>();
function syncEnemies(): void {
  const box = document.getElementById('ac-foe-grid');
  if (!box) return;
  const seen = new Set<MobBattle>();
  if (st.run.phase === 'combat') {
    for (const m of st.run.mobs) {
      if (!m.alive) continue;
      seen.add(m);
      const cell = box.querySelector(`[data-xy="${m.cx},${m.cy}"]`) as HTMLElement | null;
      if (!cell) continue;
      cell.classList.remove('ghost');
      if (!cell.querySelector('canvas')) {
        cell.innerHTML = '';
        cell.appendChild(UI.spriteCanvas(m.dex, 44, 44, { scale: 2, lively: true }));
        cell.insertAdjacentHTML('beforeend', pill(m.star, m.atk) + '<span class="hp"><i></i></span>');
        if (m.boss) cell.classList.add('boss');
      }
      const fill = cell.querySelector('.hp i') as HTMLElement | null;
      if (fill) fill.style.width = Math.max(0, (m.hp / Math.max(1, m.maxHp)) * 100) + '%';
      const prev = foeLastHp.get(m) ?? m.hp;
      if (m.hp < prev) {
        const cv = cell.querySelector('canvas');
        if (cv) { cv.classList.remove('hurt'); void cv.offsetWidth; cv.classList.add('hurt'); }
      }
      foeLastHp.set(m, m.hp);
    }
  }
  // death: clear cells whose mob is gone (burst at cell)
  for (const cell of box.querySelectorAll<HTMLElement>('.ac-cell')) {
    if (!cell.querySelector('canvas')) continue;
    const [x, y] = (cell.dataset.xy || '').split(',').map(Number);
    const m = st.run.mobs.find((mm) => mm.cx === x && mm.cy === y && seen.has(mm));
    if (!m) {
      const a = mfx(x, y);
      FX.burst(a.x, a.y - LIFT, '#fff', 8, 120);
      cell.innerHTML = '';
      cell.classList.remove('boss', 'ghost');
    }
  }
}

function renderShop(): void {
  const box = $('ac-shop');
  box.innerHTML = '';
  st.shop.slots.forEach((slot, i) => {
    const card = document.createElement('div');
    if (!slot) { card.className = 'ac-card empty'; box.appendChild(card); return; }
    const cost = Shop.slotCost(slot);
    card.className = 'ac-card' + (st.run.gold < cost ? ' off' : '');
    card.dataset.sfx = 'none'; // buy/error played explicitly in onBuy
    const bs = boardStats(slot.dex, slot.star);
    const e = ((G as any).DEX_BY || {})[slot.dex] || {};
    card.innerHTML =
      `<span class="ac-cost">${cost}</span>` +
      `<span class="ac-cardname">${esc(e.name || '?')}</span>` +
      `<span class="ac-strip">⚔️ ${bs ? bs.atk : '?'}</span>` +
      (slot.star > 1 ? `<span class="st">${'★'.repeat(slot.star)}</span>` : '');
    const spr = document.createElement('span');
    spr.className = 'ac-sprite';
    spr.appendChild(UI.spriteCanvas(slot.dex, 48, 48, { scale: 2, lively: true }));
    card.insertBefore(spr, card.querySelector('.ac-strip'));
    card.onclick = () => { if (dragClick) { dragClick = false; return; } onBuy(i); };
    card.addEventListener('pointerdown', (ev) => startDrag(i, ev));
    box.appendChild(card);
  });
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
  renderShop();
  renderSyn();
  $('ac-sell').classList.toggle('off', !st.sel);
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

/** Buy champion i. Returns Shop.buy result (drag-drop drop handler checks ok/merged). */
function onBuy(i: number) {
  const r = Shop.buy(st.shop, i, st.board, st.run.gold);
  if (!r.ok) {
    Audio.sfx('error', undefined);
    UI.toast('Not enough gold or board full');
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
  if (st.run.phase !== 'prep') return;
  if (!st.board.units.some((u) => u.x !== null)) {
    UI.toast('Place units first');
    Audio.sfx('error', undefined);
    return;
  }
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
    if (after === 'combat') { syncEnemies(); renderHud(); playSwings(); stepFx(dt); updateCombatBars(); }
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

/** Dungeon SFX alias table (player.cast SND): newer move kinds sound like their classic cousin. */
const SHOT_SND: Record<string, string> = {
  boomerang: 'projectile', chain: 'beam', mine: 'nova', meteor: 'nova',
  turret: 'buff', dash: 'melee', trail: 'aura', cone: 'projectile',
};

/** Fire pending unit move flourishes (flag set by unitAI on each attack = anim name).
 * Dungeon resources: Sprites.Animator one-shot (Attack/Shoot/Charge) + player.cast
 * adaptive speed (animLen / atkCd) + shot sfx by move kind/type. */
function playSwings(): void {
  for (const b of st.units) {
    const anim = b.swing;
    if (!anim) continue;
    b.swing = undefined;
    const cv = unitCv.get(b.x + ',' + b.y);
    const move = (b as any).move || '';
    const M = move ? ((globalThis as any).G?.Moves?.BY_ID?.[move] ?? null) : null;
    const kind: string = M?.kind || 'melee';
    if (cv) {
      // dungeon player.cast(): pace anim to cooldown so fast atks chain, slow atks linger
      const meta = Sprites.animMeta(String(b.dex), anim);
      const len = meta ? meta.d.reduce((a: number, c: number) => a + c, 0) / 60 : 0.4;
      const cd = Math.max(0.12, b.atkCd || 0.5);
      UI.spriteHit(cv, anim, b.face, Math.max(1, len / (cd * 0.9)));
    }
    if (kind !== 'trail') Audio.sfx('shot', { kind: (SHOT_SND as any)[kind] || kind, type: M?.type || 'normal' });
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
  const f0 = mfx(b.x, b.y), h0 = mfx(hit.x, hit.y);
  const fx0 = f0.x, fy0 = f0.y - LIFT;
  const hx = h0.x, hy = h0.y - LIFT * 0.5;
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
  // player unit hp fills
  for (const cell of document.querySelectorAll<HTMLElement>('#ac-me-grid .ac-cell')) {
    const [x, y] = (cell.dataset.xy || '').split(',').map(Number);
    const fill = cell.querySelector('.hp i') as HTMLElement | null;
    if (!fill) continue;
    const b = st.units.find((bu) => bu.x === x && bu.y === y && bu.alive);
    fill.style.width = b ? Math.max(0, (b.hpCur / b.hp) * 100) + '%' : '0%';
  }
  // enemy hp fills (sprites synced by syncEnemies)
  for (const cell of document.querySelectorAll<HTMLElement>('#ac-foe-grid .ac-cell')) {
    const [x, y] = (cell.dataset.xy || '').split(',').map(Number);
    const fill = cell.querySelector('.hp i') as HTMLElement | null;
    if (!fill) continue;
    const m = st.run.mobs.find((mm) => mm.cx === x && mm.cy === y && mm.alive);
    fill.style.width = m ? Math.max(0, (m.hp / Math.max(1, m.maxHp)) * 100) + '%' : '0%';
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
  open, close, reset, syncEnemies,
  step: loop, // exported for tests: call manually (rAF stubbed)
  get run() { return st.run; }, get board() { return st.board; }, get shop() { return st.shop; },
  get units() { return st.units; },
};
register('AutochessUI', ACUI);
export { ACUI };
export default ACUI;
