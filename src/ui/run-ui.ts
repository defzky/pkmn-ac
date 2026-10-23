/* ============ run-ui.ts — cartas de nivel, pausa y fin de run ============ */
import { register } from '../core/registry';
import { U } from '../core/util';
import { DB } from '../core/db';
import { Audio } from '../core/audio';
import Items from '../data/items';
import { Funding } from '../data/funding';
import { Stats } from '../systems/stats';
import { LevelUp } from '../systems/levelup';
import { UI } from './ui';
import { Icons } from './icons';
import { Game } from '../game';

const RunUI = (() => {
  const $ = UI.$;
  let offers: any = null, offerCb: any = null, coopMode = false;

  /*
   * Al aparecer unas cartas (nivel, vínculo, objeto) no se pueden elegir
   * durante GUARD s y se ven apagadas: en plena pelea se pulsa 1-4 (o se toca
   * la pantalla) para cambiar de ataque y se elegía una carta sin querer.
   * Cambiar las cartas o el 2.º paso del vínculo no lo vuelven a poner: ahí ya
   * estás eligiendo a propósito.
   */
  const GUARD = 0.6;
  let guardUntil = 0, guardT = 0;
  function guard(box: any) {
    guardUntil = performance.now() + GUARD * 1000;
    box.classList.add('guard');
    clearTimeout(guardT);
    guardT = setTimeout(() => document.querySelectorAll('.cards.guard').forEach(b => b.classList.remove('guard')), GUARD * 1000);
  }
  const guarded = () => performance.now() < guardUntil;

  /** @param coop  en grupo: tras elegir, se queda esperando a los demás */
  function showLevelUp(level: any, list: any, cb: any, coop = false) {
    offerCb = cb; coopMode = coop;
    $('lvl-num').textContent = level;
    $('lvl-wait').textContent = '';
    $('lvl-wait').classList.toggle('hidden', !coop);
    $('cards').classList.remove('done');
    renderCards(list);
    $('lvl-reroll').onclick = reroll;
    UI.show('scr-levelup');
    guard($('cards'));
  }

  /**
   * Cambiar las cartas: 1 vez gratis por partida y 1 más por cada jefe
   * derrotado (en grupo cuentan los jefes del equipo; cada uno tiene los suyos).
   */
  function rerollsLeft() {
    const p: any = Game.player;
    // 1 gratis + los comprados en Mejoras (antes, 1 más por cada jefe).
    return p ? Math.max(0, 1 + (p.rerollBonus || 0) - (p.rerolls || 0)) : 0;
  }

  function reroll() {
    if (!offers || rerollsLeft() <= 0) return;
    const p: any = Game.player;
    p.rerolls = (p.rerolls || 0) + 1;
    Audio.sfx('select', undefined);
    renderCards(LevelUp.offer(p));
  }

  function renderCards(list: any) {
    offers = list;
    const left = rerollsLeft();
    $('lvl-rr-n').textContent = left;
    $('lvl-reroll').classList.toggle('hidden', left <= 0);
    const box = $('cards');
    box.innerHTML = '';
    list.forEach((c: any, i: any) => {
      const el = document.createElement('div');
      el.className = 'card';
      const tag = c.type === 'new'
        ? `<span class="tag-chip" style="background:${c.color}">Nuevo · ${c.tag}</span>`
        : c.type === 'up' || c.type === 'evo'
          ? `<span class="tag-chip" style="background:${c.color}">${c.tag}</span>`
          : `<span class="tag-chip" style="background:${c.color === '#ffd23f' ? '#ffd23f' : '#9fb1c9'}">${c.tag}</span>`;
      if (c.type === 'evo') el.classList.add('evo');
      el.innerHTML =
        `<div class="ico" style="background:${c.color}33">${Icons.html(c.icon, 32)}</div>
         <div class="txt"><div class="nm">${c.title} ${tag}</div><div class="ds">${c.desc}</div></div>
         <div class="key">${i + 1}</div>`;
      el.dataset.sfx = 'none';             // el juego pone su propio sonido al elegir
      el.onclick = () => pick(i);
      box.appendChild(el);
    });
  }

  function pick(i: any) {
    if (!offers || !offers[i] || guarded()) return;
    const c = offers[i], cb = offerCb;
    offers = null; offerCb = null;
    $('lvl-reroll').classList.add('hidden');
    if (coopMode) {
      // Se queda la carta elegida a la vista mientras eligen los demás.
      $('cards').querySelectorAll('.card').forEach((el: any, j: any) => el.classList.toggle('picked', j === i));
      $('cards').classList.add('done');
    } else UI.hide('scr-levelup');
    cb(c);
  }

  /** Cooperativo: quién falta por elegir. */
  function setWaiting(names: any) {
    const me = (G as any).Social.me ? (G as any).Social.me.name : '';
    const others = names.filter((n: any) => n !== me);
    const list = (a: any) => a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a[0];
    $('lvl-wait').textContent = !names.length ? ''
      : !others.length ? 'Elige tu carta'
      : names.includes(me) ? 'Faltan por elegir: ' + list([...others, 'tú'])
      : 'Esperando a ' + list(others) + '…';
  }

  function closeLevelUp() {
    offers = null; offerCb = null;
    $('cards').classList.remove('done');
    UI.hide('scr-levelup');
  }

  /**
   * Mensaje de apoyo (Ko-fi) al acabar: tras un récord o cada 10 partidas,
   * nunca en la primera y como mucho una vez al día. Se cierra con la X.
   */
  function askSupport(r: any) {
    if (!Funding || !Funding.url) return false;
    const runs = (DB.save && DB.save.stats && DB.save.stats.runs) || 0;
    if (runs < 2 || !(r.record || runs % 10 === 0)) return false;
    const today = new Date().toISOString().slice(0, 10);
    try { if (localStorage.getItem('ps.ask') === today) return false; localStorage.setItem('ps.ask', today); } catch (e) { return false; }
    return true;
  }

  function showOver(r: any, onBack: any) {
    $('over-title').textContent = r.dead ? 'Has caído…' : 'Run terminada';
    $('over-stats').innerHTML = `
      <div><span>Tiempo</span><b>${U.mmss(r.time)}</b></div>
      <div><span>Nivel</span><b>${r.level}</b></div>
      <div><span>Derrotados</span><b>${r.kills}</b></div>
      <div><span>Jefes</span><b>${r.bosses}</b></div>
      ${r.judge ? `<div style="grid-column:1/-1"><span>Ante Arceus</span><b class="gold">${U.mmss(r.judge.time)} · ${r.judge.bosses} ${r.judge.bosses === 1 ? 'legendario' : 'legendarios'}</b></div>` : ''}
      <div style="grid-column:1/-1"><span>Pokémonedas ganadas</span>
        <b class="gold"><span class="coin"></span> +${r.coins}</b>
        <div style="font-size:12px;color:var(--muted)">${r.breakdown}</div></div>
      ${r.t1 || r.t10 ? `<div style="grid-column:1/-1"><span>Tickets del gacha</span><b>
        ${r.t1 ? Icons.html('ticket', 22) + ' +' + r.t1 + ' ' : ''}${r.t10 ? Icons.html('ticket10', 22) + ' +' + r.t10 + ' ×10' : ''}</b></div>` : ''}
      <div style="grid-column:1/-1"><span>Movimientos</span><b style="font-size:15px">
        ${r.moves.map((m: any) => `${Icons.html('move:' + m.id, 16)} ${m.name} Nv.${m.lvl}`).join(' · ') || '—'}</b></div>
      ${r.caught && r.caught.length ? `<div style="grid-column:1/-1" class="caught"><span>${Icons.html('shiny', 12)} Shinies conseguidos</span>
        <div class="caught-row" id="over-caught"></div></div>` : ''}
      ${r.record ? '<div style="grid-column:1/-1;text-align:center" class="gold">¡Nuevo récord de tiempo!</div>' : ''}
      ${askSupport(r) ? `<div class="support-ask" id="over-ask" style="grid-column:1/-1">
        <button class="x" type="button" aria-label="Cerrar">×</button>
        <p>¿Te está gustando PokéSurvivor? Lo hago yo solo y los servidores cuestan dinero. Si quieres, puedes ayudarme a mantenerlo en línea.</p>
        <a class="btn small gold" href="${Funding.url}" target="_blank" rel="noopener">${Icons.html('heart', 14)} Apoyar en Ko-fi</a>
      </div>` : ''}`;
    const ask = $('over-ask');
    if (ask) ask.querySelector('.x').onclick = () => ask.remove();
    $('btn-again').onclick = onBack;
    if (r.caught && r.caught.length) {
      const row = $('over-caught');
      for (const c of r.caught) {
        const w = document.createElement('div');
        w.appendChild(UI.spriteCanvas(c.dex, 90, 72, { shiny: true, lively: true, scale: 2 }));
        w.insertAdjacentHTML('beforeend', `<small>${(G as any).DEX_BY[c.dex].name}${c.isNew ? ' · ¡nuevo!' : ''}</small>`);
        row.appendChild(w);
      }
    }
    UI.show('scr-over');
  }

  /** Has encontrado un objeto llevando ya otro: ¿con cuál te quedas? */
  function showItemChoice(cur: any, next: any, cb: any) {
    const box = $('item-cards');
    box.innerHTML = '';
    [[cur, 'Quedarme con'], [next, 'Cambiar a']].forEach(([id, verb], i) => {
      const it = Items.BY[id];
      const el = document.createElement('div');
      el.className = 'card' + (i === 1 ? ' evo' : '');
      el.innerHTML = `<div class="ico">${Icons.html(id, 36)}</div>
        <div class="txt"><div class="nm">${verb} ${it.name}</div><div class="ds">${it.desc}</div></div>
        <div class="key">${i + 1}</div>`;
      el.onclick = () => { if (guarded()) return; UI.hide('scr-item'); cb(id); };
      box.appendChild(el);
    });
    UI.show('scr-item');
    guard(box);
  }

  // ---------------- vínculo: qué movimientos se fusionan ----------------

  let bond: any = null;          // { opt, cb, first, list }

  /**
   * @param opt  pl.bondOptions(): 'add' (uno suelto al grupo) o 'pair' (dos sueltos, en dos pasos)
   * @param cb   recibe la lista de movimientos que se juntan
   */
  function showBond(opt: any, cb: any) {
    bond = { opt, cb, first: null, list: [] };
    $('bond-back').onclick = bondBack;
    renderBond();
    UI.show('scr-bond');
    guard($('bond-cards'));
  }

  function renderBond() {
    const { opt, first } = bond;
    const names = (ms: any) => ms.map((m: any) => m.name).join(' + ');
    const step2 = opt.mode === 'pair' && first;
    $('bond-sub').textContent = opt.mode === 'add' ? 'Elige qué movimiento se une a ' + names(opt.group)
      : step2 ? '¿Con cuál unes ' + first.name + '?' : 'Elige el primer movimiento que vas a unir';
    $('bond-back').classList.toggle('hidden', !step2);
    bond.list = step2 ? opt.loose.filter((m: any) => m !== first) : opt.loose;
    const box = $('bond-cards');
    box.innerHTML = '';
    bond.list.forEach((m: any, i: any) => {
      const col = (U.TYPE_COLOR as any)[m.type];
      const desc = opt.mode === 'add' ? 'Se lanzará a la vez que ' + names(opt.group) + '.'
        : step2 ? 'Se lanzará a la vez que ' + first.name + '. Queda un hueco libre.'
        : m.desc || '';
      const el = document.createElement('div');
      el.className = 'card' + (opt.mode === 'add' || step2 ? ' bond' : '');
      el.innerHTML =
        `<div class="ico" style="background:${col}33">${Icons.html('move:' + m.id, 32)}</div>
         <div class="txt"><div class="nm">${m.name} <span class="tag-chip" style="background:${col}">Nv.${m.lvl}</span></div><div class="ds">${desc}</div></div>
         <div class="key">${i + 1}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => pickBond(i);
      box.appendChild(el);
    });
  }

  function pickBond(i: any) {
    if (!bond || !bond.list[i] || guarded()) return;
    const m = bond.list[i];
    if (bond.opt.mode === 'pair' && !bond.first) {
      bond.first = m;
      Audio.sfx('select', undefined);
      renderBond();
      return;
    }
    const picked = bond.opt.mode === 'add' ? [m] : [bond.first, m];
    const cb = bond.cb;
    bond = null;
    UI.hide('scr-bond');
    cb(picked);
  }

  function bondBack() {
    if (!bond) return;
    bond.first = null;
    renderBond();
  }

  /*
   * Resumen de la partida en la pausa: tus ataques (categoría, daño hecho y
   * daño por segundo), tus estadísticas con todo lo subido y el objeto y las
   * cartas de mejora que llevas.
   */
  function pauseSummary() {
    const pl: any = Game.player;
    if (!pl) return '';
    const t = Game.st.time, n = (v: any) => Math.round(v).toLocaleString('es');
    const k2 = (v: any) => '×' + v.toFixed(2).replace('.', ',');
    const pct = (v: any) => Math.round(v * 100) + ' %';
    const moves = pl.moves.map((m: any) => {
      const secs = Math.max(5, t - (m.since || 0)), col = (U.TYPE_COLOR as any)[m.type];
      const cat = m.cat ? `<span class="tag-chip" style="background:${col}">${(Stats.NAME as any)[m.cat]}</span>` : '<span class="sub">Mejora</span>';
      return `<tr><td>${Icons.html('move:' + m.id, 18)} ${m.name} <small>Nv.${m.lvl}</small></td><td>${cat}</td>
        <td class="num">${m.cat ? n(m.dealt || 0) : '—'}</td><td class="num">${m.cat ? n((m.dealt || 0) / secs) + '/s' : '—'}</td></tr>`;
    }).join('');
    const mon = pl.mon, fis = 1 - Stats.taken(mon, 'physical'), esp = 1 - Stats.taken(mon, 'special');
    const guard = (v: any) => (v >= 0 ? '−' : '+') + Math.round(Math.abs(v) * 100) + ' %';
    const st = [
      ['Vida', n(pl.hp) + ' / ' + n(pl.maxHp)],
      ['Ataque', k2(pl.atkFor({ cat: 'physical' }))],
      ['At. Esp.', k2(pl.atkFor({ cat: 'special' }))],
      ['Defensa', mon.df + ' <small>' + guard(fis) + ' físico</small>'],
      ['Def. Esp.', mon.sd + ' <small>' + guard(esp) + ' especial</small>'],
      ['Velocidad', n(pl.spd)],
      ['Crítico', pct(pl.critChance || 0)],
      ['Reducción de daño', pct(pl.reduction)],
      ['Recarga', pl.cdMul < 0.995 ? '−' + pct(1 - pl.cdMul) : '0 %'],
      ['Regeneración', pl.regen.toFixed(1).replace('.', ',') + ' /s']
    ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    const it = pl.item && Items.BY[pl.item];
    const cards = Object.entries(pl.statsTaken || {}).map(([id, c]) => {
      const s = LevelUp.STATS.find(x => x.id === id);
      return s ? `<span class="chip">${Icons.html(s.icon, 12)} ${s.title} ×${c}</span>` : '';
    }).join('');
    return `<h3>Tus ataques</h3>
      <table class="sum-moves"><tr><th></th><th></th><th class="num">Daño</th><th class="num">Por segundo</th></tr>${moves}</table>
      <h3>Tus estadísticas</h3><div class="sum-stats">${st}</div>
      <h3>Objeto y cartas</h3>
      <p class="sub">${it ? Icons.html(pl.item, 18) + ' <b>' + it.name + '</b>: ' + it.desc : 'Sin objeto.'}</p>
      <div class="chips">${cards || '<span class="sub">Aún no has cogido cartas de mejora.</span>'}</div>`;
  }

  function showPause(coop = false) {
    $('pause-sum').innerHTML = pauseSummary();
    UI.soundControls($('pause-sound'));
    $('pause-coop').classList.toggle('hidden', !coop);
    $('btn-quit').textContent = coop ? 'Salir de la partida' : 'Abandonar run';
    UI.show('scr-pause');
  }

  function wirePause(onResume: any, onQuit: any) {
    $('btn-resume').onclick = onResume;
    $('btn-quit').onclick = onQuit;
  }

  return { showLevelUp, reroll, showItemChoice, showBond, pickBond, bondBack, pick, setWaiting, closeLevelUp, showOver, wirePause, showPause };
})();
register('RunUI', RunUI);
export { RunUI };
export default RunUI;
