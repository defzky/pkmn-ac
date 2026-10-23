import { register } from '../core/registry';
import I18n from '../core/i18n';

/* ============ news-ui.js — "Novedades" ============
 * Botón en la barra de arriba que abre la lista de cambios del juego
 * (js/data/changelog.js). Lleva un punto mientras haya algo que no has visto.
 */
const $ = (G as any).UI.$;
const KEY = 'ps.news.seen';
const esc = (s: any) => String(s).replace(/[&<>"']/g, c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]));
const latest = () => ((G as any).CHANGELOG[0] || {}).d || '';
function seen() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }

function init() {
  const b = $('btn-news');
  b.innerHTML = (G as any).Icons.html('book', 18) + ' <span>Novedades</span><i class="dot"></i>';
  b.onclick = open;
  $('news-close').onclick = close;
  refresh();
}
function refresh() { $('btn-news').classList.toggle('new', seen() < latest()); }

function fmt(d: any) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(I18n.lang === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function open() {
  const en: any = I18n.lang === 'en' ? 1 : 0;
  // Cada texto ya va en su idioma: translate="no" para que no lo toque i18n.
  const PARTS: any = [['new', ['Nuevo', 'New']], ['chg', ['Cambios', 'Changes']], ['fix', ['Arreglos', 'Fixes']]];
  $('news-body').innerHTML = (G as any).CHANGELOG.map((v: any) =>
    `<div class="news-day" translate="no"><h3>${esc(v.title ? v.title[en] : '')}<small>${fmt(v.d)}</small></h3>` +
    PARTS.filter(([k]: any) => v[k] && v[k].length).map(([k, lbl]: any) =>
      `<div class="news-part"><span class="news-tag ${k}">${lbl[en]}</span><ul>${v[k].map((t: any) => `<li>${esc(t[en])}</li>`).join('')}</ul></div>`).join('') +
    '</div>').join('');
  $('news-body').scrollTop = 0;
  $('scr-news').classList.remove('hidden');
  try { localStorage.setItem(KEY, latest()); } catch (e) { /* nada */ }
  refresh();
}
function close() { $('scr-news').classList.add('hidden'); }

const NewsUI = { init, open, close };
register('NewsUI', NewsUI);
export { NewsUI };
export default NewsUI;
