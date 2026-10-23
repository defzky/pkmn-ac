import { register } from '../core/registry';
import { U } from '../core/util';

/* ============ mod-ui.js — moderación del ranking (pantalla oculta) ============
 * Sólo la ve la cuenta de moderación (G.Ranking.isAdmin, y firestore.rules
 * admin(): aunque alguien abriera esta pantalla, el servidor no le dejaría
 * hacer nada). Se abre con el botón "Moderación" del ranking.
 *
 *   Reportes          marcas reportadas por los jugadores, las más reportadas
 *                     primero: borrar la marca, banear (no puede volver a
 *                     subir marcas, y se borra su marca de todas las tablas de
 *                     ahora) o descartar el reporte.
 *   Baneados          las cuentas baneadas del ranking; se pueden desbanear.
 */
const $ = (G as any).UI.$;
const esc = (s: any) => String(s).replace(/[&<>"']/g, c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]));
let tab: any = 'rep';

function init() {
  $('mod-back').onclick = () => (G as any).RankingUI.open();
  $('mod-purge').onclick = async () => {
    if (!confirm('¿Quitar del ranking TODAS las marcas de más de 1 hora (todas las tablas)? No se puede deshacer.')) return;
    const b = $('mod-purge');
    b.disabled = true;
    try {
      const r = await (G as any).Ranking.purgeAbove(3600, (i: any, n: any) => { b.textContent = 'Revisando ' + i + ' / ' + n + '…'; });
      (G as any).UI.toast('Quitadas ' + r.rows + ' marcas de más de 1 hora (' + r.boards + ' tablas)', 5000);
    } catch (e: any) { (G as any).UI.toast('No se pudo: ' + (e.code || e.message), 5000); }
    b.disabled = false; b.textContent = 'Quitar marcas de más de 1 hora';
    render();
  };
  document.querySelectorAll<HTMLElement>('#mod-tabs .tab').forEach(t => { t.onclick = () => { tab = t.dataset.tab; render(); }; });
}

function open() {
  if (!(G as any).Ranking.isAdmin()) return;
  (G as any).UI.show('scr-mod', true);
  render();
}

const fmt = (t: any) => U.mmss(t || 0);
const btn = (label: any, cls: any, fn: any) => { const b = document.createElement('button'); b.className = 'btn small ' + cls; b.textContent = label; b.onclick = fn; return b; };

async function render() {
  document.querySelectorAll<HTMLElement>('#mod-tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  const list = $('mod-list');
  list.innerHTML = '<p class="sub">Cargando…</p>';
  try {
    if (tab === 'rep') await renderReports(list);
    else await renderMarked(list);
  } catch (e: any) {
    list.innerHTML = '<p class="sub">No se pudo cargar (' + esc(e.code || e.message) + ').</p>';
  }
}

/** "s_w2026-42" -> "Solo · Semana" */
function boardName(b: any) {
  const [m, p] = b.split('_');
  const mode = m === 'g' ? 'Grupo' : 'Solo';
  const per = p.startsWith('d') ? 'Hoy' : p.startsWith('w') ? 'Semana' : p.startsWith('m') ? 'Mes' : 'Histórico';
  const dex = (b.match(/_p(\d+)$/) || [])[1];
  return mode + ' · ' + per + (dex && (G as any).DEX_BY[dex] ? ' · sólo ' + (G as any).DEX_BY[dex].name : '');
}
// Con la Sentencia de Arceus (minuto 30) casi nadie pasa de ~32-33 min.
const SUSPECT_T = 33 * 60;

async function renderReports(list: any) {
  const groups = await (G as any).Ranking.reports();
  list.innerHTML = groups.length ? '' : '<p class="sub">No hay reportes.</p>';
  for (const g of groups) {
    const row = document.createElement('div');
    row.className = 'rk-row mod-row rep';
    const mode = g.board.startsWith('g_') ? 'g' : 's';
    // Lo que se ve de la marca ahora en su tabla (nivel, derrotados, Pokémon).
    const info = await (G as any).Ranking.entryInfo(g.board, g.e).catch(() => null);
    const t = info ? info.t : g.t;
    const sus = t > SUSPECT_T;
    const mons = document.createElement('span');
    mons.className = 'mons';
    if (info) info.dex.forEach((d: any, i: any) => { if ((G as any).DEX_BY[d]) mons.appendChild((G as any).UI.spriteCanvas(d, 44, 40, { scale: 1, shiny: !!(info.shiny || [])[i] })); });
    row.innerHTML = `<span class="pos" title="veces reportada">${g.n}×</span>`;
    row.appendChild(mons);
    row.insertAdjacentHTML('beforeend', `<span class="who"><b translate="no">${g.names.map(esc).join(' · ')}</b>
        <small>${esc(boardName(g.board))}${info ? ' · Nv. ' + (info.lv || 1) + ' · ' + (info.kills || 0).toLocaleString('es') + ' derrotados' : ' · ya no está en el top 50'}</small>
        ${sus ? '<small class="mod-warn">Más de 33 min: casi imposible con la Sentencia de Arceus</small>' : ''}</span>
      <span class="time${sus ? ' mod-warn' : ''}">${fmt(t)}</span>`);
    const acts = document.createElement('span');
    acts.className = 'mod-acts';
    const busy = async (fn: any, msg: any) => {
      acts.querySelectorAll('button').forEach((b: any) => { b.disabled = true; });
      try { await fn(); (G as any).UI.toast(msg); row.remove(); }
      catch (e: any) { (G as any).UI.toast('No se pudo: ' + (e.code || e.message)); acts.querySelectorAll('button').forEach((b: any) => { b.disabled = false; }); }
    };
    acts.append(
      btn('Borrar marca', 'ghost', () => busy(async () => {
        await (G as any).Ranking.removeEverywhere(g.e, mode, [], g.board);
        await (G as any).Ranking.dismiss(g.ids);
      }, 'Marca borrada')),
      btn('Banear', 'danger', () => {
        if (!confirm('¿Banear a ' + g.names.join(', ') + '? No podrán volver a salir en el ranking y se borra su marca.')) return;
        busy(async () => {
          const uids = g.e.split('_');
          for (const u of uids) await (G as any).Ranking.setMarked(u, true).catch(() => {});
          await (G as any).Ranking.removeEverywhere(g.e, mode, [], g.board);
          await (G as any).Ranking.dismiss(g.ids);
        }, 'Baneado');
      }),
      btn('Descartar', 'ghost', () => busy(() => (G as any).Ranking.dismiss(g.ids), 'Reporte descartado'))
    );
    row.appendChild(acts);
    list.appendChild(row);
  }
}

async function renderMarked(list: any) {
  const accs = await (G as any).Ranking.markedAccounts();
  list.innerHTML = accs.length ? '' : '<p class="sub">No hay cuentas baneadas.</p>';
  for (const a of accs) {
    const row = document.createElement('div');
    row.className = 'rk-row mod-row';
    row.innerHTML = `<span class="pos"></span>
      <span class="who"><b translate="no">${esc(a.name)}</b><small translate="no">${a.coins.toLocaleString('es')} monedas · ${a.t1} tickets · ${a.t10} ×10 · ${a.owned} Pokémon · ${esc(a.uid)}</small></span>`;
    const acts = document.createElement('span');
    acts.className = 'mod-acts';
    acts.append(btn('Desbanear', 'ghost', async () => {
      try { await (G as any).Ranking.setMarked(a.uid, false); (G as any).UI.toast('Desbaneada'); row.remove(); }
      catch (e: any) { (G as any).UI.toast('No se pudo: ' + (e.code || e.message)); }
    }));
    row.appendChild(acts);
    list.appendChild(row);
  }
}

const ModUI = { init, open };
register('ModUI', ModUI);
export { ModUI };
export default ModUI;
