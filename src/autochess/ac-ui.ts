/**
 * ac-ui.ts — autochess TD screen: board grid, bench, shop, HUD, phase loop.
 *
 * P17. Self-contained DOM (section built on first open, appended to body).
 * Loop: prep countdown → combat rAF tick(WaveRunner) → reward claim → … .
 * Placement = tap unit (bench/board) → tap cell (mobile-friendly; no drag yet).
 */
import { register } from '../core/registry';
import { UI } from '../ui/ui';
import { Audio } from '../core/audio';
import { Board, type BoardState, type BoardUnit } from './board';
import { Path } from './path';
import { Shop, type ShopState } from './shop';
import { Team } from './team';
import { WaveRunner, type RunState } from './wave-runner';
import { WaveDef } from './wave';
import type { UnitBattle } from './unit';

const LEVEL = 8; // boardCap = min(8, 1+floor(l/2)) = 5

interface ACInternal {
  run: RunState;
  shop: ShopState;
  board: BoardState;
  sel: BoardUnit | null;
  units: UnitBattle[];
  open: boolean;
  last: number;
}

const st: ACInternal = {
  run: WaveRunner.createRun(),
  shop: Shop.createShop(),
  board: { units: [] },
  sel: null,
  units: [],
  open: false,
  last: 0,
};

const $ = (id: string) => document.getElementById(id) as HTMLElement;

// ---------------- DOM skeleton (built once) ----------------

const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function esc(s: any): string {
  return String(s ?? '').replace(/[&<>"]/g, (c: string) => ESC_MAP[c]);
}

function ensureDom(): HTMLElement {
  let sec = document.getElementById('scr-ac');
  if (sec) return sec;
  sec = document.createElement('section');
  sec.id = 'scr-ac';
  sec.className = 'scr hidden';
  sec.innerHTML = `
    <style>
      #scr-ac{position:fixed;inset:0;z-index:60;background:var(--bg,#12141c);display:flex;flex-direction:column;
        padding:8px;gap:6px;overflow:hidden;color:var(--fg,#eee)}
      .ac-hud{display:flex;gap:10px;align-items:center;font-size:14px;flex-wrap:wrap;justify-content:center}
      .ac-hud b{color:var(--gold,#ffd45e)}
      .ac-base{width:140px;height:12px;background:#331;border:1px solid #555;border-radius:6px;overflow:hidden}
      .ac-base i{display:block;height:100%;background:linear-gradient(#6f6,#2c2);transition:width .3s}
      .ac-mid{flex:1;display:flex;gap:8px;min-height:0}
      .ac-left{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}
      .ac-board{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(5,1fr);gap:3px;
        flex:1;min-height:0;background:#0b0d14;border:1px solid #2a2f3f;border-radius:8px;padding:4px}
      .ac-cell{position:relative;background:#161a26;border:1px solid #232838;border-radius:6px;min-height:34px;
        display:flex;align-items:center;justify-content:center;cursor:pointer}
      .ac-cell.lane{background:#1d1712;border-color:#4a3b1e}
      .ac-cell.sel{outline:2px solid #ffd45e}
      .ac-cell canvas{max-width:92%;max-height:92%;image-rendering:pixelated}
      .ac-cell .st{position:absolute;top:1px;right:3px;font-size:10px;color:#ffd45e;text-shadow:0 0 3px #000}
      .ac-cell .hp{position:absolute;left:8%;right:8%;bottom:2px;height:3px;background:#411;border-radius:2px;overflow:hidden}
      .ac-cell .hp i{display:block;height:100%;background:#4d4}
      .ac-mob{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        font-size:11px;background:rgba(180,40,40,.35);border-radius:6px}
      .ac-side{width:150px;display:flex;flex-direction:column;gap:4px;font-size:12px;overflow:auto}
      .ac-syn{background:#12151f;border:1px solid #262b3b;border-radius:6px;padding:4px 6px}
      .ac-syn div{display:flex;justify-content:space-between;gap:4px}
      .ac-syn .t2{color:#7fd3ff}.ac-syn .t4{color:#ffd45e}
      .ac-bench{display:grid;grid-template-columns:repeat(9,1fr);gap:3px}
      .ac-slot{position:relative;background:#161a26;border:1px solid #232838;border-radius:6px;height:44px;
        display:flex;align-items:center;justify-content:center;cursor:pointer}
      .ac-slot.sel{outline:2px solid #ffd45e}
      .ac-slot canvas{max-width:90%;max-height:90%;image-rendering:pixelated}
      .ac-slot .st{position:absolute;top:0;right:2px;font-size:10px;color:#ffd45e}
      .ac-shop{display:grid;grid-template-columns:repeat(5,1fr) auto;gap:4px}
      .ac-card{position:relative;background:#141826;border:1px solid #2a3044;border-radius:8px;padding:3px;
        display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;font-size:11px;min-height:74px}
      .ac-card.off{opacity:.45;pointer-events:none}
      .ac-card canvas{height:36px;image-rendering:pixelated}
      .ac-card .cost{color:#ffd45e;font-weight:bold}
      .ac-card .st{position:absolute;top:1px;right:3px;color:#ffd45e;font-size:10px}
      .ac-btns{display:flex;gap:6px;justify-content:center}
      .ac-over{position:absolute;inset:0;background:rgba(5,6,10,.88);z-index:70;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:12px;font-size:18px}
    </style>
    <div class="ac-hud">
      <span id="ac-wave">Oleada <b>1/30</b></span>
      <span id="ac-phase">Preparación 20s</span>
      <span id="ac-gold"><b>20</b> 🪙</span>
      <span class="ac-base"><i id="ac-base-hp" style="width:100%"></i></span>
      <button id="ac-start" class="btn gold" style="font-size:13px;padding:4px 12px">Empezar</button>
      <button id="ac-close" class="btn ghost" style="font-size:13px;padding:4px 10px">Salir</button>
    </div>
    <div class="ac-mid">
      <div class="ac-left">
        <div class="ac-board" id="ac-board"></div>
        <div class="ac-bench" id="ac-bench"></div>
        <div class="ac-shop" id="ac-shop"></div>
        <div class="ac-btns">
          <button id="ac-reroll" class="btn" style="font-size:13px">⟲ 2🪙</button>
          <button id="ac-sell" class="btn hidden" style="font-size:13px">Vender ★</button>
        </div>
      </div>
      <div class="ac-side">
        <div class="ac-syn" id="ac-syn"></div>
      </div>
    </div>
    <div class="ac-over hidden" id="ac-over"></div>`;
  document.body.appendChild(sec);
  wire(sec);
  return sec;
}

// ---------------- rendering ----------------

function phaseText(): string {
  const r = st.run;
  if (r.phase === 'prep') return `Preparación ${Math.ceil(r.prepLeft)}s`;
  if (r.phase === 'combat') return '⚔️ ¡Combate!';
  if (r.phase === 'reward') return '🎉 Recompensa';
  if (r.phase === 'won') return '🏆 ¡Victoria!';
  return '💀 Derrota';
}

function renderHud(): void {
  const r = st.run;
  $('ac-wave').innerHTML = `Oleada <b>${r.wave}/${WaveDef.MAX_WAVE}</b>`;
  $('ac-phase').textContent = phaseText();
  $('ac-gold').innerHTML = `<b>${r.gold}</b> 🪙`;
  $('ac-base-hp').style.width = Math.max(0, (r.base.hp / r.base.maxHp) * 100) + '%';
  $('ac-start').classList.toggle('hidden', r.phase !== 'prep');
}

function unitAt(x: number, y: number): BoardUnit | null {
  return st.board.units.find((u) => u.x === x && u.y === y) || null;
}

function renderBoard(): void {
  const box = $('ac-board');
  box.innerHTML = '';
  const lane = new Set(Path.laneCells().map((c) => c.x + ',' + c.y));
  for (let y = 0; y < Path.H; y++) {
    for (let x = 0; x < Path.W; x++) {
      const cell = document.createElement('div');
      cell.className = 'ac-cell' + (lane.has(x + ',' + y) ? ' lane' : '');
      cell.dataset.xy = x + ',' + y;
      const u = unitAt(x, y);
      if (u) {
        if (st.sel === u) cell.classList.add('sel');
        cell.appendChild(UI.spriteCanvas(u.dex, 44, 44, { scale: 2 }));
        if (u.star > 1) cell.insertAdjacentHTML('beforeend', `<span class="st">${'★'.repeat(u.star)}</span>`);
        cell.insertAdjacentHTML('beforeend', `<span class="hp"><i style="width:100%"></i></span>`);
      }
      cell.onclick = () => onCell(x, y);
      box.appendChild(cell);
    }
  }
  // lane mob badges (combat)
  if (st.run.phase === 'combat') {
    const byCell = new Map<string, number>();
    let boss = false;
    for (const m of st.run.mobs) {
      if (!m.alive) continue;
      const i = Math.min(Path.laneCells().length - 1, Math.max(0, Math.floor(m.progress)));
      const c = Path.laneCells()[i];
      const k = c.x + ',' + c.y;
      byCell.set(k, (byCell.get(k) || 0) + 1);
      if (m.boss) boss = true;
    }
    for (const [k, n] of byCell) {
      const el = box.querySelector(`[data-xy="${k}"]`) as HTMLElement;
      if (el) {
        const b = document.createElement('span');
        b.className = 'ac-mob';
        b.textContent = (boss ? '👑' : '👾') + '×' + n;
        el.appendChild(b);
      }
    }
  }
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
      slot.appendChild(UI.spriteCanvas(u.dex, 40, 40, { scale: 2 }));
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
    card.appendChild(UI.spriteCanvas(slot.dex, 40, 40, { scale: 2 }));
    const e = ((G as any).DEX_BY || {})[slot.dex] || {};
    card.insertAdjacentHTML(
      'beforeend',
      `<span class="cost">${cost}🪙</span><span>${esc(e.name || '?')}</span>` +
      `<span class="st">${'★'.repeat(slot.star)}</span>`
    );
    card.onclick = () => onBuy(i);
    box.appendChild(card);
  });
  const rr = document.createElement('button');
  rr.className = 'ac-card';
  rr.style.cssText = 'cursor:pointer;color:#9fb0d0;border-style:dashed';
  rr.textContent = '⟲\n2🪙';
  rr.onclick = () => onReroll();
  box.appendChild(rr);
}

function renderSyn(): void {
  const list = Team.teamActive(st.board);
  const box = $('ac-syn');
  if (!list.length) { box.innerHTML = '<div style="color:#667">Sin sinergias</div>'; return; }
  box.innerHTML = list
    .map(
      (a: any) =>
        `<div><span>${esc(a.def.name)} <small>${a.count}</small></span><span class="${a.tier === 4 ? 't4' : 't2'}">T${a.tier}</span></div>`
    )
    .join('');
}

function renderAll(): void {
  renderHud();
  renderBoard();
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
      Audio.sfx('click', undefined);
      afterBoardChange();
    } else UI.toast('No puedes colocar ahí');
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
  Audio.sfx('click', undefined);
  afterBoardChange();
}

function onBuy(i: number): void {
  const r = Shop.buy(st.shop, i, st.board, st.run.gold);
  if (!r.ok) { UI.toast('Oro insuficiente o banca llena'); return; }
  st.run.gold = r.gold;
  Audio.sfx('coins', undefined);
  if (r.merged) UI.toast(`★ fusión ×${r.merged}`);
  afterBoardChange();
}

function onReroll(): void {
  const r = Shop.reroll(st.shop, st.run.gold);
  if (!r.ok) { UI.toast('Oro insuficiente'); return; }
  st.run.gold = r.gold;
  Audio.sfx('click', undefined);
  renderAll();
}

function onSell(): void {
  if (!st.sel) return;
  const name = st.sel;
  st.run.gold = Shop.sell(st.board, name, st.run.gold);
  st.sel = null;
  Audio.sfx('coins', undefined);
  UI.toast('Vendido');
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

function onClaim(): void {
  const gain = WaveRunner.claimReward(st.run);
  if (gain) UI.toast(`+${gain} 🪙`);
  hideOver();
  renderAll();
  if (st.open) requestAnimationFrame(loop); // resume after reward overlay
}

function onExit(): void {
  close();
}

function showOver(title: string, sub: string): void {
  const ov = $('ac-over');
  ov.classList.remove('hidden');
  ov.innerHTML = `
    <div style="font-size:34px">${title}</div>
    <div style="color:#9fb0d0">${sub}</div>
    <div class="ac-btns">
      <button class="btn gold" id="ac-again">Otra vez</button>
      <button class="btn" id="ac-menu">Menú</button>
    </div>`;
  $('ac-again').onclick = () => { hideOver(); reset(); if (st.open) requestAnimationFrame(loop); };
  $('ac-menu').onclick = () => close();
}

function hideOver(): void {
  $('ac-over').classList.add('hidden');
}

// ---------------- loop ----------------

function enterCombat(): void {
  st.sel = null;
  st.units = Team.spawnUnits(st.board);
  renderAll();
}

function loop(ts: number): void {
  if (!st.open) return;
  const dt = Math.min(0.1, (ts - st.last) / 1000 || 0);
  st.last = ts;
  const r = st.run;
  if (r.phase === 'combat' || r.phase === 'prep') {
    const prev = r.phase;
    const changed = WaveRunner.tick(r, st.units, dt, Team.teamMods(st.board));
    const after: string = r.phase;
    if (changed) {
      if (prev === 'prep' && after === 'combat') enterCombat();
      else if (after === 'reward') { renderAll(); offerReward(); return; }
      else if (after === 'lost') { renderAll(); showOver('💀', `Oleada ${r.wave} — la base cayó`); return; }
      else renderAll();
    }
    if (after === 'combat') { renderHud(); updateCombatBars(); }
    else if (after === 'prep') renderHud();
  } else if (r.phase === 'won') {
    renderAll();
    showOver('🏆', `¡${WaveDef.MAX_WAVE} oleadas superadas! Oro: ${r.gold}`);
    return;
  }
  requestAnimationFrame(loop);
}

let rewardPending = false;
function offerReward(): void {
  if (rewardPending) return;
  rewardPending = true;
  const ov = $('ac-over');
  ov.classList.remove('hidden');
  const income = WaveRunner.income(st.run.wave, st.run.gold);
  ov.innerHTML = `
    <div style="font-size:26px">🎉 Oleada ${st.run.wave} superada</div>
    <div class="gold">+${income} 🪙 (+interés)</div>
    <div class="ac-btns"><button class="btn gold" id="ac-claim">Cobrar</button></div>`;
  $('ac-claim').onclick = () => { rewardPending = false; onClaim(); };
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
  // mob badges refresh
  const badges = $('ac-board').querySelectorAll('.ac-mob');
  badges.forEach((b) => b.remove());
  const byCell = new Map<string, number>();
  let boss = false;
  for (const m of st.run.mobs) {
    if (!m.alive) continue;
    const i = Math.min(Path.laneCells().length - 1, Math.max(0, Math.floor(m.progress)));
    const c = Path.laneCells()[i];
    const k = c.x + ',' + c.y;
    byCell.set(k, (byCell.get(k) || 0) + 1);
    if (m.boss) boss = true;
  }
  for (const [k, n] of byCell) {
    const el = $('ac-board').querySelector(`[data-xy="${k}"]`);
    if (el) {
      const b = document.createElement('span');
      b.className = 'ac-mob';
      b.textContent = (boss ? '👑' : '👾') + '×' + n;
      el.appendChild(b);
    }
  }
  renderHud();
}

// ---------------- lifecycle ----------------

function reset(): void {
  rewardPending = false;
  st.run = WaveRunner.createRun();
  st.shop = Shop.createShop();
  st.board = { units: [] };
  st.sel = null;
  st.units = [];
  renderAll();
}

function wire(sec: HTMLElement): void {
  $('ac-start').onclick = onStart;
  $('ac-close').onclick = onExit;
  $('ac-sell').onclick = onSell;
  $('ac-reroll').onclick = () => onReroll();
}

function open(): void {
  ensureDom();
  reset();
  st.open = true;
  st.last = performance.now();
  UI.chrome(false);
  UI.show('scr-ac');
  Audio.sfx('confirm', undefined);
  requestAnimationFrame(loop);
}

function close(): void {
  st.open = false;
  rewardPending = false;
  Audio.sfx('click', undefined);
  UI.show('scr-menu');
  UI.chrome(true);
}

const ACUI = { open, close, reset, get run() { return st.run; }, get board() { return st.board; }, get shop() { return st.shop; } };
register('AutochessUI', ACUI);
export { ACUI };
export default ACUI;
