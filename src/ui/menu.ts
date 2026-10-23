/* ============ menu.ts — menú principal, colección y mejoras ============ */
import { register } from '../core/registry';
import { U } from '../core/util';
import { DB } from '../core/db';
import { Audio } from '../core/audio';
import { Flow } from '../game';
import { Stats } from '../systems/stats';
import { Gacha } from '../systems/gacha';
import { Progress } from '../systems/progress';
import Moves from '../data/moves';
import Upgrades from '../data/upgrades';
import { startMoveOf } from '../data/starters';
import { UI } from './ui';
import { Icons } from './icons';

const MenuUI = (() => {
  const $ = UI.$;
  const GEN_NAMES = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  let dexGen = 1, dexSel: any = null;
  // Filtros de la colección (se combinan): tengo / me faltan, rarezas (varias),
  // shiny, favoritos, tipo y búsqueda; y el orden. Duran mientras no recargas.
  const DEX0 = () => ({ status: 'all', rar: new Set(), shiny: false, fav: false, type: '', q: '', sort: 'num' });
  let dexF = DEX0();
  const SORTS = [['num', 'Nº'], ['name', 'Nombre'], ['rar', 'Rareza'], ['new', 'Recién conseguidos'], ['used', 'Más usados']];

  function init() {
    const ICON = { play: 'ball', dex: 'book', upgrades: 'up', gacha: 'ball4', goals: 'medal3', friends: 'friends', rank: 'trophy', settings: 'gear', ac: 'gear' };
    document.querySelectorAll('#scr-menu [data-go]').forEach((b: any) => {
      b.insertAdjacentHTML('afterbegin', `<span class="mi-ico">${Icons.html((ICON as any)[b.dataset.go], 26)}</span>`);
      b.dataset.sfx = b.dataset.go === 'play' ? 'confirm' : 'click';
      b.onclick = () => {
        const go = b.dataset.go;
        if (go === 'play') { if ((G as any).Social.room) (G as any).LobbyUI.open(); else Flow.play(); }
        else if (go === 'dex') openDex();
        else if (go === 'upgrades') openUpgrades();
        else if (go === 'gacha') (G as any).GachaUI.open();
        else if (go === 'goals') (G as any).GoalsUI.open();
        else if (go === 'friends') (G as any).FriendsUI.open();
        else if (go === 'rank') (G as any).RankingUI.open();
        else if (go === 'settings') (G as any).SettingsUI.open();
        else if (go === 'ac') (G as any).AutochessUI.open();
      };
    });
    document.querySelectorAll('[data-back]').forEach((b: any) => { b.onclick = open; });
    (G as any).Social.on(() => { if (UI.isOpen('scr-menu')) socialLine(); });
    $('btn-logout').onclick = () => {
      if (DB.guest && !confirm('Eres invitado: se perderá todo el progreso. ¿Salir?')) return;
      Audio.music(null);
      DB.logout().then(() => Flow.toLogin());
    };
  }

  // ---------------- menú principal ----------------

  function open() {
    const s: any = DB.save;
    const mon = (G as any).DEX_BY[s.partner];
    const shiny = !!s.partnerShiny && DB.ownsShiny(mon.dex);
    UI.chrome(true);
    UI.show('scr-menu');
    UI.sprite($('menu-partner'), mon.dex, { lively: true, scale: 4, hero: true, shiny });
    $('menu-partner').style.setProperty('--stage-c', shiny ? '#9ae6ff' : (U.TYPE_COLOR as any)[mon.types[0]]);
    $('menu-partner').classList.toggle('shiny', shiny);
    $('menu-partner-name').innerHTML = mon.name + (shiny ? ' ' + Icons.html('shiny', 24) : '');
    $('menu-partner-info').innerHTML = UI.typeChips(mon.types) + ' ' + UI.stars(mon.rarity);
    // Normal / shiny a mano, aquí mismo (en el móvil no se encontraba en la ficha).
    const seg = $('menu-shiny');
    seg.classList.toggle('hidden', !DB.ownsShiny(mon.dex));
    seg.lastChild.innerHTML = Icons.html('shiny', 12) + ' Shiny';
    seg.querySelectorAll('button').forEach((b: any) => {
      b.classList.toggle('on', (b.dataset.v === '1') === shiny);
      b.onclick = () => {
        if ((b.dataset.v === '1') === shiny) return;
        s.partnerShiny = b.dataset.v === '1';
        DB.commit();
        Audio.sfx('confirm', undefined);
        open();
      };
    });

    const owned = Object.keys(s.owned).filter(d => (G as any).DEX_BY[d]).length;
    const shinies = Object.keys(s.shiny || {}).length;
    $('menu-dex-count').textContent = `${owned} / ${(G as any).DEX.length}` + (shinies ? ` · ${shinies} shiny` : '');

    const st = s.stats;
    $('menu-stats').innerHTML =
      `Runs <b style="color:#fff">${st.runs}</b> · Mejor tiempo <b style="color:#fff">${U.mmss(st.bestTime)}</b><br>` +
      `Mejor nivel <b style="color:#fff">${st.bestLevel}</b> · Derrotados <b style="color:#fff">${st.totalKills.toLocaleString('es')}</b>` +
      (DB.guest ? '<br><span style="color:#ffb0b8">Modo invitado: no se guarda</span>' : '');

    socialLine();
    // Premios de misiones por recoger.
    Progress.checkAch();
    const pend = Progress.pending();
    $('menu-goals-sub').textContent = pend ? pend + (pend === 1 ? ' premio por recoger' : ' premios por recoger') : 'Misiones, logros y perfil';
    $('menu-goals-sub').classList.toggle('gold', pend > 0);
    // Con cuenta en la nube: amigos en línea, invitaciones y (una vez) el apodo.
    if (DB.online && !(G as any).Social.started) {
      (G as any).Social.start().then((r: any) => {
        if (r === 'need-nick' && !(G as any).NickUI.skipped && UI.isOpen('scr-menu')) (G as any).NickUI.open();
        socialLine();
      });
    }
    (G as any).InvitePop.refresh();
  }

  /** Texto bajo "Amigos" y "Jugar": quién está en línea, solicitudes, sala. */
  function socialLine() {
    const room = (G as any).Social.room;
    const play = document.querySelector('#scr-menu [data-go=play] small');
    if (play) play.textContent = room ? 'Volver a tu sala (' + room.members.length + '/' + (G as any).Social.MAX_PLAYERS + ')' : 'Entra en la mazmorra';
    const fr = (G as any).Social.friends;
    const on = fr.filter((f: any) => f.status === 'ok' && f.online).length;
    const req = fr.filter((f: any) => f.status === 'in').length;
    const parts: any[] = [];
    if (on) parts.push(on + ' en línea');
    if (req) parts.push(req + (req === 1 ? ' solicitud' : ' solicitudes'));
    $('menu-friends-sub').textContent = parts.length ? parts.join(' · ') : 'Juega en grupo, hasta 4';
    $('menu-friends-sub').classList.toggle('gold', req > 0);
  }

  // ---------------- colección ----------------

  function openDex() {
    UI.show('scr-dex', true);
    const s: any = DB.save;
    if (dexSel == null) { dexSel = s.partner; dexGen = (G as any).DEX_BY[s.partner].gen; }
    const owned = Object.keys(s.owned).filter(d => (G as any).DEX_BY[d]).length;
    $('dex-total').textContent = `${owned} / ${(G as any).DEX.length}`;

    // Pestañas de generación (y "Todas"), con cuántos tienes de cada una.
    const tabs = $('dex-gens');
    tabs.innerHTML = '';
    ['Todas', ...GEN_NAMES].forEach((name, g) => {
      const list = g ? (G as any).DEX.filter((p: any) => p.gen === g) : (G as any).DEX;
      const have = list.filter((p: any) => s.owned[p.dex]).length;
      const b = document.createElement('button');
      b.className = 'gen-tab' + (g === dexGen && !dexF.q ? ' on' : '');
      b.innerHTML = `<b>${name}</b><small>${have}/${list.length}</small>`;
      b.onclick = () => { dexGen = g; openDex(); };
      tabs.appendChild(b);
    });

    // Tengo / me faltan (uno), rarezas (las que quieras), shiny y favoritos.
    const fb = $('dex-filters');
    fb.innerHTML = '';
    const chip = (html: any, on: any, fn: any) => {
      const c = document.createElement('button');
      c.className = 'chip' + (on ? ' on' : '');
      c.innerHTML = html;
      c.onclick = () => { fn(); openDex(); };
      fb.appendChild(c);
    };
    for (const [k, label] of [['all', 'Todos'], ['own', 'Tengo'], ['miss', 'Me faltan']]) chip(label, dexF.status === k, () => { dexF.status = k; });
    chip(Icons.html('shiny', 12) + ' Shiny', dexF.shiny, () => { dexF.shiny = !dexF.shiny; });
    chip(Icons.html('star', 12) + ' Favoritos', dexF.fav, () => { dexF.fav = !dexF.fav; });
    for (const r of [5, 4, 3, 2, 1]) {
      chip(Icons.rarity(r, 12) + ' ' + (Gacha.RARITY_NAME as any)[r], dexF.rar.has(r), () => { dexF.rar.has(r) ? dexF.rar.delete(r) : dexF.rar.add(r); });
    }

    // Orden.
    const sb = $('dex-sort');
    sb.innerHTML = '<span class="sub">Orden:</span>';
    for (const [k, label] of SORTS) {
      const c = document.createElement('button');
      c.className = 'chip' + (dexF.sort === k ? ' on' : '');
      c.textContent = label;
      c.onclick = () => { dexF.sort = k; openDex(); };
      sb.appendChild(c);
    }

    // Tipo y búsqueda (la búsqueda mira en todas las generaciones).
    const ts = $('dex-type');
    ts.innerHTML = `<option value="">Todos los tipos</option>` +
      Object.keys(U.TYPE_NAME).map(t => `<option value="${t}">${(U.TYPE_NAME as any)[t]}</option>`).join('');
    ts.value = dexF.type;
    ts.onchange = () => { dexF.type = ts.value; openDex(); };
    const q = $('dex-q');
    if (q.value !== dexF.q) q.value = dexF.q;
    q.oninput = () => {
      clearTimeout(qT);
      qT = setTimeout(() => {
        dexF.q = q.value; renderGrid();
        $('dex-gens').querySelectorAll('.gen-tab').forEach((b: any, g: any) => b.classList.toggle('on', g === dexGen && !dexF.q));
      }, 150);
    };
    q.onkeydown = (e: any) => { if (e.key === 'Escape') { e.stopPropagation(); q.blur(); } };
    $('dex-clear').onclick = () => { dexF = DEX0(); openDex(); };
    renderGrid();
    showDetail(dexSel);
  }

  /** Lo que se ve con la generación, los filtros y el orden de ahora. */
  function dexList() {
    const s: any = DB.save, f = dexF;
    const q = f.q.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const num = /^#?\d+$/.test(q) ? +q.replace('#', '') : null;
    const list = (G as any).DEX.filter((p: any) => {
      const own = !!s.owned[p.dex];
      if (q) {
        // Por número, o por nombre (sin tildes); de los que no tienes no se busca el nombre.
        if (num != null ? p.dex !== num : !(own && p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q))) return false;
      } else if (dexGen && p.gen !== dexGen) return false;
      if (f.status === 'own' && !own) return false;
      if (f.status === 'miss' && own) return false;
      if (f.shiny && !(s.shiny && s.shiny[p.dex])) return false;
      if (f.fav && !DB.isFav(p.dex)) return false;
      if (f.rar.size && !f.rar.has(p.rarity)) return false;
      if (f.type && !(own && p.types.includes(f.type))) return false;
      return true;
    });
    const at = (p: any) => (s.owned[p.dex] && s.owned[p.dex].at) || 0, used = (p: any) => +(s.pused || {})[p.dex] || 0;
    const by = { num: (a: any, b: any) => a.dex - b.dex, name: (a: any, b: any) => a.name.localeCompare(b.name, 'es'),
                 rar: (a: any, b: any) => b.rarity - a.rarity || a.dex - b.dex, new: (a: any, b: any) => at(b) - at(a) || a.dex - b.dex,
                 used: (a: any, b: any) => used(b) - used(a) || a.dex - b.dex }[f.sort];
    // Los que no tienes no tienen nombre a la vista: al ordenar por nombre van al final.
    if (f.sort === 'name') list.sort((a: any, b: any) => ((!(s.owned as any)[a.dex]) as any) - ((!(s.owned as any)[b.dex]) as any) || (by as any)(a, b)); else list.sort(by);
    return list;
  }

  /*
   * La rejilla se pinta por tandas de PAGE: con "Todas" son 966 Pokémon, cada
   * uno con su animación y su hoja de sprites, y pintarlos de golpe paraba el
   * juego (y la música) un segundo al borrar la búsqueda o cambiar el orden.
   * Al acercarse al final de la lista se pinta la siguiente tanda.
   * keep: volver a pintar los mismos que había (marcar un favorito no te
   * devuelve arriba).
   */
  const PAGE = 48;
  let qT = 0, gridList: any[] = [], gridShown = 0, gridIO: any = null;
  function renderGrid(keep = false) {
    const grid = $('dex-grid');
    const want = keep ? Math.max(PAGE, gridShown) : PAGE;
    const top = grid.scrollTop;
    grid.innerHTML = '';
    gridList = dexList();
    gridShown = 0;
    const f = dexF, busy = f.q || f.status !== 'all' || f.shiny || f.fav || f.rar.size || f.type || f.sort !== 'num';
    $('dex-count').textContent = gridList.length === 1 ? '1 Pokémon' : gridList.length + ' Pokémon';
    $('dex-clear').classList.toggle('hidden', !busy);
    if (!gridList.length) { grid.innerHTML = '<p class="sub" style="grid-column:1/-1">Ninguno con estos filtros.</p>'; return; }
    moreCells(want);
    if (keep) grid.scrollTop = top;
  }

  function moreCells(n = PAGE) {
    const grid = $('dex-grid');
    const old = grid.querySelector('.dex-more');
    if (old) { if (gridIO) gridIO.unobserve(old); old.remove(); }
    const end = Math.min(gridList.length, gridShown + n);
    for (let i = gridShown; i < end; i++) grid.appendChild(dexCell(gridList[i]));
    gridShown = end;
    if (gridShown >= gridList.length) return;
    // Marca al final: cuando se acerca a la vista, la siguiente tanda.
    const more = document.createElement('div');
    more.className = 'dex-more';
    grid.appendChild(more);
    if (!('IntersectionObserver' in window)) { moreCells(gridList.length); return; }
    gridIO = gridIO || new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) moreCells(); }, { rootMargin: '300px' });
    gridIO.observe(more);
  }

  function dexCell(p: any) {
    const s: any = DB.save;
    const own = !!s.owned[p.dex], sh = !!(s.shiny && s.shiny[p.dex]);
    const cell = document.createElement('div');
    cell.className = 'cell' + (own ? '' : ' locked') + (p.dex === dexSel ? ' on' : '');
    cell.dataset.pad = '1';
    cell.insertAdjacentHTML('beforeend', `<span class="no">${String(p.dex).padStart(3, '0')}${DB.isFav(p.dex) ? ' ' + Icons.html('star', 10) : ''}</span>`);
    if (p.dex === s.partner) cell.insertAdjacentHTML('beforeend', `<span class="badge-r" title="Compañero">${Icons.html('crown', 14)}</span>`);
    else if (sh) cell.insertAdjacentHTML('beforeend', `<span class="badge-r" title="Tienes su shiny">${Icons.html('shiny', 12)}</span>`);
    const useShiny = sh && p.dex === s.partner && s.partnerShiny;
    cell.appendChild(UI.spriteCanvas(p.dex, 92, 80, { scale: 2, silhouette: !own, shadow: own, shiny: useShiny }));
    cell.insertAdjacentHTML('beforeend', `<b>${own ? p.name : '???'}</b>${UI.stars(p.rarity, 9)}`);
    cell.onclick = () => {
      dexSel = p.dex;
      $('dex-grid').querySelectorAll('.cell').forEach((c: any) => c.classList.remove('on'));
      cell.classList.add('on');
      showDetail(p.dex);
    };
    return cell;
  }

  // Variante que se está viendo en la ficha (normal o shiny).
  let viewShiny = false;

  function showDetail(dex: any) {
    const s: any = DB.save;
    const p = (G as any).DEX_BY[dex];
    const own = !!s.owned[dex];
    const hasSh = DB.ownsShiny(dex);
    const isPartner = dex === s.partner;
    if (!hasSh) viewShiny = false;
    else if (isPartner && dex !== (showDetail as any).last) viewShiny = !!s.partnerShiny;
    (showDetail as any).last = dex;

    const max = { hp: 183, atk: 1.55, spd: 137, def: 160 };
    const bar = (label: any, v: any, m: any, txt: any) =>
      `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, v / m * 100)}%"></i></div><span>${txt}</span></div>`;
    const usingThis = isPartner && (!hasSh || !!s.partnerShiny === viewShiny);

    const box = $('dex-detail');
    box.innerHTML = `
      <canvas id="dex-big" class="stage" width="220" height="190"></canvas>
      ${hasSh ? `<div class="seg">
          <button class="${viewShiny ? '' : 'on'}" data-v="0">Normal</button>
          <button class="${viewShiny ? 'on' : ''}" data-v="1">${Icons.html('shiny', 12)} Shiny</button></div>` : ''}
      <div class="center">
        <div style="color:var(--muted);font-size:13px">Nº ${String(p.dex).padStart(3, '0')} · ${GEN_NAMES[p.gen - 1]}</div>
        <h3>${own ? p.name : '???'}</h3>
        ${own ? `<button id="dex-fav" class="chip${DB.isFav(dex) ? ' on' : ''}" type="button">${Icons.html(DB.isFav(dex) ? 'star' : 'starDim', 12)} ${DB.isFav(dex) ? 'Favorito' : 'Marcar como favorito'}</button>` : ''}
        <div style="color:${(Gacha.RARITY_COLOR as any)[p.rarity]}">${UI.stars(p.rarity, 24)} ${(Gacha.RARITY_NAME as any)[p.rarity]}</div>
        <div style="margin:6px 0">${own ? UI.typeChips(p.types) : ''}</div>
      </div>
      ${own ? `
        ${bar('Vida', p.hp, max.hp, p.hp)}
        ${bar('Ataque', p.pa, max.atk, '×' + p.pa.toFixed(2))}
        ${bar('At. Esp.', p.sa, max.atk, '×' + p.sa.toFixed(2))}
        ${bar('Defensa', p.df, max.def, p.df)}
        ${bar('Def. Esp.', p.sd, max.def, p.sd)}
        ${bar('Velocidad', p.spd, max.spd, p.spd)}
        <p class="sub center" style="margin:6px 0 0">Pega mejor con ataques <b class="gold">${Stats.sideOf(p) === 'special' ? 'especiales' : 'físicos'}</b></p>
        <p style="font-size:14px;margin:10px 0 4px">Empieza con <b class="gold">${Moves.BY_ID[startMoveOf(dex)].name}</b></p>
        <p class="move-icons" title="Movimientos que puede aprender">
          ${Moves.poolFor(p).map(id => `<span title="${Moves.BY_ID[id].name}">${Icons.html('move:' + id, 16)}</span>`).join('')}</p>
        ${usingThis
          ? '<button class="btn grow" disabled style="width:100%">Es tu compañero</button>'
          : `<button id="dex-pick" class="btn gold" data-sfx="confirm" style="width:100%">Elegir de compañero${viewShiny ? ' (shiny)' : ''}</button>`}
      ` : `<p class="center" style="color:var(--muted)">Aún no lo tienes.<br>Consíguelo en el banner de <b class="gold">${GEN_NAMES[p.gen - 1]}</b>
            o derrotándolo cuando salga shiny.</p>`}
    `;
    $('dex-big').style.setProperty('--stage-c', !own ? '#5b83d6' : viewShiny ? '#9ae6ff' : (U.TYPE_COLOR as any)[p.types[0]]);
    $('dex-big').classList.toggle('shiny', own && viewShiny);
    UI.sprite($('dex-big'), dex, { lively: own, spin: own, silhouette: !own, scale: 3, hero: true, shiny: own && viewShiny });
    box.querySelectorAll('.seg button').forEach((b: any) => {
      b.onclick = () => { viewShiny = b.dataset.v === '1'; showDetail(dex); };
    });
    const fav = $('dex-fav');
    if (fav) fav.onclick = () => { DB.setFav(dex, !DB.isFav(dex)); renderGrid(true); showDetail(dex); };
    const pick = $('dex-pick');
    if (pick) pick.onclick = () => {
      s.partner = dex;
      s.partnerShiny = hasSh && viewShiny;
      DB.commit();
      UI.toast(p.name + (s.partnerShiny ? ' shiny' : '') + ' es ahora tu compañero');
      renderGrid(true); showDetail(dex);
    };
  }

  // ---------------- mejoras ----------------

  let upgDex: any = null;

  function openUpgrades() {
    UI.show('scr-upgrades', true);
    const s: any = DB.save;
    if (!upgDex || !s.owned[upgDex]) upgDex = s.partner;
    // Selector con tus Pokémon: el compañero primero, luego los que ya tienen mejoras.
    const sel = $('upg-mon');
    const lv = (d: any): any => Object.values(s.pupg[d] || {}).reduce((a: any, b: any) => a + b, 0);
    const mons = Object.keys(s.owned).map(Number).filter(d => (G as any).DEX_BY[d])
      .sort((a, b) => ((b === s.partner) as any) - ((a === s.partner) as any) || lv(b) - lv(a) || a - b);
    sel.innerHTML = mons.map(d => `<option value="${d}">${(G as any).DEX_BY[d].name}${d === s.partner ? ' (compañero)' : ''}${lv(d) ? ' · ' + lv(d) + ' niveles' : ''}</option>`).join('');
    sel.value = upgDex;
    sel.onchange = () => { upgDex = +sel.value; Audio.sfx('select', undefined); renderUpgrades(); };
    renderUpgrades();
  }

  function renderUpgrades() {
    const s: any = DB.save;
    const levels = DB.upgradesOf(upgDex);
    const mon = (G as any).DEX_BY[upgDex];
    const shiny = upgDex === s.partner && !!s.partnerShiny && DB.ownsShiny(upgDex);
    UI.sprite($('upg-stage'), upgDex, { lively: true, scale: 2, hero: true, shiny });
    $('upg-stage').style.setProperty('--stage-c', shiny ? '#9ae6ff' : (U.TYPE_COLOR as any)[mon.types[0]]);
    const box = $('upg-list');
    box.innerHTML = '';
    for (const u of Upgrades.LIST) {
      const lvl = levels[u.id] || 0;
      const maxed = lvl >= u.max;
      const cost = maxed ? 0 : Upgrades.cost(u.id, lvl);
      const el = document.createElement('div');
      el.className = 'panel upg-item';
      el.innerHTML = `
        <div class="ic">${Icons.html(u.icon, 32)}</div>
        <div>
          <b>${u.name}</b> <span style="color:var(--muted);font-size:13px">${u.unit}</span>
          <div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
        </div>
        <div class="upg-btns">
          ${u.id === 'ban' && lvl > 0 ? `<button class="btn small" data-ban>Elegir (${banList().length}/${lvl})</button>` : ''}
          <button class="btn small ${maxed ? '' : 'gold'}" data-buy data-sfx="none" ${maxed || s.coins < cost ? 'disabled' : ''}>
          ${maxed ? 'Máx.' : `<span class="coin"></span> ${cost}`}</button></div>`;
      if (u.id === 'ban' && lvl > 0) (el.querySelector('[data-ban]') as any).onclick = () => { banOpen = !banOpen; renderUpgrades(); };
      (el.querySelector('[data-buy]') as any).onclick = () => {
        // Se vuelve a leer todo al pulsar (la partida puede haber cambiado desde que se dibujó).
        const sv: any = DB.save, lv = DB.upgradesOf(upgDex), now = lv[u.id] || 0;
        if (now >= u.max) { renderUpgrades(); return; }
        const price = Upgrades.cost(u.id, now);
        if (sv.coins < price) { renderUpgrades(); return; }
        sv.coins -= price;
        lv[u.id] = now + 1;
        DB.commit(true);
        Audio.sfx('buy', undefined);
        UI.refreshCoins();
        UI.toast(`${mon.name} · ${u.name}: nivel ${now + 1}`);
        renderUpgrades();
      };
      box.appendChild(el);
      if (u.id === 'ban' && lvl > 0 && banOpen) box.appendChild(banPicker(lvl));
    }
    box.appendChild(bindPanel());
  }

  // ---------------- atajos: hueco fijo para cada movimiento ----------------
  // save.pbind[dex] = [movimiento del hueco 1, del 2, del 3, del 4] (o null).
  function bindPanel() {
    const s: any = DB.save;
    s.pbind = s.pbind || {};
    const list = s.pbind[upgDex] || [null, null, null, null];
    const mon = (G as any).DEX_BY[upgDex];
    const ids = Moves.poolFor(mon).concat([startMoveOf(upgDex)]).filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => Moves.BY_ID[a].name.localeCompare(Moves.BY_ID[b].name, 'es'));
    const el = document.createElement('div');
    el.className = 'panel bind-panel';
    el.innerHTML = `<b>Atajos de movimientos</b>
      <p class="sub" style="margin:2px 0 8px">Elige qué movimiento va siempre en cada hueco (teclas 1-4 o los iconos de abajo), para la memoria muscular. Si aún no tienes tantos movimientos, va al hueco más cercano.</p>
      <div class="bind-slots">${[0, 1, 2, 3].map(i => `<label class="bind-slot"><span>${i + 1}</span>
        <select class="field" data-slot="${i}"><option value="">Libre</option>${ids.map(id =>
          `<option value="${id}" ${list[i] === id ? 'selected' : ''}>${Moves.BY_ID[id].name}</option>`).join('')}</select></label>`).join('')}</div>`;
    el.querySelectorAll('select[data-slot]').forEach((sel: any) => {
      sel.onchange = () => {
        const l = (s.pbind[upgDex] || [null, null, null, null]).slice(0, 4);
        while (l.length < 4) l.push(null);
        const i = +sel.dataset.slot, id = sel.value || null;
        // Un movimiento sólo puede estar en un hueco.
        for (let j = 0; j < 4; j++) if (id && l[j] === id) l[j] = null;
        l[i] = id;
        s.pbind[upgDex] = l;
        DB.commit();
        Audio.sfx('select', undefined);
        renderUpgrades();
      };
    });
    return el;
  }

  // ---------------- veto: movimientos bloqueados ----------------
  // Lista por Pokémon en save.pban[dex]; con N niveles de Veto, N movimientos.
  let banOpen = false;
  function banList() {
    const s: any = DB.save;
    s.pban = s.pban || {};
    return s.pban[upgDex] || (s.pban[upgDex] = []);
  }
  function banPicker(max: any) {
    const mon = (G as any).DEX_BY[upgDex];
    const start = startMoveOf(upgDex);
    const ids = Moves.poolFor(mon).filter(id => id !== start)
      .sort((a, b) => Moves.BY_ID[a].name.localeCompare(Moves.BY_ID[b].name, 'es'));
    const list = banList();
    const el = document.createElement('div');
    el.className = 'panel ban-picker';
    el.innerHTML = `<p class="sub" style="margin:0 0 8px">Toca los movimientos que no quieres que te salgan en las cartas (${list.length}/${max}). El movimiento de inicio no se puede vetar.</p>
      <div class="ban-moves">${ids.map(id => { const d = Moves.BY_ID[id]; const on = list.includes(id);
        return `<button class="chip ${on ? 'on ban' : ''}" data-id="${id}">${Icons.html('move:' + id, 16)} ${d.name}${on ? ' ' + Icons.html('ban', 14) : ''}</button>`; }).join('')}</div>`;
    el.querySelectorAll('[data-id]').forEach((b: any) => {
      b.onclick = () => {
        const l = banList(), id = b.dataset.id, i = l.indexOf(id);
        if (i >= 0) l.splice(i, 1);
        else if (l.length >= max) { UI.toast('Ya tienes ' + max + ' vetados: quita uno primero'); return; }
        else l.push(id);
        DB.commit();
        Audio.sfx('select', undefined);
        renderUpgrades();
      };
    });
    return el;
  }

  return { init, open, GEN_NAMES };
})();
register('MenuUI', MenuUI);
export { MenuUI };
export default MenuUI;
