import { register } from '../core/registry';
import { U } from '../core/util';
import I18n from '../core/i18n';

/* ============ ranking-ui.js — pantalla del ranking ============
 * Pestañas Solo / Grupo, periodo (diario ... histórico), todos o sólo amigos,
 * filtro por Pokémon (sólo en el histórico) y tu puesto abajo aunque no salgas
 * en el top. Lo leído se guarda 30 min (ver ranking.js).
 */
const $ = (G as any).UI.$;
const esc = (s: any) => U.esc(s);
let mode: any = 's', period: any = 'w', scope: any = 'all', dex: any = null;
let token = 0;

function init() {
  const dl = $('rk-dl');
  dl.innerHTML = (G as any).DEX.map((p: any) => `<option value="${esc(p.name)}">`).join('');
  $('rk-poke').onchange = () => {
    const v = $('rk-poke').value.trim().toLowerCase();
    const p = (G as any).DEX.find((x: any) => x.name.toLowerCase() === v);
    if (!v) { setDex(null); return; }
    if (!p) { (G as any).UI.toast('No hay ningún Pokémon con ese nombre'); return; }
    setDex(p.dex);
  };
  $('rk-clear').onclick = () => { $('rk-poke').value = ''; setDex(null); };
  $('rk-mod').onclick = () => (G as any).ModUI.open();
}

/** El filtro por Pokémon sólo existe en el histórico: al elegir uno se pasa a esa pestaña. */
function setDex(d: any) {
  dex = d;
  if (d && period !== 'a') period = 'a';
  $('rk-clear').classList.toggle('hidden', !d);
  tabs(); load();
}

function open() {
  if (!(G as any).SocialUI.needOnline()) return;
  (G as any).UI.show('scr-rank', true);
  if (!(G as any).Social.started) (G as any).Social.start();
  $('rk-mod').classList.toggle('hidden', !(G as any).Ranking.isAdmin());
  tabs();
  load();
}

function tabs() {
  const mk = (box: any, items: any, cur: any, set: any, cls: any) => {
    box.innerHTML = '';
    for (const [k, label] of items) {
      const b = document.createElement('button');
      b.className = cls + (k === cur ? ' on' : '');
      b.innerHTML = label;
      b.onclick = () => { set(k); tabs(); load(); };
      box.appendChild(b);
    }
  };
  mk($('rk-mode'), [['s', `<b>${(G as any).Icons.html('user', 16)} Solo</b>`], ['g', `<b>${(G as any).Icons.html('friends', 16)} Grupo</b>`]],
     mode, (k: any) => { mode = k; }, 'gen-tab');
  mk($('rk-period'), (G as any).Ranking.PERIODS, period, (k: any) => {
    period = k;
    if (k !== 'a' && dex) { dex = null; $('rk-poke').value = ''; $('rk-clear').classList.add('hidden'); }
  }, 'chip');
  mk($('rk-scope'), [['all', 'Todos'], ['friends', 'Sólo amigos']], scope, (k: any) => { scope = k; }, 'chip');
}

const fmt = (t: any) => t >= 3600 ? Math.floor(t / 3600) + ':' + U.mmss(t % 3600).padStart(5, '0') : U.mmss(t);

async function load() {
  const my = ++token;
  const list = $('rk-list');
  list.innerHTML = '<p class="sub">Cargando…</p>';
  $('rk-me').innerHTML = '';
  let rows: any = [], me: any = null;
  try {
    [rows, me] = await Promise.all([
      (G as any).Ranking.top(mode, period, dex, scope === 'friends'),
      (G as any).Social.me ? (G as any).Ranking.myRank(mode, period, dex) : Promise.resolve(null)
    ]);
  } catch (e: any) {
    if (my !== token) return;
    list.innerHTML = '<p class="sub">No se pudo cargar el ranking (' + esc(e.code || e.message) + ').</p>';
    return;
  }
  if (my !== token) return;
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = '<p class="sub">Todavía no hay marcas aquí. ¡Sé el primero!</p>';
  }
  const uid = (G as any).Social.uid;
  const b = (G as any).Ranking.board(mode, period, dex), done = (G as any).Ranking.reported();
  rows.forEach((r: any, i: any) => list.appendChild(rowEl(r, i + 1, r.uids.includes(uid), b, done)));

  // La frase se monta en cada idioma (traducirla por trozos sale rara).
  const en = I18n.lang === 'en';
  const pn: any = en ? ({ d: 'today', w: 'this week', m: 'this month', y: 'this year', a: 'of all time' } as any)[period]
                : ({ d: 'de hoy', w: 'de esta semana', m: 'de este mes', y: 'de este año', a: 'de siempre' } as any)[period];
  const mon = dex ? (G as any).DEX_BY[dex].name : '';
  const where = en ? (mode === 's' ? 'solo' : 'group') + (dex ? ' with ' + mon : '')
                   : (mode === 's' ? 'en solitario' : 'en grupo') + (dex ? ' con ' + mon : '');
  $('rk-me').innerHTML = !(G as any).Social.me ? 'Elige un apodo (en Amigos) para salir en el ranking.'
    : me && me.out ? (en ? `<span translate="no">You're not in the top 50 ${where} ${pn} yet. Your rank is in All-time.</span>`
                         : `Aún no estás en el top 50 ${pn} ${where}. Tu puesto está en Histórico.`)
    : me ? (en ? `<span translate="no">Your best ${where} rank ${pn}: <b class="gold">#${me.capped ? '1000+' : me.pos}</b> · ${fmt(me.t)}</span>`
               : `Tu mejor puesto ${pn} ${where}: <b class="gold">#${me.capped ? '1000+' : me.pos}</b> · ${fmt(me.t)}`)
    : (en ? `<span translate="no">You don't have a ${where} record ${pn} yet.</span>` : `Aún no tienes marca ${pn} ${where}.`);
}

function rowEl(r: any, pos: any, mine: any, b: any, done: any) {
  const el = document.createElement('div');
  el.className = 'rk-row' + (mine ? ' mine' : '') + (pos <= 3 ? ' top' + pos : '');
  el.insertAdjacentHTML('beforeend', `<span class="pos">${pos <= 3 ? (G as any).Icons.html('trophy', 20) : ''}${pos}</span>`);
  const mons = document.createElement('span');
  mons.className = 'mons';
  r.dex.forEach((d: any, i: any) => { if ((G as any).DEX_BY[d]) mons.appendChild((G as any).UI.spriteCanvas(d, 44, 40, { scale: 1, shiny: !!r.shiny[i] })); });
  el.appendChild(mons);
  el.insertAdjacentHTML('beforeend',
    `<span class="who"><b translate="no">${r.names.map((n: any, i: any) => `<a href="#" class="plink" data-u="${esc(r.uids[i] || '')}">${esc(n)}</a>`).join(' · ')}</b><small>Nv. ${r.lv || 1} · ${(r.kills || 0).toLocaleString('es')} derrotados</small></span>
     <span class="time">${fmt(r.t)}</span>`);
  el.querySelectorAll<HTMLElement>('.plink').forEach(a => { a.onclick = e => { e.preventDefault(); (G as any).ProfileUI.show(a.dataset.u); }; });
  // Reportar una marca sospechosa (no la tuya). Lo revisa el admin (mod-ui.js).
  if (!mine && (G as any).Social.me) {
    const rep = document.createElement('button');
    const sent = done.has(b + '__' + r.id);
    rep.className = 'rk-rep' + (sent ? ' sent' : '');
    rep.title = sent ? 'Ya la has reportado' : 'Reportar marca sospechosa';
    rep.innerHTML = (G as any).Icons.html('flag', 16);
    rep.onclick = async () => {
      if (rep.classList.contains('sent')) { (G as any).UI.toast('Ya has reportado esta marca'); return; }
      if (!confirm('¿Reportar la marca de ' + r.names.join(', ') + ' como trampa?')) return;
      rep.classList.add('sent'); rep.title = 'Ya la has reportado';
      await (G as any).Ranking.report(b, r);
      (G as any).UI.toast('Gracias: la revisaremos');
    };
    el.appendChild(rep);
  } else el.appendChild(document.createElement('span'));
  return el;
}

const RankingUI = { init, open };
register('RankingUI', RankingUI);
export { RankingUI };
export default RankingUI;
