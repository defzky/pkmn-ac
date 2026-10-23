import { register } from '../core/registry';
import { Audio } from '../core/audio';
import { Pad } from '../core/gamepad';
import I18n from '../core/i18n';
import Settings from '../core/settings';
import DB from '../core/db';
import { Game, Flow } from '../game';

/* ============ settings-ui.js — pantalla de Ajustes (PC y móvil) ============
 * Se abre por encima de lo que haya (menú o pausa) y al cerrar vuelve ahí.
 * Pestañas: Sonido · Gráficos · Controles · Accesibilidad · Cuenta · Acerca de.
 * Los ajustes son de este dispositivo (G.Settings / G.Audio en el navegador).
 */
const $ = (G as any).UI.$;
const esc = (s: any) => String(s).replace(/[&<>"']/g, c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]));
const VERSION = '1.2 · 2026-10-09';
const REPO = 'https://github.com/JPTER78/pokesurvivor';
let tab: any = 'sound';

function init() {
  document.querySelectorAll<HTMLElement>('#set-tabs .gen-tab').forEach(b => { b.onclick = () => { tab = b.dataset.t; render(); }; });
  // Al conectar o quitar un mando con Controles abierto, se ve al momento.
  for (const ev of ['gamepadconnected', 'gamepaddisconnected']) addEventListener(ev, () => { if (isOpen() && tab === 'ctl') render(); });
  $('set-close').onclick = close;
  $('btn-settings').innerHTML = (G as any).Icons.html('gear', 20);
  $('btn-settings').onclick = () => open();
  $('btn-pause-settings').onclick = () => open('sound');
  // Pantalla completa (si el navegador la permite; en iPhone, cómo conseguirla).
  if (canFull() || iosTip()) {
    $('btn-full').classList.remove('hidden');
    $('btn-full').innerHTML = (G as any).Icons.html('full', 20);
    $('btn-full').onclick = toggleFull;
  }
}

function open(t?: any) {
  if (t) tab = t;
  $('scr-settings').classList.remove('hidden');
  render();
}
function close() { $('scr-settings').classList.add('hidden'); }
const isOpen = () => !$('scr-settings').classList.contains('hidden');

// ---------------- pantalla completa ----------------
function canFull() { return !!(document.fullscreenEnabled || (document as any).webkitFullscreenEnabled); }
function isFull() { return !!(document.fullscreenElement || (document as any).webkitFullscreenElement); }
// iPhone: Safari no deja poner una web a pantalla completa (por eso a veces
// no salía la opción). Sí se puede abriéndola desde la pantalla de inicio.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => !!(navigator as any).standalone || ((window as any).matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
function iosTip() { return IOS && !canFull() && !standalone(); }
const IOS_TIP = 'En iPhone, Safari no deja poner las webs a pantalla completa. Pulsa Compartir y luego "Añadir a pantalla de inicio": abriendo el juego desde ese icono se juega a pantalla completa.';
function toggleFull() {
  if (!canFull()) { if (iosTip()) (G as any).UI.toast(IOS_TIP, 9000); return; }
  if (isFull()) (document.exitFullscreen || (document as any).webkitExitFullscreen).call(document);
  else {
    const el = document.documentElement;
    const p: any = (el.requestFullscreen || (el as any).webkitRequestFullscreen).call(el);
    // En móvil, además se intenta fijar la pantalla en horizontal.
    if (p && p.then) p.then(() => { try { (screen.orientation as any).lock('landscape').catch(() => {}); } catch (e) { /* nada */ } }).catch(() => {});
  }
  setTimeout(() => { if (isOpen()) render(); }, 300);
}

// ---------------- piezas ----------------
function section(title: any, sub?: any) { return `<h3 class="set-h">${esc(title)}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}`; }
function toggle(key: any, label: any, desc: any) {
  const on = !!Settings.get(key);
  return `<div class="set-row"><div class="grow"><b>${esc(label)}</b><small>${esc(desc)}</small></div>
    <button class="btn small switch ${on ? 'gold' : ''}" data-k="${key}">${on ? 'Sí' : 'No'}</button></div>`;
}
function choice(key: any, opts: any) {
  const cur = Settings.get(key);
  return `<div class="chips set-chips">${opts.map(([v, l]: any) => `<button class="chip ${v === cur ? 'on' : ''}" data-k="${key}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
}

function render() {
  document.querySelectorAll<HTMLElement>('#set-tabs .gen-tab').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  const box = $('set-body');
  box.scrollTop = 0;
  if (tab === 'sound') {
    box.innerHTML = section('Sonido') + '<div id="set-sound" class="sound-inline"></div>';
    (G as any).UI.soundControls($('set-sound'));
  } else if (tab === 'gfx') {
    const auto = ['baja', 'media', 'alta'][Settings.autoLevel];
    box.innerHTML = section('Idioma', 'El juego se recarga al cambiarlo.')
      + `<div class="chips set-chips" translate="no">${[['es', 'Español'], ['en', 'English']].map(([v, l]: any) =>
           `<button class="chip ${I18n.lang === v ? 'on' : ''}" data-lang="${v}">${l}</button>`).join('')}</div>`
      + section('Calidad', 'Cuántos efectos y partículas se dibujan. <b>Auto</b> la baja sola si el juego va a tirones (ahora: ' + auto + ').')
      + choice('quality', [['auto', 'Auto'], ['high', 'Alta'], ['mid', 'Media'], ['low', 'Baja']])
      + section('Pantalla')
      + toggle('dmgNumbers', 'Números de daño', 'Los números que salen al golpear y al recibir daño.')
      + toggle('calm', 'Menos sacudidas y destellos', 'La cámara tiembla menos y los fogonazos son suaves.')
      + toggle('fps', 'Mostrar FPS', 'Fotogramas por segundo, en la esquina de abajo.')
      + (canFull() ? `<div class="set-row"><div class="grow"><b>Pantalla completa</b><small>Sin barras del navegador.</small></div>
           <button class="btn small" id="set-full">${isFull() ? 'Salir' : 'Activar'}</button></div>`
         : iosTip() ? `<div class="set-row"><div class="grow"><b>Pantalla completa</b><small>${esc(IOS_TIP)}</small></div></div>` : '');
  } else if (tab === 'ctl') {
    const pn = Pad.name;
    box.innerHTML = section('Con mando', pn
        ? 'Mando conectado: <b translate="no">' + esc(pn.replace(/\s*\(.*$/, '')) + '</b>'
        : 'Xbox, PlayStation, Switch y la mayoría de mandos USB o Bluetooth. Conéctalo y pulsa cualquier botón.')
      + toggle('gamepad', 'Usar mando', 'Moverte, cambiar de ataque y manejar los menús con el mando.')
      + toggle('padRumble', 'Vibración', 'El mando vibra al recibir daño (si el mando y el navegador lo permiten).')
      + `<div class="keys">
           <div><span class="padkey">Stick izq.</span> o <span class="padkey">Cruceta</span></div><span>moverse · elegir en los menús</span>
           <div><span class="padkey">LB</span> / <span class="padkey">RB</span></div><span>ataque anterior / siguiente</span>
           <div><span class="padkey">Start</span></div><span>pausa</span>
           <div><span class="padkey">A</span></div><span>pulsar (en los menús) · saltar la animación de Arceus</span>
           <div><span class="padkey">B</span></div><span>atrás / cerrar</span>
           <div><span class="padkey">Y</span></div><span>cambiar las cartas al subir de nivel</span>
           <div><span class="padkey">Stick der.</span></div><span>desplazar las listas · apuntar (si activas Apuntar a mano en Accesibilidad)</span>
         </div>`
      + section('En móvil o tablet')
      + `<p class="sub">Pon el dedo en cualquier parte y arrastra para moverte: el joystick aparece donde tocas. Toca un ataque de abajo para cambiarlo y el botón de arriba a la derecha para pausar. Se juega en horizontal.</p>`
      + `<div class="set-row"><div class="grow"><b>Tamaño del joystick</b><small>Cuánto hay que arrastrar el dedo.</small></div></div>`
      + choice('stick', [[0.8, 'Pequeño'], [1, 'Normal'], [1.25, 'Grande']])
      + `<div class="set-row"><div class="grow"><b>Colocar los botones</b><small>Pon los ataques, la pausa y el joystick (fijo, si quieres) donde quieras de la pantalla.</small></div>
           <button class="btn small" id="set-layout">Colocar</button></div>`
      + section('En PC')
      + `<div class="keys">
           <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o flechas</div><span>moverse</span>
           <div><kbd>1</kbd>–<kbd>4</kbd> o clic en el icono</div><span>elegir ataque</span>
           <div><kbd>Q</kbd> / <kbd>E</kbd></div><span>ataque anterior / siguiente</span>
           <div><kbd>Esc</kbd> o <kbd>P</kbd></div><span>pausa</span>
           <div><kbd>1</kbd>–<kbd>3</kbd></div><span>elegir carta al subir de nivel</span>
         </div>`;
  } else if (tab === 'a11y') {
    box.innerHTML = section('Apuntado')
      + toggle('aimManual', 'Apuntar a mano', 'Tus ataques van hacia el ratón (o hacia donde empujes el stick derecho del mando) en vez de al enemigo más cercano. Si sueltas el stick y no mueves el ratón, vuelve a apuntar solo. La cadena y los meteoros siguen buscando a los enemigos solos.');
  } else if (tab === 'acc') {
    renderAccount(box);
  } else {
    box.innerHTML = `<div class="about-logo">PokéSurvivor</div><p class="sub center">Versión ${esc(VERSION)}</p>`
      + `<p class="sub">Juego de fans <b>gratuito y sin ánimo de lucro</b>: sin anuncios ni compras. Pokémon y sus personajes son propiedad de Nintendo, Creatures y GAME FREAK; este proyecto no está afiliado a ellos.</p>`
      + section('Créditos')
      + `<ul class="credits">
           <li><b>Sprites:</b> PMD SpriteCollab y sus artistas (CC BY-NC 4.0).</li>
           <li><b>Datos de los Pokémon:</b> PokéAPI.</li>
           <li><b>Música y sonidos:</b> originales, generados por el propio juego.</li>
           <li><b>Fuente:</b> Pixelify Sans (OFL).</li>
         </ul>`
      + `<div class="row wrap" style="justify-content:center;gap:8px">
           ${window.PS_PAGES ? `<a class="btn small" href="${I18n.lang === 'en' ? 'en/guide/' : 'guia/'}" target="_blank">Guía y preguntas</a>
           <a class="btn small" href="${I18n.lang === 'en' ? 'en/pokedex/' : 'pokedex/'}" target="_blank">Pokédex</a>` : ''}
           <button class="btn small" data-legal>Aviso legal y privacidad</button>
           <a class="btn small" href="contacto/" target="_blank" rel="noopener">Contacto</a>
           <a class="btn small" href="${REPO}" target="_blank" rel="noopener">Código (GitHub)</a>
         </div>`;
  }
  wire(box);
}

function renderAccount(box: any) {
  const st = DB.guest ? 'guest' : DB.syncState;
  const SYNC: any = { ok: 'Guardado en la nube', syncing: 'Guardando…', pending: 'Pendiente de subir (se sube al salir del juego)',
                 offline: 'Sin conexión: se subirá al volver', local: 'Guardado sólo en este navegador', guest: 'Invitado: no se guarda' };
  if (DB.guest) {
    box.innerHTML = section('Cuenta', 'Estás jugando como <b>invitado</b>: tu progreso no se guarda al salir.')
      + `<button class="btn gold" id="set-login">Crear cuenta o entrar</button>`;
    return;
  }
  const nick = (G as any).Social.me ? (G as any).Social.me.name : (DB.user || '');
  const kind = DB.mode === 'local' ? 'Cuenta de este navegador' : DB.nameAccount ? 'Nombre y contraseña' : 'Google';
  box.innerHTML = section('Cuenta')
    + `<div class="set-row"><div class="grow"><b>Apodo</b><small>Es único y no se puede cambiar.</small></div><span class="gold" translate="no">${esc(nick)}</span></div>`
    + `<div class="set-row"><div class="grow"><b>Tipo de cuenta</b></div><span>${esc(kind)}</span></div>`
    + `<div class="set-row"><div class="grow"><b>Partida</b></div><span>${esc(SYNC[st] || st)}</span></div>`
    + `<div class="row wrap" style="gap:8px;margin-top:12px">
         <button class="btn" id="set-logout">Cerrar sesión</button>
         <button class="btn danger" id="set-delete">Borrar cuenta</button>
       </div><p class="note" id="set-msg"></p>`;
}

function wire(box: any) {
  box.querySelectorAll('.switch[data-k]').forEach((b: any) => { b.onclick = () => { Settings.set(b.dataset.k, !Settings.get(b.dataset.k)); render(); }; });
  box.querySelectorAll('.chip[data-k]').forEach((b: any) => {
    b.onclick = () => { const v = b.dataset.v; Settings.set(b.dataset.k, isNaN(+v) ? v : +v); render(); };
  });
  const full = $('set-full'); if (full) full.onclick = toggleFull;
  const lay = $('set-layout'); if (lay) lay.onclick = () => (G as any).LayoutUI.open();
  box.querySelectorAll('[data-lang]').forEach((b: any) => { b.onclick = () => { if (b.dataset.lang !== I18n.lang) I18n.set(b.dataset.lang); }; });
  const lo = $('set-login'); if (lo) lo.onclick = () => { close(); leave(); };
  const out = $('set-logout'); if (out) out.onclick = () => { close(); leave(); };
  const del = $('set-delete');
  if (del) del.onclick = async () => {
    const ok = await (G as any).UI.confirmDelete();
    if (!ok) return;
    del.disabled = true;
    const r = await DB.deleteAccount(ok.pass);
    if (!r.ok) { $('set-msg').textContent = r.error; del.disabled = false; return; }
    close();
    (G as any).UI.toast('Cuenta borrada');
    Audio.music(null);
    Flow.toLogin();
  };
}

/** Cerrar sesión (si estás en una partida, se abandona). */
function leave() {
  if (DB.guest && !confirm('Eres invitado: se perderá todo el progreso. ¿Salir?')) return;
  if (Game.state !== 'ui') Game.quit && Game.quit();
  Audio.music(null);
  DB.logout().then(() => Flow.toLogin());
}

const SettingsUI = { init, open, close, get isOpen() { return isOpen(); } };
register('SettingsUI', SettingsUI);
export { SettingsUI };
export default SettingsUI;
