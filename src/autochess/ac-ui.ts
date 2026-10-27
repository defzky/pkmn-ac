/**
 * ac-ui.ts — autochess screen: mode select (TD / Full Autochess) → arena render + shop + HUD + phase loop.
 *
 * Modes:
 *  - 'auto': dual-board 3x3 (enemy top, player bottom), foe heart 20 / player 45.
 *  - 'td': single 3x3 player board + serpentine path, mobs walk to base, leak = base HP damage.
 * Loop: prep countdown → combat rAF tick(runner) → buff pick (every 3rd) → … .
 * Placement = drag shop card onto cell, or tap unit → tap cell (mobile-friendly).
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
import { WaveRunner } from './wave-runner';
import { WaveRunnerTd } from './wave-runner-td';
import { WaveDef } from './wave';
import { runScore } from './base';
import { recordRun, bestOf } from './ac-save';
import { track, flushNow } from '../core/telemetry';
import { waveRnd, shopRnd, seedFromDate, dailyKey } from './rng';
import Types from '../data/types';
import { DEFS } from './champions';
import { Buffs, type BuffDef } from './buffs';
import { isFlank, FLANK_ATK_MUL } from './unit';
import { planMoveFx } from './move-fx';
import { evoDex } from './evo';
import type { UnitBattle } from './unit';
import type { MobBattle } from './unitAI';
import { Path } from './path';

/** active mode: 'auto' = dual-board, 'td' = tower defence (path walk + leak) */
let currentMode: 'auto' | 'td' = 'auto';

interface ACInternal {
  run: any; // RunState (auto) | TdRunState (td)
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
    <canvas class="ac-bg" id="ac-bg" aria-hidden="true"></canvas>
    <div class="ac-app">
      <div class="ac-topbar">
        <span class="ac-round" id="ac-round">Round 1</span>
        <b class="ac-streak" id="ac-streak" hidden></b>
        <span class="ac-heart blue" id="ac-hp">♥ <b>45</b></span>
        <span class="ac-heart red" id="ac-foe-hp">♥ <b>20</b></span>
        <span class="ac-power" id="ac-power">⚔️ 0</span>
        <button id="ac-pause-btn" class="ac-x" aria-label="Pausa">II</button>
        <button id="ac-close" class="ac-x" aria-label="Salir de la partida">✕</button>
      </div>
      <div class="ac-arenas" id="ac-arenas">
        <div class="ac-td-wave" id="ac-td-wave"></div>
        <div class="ac-arena foe" id="ac-arena-foe">
          <span class="ac-caplbl foe">ENEMIGO</span>
          <div class="ac-foechips" id="ac-foechips"></div>
          <div class="ac-grid" id="ac-foe-grid"></div>
        </div>
        <div class="ac-arow">
          <div class="ac-arena me" id="ac-arena-me">
            <span class="ac-caplbl me">EQUIPO</span>
            <button id="ac-sell" class="ac-trash" title="Vender la seleccionada" aria-label="Vender la seleccionada">🗑</button>
            <div class="ac-me-hud">
              <span class="ac-cap" id="ac-p-cap"></span>
            </div>
            <div class="ac-grid" id="ac-me-grid"></div>
          </div>
          <div class="ac-synbar" id="ac-syn"></div>
        </div>
        <span class="ac-td-base" id="ac-td-base" hidden><span class="ac-base-ring" id="ac-base-ring"><b>🏰</b></span><span class="ac-td-hptext" id="ac-td-hptext">♥ <b>100</b></span><span class="ac-td-hp"><i id="ac-td-hp-fill"></i></span></span>
        <div class="ac-td-lanes" id="ac-td-lanes" hidden></div>
        <canvas class="ac-fx" id="ac-fx"></canvas>
        <div class="ac-banner" id="ac-banner" hidden></div>
      </div>
      <div class="ac-dock">
        <div class="ac-goldsun" id="ac-gold">☀️ <b>5</b></div>
        <div class="ac-footer">
          <button id="ac-reroll" class="ac-reroll" data-sfx="none" aria-label="Recargar la tienda"><span>↻</span><i>1</i></button>
          <div class="ac-readywrap">
            <button id="ac-start" class="ac-ready">Listo</button>
            <div class="ac-timer"><i id="ac-timer-fill"></i><span>⏳</span></div>
          </div>
        </div>
        <div class="ac-shoprow" id="ac-shop"></div>
      </div>
      <div class="ac-kbd">[1]–[3] buy · [R] reroll · [Space] start · [Esc] pause</div>
    </div>
    <div class="ac-over hidden" id="ac-over"></div>
    <div class="ac-tut hidden" id="ac-tut"><span id="ac-tut-text"></span><button class="btn small" id="ac-tut-skip">Saltar</button></div>
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

let lastPCap = -1;
let lastBaseHp: number | null = null;
/** AU-2: topbar heart tracking (auto mode) */
let lastPlayerHp: number | null = null;
let lastFoeHp: number | null = null;
/** last Round number shown — wave++ re-pulses the .ac-round pill (Fase L) */
let lastRoundWave: number | null = null;

/** centered status banner (wave start / clear / boss / leak) — Fase J juice */
function banner(kind: 'wave' | 'clear' | 'boss' | 'leak', big: string, sub = ''): void {
  const el = $('ac-banner');
  el.hidden = false;
  el.className = 'ac-banner' + (kind === 'boss' ? ' boss' : kind === 'leak' ? ' leak' : kind === 'clear' ? ' clear' : '');
  el.innerHTML = `<b>${esc(big)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
  // retrigger the pop-in animation
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout((banner as any)._t);
  (banner as any)._t = setTimeout(() => {
    el.classList.add('out');
    (banner as any)._t2 = setTimeout(() => { el.hidden = true; }, 350);
  }, 1600);
}

/** base took a leak — flash base + pulse heart + red banner (Fase J) */
function leakFx(dmg: number): void {
  const base = $('ac-td-base');
  base.classList.remove('flash'); void base.offsetWidth; base.classList.add('flash');
  const heart = document.querySelector('.ac-heart.blue');
  if (heart) { heart.classList.remove('pulse'); void (heart as HTMLElement).offsetWidth; heart.classList.add('pulse'); }
  banner('leak', `Base hit! −${dmg}`, 'a mob leaked through');
  Audio.sfx('hurt', undefined);
  track('wave_leak', {
    wave: st.run.wave,
    boss: (st.run.mobs as any[]).some((m) => m.boss && m.alive),
    dmg,
  });
}

/** AU-2: heart hit — pulse + floating −N over the topbar heart (auto mode). */
function heartFx(el: HTMLElement | null, dmg: number): void {
  if (!el) return;
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  el.querySelectorAll('.ac-heartdmg').forEach((n) => n.remove()); // no stacking
  const fx = document.createElement('span');
  fx.className = 'ac-heartdmg';
  fx.textContent = '−' + dmg;
  el.appendChild(fx); // renderHud heart writes only update <b>, never wipe children
  setTimeout(() => fx.remove(), 950);
}

/** non-destructive heart value update (keeps the floating −N child alive) */
function setHeart(el: HTMLElement | null, hp: number): void {
  if (!el) return;
  const b = el.querySelector('b');
  if (b) b.textContent = String(hp);
  else el.innerHTML = `♥ <b>${hp}</b>`;
}

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
  if (dex != null && dex > 0) box.appendChild(UI.spriteCanvas(dex, 64, 64, { scale: 4 })); // res interna ×2, fitDraw evita recorte
  return dex ?? -1;
}

function renderHud(): void {
  const r: any = st.run;
  const td = currentMode === 'td';
  const rnd = $('ac-round');
  rnd.textContent = `Round ${r.wave}`;
  // wave change → pill pulse (Fase L)
  if (r.wave !== lastRoundWave) {
    if (lastRoundWave != null) { rnd.classList.remove('pulse'); void rnd.offsetWidth; rnd.classList.add('pulse'); }
    lastRoundWave = r.wave;
  }
  // foe HP pill lives in the topbar (auto only — CSS hides it in TD)
  if (!td) {
    const foeEl = $('ac-foe-hp') as HTMLElement;
    const fh = r.foe.hp;
    if (lastFoeHp != null && fh < lastFoeHp) heartFx(foeEl, lastFoeHp - fh); // AU-2
    lastFoeHp = fh;
    setHeart(foeEl, fh);
  }
  const php = r.base.hp;
  if (!td && lastPlayerHp != null && php < lastPlayerHp) heartFx($('ac-hp') as HTMLElement, lastPlayerHp - php);
  if (!td) lastPlayerHp = php;
  setHeart($('ac-hp') as HTMLElement, php);
  // AU-2: streak pip 🔥×N (topbar, visible from streak 2)
  const pip = $('ac-streak');
  if (pip) {
    const sk = r.streak || 0;
    pip.hidden = sk < 2;
    pip.textContent = '🔥×' + sk;
  }
  $('ac-gold').innerHTML = `☀️ <b>${r.gold}</b>`;
  $('ac-power').innerHTML = `⚔️ ${playerPower()}`;
  // prep timer bar (D2c: wave-scaled 25/15/12s)
  const tf = $('ac-timer-fill');
  const prepSec = WaveDef.prepSeconds(r.wave);
  const pct = r.phase === 'prep' ? Math.max(0, Math.min(100, (r.prepLeft / prepSec) * 100)) : 0;
  tf.style.width = pct + '%';
  // timer urgency: last 3s of prep → blink the fill (Fase J)
  if (r.phase === 'prep' && r.prepLeft <= 3) tf.classList.add('blink');
  else tf.classList.remove('blink');
  // leak feedback: base hp dropped → flash base + pulse heart + red banner (Fase J)
  if (td) {
    const hp = r.base.hp;
    if (lastBaseHp != null && hp < lastBaseHp) leakFx(hp - lastBaseHp);
    lastBaseHp = hp;
    // castle HP pill under the ring (Fase Q)
    const hpText = $('ac-td-hptext');
    if (hpText) hpText.innerHTML = `♥ <b>${hp}</b>`;
    // castle HP ring: conic-gradient arc % + color by hp band (Fase L)
    const ring = document.getElementById('ac-base-ring');
    if (ring) {
      const pct = Math.max(0, Math.round((hp / Math.max(1, r.base.maxHp)) * 100));
      (ring as HTMLElement).style.setProperty('--hp', String(pct));
      (ring as HTMLElement).style.setProperty('--hp-col', pct > 50 ? '#7dff9b' : pct > 25 ? '#ffd465' : '#ff6b6b');
      const bar = document.getElementById('ac-td-hp-fill');
      if (bar) bar.style.width = pct + '%';
    }
  }
  // Ready button state
  const btn = $('ac-start') as HTMLButtonElement;
  if (r.phase === 'prep') { btn.textContent = 'Listo'; btn.disabled = false; btn.classList.remove('fighting'); }
  else if (r.phase === 'combat') { btn.textContent = 'En combate…'; btn.disabled = true; btn.classList.add('fighting'); }
  // avatars: first player unit (foe cap dropped — .ac-foehud is hidden in auto, AU-4)
  const fu = st.board.units.find((u) => u.x !== null);
  lastPCap = setCap('ac-p-cap', fu ? evoDex(fu.dex, fu.star) : null, lastPCap);
  // D2b: flank highlight — lane-touching cells glow during prep (TD only)
  if (td) {
    const hlOn = r.phase === 'prep';
    for (const cell of document.querySelectorAll<HTMLElement>('#ac-me-grid .ac-cell')) {
      const [x, y] = (cell.dataset.xy || '').split(',').map(Number);
      cell.classList.toggle('flank', hlOn && isFlank(x, y));
    }
  }
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
type FlyMode = 'projectile' | 'boomerang' | 'cone' | 'meteor';
interface AcProj {
  mode: FlyMode;
  x: number; y: number; ox: number; oy: number; vx: number; vy: number;
  t: number; life: number; /** outbound flight time (boomerang turn point) */ out: number;
  vis: { proj: string; pal: string; trail?: string | null };
  dmg: number; hx: number; hy: number; col: string;
  /** draw damage number on impact (false for extra fan/boomerang copies) */
  showText: boolean;
  /** boomerang already hit at the turn point */
  hit: boolean;
  /** type effectiveness vs target (dungeon dmgText color: super yellow / weak gray) */
  eff?: 'super' | 'weak' | null;
}
interface AcImpact {
  t: number; x: number; y: number; dmg: number; col: string;
  pal: string; melee?: string | null; angle: number;
  /** total delay (telegraph growth denominator) */
  total?: number;
  /** ground telegraph radius (Hazards-style warning ring while t > 0) */
  tele?: number;
  eff?: 'super' | 'weak' | null;
}
const acProjs: AcProj[] = [];
const acImpacts: AcImpact[] = [];
/** time accumulator for pulsing ground status FX (stepFx) */
let fxT = 0;
let fxCanvas: HTMLCanvasElement | null = null;
const cellPx = new Map<string, { x: number; y: number }>();
let fxRo: ResizeObserver | null = null;

/** TD: board/path coord (x 0..2, y −1..3) → host-px centre. Uses real cell rects (gap-aware);
 * y −1 / y 3 map into reserved top/bottom lanes on `.ac-arenas`. */
function tdCellHostPos(x: number, y: number): { x: number; y: number } | null {
  const host = document.getElementById('ac-arenas');
  const meGrid = document.getElementById('ac-me-grid');
  if (!host || !meGrid) return null;
  const hostR = host.getBoundingClientRect();
  const c00 = meGrid.querySelector('.ac-cell[data-xy="0,0"]') as HTMLElement | null;
  const c10 = meGrid.querySelector('.ac-cell[data-xy="1,0"]') as HTMLElement | null;
  const c01 = meGrid.querySelector('.ac-cell[data-xy="0,1"]') as HTMLElement | null;
  if (!c00 || !c10 || !c01) return null;
  const r0 = c00.getBoundingClientRect();
  const r1 = c10.getBoundingClientRect();
  const r2 = c01.getBoundingClientRect();
  if (hostR.width <= 0 || r0.width <= 0) return null;
  const pitchX = r1.left - r0.left;
  const pitchY = r2.top - r0.top;
  const px = r0.left + r0.width / 2 - hostR.left + x * pitchX;
  // y −1 → half a pitch above row 0; y 3 → half a pitch below row 2 (lands in lane padding)
  const py = r0.top + r0.height / 2 - hostR.top + y * pitchY;
  return { x: px, y: py };
}

/** TD ring-lane tiles (both branches, dedup) outside the grid — pitch-sized squares. */
function renderTdLanes(): void {
  const box = document.getElementById('ac-td-lanes');
  if (!box) return;
  box.innerHTML = '';
  (box as HTMLElement).hidden = false;
  const c00 = document.querySelector('#ac-me-grid .ac-cell[data-xy="0,0"]') as HTMLElement | null;
  const c10 = document.querySelector('#ac-me-grid .ac-cell[data-xy="1,0"]') as HTMLElement | null;
  if (!c00 || !c10) return;
  const r0 = c00.getBoundingClientRect(), r1 = c10.getBoundingClientRect();
  const pitch = r1.left - r0.left;
  if (!(pitch > 0)) return; // jsdom / hidden — no layout, skip sizeless tiles
  // expose pitch so CSS can size lanes/mobs/lane-pad proportionally (not fixed px)
  const host = document.getElementById('ac-arenas');
  if (host) {
    host.style.setProperty('--ac-pitch', pitch + 'px');
    host.style.setProperty('--ac-lane-pad', Math.round(pitch * 0.28) + 'px');
  }
  const size = Math.round(pitch * 0.86);
  const seen = new Set<string>();
  for (const br of [0, 1]) {
    for (const c of Path.branchCells(br)) {
      const key = c.x + ',' + c.y;
      if (seen.has(key)) continue;
      seen.add(key);
      const p = tdCellHostPos(c.x, c.y);
      if (!p) continue;
      const tile = document.createElement('div');
      tile.className = 'ac-td-lane';
      tile.style.left = p.x + 'px';
      tile.style.top = p.y + 'px';
      tile.style.width = size + 'px';
      tile.style.height = size + 'px';
      box.appendChild(tile);
    }
  }
  // spawn portal at ring entry (1,-1) — rotating double-ring marker (Fase L)
  const sp = tdCellHostPos(1, -1);
  if (sp) {
    const port = document.createElement('div');
    port.className = 'ac-td-portal';
    port.id = 'ac-td-portal';
    port.style.left = sp.x + 'px';
    port.style.top = sp.y + 'px';
    box.appendChild(port);
  }
}

/** global cell (enemy y −1..−3, player y 0..2) → fallback world px on the 3×7 canvas. */
function mfx(x: number, y: number): { x: number; y: number } {
  if (currentMode === 'td') {
    // TD-aware: extrapolate from me-grid rects (fx canvas = host-sized, 1:1)
    const p = tdCellHostPos(x, y);
    if (p) return p;
  }
  const row = y < 0 ? -y - 1 : 4 + y;
  return { x: (x + 0.5) * Tiles.T * Sprites.PX, y: (row + 0.5) * Tiles.T * Sprites.PX };
}

/** Cell centre in fx-canvas world px. Uses real DOM rects when layout exists,
 * so projectiles line up with the actual grid padding/border/gaps. */
function cellCenter(x: number, y: number): { x: number; y: number } {
  const key = x + ',' + y;
  const cached = cellPx.get(key);
  if (cached) return cached;
  const host = document.getElementById('ac-arenas');
  if (host && currentMode === 'td') {
    // TD: board cells + path endpoints (y −1, y 3) via gap-aware pitch
    const p = tdCellHostPos(x, y);
    if (p) {
      // fx canvas buffer tracks host size (see sizeFxCanvas) → 1:1 host px
      const w = fxCanvas?.width || 0;
      const ht = fxCanvas?.height || 0;
      if (w > 0 && ht > 0) {
        const out = { x: (p.x / (host.getBoundingClientRect().width || w)) * w, y: (p.y / (host.getBoundingClientRect().height || ht)) * ht };
        cellPx.set(key, out);
        return out;
      }
      cellPx.set(key, p);
      return p;
    }
  }
  const cell = document.querySelector(`.ac-cell[data-xy="${key}"]`) as HTMLElement | null;
  if (host && cell) {
    const h = host.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    if (h.width > 0 && h.height > 0 && c.width > 0 && c.height > 0) {
      const w = fxCanvas?.width || 3 * Tiles.T * Sprites.PX;
      const ht = fxCanvas?.height || 7 * Tiles.T * Sprites.PX;
      const p = {
        x: ((c.left + c.width / 2 - h.left) / h.width) * w,
        y: ((c.top + c.height / 2 - h.top) / h.height) * ht,
      };
      cellPx.set(key, p);
      return p;
    }
  }
  return mfx(x, y);
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

/** wipe every TD-only layer: lanes + portal, castle marker, wave strip, pitch vars.
 *  Runs at the top of renderStage (idempotent — TD re-renders after) and on close(),
 *  so switching TD → autochess can never leak stale TD DOM/inline state. */
function clearTdLayers(): void {
  const lanes = document.getElementById('ac-td-lanes');
  if (lanes) { lanes.innerHTML = ''; lanes.hidden = true; }
  const base = document.getElementById('ac-td-base');
  if (base) { base.hidden = true; base.style.left = ''; base.style.top = ''; }
  const wave = document.getElementById('ac-td-wave');
  if (wave) wave.innerHTML = '';
  const host = document.getElementById('ac-arenas');
  if (host) {
    host.style.removeProperty('--ac-pitch');
    host.style.removeProperty('--ac-lane-pad');
  }
}

/** auto mode: size3×3 tiles from the REAL arena rect (topbar+dock already reserved
 *  by the .ac-app grid rows) → square cells, always fits, no vertical overflow on
 *  any viewport (portrait or landscape). Clamped 36–76px. */
function fitAutoTiles(): void {
  if (currentMode === 'td') return;
  const host = document.getElementById('ac-arenas');
  const foe = document.getElementById('ac-arena-foe');
  const me = document.getElementById('ac-arena-me');
  if (!host || !foe || !me) return;
  // AU-4: measure BOTH arenas, take min → portrait + landscape always square-match
  const sides: number[] = [];
  for (const el of [foe, me]) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) sides.push(Math.min(r.width, r.height));
  }
  if (!sides.length) return; // jsdom / hidden screen
  // arena is border-box: padding 10×2 + border 4×2 = 28; grid gap 6×2 = 12
  const side = Math.min(...sides) - 28 - 12;
  const tile = Math.max(36, Math.min(76, Math.floor(side / 3)));
  host.style.setProperty('--ac-tile', tile + 'px');
}

function renderStage(): void {
  unitCv.clear();
  cellPx.clear();
  acProjs.length = 0;
  acImpacts.length = 0;
  FX.clear();
  clearTdMobs();
  clearTdLayers();
  const meBox = $('ac-me-grid');
  const foeBox = $('ac-foe-grid');
  meBox.innerHTML = '';
  foeBox.innerHTML = '';

  const td = currentMode === 'td';
  const arenas = $('ac-arenas');
  arenas.classList.toggle('td-mode', td);
  // layout scoping classes (CSS: .mode-td / .mode-autochess own their mode rules)
  const scrAc = document.getElementById('scr-ac');
  scrAc?.classList.toggle('mode-td', td);
  scrAc?.classList.toggle('mode-autochess', !td);
  // landscape layout class (CSS @media orientation:landscape + .td-land → full-width grid)
  scrAc?.classList.toggle('td-land', td);

  // enemy arena: prep = ghost preview of next round (auto only; TD uses #ac-td-wave strip)
  if (!td) {
    const comp = WaveRunner.getComp(st.run as any);
    const preview = st.run.phase === 'combat' ? [] : comp.mobs.slice(0, WaveRunner.MAX_FIELD);
    // AU-3: foe-arena header = type chips + affix badge + overflow count (parity w/ TD strip)
    const chipsEl = $('ac-foechips');
    if (chipsEl) {
      if (preview.length) {
        const tset: string[] = [];
        for (const spec of preview) {
          const e = ((G as any).DEX_BY || {})[spec.dex] || {};
          for (const t of e.types || []) if (!tset.includes(t)) tset.push(t);
        }
        const over = Math.max(0, comp.mobs.length - WaveRunner.MAX_FIELD);
        chipsEl.innerHTML =
          `<span class="ac-td-types">${tset.map((t) =>
            `<i style="background:${(U.TYPE_COLOR as any)[t] || '#888'}">${esc(t)}</i>`).join('')}</span>` +
          (comp.affix ? `<b class="ac-td-affix a-${comp.affix}">${WaveDef.AFFIX_LABEL[comp.affix]}</b>` : '') +
          (over ? `<b class="ac-foe-over">+${over}</b>` : '');
      } else chipsEl.innerHTML = '';
    }
    preview.forEach((spec, i) => {
      const slot = WaveRunner.FOE_SLOTS[i];
      const cell = document.createElement('div');
      cell.className = 'ac-cell ghost' + (spec.boss ? ' boss' : '');
      cell.dataset.xy = slot.x + ',' + slot.y;
      cell.dataset.star = String(spec.star); // AU-4 star glow (CSS)
      const fe = ((G as any).DEX_BY || {})[spec.dex] || {};
      cell.setAttribute('role', 'img');
      cell.setAttribute('aria-label', `${fe.name || '?'} ★${spec.star}${spec.boss ? ' jefe' : ''}`);
      cell.appendChild(UI.spriteCanvas(spec.dex, 96, 96, { scale: 4.4 })); // cell res ×2.4, same fill as 44@2
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
          if (spec.boss) cell.classList.add('boss');
          cell.dataset.star = String(spec.star);
          const fe = ((G as any).DEX_BY || {})[spec.dex] || {};
          cell.setAttribute('role', 'img');
          cell.setAttribute('aria-label', `${fe.name || '?'} ★${spec.star}${spec.boss ? ' jefe' : ''}`);
          cell.appendChild(UI.spriteCanvas(spec.dex, 96, 96, { scale: 4.4 })); // cell res ×2.4, same fill as 44@2
          cell.insertAdjacentHTML('beforeend', pill(spec.star, spec.atk));
        }
        foeBox.appendChild(cell);
      }
    }
  } else {
    // TD: next-wave preview in visible strip above board + base gate marker at path end
    const waveBox = $('ac-td-wave');
    waveBox.innerHTML = '';
    const comp = WaveRunnerTd.getComp(st.run as any);
    const preview = st.run.phase === 'combat' ? [] : comp.mobs.slice(0, WaveRunnerTd.MAX_MOBS);
    waveBox.insertAdjacentHTML('beforeend', '<span class="ac-td-gate">⬇ Spawn</span>');
    // D2b: type chips (counter-building) + side summary of the coming wave
    // D2d: affix badge (Swarm/Fast/Armored/Elemental from wave 3)
    if (preview.length) {
      const tset: string[] = [];
      for (const spec of preview) {
        const e = ((G as any).DEX_BY || {})[spec.dex] || {};
        for (const t of e.types || []) if (!tset.includes(t)) tset.push(t);
      }
      const sides = preview.map((s) => s.side ?? 0);
      const sideHint = sides.every((s) => s === 0) ? '⬅ izquierda'
        : sides.every((s) => s === 1) ? '⭢ derecha' : '⬌ ambos';
      waveBox.insertAdjacentHTML('beforeend',
        `<span class="ac-td-types">${tset.map((t) =>
          `<i style="background:${(U.TYPE_COLOR as any)[t] || '#888'}">${esc(t)}</i>`).join('')}` +
        `<em>${sideHint}</em></span>` +
        (comp.affix ? `<b class="ac-td-affix a-${comp.affix}">${WaveDef.AFFIX_LABEL[comp.affix]}</b>` : ''));
    }
    preview.forEach((spec) => {
      const g = document.createElement('span');
      g.className = 'ac-td-ghost';
      g.appendChild(UI.spriteCanvas(spec.dex, 72, 72, { scale: 3, lively: true }));
      if (spec.boss) g.classList.add('boss');
      g.insertAdjacentHTML('beforeend', `<span class="ac-td-side">${(spec.side ?? 0) === 1 ? '⭢' : '⬅'}</span>`);
      waveBox.appendChild(g);
    });
    if (!preview.length) waveBox.insertAdjacentHTML('beforeend', '<span class="sub" style="font-size:11px">next wave…</span>');
    // base marker + lane tiles are positioned AFTER the player grid renders
    // (tdCellHostPos needs the cells) — see below.
  }

  // player arena 3×3
  const buffs = buffCells(st.run.wave);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const cell = document.createElement('div');
      cell.className = 'ac-cell';
      cell.dataset.xy = x + ',' + y;
      if (!td && buffs.has(x + ',' + y)) cell.classList.add('buff');
      const u = unitAt(x, y);
      cell.setAttribute('role', 'button');
      if (u) {
        const ue = ((G as any).DEX_BY || {})[u.dex] || {};
        cell.setAttribute('aria-label',
          `Casilla ${x + 1},${y + 1}: ${ue.name || '?'} ★${u.star}${st.sel === u ? ' — seleccionada' : ''}`);
        if (st.sel === u) cell.classList.add('sel');
        cell.dataset.star = String(u.star); // AU-4 star glow (CSS)
        const cv = UI.spriteCanvas(evoDex(u.dex, u.star), 96, 96, { scale: 4.4, lively: true }); // cell res ×2
        cell.appendChild(cv);
        unitCv.set(x + ',' + y, cv);
        const st2 = boardStats(u.dex, u.star);
        cell.insertAdjacentHTML('beforeend', pill(u.star, st2 ? st2.atk : 0) + `<span class="hp"><i style="width:100%"></i></span>`);
      } else {
        cell.setAttribute('aria-label', `Casilla ${x + 1},${y + 1}: vacía`);
      }
      cell.onclick = () => onCell(x, y);
      meBox.appendChild(cell);
    }
  }

  // TD base marker (ring end (1,3), both branches) + lane tiles outside the grid
  if (td) {
    const baseEl = $('ac-td-base');
    baseEl.hidden = false;
    const ringEnd = Path.branchCells(0);
    const bp = tdCellHostPos(ringEnd[ringEnd.length - 1].x, ringEnd[ringEnd.length - 1].y);
    if (bp) { baseEl.style.left = bp.x + 'px'; baseEl.style.top = bp.y + 'px'; }
    renderTdLanes();
  }

  // fx overlay: buffer tracks host rect (was hardcoded 3×7 world → anamorphic in TD)
  const fc = $('ac-fx') as HTMLCanvasElement;
  fxCanvas = fc;
  fitAutoTiles();
  sizeFxCanvas();
  paintAcBg();
  if (!fxRo && typeof ResizeObserver !== 'undefined') {
    fxRo = new ResizeObserver(() => { cellPx.clear(); fitAutoTiles(); sizeFxCanvas(); paintAcBg(); });
    fxRo.observe($('ac-arenas'));
    fxRo.observe($('scr-ac')); // bg canvas spans the whole screen
  }
}

/** size fx canvas buffer to host CSS px (1:1) so effects never stretch anamorphic */
function sizeFxCanvas(): void {
  const fc = fxCanvas;
  const host = document.getElementById('ac-arenas');
  if (!fc || !host) return;
  const r = host.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) {
    fc.width = Math.round(r.width);
    fc.height = Math.round(r.height);
  } else {
    // jsdom / hidden: keep classic dual-board world buffer
    fc.width = 3 * Tiles.T * Sprites.PX;
    fc.height = 7 * Tiles.T * Sprites.PX;
  }
  cellPx.clear();
}

// ---------------- dungeon-style procedural backdrop (TD) ----------------
let bgKey = '';

/** Bake dungeon-look forest floor under the TD arenas: Tiles.paintChunk biome 0
 * (Bosque — same pixel ground as World chunkImage), floor-only + organic dirt
 * blobs + radial vignette (World.drawVignette equivalent). Debounced by size key. */
function paintAcBg(): void {
  const cv = document.getElementById('ac-bg') as HTMLCanvasElement | null;
  if (!cv) return;
  // full-viewport backdrop: measure the screen section, not just the arenas
  const host = document.getElementById('scr-ac');
  const r = host?.getBoundingClientRect();
  const w = Math.round(r?.width || 0), h = Math.round(r?.height || 0);
  if (w <= 0 || h <= 0) return; // hidden / jsdom — no layout
  const key = w + 'x' + h;
  if (key === bgKey) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  cv.width = w; cv.height = h;
  // one chunk big enough to cover host at dungeon scale (T × Sprites.PX px/tile)
  const s = Tiles.T * Sprites.PX;
  const n = Math.max(2, Math.ceil(Math.max(w, h) / s)) + 1;
  const at = () => 0; // floor everywhere (no walls/liquid)
  const dirtField = (gx: number, gy: number) =>
    0.5 + 0.3 * Math.sin(gx * 0.021 + gy * 0.007) * Math.cos(gy * 0.017);
  const chunk = Tiles.paintChunk(0, 0, n, at, dirtField, 0, 7);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(chunk, 0, 0, n * s, n * s);
  // vignette: darken edges like World.drawVignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, 'rgba(4,8,12,0)');
  vg.addColorStop(1, 'rgba(3,6,10,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  bgKey = key;
}

/** sync enemy sprites each combat frame: dual-board = grid cells; TD = path walk overlay */
const foeLastHp = new Map<MobBattle, number>();
/** last hpCur per unit cell (x,y) — mob-hit feedback + death visual */
const unitLastHp = new Map<string, number>();
/** D2e Second Wind: one auto-respawn per wave */
let swUsed = false;
/** Save v4: one recordRun per run end (won/lost); cleared on reset + endless resume */
let runRecorded = false;
/** P23: epoch ms del open() actual → duration_s en run_end */
let runOpenedT = Date.now();
/** Daily seed: shared RNG intent — per-wave/per-batch fresh rng (count-independent) */
let acSeed: number | null = null;
let acDailyKey: string | null = null;
/** shop roll batch counter (daily determinism: each createShop/reroll gets own batch) */
let acShopN = 0;
/** P26c tutorial onboarding: -1 off, 0 = step "buy", 1 = step "start" (TD first run only) */
let tutStep = -1;

/** localStorage guard (tests sandbox / private mode) */
function tutSeen(): boolean {
  try { return localStorage.getItem('ps.tut') === '1'; } catch (e) { return true; }
}
/** dismiss tanpa flag (run selesai / ganti mode) — muncul lagi run TD berikutnya */
function tutDismiss(): void {
  tutStep = -1;
  const el = $('ac-tut');
  if (el) el.classList.add('hidden');
  $('ac-shop')?.classList.remove('tut-hl');
  $('ac-start')?.classList.remove('tut-hl');
}
function tutFinish(): void {
  try { localStorage.setItem('ps.tut', '1'); } catch (e) { /* nada */ }
  tutDismiss();
}
/** render kartu coach (step 0/1) — highlight target sekali, tanpa blocking input */
function tutShow(step: number): void {
  const el = $('ac-tut'), txt = $('ac-tut-text');
  if (!el || !txt) return;
  tutStep = step;
  el.classList.remove('hidden');
  txt.textContent = step === 0 ? 'Compra un Pokémon de la tienda' : 'Pulsa Listo para luchar';
  $('ac-shop')?.classList.toggle('tut-hl', step === 0);
  $('ac-start')?.classList.toggle('tut-hl', step === 1);
}

/** compose rnd: seeded per-wave (preview === startCombat), else undefined → Math.random */
function waveRndFor(wave: number): (() => number) | undefined {
  return acSeed != null ? waveRnd(acSeed, wave) : undefined;
}

/** shop batch rnd: fresh seeded batch per call when daily, else undefined */
function shopRndFor(): (() => number) | undefined {
  if (acSeed == null) return undefined;
  return shopRnd(acSeed, st.run.wave, acShopN++);
}
/** TD mob element cache (create once, update pos/hp per frame — no 60fps DOM rebuild).
 * Each mob owns a raw canvas + Sprites.Animator (Walk/Idle + facing — dungeon-style;
 * NOT UI.spriteCanvas so the shared live-set doesn't fight over draw/update). */
interface TdEntry {
  el: HTMLDivElement;
  fill: HTMLElement | null;
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  anim: InstanceType<typeof Sprites.Animator>;
  lastP: number;
  /** death fade timer (Faint hold + .ac-dying opacity, removed at 0.9s) */
  deathT: number;
  dying: boolean;
}
const tdMobEls = new Map<MobBattle, TdEntry>();
const tdLastPos = new Map<MobBattle, { x: number; y: number }>();
/** dual-board death fades: dying cell → elapsed time (cleared at 0.9s) */
const dyingCells = new Map<HTMLElement, number>();
function clearTdMobs(): void {
  for (const { el } of tdMobEls.values()) el.remove();
  tdMobEls.clear();
  tdLastPos.clear();
  dyingCells.clear();
}
function syncEnemies(dt = 0): void {
  const box = document.getElementById('ac-foe-grid');
  if (!box) return;
  const seen = new Set<MobBattle>();
  if (st.run.phase === 'combat') {
    if (currentMode === 'td') {
      // TD: absolute sprites over arenas, position = interpolate the mob's OWN
      // ring branch cells (spawn alternates lane 0/1 — never crosses board cells)
      const host = document.getElementById('ac-arenas');
      if (!host) return;
      for (const m of st.run.mobs) {
        if (!m.alive) continue;
        seen.add(m);
        const cells = Path.branchCells(typeof m.branch === 'number' ? m.branch : 0);
        const idx = Math.min(cells.length - 1, Math.max(0, m.progress));
        const i0 = Math.floor(idx), i1 = Math.min(cells.length - 1, i0 + 1);
        const t = idx - i0;
        const a = tdCellHostPos(cells[i0].x, cells[i0].y);
        const b = tdCellHostPos(cells[i1].x, cells[i1].y);
        if (!a || !b) continue;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        tdLastPos.set(m, { x: px, y: py });
        let entry = tdMobEls.get(m);
        if (!entry) {
          const el = document.createElement('div');
          el.className = 'ac-td-mob' + (m.boss ? ' boss' : '');
          const cv = document.createElement('canvas');
          cv.width = 80; cv.height = 88; // res ×2; display capped by CSS (40×44)
          // per-frame scale via Sprites.fitDraw in the draw block (prefer 4 = 2×80/40)
          const anim = new Sprites.Animator(String(m.dex), 4 / Sprites.PX);
          el.appendChild(cv);
          el.insertAdjacentHTML('beforeend', pill(m.star, m.atk) + '<span class="hp"><i></i></span>');
          const fill = el.querySelector('.hp i') as HTMLElement | null;
          host.appendChild(el);
          entry = { el, fill, cv, ctx: cv.getContext('2d'), anim, lastP: -1, deathT: 0, dying: false };
          tdMobEls.set(m, entry);
        }
        entry.el.style.left = px + 'px';
        entry.el.style.top = py + 'px';
        if (entry.fill) entry.fill.style.width = Math.max(0, (m.hp / Math.max(1, m.maxHp)) * 100) + '%';
        // dungeon-style walk: facing from path segment, Walk while progress advances
        const segDx = b.x - a.x, segDy = b.y - a.y;
        if (Math.hypot(segDx, segDy) > 0.5) entry.anim.dir = Sprites.dirFromAngle(Math.atan2(segDy, segDx));
        const moving = entry.lastP !== m.progress;
        // bulwark stop-&-fight (D2a): Attack while halted, else Walk/Idle
        const fighting = (m.stopT || 0) > 0;
        entry.anim.loop(fighting ? 'Attack' : moving ? 'Walk' : 'Idle', moving ? Math.max(0.6, Math.min(2.2, m.spd * 1.6)) : 1.4);
        entry.lastP = m.progress;
        if (dt > 0) entry.anim.update(dt);
        // dirt kick-up behind walking mobs — dungeon World dirt-trail flavour (Fase L)
        if (moving && dt > 0 && Math.random() < 0.1) {
          const hostR2 = host.getBoundingClientRect();
          const w2 = fxCanvas?.width || hostR2.width, h2 = fxCanvas?.height || hostR2.height;
          const sx2 = hostR2.width > 0 ? (px / hostR2.width) * w2 : px;
          const sy2 = hostR2.height > 0 ? (py / hostR2.height) * h2 : py;
          FX.trail('dirt', 'dirt', sx2, sy2, 0, -12);
        }
        if (entry.ctx) {
          const ctx = entry.ctx;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, entry.cv.width, entry.cv.height);
          ctx.imageSmoothingEnabled = false;
          // encaje sin recortes (Sprites.fitDraw) — misma fórmula que UI.sprite tick
          const fit = Sprites.fitDraw(String(m.dex), entry.cv.width, entry.cv.height, 4);
          entry.anim.scale = fit.k / Sprites.PX;
          Sprites.drawShadow(ctx, String(m.dex), fit.fx, fit.fy, 0.45 * fit.k); // PMD ShadowSize
          entry.anim.draw(ctx, fit.fx, fit.fy);
        }
        entry.el.dataset.anim = entry.anim.cur;
        const prev = foeLastHp.get(m) ?? m.hp;
        if (m.hp < prev) {
          const cv = entry.cv;
          cv.classList.remove('hurt'); void cv.offsetWidth; cv.classList.add('hurt');
          if (!entry.anim.busy()) entry.anim.play('Hurt', { speed: 1.6 }); // dungeon enemy.showHurt
          Audio.sfx('hit', undefined);
        }
        foeLastHp.set(m, m.hp);
      }
      // death: Faint hold + .ac-dying fade (~0.9s) + burst, then remove cached element
      for (const [m, entry] of tdMobEls) {
        if (seen.has(m)) continue;
        if (!entry.dying) {
          entry.dying = true;
          entry.anim.play('Faint', { speed: 1.4, hold: true }); // dungeon enemy.die
          entry.el.classList.add('ac-dying');
          Audio.sfx(m.boss ? 'bossDown' : 'faint', undefined);
        }
        const p = tdLastPos.get(m);
        if (p) {
          const hostR = host.getBoundingClientRect();
          const w = fxCanvas?.width || hostR.width, ht = fxCanvas?.height || hostR.height;
          const sx = hostR.width > 0 ? (p.x / hostR.width) * w : p.x;
          const sy = hostR.height > 0 ? (p.y / hostR.height) * ht : p.y;
          if (entry.deathT === 0) FX.burst(sx, sy - LIFT * 0.5, '#fff', 8, 120);
        }
        entry.deathT += dt > 0 ? dt : 1; // dt 0 (tests) → finalize immediately
        if (entry.deathT < 0.9) {
          // keep drawing the Faint frame while fading
          if (entry.ctx && dt > 0) {
            const ctx = entry.ctx;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, entry.cv.width, entry.cv.height);
            ctx.globalAlpha = Math.max(0, 1 - entry.deathT / 0.9);
            const fit = Sprites.fitDraw(String(m.dex), entry.cv.width, entry.cv.height, 4);
            entry.anim.scale = fit.k / Sprites.PX;
            Sprites.drawShadow(ctx, String(m.dex), fit.fx, fit.fy, 0.45 * fit.k);
            entry.anim.draw(ctx, fit.fx, fit.fy);
            ctx.globalAlpha = 1;
          }
          continue;
        }
        entry.el.remove();
        tdMobEls.delete(m);
        tdLastPos.delete(m);
        foeLastHp.delete(m);
      }
      return;
    }
    // dual-board mode (existing)
    for (const m of st.run.mobs) {
      if (!m.alive) continue;
      seen.add(m);
      const cell = box.querySelector(`[data-xy="${m.cx},${m.cy}"]`) as HTMLElement | null;
      if (!cell) continue;
      cell.classList.remove('ghost');
      if (!cell.querySelector('canvas')) {
        cell.innerHTML = '';
        cell.appendChild(UI.spriteCanvas(m.dex, 96, 96, { scale: 4.4, lively: true })); // cell res ×2
        cell.insertAdjacentHTML('beforeend', pill(m.star, m.atk) + '<span class="hp"><i></i></span>');
        if (m.boss) cell.classList.add('boss');
      }
      const fill = cell.querySelector('.hp i') as HTMLElement | null;
      if (fill) fill.style.width = Math.max(0, (m.hp / Math.max(1, m.maxHp)) * 100) + '%';
      const prev = foeLastHp.get(m) ?? m.hp;
      if (m.hp < prev) {
        const cv = cell.querySelector('canvas');
        if (cv) {
          cv.classList.remove('hurt'); void cv.offsetWidth; cv.classList.add('hurt');
          UI.spriteHit(cv, 'Hurt', undefined, 1.6); // dungeon enemy.showHurt
          Audio.sfx('hit', undefined);
        }
      }
      foeLastHp.set(m, m.hp);
    }
  }
  // death: Faint hold + .ac-dying fade (~0.9s), then clear cell — dual-board only
  if (currentMode !== 'td') {
    for (const cell of box.querySelectorAll<HTMLElement>('.ac-cell')) {
      if (!cell.querySelector('canvas')) continue;
      const [x, y] = (cell.dataset.xy || '').split(',').map(Number);
      const m = st.run.mobs.find((mm: MobBattle) => mm.cx === x && mm.cy === y && seen.has(mm));
      if (!m) {
        if (!cell.classList.contains('ac-dying')) {
          cell.classList.add('ac-dying');
          const cv = cell.querySelector('canvas');
          if (cv) UI.spriteFaint(cv);
          const dm = st.run.mobs.find((mm: MobBattle) => mm.cx === x && mm.cy === y && !mm.alive);
          Audio.sfx(dm?.boss ? 'bossDown' : 'faint', undefined);
          const a = cellCenter(x, y);
          FX.burst(a.x, a.y - LIFT * 0.5, '#fff', 8, 120);
          dyingCells.set(cell, 0);
          cell.classList.remove('boss', 'ghost');
        }
      }
    }
    for (const [cell, t] of dyingCells) {
      const nt = t + (dt > 0 ? dt : 1); // dt 0 (tests) → finalize immediately
      if (nt >= 0.9) {
        cell.innerHTML = '';
        cell.classList.remove('ac-dying');
        dyingCells.delete(cell);
      } else {
        dyingCells.set(cell, nt);
      }
    }
  }
}

function renderShop(): void {
  const box = $('ac-shop');
  box.innerHTML = '';
  st.shop.slots.forEach((slot, i) => {
    const card = document.createElement('div');
    if (!slot) { card.className = 'ac-card empty'; card.setAttribute('aria-hidden', 'true'); box.appendChild(card); return; }
    const cost = Shop.slotCost(slot);
    card.className = 'ac-card' + (st.run.gold < cost ? ' off' : '');
    card.dataset.sfx = 'none'; // buy/error played explicitly in onBuy
    const bs = boardStats(slot.dex, slot.star);
    const e = ((G as any).DEX_BY || {})[slot.dex] || {};
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Comprar ${e.name || '?'} ★${slot.star} — ${cost} monedas`);
    card.innerHTML =
      `<span class="ac-cost">${cost}</span>` +
      `<span class="ac-cardname">${esc(e.name || '?')}</span>` +
      `<span class="ac-strip">⚔️ ${bs ? bs.atk : '?'}</span>` +
      (slot.star > 1 ? `<span class="st">${'★'.repeat(slot.star)}</span>` : '');
    const spr = document.createElement('span');
    spr.className = 'ac-sprite';
    spr.appendChild(UI.spriteCanvas(slot.dex, 96, 96, { scale: 4, lively: true })); // shop card res ×2
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
  // live mini-sprite so the drag ghost shows the actual mon (Fase K)
  ghost.insertBefore(UI.spriteCanvas(slot.dex, 40, 40, { scale: 2, lively: true }), ghost.firstChild);
  ghost.style.left = (e.clientX ?? 0) + 'px';
  ghost.style.top = (e.clientY ?? 0) + 'px';
  document.body.appendChild(ghost);
  drag = { idx: i, x0: e.clientX ?? 0, y0: e.clientY ?? 0, ghost };
  dragMoved = false;
  markMergeTargets(i);
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp);
  window.addEventListener('pointercancel', onDragCancel);
}

/** outline cells where dropping this shop card would star-up (same dex + star, prep only) */
function markMergeTargets(idx: number): void {
  const slot = st.shop.slots[idx];
  if (!slot || st.run.phase === 'combat') return;
  document.querySelectorAll('#ac-me-grid .ac-cell').forEach((el) => {
    const xy = (el as HTMLElement).dataset?.xy || '';
    const [x, y] = xy.split(',').map(Number);
    const t = unitAt(x, y);
    if (t && t.dex === slot.dex && t.star === slot.star && t.star < Board.MAX_STAR) {
      el.classList.add('merge-ok');
    }
  });
}

function clearMergeTargets(): void {
  document.querySelectorAll('.ac-cell.merge-ok').forEach((el) => el.classList.remove('merge-ok'));
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
  clearMergeTargets();
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
  if (!cellEl) { onBuy(d.idx); return; } // drop elsewhere (bench/empty/UI): buy to auto-place
  // target cell under the card
  const xy = (cellEl as HTMLElement).dataset?.xy || '';
  const [x, y] = xy.split(',').map(Number);
  const target = unitAt(x, y);
  if (target) {
    // occupied: merge target = same champ + same star (drop card onto it → buy + merge, prep only)
    const slot = st.shop.slots[d.idx];
    if (!slot || target.dex !== slot.dex || target.star !== slot.star
      || target.star >= Board.MAX_STAR || st.run.phase === 'combat') {
      Audio.sfx('error', undefined);
      UI.toast('Cell occupied');
      return;
    }
    const r = Shop.buyMerge(st.shop, d.idx, st.run.gold);
    if (!r.ok || !r.slot) {
      Audio.sfx('error', undefined);
      UI.toast('Not enough gold');
      return;
    }
    st.run.gold = r.gold;
    // temp unit (never placed) merges onto the target cell — applyMerge result lands there
    const temp: BoardUnit = { dex: r.slot.dex, star: r.slot.star, x: null, y: null, bench: null, items: [] };
    if (Board.tryMergeAt(st.board, temp, x, y)) {
      Audio.sfx('buy', undefined);
      UI.toast('★ merge');
      afterBoardChange();
      placeFx(x, y, 'merge', temp.star + 1);
    }
    return;
  }
  // drop on empty cell: buy → move the fresh unit there (prep only)
  const before2 = new Set(st.board.units);
  const r2 = onBuy(d.idx);
  if (!r2 || !r2.ok) return;
  const u2 = st.board.units.find((v) => !before2.has(v));
  if (!u2 || st.run.phase === 'combat') return;
  if (Board.place(st.board, u2, x, y)) { afterBoardChange(); placeFx(x, y, 'land'); }
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
  renderStage(); // cells first — renderHud's flank pass needs .ac-cell[data-xy] present
  renderHud();
  renderShop();
  renderSyn();
  $('ac-sell').classList.toggle('off', !st.sel);
}

// ---------------- interactions ----------------

/** Prep-time cell juice (Fase K): ring+burst at cell, squash-pop the sprite, sfx.
 * merge = gold ring + star-up text; sell = coin burst at captured pos (no pop). */
function placeFx(x: number | null, y: number | null, kind: 'land' | 'merge' | 'sell' = 'land', star = 0): void {
  if (x == null || y == null) return;
  const p = cellCenter(x, y);
  if (kind === 'merge') {
    FX.ring(p.x, p.y, 4, 26, '#ffd465', 0.45, 3);
    FX.burst(p.x, p.y, '#ffd465', 12, 150);
    if (star) FX.dmgText(p.x, p.y - 18, '★' + star, '#ffd465', true);
    Audio.sfx('levelup', undefined);
  } else if (kind === 'sell') {
    FX.burst(p.x, p.y, '#ffd465', 10, 130);
    Audio.sfx('coin', undefined);
  } else {
    FX.ring(p.x, p.y, 3, 18, '#8ccaff', 0.35, 2);
    FX.burst(p.x, p.y, '#8ccaff', 6, 90);
    Audio.sfx('land', undefined);
  }
  // squash-pop / flash the freshly-rendered sprite in that cell
  const cell = document.querySelector(`#ac-me-grid .ac-cell[data-xy="${x},${y}"]`);
  if (!cell) return;
  if (kind === 'merge') { cell.classList.add('mergeflash'); setTimeout(() => cell.classList.remove('mergeflash'), 600); }
  const cv = cell.querySelector('canvas');
  if (cv) { cv.classList.remove('ac-pop'); void cv.offsetWidth; cv.classList.add('ac-pop'); }
}

function onCell(x: number, y: number): void {
  if (st.run.phase === 'combat') return; // lock board mid-fight (P17 rule)
  const here = unitAt(x, y);
  if (st.sel) {
    if (here === st.sel) return;
    if (here) {
      // same champ + same star → merge-2 on this cell (else swap-select)
      if (here.dex === st.sel.dex && here.star === st.sel.star && here.star < Board.MAX_STAR
        && Board.tryMergeAt(st.board, st.sel, x, y)) {
        const newStar = here.star + 1;
        st.sel = null;
        Audio.sfx('confirm', undefined);
        UI.toast('★ merge');
        afterBoardChange();
        placeFx(x, y, 'merge', newStar);
        return;
      }
      st.sel = here; renderAll(); return; // swap select
    }
    if (Board.place(st.board, st.sel, x, y)) {
      st.sel = null;
      afterBoardChange();
      placeFx(x, y, 'land');
    } else {
      Audio.sfx('error', undefined);
      UI.toast("Can't place there");
    }
  } else if (here) {
    st.sel = here;
    renderAll();
  }
}

/** Buy champion i. Returns Shop.buy result. */
function onBuy(i: number) {
  const before = new Set(st.board.units);
  const slot = st.shop.slots[i];
  const r = Shop.buy(st.shop, i, st.board, st.run.gold);
  if (!r.ok) {
    Audio.sfx('error', undefined);
    UI.toast('Not enough gold or board full');
    return r;
  }
  st.run.gold = r.gold;
  Audio.sfx('buy', undefined);
  track('shop_action', { action: 'buy', cost: slot ? Shop.slotCost(slot) : 0, star: slot?.star ?? 1 });
  if (tutStep === 0) tutShow(1); // P26c: maju ke langkah "Listo"
  afterBoardChange();
  // landing juice on the freshly auto-placed unit (Fase K)
  const u = st.board.units.find((v) => !before.has(v));
  if (u && u.x != null) placeFx(u.x, u.y, 'land');
  return r;
}

/** D2d shop bias: champion dexes super-effective vs upcoming wave types. */
function waveBiasDexes(): number[] {
  const w = Math.max(1, st.run?.wave || 1);
  const comp = (currentMode === 'td' ? WaveRunnerTd : WaveRunner).getComp(st.run as any);
  const mobTypes: string[] = [];
  for (const s of comp.mobs) {
    const e = ((G as any).DEX_BY || {})[s.dex] || {};
    for (const t of e.types || []) if (!mobTypes.includes(t)) mobTypes.push(t);
  }
  if (!mobTypes.length) return [];
  const out: number[] = [];
  for (const c of DEFS) {
    const e = ((G as any).DEX_BY || {})[c.dex] || {};
    const ts: string[] = e.types || [];
    if (ts.some((t: string) => Types.mult(t, mobTypes) > 1)) out.push(c.dex);
  }
  return out;
}

function onReroll(): void {
  const r = Shop.reroll(st.shop, st.run.gold, st.run.wave, shopRndFor() ?? Math.random, waveBiasDexes());
  if (!r.ok) {
    Audio.sfx('error', undefined);
    UI.toast('Not enough gold');
    return;
  }
  st.run.gold = r.gold;
  Audio.sfx('buy', undefined);
  track('shop_action', { action: 'reroll', cost: 1 });
  renderAll();
}

function onSell(): void {
  if (!st.sel) return;
  const name = st.sel;
  const sx = st.sel.x, sy = st.sel.y; // capture pos before the rebuild wipes the cell
  const star = st.sel.star, g0 = st.run.gold;
  st.run.gold = Shop.sell(st.board, name, st.run.gold);
  st.sel = null;
  Audio.sfx('coin', undefined);
  UI.toast('Sold');
  track('shop_action', { action: 'sell', cost: st.run.gold - g0, star });
  afterBoardChange();
  if (sx != null && sy != null) placeFx(sx, sy, 'sell');
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
  if (tutStep === 1) tutFinish(); // P26c: selesai langkah "Listo"
  const Runner: any = currentMode === 'td' ? WaveRunnerTd : WaveRunner;
  Runner.forceStart(st.run);
  enterCombat();
}

function onBuffPick(buff: BuffDef): void {
  const Runner: any = currentMode === 'td' ? WaveRunnerTd : WaveRunner;
  Runner.pickBuff(st.run, buff);
  track('buff_pick', { buff_id: buff.id, wave: st.run.wave });
  UI.toast(`${buff.name}: ${buff.desc}`);
  Audio.sfx('confirm', undefined);
  hideOver();
  renderAll();
  if (st.open) requestAnimationFrame(loop); // resume after buff overlay
}

function onExit(): void {
  close();
}

function showOver(icon: string, sub: string, opts?: { endless?: boolean; onEndless?: () => void }): void {
  if (icon === 'trophy' || icon === 'ban') {
    tutDismiss(); // P26c: run selesai → tutup coach tanpa flag
    const r = st.run as any;
    track('run_end', {
      mode: currentMode, wave: r.wave, score: runScore(r.wave, r.base.hp, r.gold),
      endless: !!r.endless, win: icon === 'trophy',
      duration_s: Math.round((Date.now() - runOpenedT) / 1000),
    });
    flushNow();
  }
  const ov = $('ac-over');
  ov.classList.remove('hidden');
  ov.innerHTML = `
    <div class="box center">
      <div class="ac-over-ico">${Icons.html(icon, 34)}</div>
      <p class="sub">${esc(sub)}</p>
      <div class="ac-btns">
        ${opts?.endless ? '<button class="btn gold small" id="ac-endless">Endless</button>' : ''}
        <button class="btn gold small" id="ac-again">Play again</button>
        <button class="btn small" id="ac-menu">Menu</button>
      </div>
    </div>`;
  if (opts?.endless && opts.onEndless) $('ac-endless').onclick = () => { hideOver(); opts.onEndless!(); };
  $('ac-again').onclick = () => { hideOver(); reset(); if (st.open) requestAnimationFrame(loop); };
  $('ac-menu').onclick = () => close();
}

function hideOver(): void {
  $('ac-over').classList.add('hidden');
}

/** Save v4: rekam run sekali → append Best/NEW BEST ke sub overlay. */
function recordOnce(sub: string): string {
  if (runRecorded) return sub;
  runRecorded = true;
  const r = st.run as any;
  const sc = runScore(r.wave, r.base.hp, r.gold);
  const res = recordRun({ mode: currentMode, wave: r.wave, score: sc, endless: !!r.endless, dateKey: acDailyKey || undefined });
  return `${sub} · Best ${res.best}${res.isBest ? ' ★ NEW BEST' : ''}`;
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
    // D2e augments
    typeBoostMul: (t.typeBoostMul ?? 1) * (b.elementalistMul ?? 1),
    bountyMul: (t.bountyMul ?? 1) * (b.bountyMul ?? 1),
    flankAtkMul: FLANK_ATK_MUL * (b.flankAtkMul ?? 1),
    // P25 Eagle Eye: additive with synergy rangeAdd
    rangeAdd: (t.rangeAdd ?? 0) + (b.rangeAdd ?? 0),
  };
}

function enterCombat(): void {
  st.sel = null;
  st.units = Team.spawnUnits(st.board, battleMods());
  swUsed = false;
  // AU-3: flank is TD-only (GDD td §1) — dual units never flank
  if (currentMode !== 'td') {
    for (const u of st.units) { u.flankAtk = false; u.flankRange = false; }
    // AU-4: daily buff tiles give +10% ATK to whoever stands on them
    const tiles = buffCells(st.run.wave);
    for (const u of st.units) u.tileAtk = tiles.has(u.x + ',' + u.y);
  }
  const b = st.run.buffs;
  // D2e Frontline Bond: adjacent allies take 8% less damage this combat
  if (b?.frontlineBond) {
    for (const u of st.units) {
      if (!u.alive) continue;
      const adj = st.units.some((v) => v !== u && v.alive &&
        Math.abs(v.x - u.x) + Math.abs(v.y - u.y) === 1);
      if (adj) u.dmgReduce = 0.08;
    }
  }
  // D2e Slipstream: first unit opens fast for 5s
  if (b?.slipstream && st.units[0]) st.units[0].slipT = 5;
  renderAll();
}

function loop(ts: number): void {
  if (!st.open) return;
  if (st.paused) { st.last = ts; requestAnimationFrame(loop); return; }
  const dt = Math.min(0.1, (ts - st.last) / 1000 || 0);
  st.last = ts;
  const r: any = st.run;
  const td = currentMode === 'td';
  const Runner: any = td ? WaveRunnerTd : WaveRunner;
  if (r.phase === 'combat' || r.phase === 'prep') {
    const prev = r.phase;
    const changed = Runner.tick(r, st.units, dt, battleMods());
    const after: string = r.phase;
    if (changed) {
      if (prev === 'prep' && after === 'combat') {
        enterCombat();
        // wave-start banner — boss waves red + boss sfx, else gold + confirm (Fase J)
        const mobs: any[] = r.mobs || [];
        const boss = mobs.some((m: any) => m.boss);
        banner(boss ? 'boss' : 'wave', boss ? `BOSS — Wave ${r.wave}` : `Wave ${r.wave}`, `${mobs.length} mons incoming`);
        Audio.sfx(boss ? 'boss' : 'confirm', undefined);
      }
      else if (after === 'buff') {
        st.shop = Shop.createShop(r.wave, shopRndFor(), waveBiasDexes()); // wave cleared → free shop refresh
        renderAll(); offerBuff(); return;
      }
      else if (after === 'lost') {
        renderAll();
        const sc = runScore(r.wave, r.base.hp, r.gold); // D2c: score on game over too
        showOver('ban', recordOnce(td ? `Wave ${r.wave} — the base fell · Score ${sc}` : `Wave ${r.wave} — your heart broke · Score ${sc}`));
        return;
      }
      else {
        if (prev === 'combat' && after === 'prep') {
        st.shop = Shop.createShop(r.wave, shopRndFor(), waveBiasDexes()); // wave cleared → free shop refresh
          if ((r as any).roundResult === 'loss') {
            // AU-1: team wiped — real result, no fake gold toast
            const lostWave = Math.max(1, r.wave - 1);
            const dmg = WaveRunner.LOSS_DMG + Math.floor(lostWave / 4);
            const e = (r as any).lastEcon;
            const cons = e && e.streak ? ` · +${e.streak} consolation` : '';
            banner('leak', 'Round lost!', `Your heart −${dmg} ♥${cons}`);
            Audio.sfx('hurt', undefined);
          } else {
          const e = (r as any).lastEcon;
          const bonus = e ? e.wave : Runner.waveBonus(r.wave - 1);
          const total = e ? e.wave + e.interest + e.streak : bonus;
          UI.toast(`+${total} gold`); // wave already advanced
          // wave-cleared banner + gold pill pop (Fase J); AU-2: economy breakdown sub
          const sub = e
            ? `+${total} ☀ = ${e.wave} wave + ${e.interest} int + ${e.streak} streak`
            : `+${bonus} ☀ gold`;
          banner('clear', `Wave ${r.wave - 1} cleared!`, sub);
          Audio.sfx('levelup', undefined);
          const gold = $('ac-gold');
          gold.classList.remove('pop'); void gold.offsetWidth; gold.classList.add('pop');
          }
        }
        renderAll();
      }
    }
    if (after === 'combat') { syncEnemies(dt); renderHud(); playSwings(); stepFx(dt); updateCombatBars(); }
    else if (after === 'prep') renderHud();
  } else if (r.phase === 'won') {
    renderAll();
    // D2c: RUN COMPLETE screen with score + opt-in Endless
    const sc = runScore(r.wave, r.base.hp, r.gold);
    showOver('trophy', recordOnce(`RUN COMPLETE — Wave ${WaveDef.MAX_WAVE} · Score ${sc} · Gold ${r.gold}`), {
      endless: !r.endless,
      onEndless: () => {
        runRecorded = false; // run berlanjut → rekam lagi saat akhir nanti
        Runner.resumeEndless(r);
        st.shop = Shop.createShop(r.wave, shopRndFor(), waveBiasDexes());
        renderAll();
        if (st.open) requestAnimationFrame(loop);
      },
    });
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
  const choices = Buffs.rollBuffs(Math.random, { noTdOnly: currentMode !== 'td' });
  track('augment_offer', { ids: choices.map((b) => b.id) });
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
    const skill = !!b.skillFx;
    b.skillFx = false;
    const anim = skill ? 'Charge' : b.swing;
    if (!anim) continue;
    b.swing = undefined;
    const cv = unitCv.get(b.x + ',' + b.y);
    const move = (b as any).move || '';
    const M = move ? ((globalThis as any).G?.Moves?.BY_ID?.[move] ?? null) : null;
    const kind: string = M?.kind || 'melee';
    if (cv) {
      // dungeon player.cast(): pace anim to cooldown so fast atks chain, slow atks linger
      const meta = Sprites.animMeta(String(evoDex(b.dex, b.star || 1)), anim);
      const len = meta ? meta.d.reduce((a: number, c: number) => a + c, 0) / 60 : 0.4;
      const cd = Math.max(0.12, b.atkCd || 0.5);
      UI.spriteHit(cv, anim, b.face, Math.max(1, len / (cd * 0.9)));
    }
    if (skill) {
      const c = cellCenter(b.x, b.y);
      FX.ring(c.x, c.y - LIFT * 0.5, 4, 18, '#8ccaff', 0.32, 2);
      FX.burst(c.x, c.y - LIFT * 0.5, '#8ccaff', 6, 80);
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
  const type: string = M?.type || 'normal';
  const v: any = M ? VFX.forMove(M) : VFX.forType(type);
  const plan = planMoveFx(M);
  const col = ((U as any).TYPE_COLOR[type] || '#fff') as string;
  const f0 = cellCenter(b.x, b.y), h0 = cellCenter(hit.x, hit.y);
  const fx0 = f0.x, fy0 = f0.y - LIFT * 0.5;
  const hx = h0.x, hy = h0.y - LIFT * 0.5;
  const dx = hx - fx0, dy = hy - fy0;
  const dist = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  const impact = (t: number, melee?: string | null, tele?: number) =>
    acImpacts.push({ t, total: t, x: hx, y: hy, dmg: hit.dmg, col, pal: v.pal || type, melee, angle: ang, eff: hit.eff, tele });
  const projVis = { proj: v.proj || VFX.forType(type).proj, pal: v.pal || type, trail: v.trail };
  const fan = (i: number) => plan.count <= 1 ? 0 : (i - (plan.count - 1) / 2) * plan.spread;

  if (plan.mode === 'beam') {
    FX.beam(fx0, fy0, ang, dist, 6, col, { pal: v.pal || type, beam: v.beam ?? null });
    impact(0.14);
  } else if (plan.mode === 'projectile' || plan.mode === 'cone' || plan.mode === 'boomerang') {
    for (let i = 0; i < plan.count; i++) {
      const a = ang + fan(i);
      const ex = fx0 + Math.cos(a) * dist;
      const ey = fy0 + Math.sin(a) * dist;
      const out = Math.max(0.1, dist / plan.speed);
      const mode: FlyMode = plan.mode === 'boomerang' ? 'boomerang' : plan.mode === 'cone' ? 'cone' : 'projectile';
      acProjs.push({
        mode, x: fx0, y: fy0, ox: fx0, oy: fy0, hx: ex, hy: ey,
        vx: Math.cos(a) * plan.speed, vy: Math.sin(a) * plan.speed,
        t: 0, out, life: mode === 'boomerang' ? out * 2 : out,
        vis: projVis, dmg: hit.dmg, col, showText: i === 0, hit: false, eff: hit.eff,
      });
    }
  } else if (plan.mode === 'meteor' || plan.mode === 'mine') {
    const fall = (plan.mode === 'meteor' ? Tiles.T * Sprites.PX * 2.4 : Tiles.T * Sprites.PX * 0.9);
    const life = plan.mode === 'meteor' ? 0.34 : 0.2;
    for (let i = 0; i < plan.count; i++) {
      const off = plan.count <= 1 ? 0 : (i - (plan.count - 1) / 2) * 10 * Sprites.PX;
      const tx = hx + off, ty = hy;
      acProjs.push({
        mode: 'meteor', x: tx, y: ty - fall, ox: tx, oy: ty - fall, hx: tx, hy: ty,
        vx: 0, vy: 0, t: 0, out: life, life,
        vis: projVis, dmg: hit.dmg, col, showText: i === 0, hit: false, eff: hit.eff,
      });
    }
  } else if (plan.mode === 'slash') {
    impact(0.09, v.melee || 'impact'); // windup ≈ swing anim, then slash at target
  } else if (plan.mode === 'chain') {
    FX.beam(fx0, fy0, ang, dist, 3, col, { pal: v.pal || type, beam: v.beam || 'lightning' });
    impact(0.1);
  } else if (plan.mode === 'radial') {
    FX.ring(fx0, fy0, 3, 22, col, 0.28, 2);
    FX.burst(fx0, fy0, col, 8, 90);
    impact(0.1, undefined, 22); // telegraph: dashed warning ring grows until impact
  } else if (plan.mode === 'aura') {
    FX.ring(fx0, fy0, 4, 20, col, 0.3, 2);
    if (v.aura) FX.sp(v.aura, v.pal || type, fx0, fy0, { life: 0.42, scale: 1.3 });
    else FX.burst(fx0, fy0, col, 6, 80);
    impact(0.12, undefined, 20);
  } else if (plan.mode === 'charge') {
    FX.ring(fx0, fy0, 3, 16, col, 0.3, 2);
    FX.sp(v.buff || 'arrow', v.pal || type, fx0, fy0, { vy: -45, life: 0.5, scale: 1.2 });
    impact(0.12);
  } else if (plan.mode === 'trail') {
    FX.ring(fx0, fy0, 2, 12, col, 0.26, 2);
    FX.burst(fx0, fy0, col, 5, 70);
    impact(0.12);
  } else if (plan.mode === 'orbit') {
    FX.ring(fx0, fy0, 5, 18, col, 0.3, 2);
    const n = Math.max(2, plan.count);
    const orbR = 8 * Sprites.PX;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      FX.sp(v.proj || 'leaf', v.pal || type, fx0 + Math.cos(a) * orbR, fy0 + Math.sin(a) * orbR,
        { life: 0.36, scale: 1, spin: 7 });
    }
    impact(0.12);
  } else {
    FX.burst(fx0, fy0, col, 6, 90);
    impact(0.12);
  }
}

/** Hazards-style warning: dashed ground circle grows (k 0→1) until impact. */
function drawTelegraph(g: CanvasRenderingContext2D, x: number, y: number, rMax: number, k: number, col: string): void {
  const r = rMax * (0.3 + 0.7 * Math.min(1, Math.max(0, k)));
  g.save();
  g.fillStyle = col;
  g.globalAlpha = 0.10 * k;
  g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  g.strokeStyle = col;
  g.globalAlpha = 0.45 + 0.35 * Math.sin(k * 24);
  g.lineWidth = 2;
  g.setLineDash([5, 4]);
  g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.stroke();
  g.restore();
}

/** dungeon dmgText palette: super = yellow + big, weak = gray (enemy.ts showHurt). */
function effCol(eff?: 'super' | 'weak' | null): string {
  return eff === 'super' ? '#ffe14d' : eff === 'weak' ? '#a3abb8' : '#ffffff';
}

/** Advance + draw stage fx (call each combat frame; ctx null in tests). */
function stepFx(dt: number): void {
  if (!fxCanvas) return;
  const g = fxCanvas.getContext('2d');
  if (!g) return;
  // pending impacts: slash/burst + damage number (+ telegraph while waiting)
  for (let i = acImpacts.length - 1; i >= 0; i--) {
    const p = acImpacts[i];
    p.t -= dt;
    if (p.t > 0) {
      if (p.tele && p.total) drawTelegraph(g, p.x, p.y, p.tele, 1 - p.t / p.total, p.col);
      continue;
    }
    acImpacts.splice(i, 1);
    if (p.melee) FX.slash(p.x, p.y, p.angle, 11, 1.7, p.col, { pal: p.pal, melee: p.melee });
    else FX.burst(p.x, p.y, p.col, 7, 100);
    FX.dmgText(p.x, p.y - 6, Math.round(p.dmg), effCol(p.eff), p.eff === 'super');
  }
  // projectiles: fly / turn back / fall, trail, impact
  const hitProj = (p: AcProj) => {
    FX.burst(p.hx, p.hy, p.col, 7, 110);
    if (p.showText) FX.dmgText(p.hx, p.hy - 6, Math.round(p.dmg), effCol(p.eff), p.eff === 'super');
  };
  for (let i = acProjs.length - 1; i >= 0; i--) {
    const p = acProjs[i];
    p.t += dt;
    if (p.mode === 'boomerang') {
      if (!p.hit && p.t >= p.out) { p.hit = true; hitProj(p); }
      const k = p.t < p.out ? p.t / p.out : 1 - (p.t - p.out) / p.out;
      p.x = p.ox + (p.hx - p.ox) * k;
      p.y = p.oy + (p.hy - p.oy) * k;
      if (p.t >= p.life) { acProjs.splice(i, 1); continue; }
    } else if (p.mode === 'meteor') {
      const k = Math.min(1, p.t / p.life);
      p.x = p.hx;
      p.y = p.oy + (p.hy - p.oy) * k;
      if (p.t >= p.life) { acProjs.splice(i, 1); hitProj(p); continue; }
    } else {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t >= p.life) { acProjs.splice(i, 1); hitProj(p); continue; }
    }
    if (p.vis.trail) FX.trail(p.vis.trail, p.vis.pal, p.x, p.y, p.vx, p.vy);
  }
  // draw projectiles (dungeon Projectiles.draw: shadow, then VFX shape)
  g.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  // ground status FX (dungeon enemy.ts): burn/poison ellipse + shield bubble + roar ring
  fxT += dt > 0 ? dt : 0.016;
  for (const m of st.run.mobs) {
    if (!m.alive) continue;
    let px: number | undefined, py: number | undefined;
    if (currentMode === 'td') {
      const p = tdLastPos.get(m);
      if (p) { px = p.x; py = p.y; }
    } else if (m.cx != null && m.cy != null) {
      const c = cellCenter(m.cx, m.cy);
      px = c.x; py = c.y;
    }
    if (px == null || py == null) continue;
    const sts = m.statuses || [];
    const hasSt = (t: string) => sts.some((s: { type: string }) => s.type === t);
    if (hasSt('burn') || hasSt('poison')) {
      g.fillStyle = hasSt('burn') ? 'rgba(255,130,40,.3)' : 'rgba(170,80,220,.3)';
      g.beginPath(); g.ellipse(px, py - 2, 15, 5.5, 0, 0, 6.2832); g.fill();
    }
    if (m.shield > 0) {
      g.strokeStyle = 'rgba(130,190,255,.75)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(px, py - LIFT - 6, 13 + Math.sin(fxT * 5) * 1.5, 0, 6.2832); g.stroke();
    }
    if ((m as any).roarPulse) {
      (m as any).roarPulse = false;
      FX.ring(px, py - LIFT * 0.5, 6, 30, '#ff5f6d', 0.5, 3);
      FX.burst(px, py - LIFT * 0.5, '#ff5f6d', 10, 140);
      Audio.sfx('boss', undefined);
    }
  }
  g.fillStyle = 'rgba(0,0,0,.25)';
  for (const p of acProjs) {
    g.beginPath(); g.ellipse(p.x, p.hy, 5, 2.2, 0, 0, 6.2832); g.fill();
  }
  for (const p of acProjs) {
    let angle = 0;
    if (p.mode === 'meteor') angle = Math.PI / 2;
    else if (VFX.isDir(p.vis.proj)) angle = Math.atan2(p.vy, p.vx);
    else if (VFX.spins(p.vis.proj)) angle = p.t * 9;
    if (p.mode === 'meteor') drawTelegraph(g, p.x, p.hy, 14, p.t / p.life, p.col); // landing warning
    VFX.draw(g, p.vis.proj, p.vis.pal, p.x, p.y, {
      angle, alpha: Math.min(1, Math.max(0, (p.life - p.t) * 6)), scale: 1, frame: Math.floor(p.t * 12),
    });
  }
  // dungeon FX layer (particles, slashes, beams, dmg numbers)
  FX.update(dt);
  FX.draw(g);
}

function updateCombatBars(): void {
  // player unit hp fills + death/damage feedback (GDD common §1 — Pilar 1)
  for (const cell of document.querySelectorAll<HTMLElement>('#ac-me-grid .ac-cell')) {
    const [x, y] = (cell.dataset.xy || '').split(',').map(Number);
    const fill = cell.querySelector('.hp i') as HTMLElement | null;
    const key = x + ',' + y;
    const b = st.units.find((bu) => bu.x === x && bu.y === y);
    if (fill) fill.style.width = b && b.alive ? Math.max(0, (b.hpCur / b.hp) * 100) + '%' : '0%';
    // death: Faint hold + grey petak (prep re-render rebuilds cells → class cleared)
    if (b && !b.alive && !cell.classList.contains('ac-dead')) {
      const ucv = cell.querySelector('canvas');
      if (ucv) UI.spriteFaint(ucv);
      cell.classList.add('ac-dead');
      Audio.sfx('faint', undefined);
      // D2e Second Wind: first death of this wave gets a timed auto-respawn
      if (!swUsed && (st.run.buffs?.secondWindT ?? 0) > 0) {
        swUsed = true;
        b.respawnT = st.run.buffs.secondWindT;
      }
    }
    // mob hits: hp drop → red dmg number (threshold skips runner chip spam — bar still moves)
    const prevU = unitLastHp.get(key);
    if (b && b.alive && prevU != null && prevU - b.hpCur >= 3) {
      const c = cellCenter(x, y);
      FX.dmgText(c.x, c.y - LIFT, Math.round(prevU - b.hpCur), '#ff8a8a');
      Audio.sfx('hit', undefined);
    }
    if (b) unitLastHp.set(key, b.hpCur); else unitLastHp.delete(key);
  }
  // enemy hp fills (sprites synced by syncEnemies)
  for (const cell of document.querySelectorAll<HTMLElement>('#ac-foe-grid .ac-cell')) {
    const [x, y] = (cell.dataset.xy || '').split(',').map(Number);
    const fill = cell.querySelector('.hp i') as HTMLElement | null;
    if (!fill) continue;
    const m = st.run.mobs.find((mm: MobBattle) => mm.cx === x && mm.cy === y && mm.alive);
    fill.style.width = m ? Math.max(0, (m.hp / Math.max(1, m.maxHp)) * 100) + '%' : '0%';
  }
  renderHud();
}

// ---------------- lifecycle ----------------

function reset(): void {
  buffPending = false;
  dragClick = false;
  stopDrag();
  clearTdMobs();
  foeLastHp.clear();
  unitLastHp.clear();
  swUsed = false;
  lastBaseHp = null;
  lastPlayerHp = null;
  lastFoeHp = null;
  runRecorded = false;
  runOpenedT = Date.now();
  lastRoundWave = null;
  acShopN = 0;
  const Runner: any = currentMode === 'td' ? WaveRunnerTd : WaveRunner;
  st.run = Runner.createRun(undefined, undefined, acSeed ?? undefined);
  st.shop = Shop.createShop(1, shopRndFor(), waveBiasDexes());
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
  $('ac-tut-skip').onclick = () => tutFinish();
  document.addEventListener('keydown', onKey);
}

function open(mode: 'auto' | 'td' | 'daily' = 'auto'): void {
  ensureDom();
  currentMode = mode === 'daily' ? 'td' : mode;
  if (mode === 'daily') { acSeed = seedFromDate(); acDailyKey = dailyKey(); }
  else { acSeed = null; acDailyKey = null; }
  reset();
  st.open = true;
  st.paused = false;
  st.last = performance.now();
  $('ac-pause').classList.add('hidden');
  $('ac-over').classList.add('hidden');
  UI.chrome(false);
  UI.show('scr-ac');
  fitAutoTiles(); // layout now measurable (screen visible) — size auto tiles before first frame
  Audio.sfx('confirm', undefined);
  runOpenedT = Date.now();
  // P26c: tutorial coach sekali (hanya TD eksplisit — daily/auto tidak)
  if (mode === 'td' && !tutSeen()) tutShow(0); else tutDismiss();
  track('run_start', { mode, seed: mode === 'daily' });
  if (mode === 'daily') track('daily_join', { dateKey: acDailyKey });
  if (mode === 'daily') banner('wave', 'DAILY RUN', `${acDailyKey} · Best ${bestOf(acDailyKey || undefined)}`);
  requestAnimationFrame(loop);
}

function close(): void {
  st.open = false;
  st.paused = false;
  buffPending = false;
  tutDismiss(); // P26c: ganti mode/menu → tutup coach tanpa flag
  clearTdLayers(); // no TD leftovers while sitting in the menu / next mode
  $('ac-pause')?.classList.add('hidden');
  $('ac-over')?.classList.add('hidden');
  Audio.sfx('back', undefined);
  UI.show('scr-menu');
  UI.chrome(true);
}

const ACUI = {
  open, close, reset, syncEnemies,
  step: loop, // exported for tests: call manually (rAF stubbed)
  render: renderAll, // exported for tests: re-render after direct state injection
  get run() { return st.run; }, get board() { return st.board; }, get shop() { return st.shop; },
  get units() { return st.units; },
  get mode() { return currentMode; },
  get projs() { return acProjs.length; },
  get impacts() { return acImpacts.length; },
  /** Save v4: best score untuk mode select */
  best: () => bestOf(),
  /** Dev/debug API (P20): tanpa UI — dipakai test & console */
  debug: {
    /** set wave + percepat prep ke start (debug only) */
    wave(n: number): void {
      st.run.wave = Math.max(1, Math.floor(n));
      if (st.run.phase === 'prep') st.run.prepLeft = 0.01;
      renderAll();
    },
    gold(n: number): void { st.run.gold = Math.max(0, Math.floor(n)); renderAll(); },
    base(n: number): void { st.run.base.hp = Math.max(0, Math.floor(n)); renderAll(); },
    win(): void { st.run.phase = 'won'; },
  },
};
register('AutochessUI', ACUI);
export { ACUI };
export default ACUI;
