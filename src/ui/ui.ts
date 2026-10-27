/* ============ ui.ts — utilidades comunes de la interfaz ============
 * - Mostrar / ocultar pantallas.
 * - Sprites animados de PMD dentro de <canvas> del DOM (menú, colección,
 *   gacha...). Se registran aquí y el bucle principal los anima con tick().
 * - Sonidos de interfaz (por delegación: cualquier botón suena solo).
 * - Panel de sonido, avisos (toast), monedas, chips de tipo, estrellas.
 */
import { register } from '../core/registry';
import { U } from '../core/util';
import { DB } from '../core/db';
import { Audio } from '../core/audio';
import { Sprites } from '../core/sprites';
import { I18n } from '../core/i18n';
import { Flow } from '../game';
import { Icons } from './icons';

const UI = (() => {
  const $ = (id: string) => document.getElementById(id) as any;
  const SCREENS = ['scr-login', 'scr-test', 'scr-result', 'scr-starters', 'scr-menu',
                   'scr-dex', 'scr-upgrades', 'scr-gacha', 'scr-levelup', 'scr-pause', 'scr-over',
                   'scr-nick', 'scr-friends', 'scr-lobby', 'scr-rank', 'scr-item', 'scr-goals', 'scr-bond', 'scr-mod', 'scr-ac', 'scr-ac-mode'];

  function show(id: any, keepMenu = false) {
    for (const s of SCREENS) if (s !== id && !(keepMenu && s === 'scr-menu')) $(s)?.classList.add('hidden');
    $(id)?.classList.remove('hidden');
  }
  function hide(id: any) { $(id)?.classList.add('hidden'); }
  function hideAll() { for (const s of SCREENS) $(s)?.classList.add('hidden'); }
  function isOpen(id: any) { const el = $(id); return !!el && !el.classList.contains('hidden'); }

  /** Barra superior (monedas, usuario, sonido) sólo fuera de las runs. */
  function chrome(on: any) {
    $('topbar').classList.toggle('hidden', !on);
    $('credits-line').classList.toggle('hidden', !on);
    if (!on) $('sound-panel').classList.add('hidden');
    if (on) refreshCoins();
  }

  function refreshCoins() {
    const s = DB.save;
    $('coins').textContent = s ? s.coins.toLocaleString('es') : '0';
    const t = (s && s.tickets) || { t1: 0, t10: 0 };
    $('tickets-pill').innerHTML = `${Icons.html('ticket', 18)} ${t.t1} &nbsp;${Icons.html('ticket10', 18)} ${t.t10}`;
    // Punto de sincronización: verde = guardado en la nube, amarillo = guardando,
    // rojo = sin conexión (se guarda en local y se sube al volver).
    const st = DB.guest ? 'guest' : DB.syncState;
    const TIP = { ok: 'Guardado en la nube', syncing: 'Guardando…', pending: 'Guardando…',
                  offline: 'Sin conexión: se subirá al volver', local: 'Guardado sólo en este navegador', guest: 'Invitado: no se guarda' };
    $('user-pill').innerHTML = Icons.html(DB.guest ? 'user' : 'crown', 18) + ' <span translate="no">' + (DB.guest ? I18n.t('Invitado') : (DB.user || '')) + '</span>' +
      `<i class="sync ${st}" title="${TIP[st] || ''}"></i>`;
    $('user-pill').title = TIP[st] || '';
    // Botón Guardar: sólo con cuenta en la nube (en local ya se guarda al momento).
    const sb = $('btn-save');
    sb.classList.toggle('hidden', DB.guest || DB.mode !== 'cloud');
  }

  let toastEl: any = null, toastT = 0;
  function toast(msg: any, ms = 2200) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  }

  function typeChips(types: any) {
    return types.map((t: any) => `<span class="type" style="background:${(U.TYPE_COLOR as any)[t]}">${(U.TYPE_NAME as any)[t]}</span>`).join('');
  }

  /** Rareza: la Poké Ball que le corresponde (ver Icons.rarity). */
  function stars(n: any, size = 12) { return Icons.rarity(n, size > 16 ? 24 : 12); }

  // ---------------- sonido de la interfaz ----------------

  const CLICKABLE = '.btn, .menu-item, .tab, .chip, .card, .cell:not(.locked), .answer, .gen-tab, .ac-cell, .ac-slot, .ac-card';
  let lastHover: any = null;

  function wireSounds() {
    document.addEventListener('pointerover', e => {
      const el = (e.target as any).closest(CLICKABLE);
      if (el && el !== lastHover && !el.disabled) Audio.sfx('hover', undefined);
      lastHover = el;
    });
    document.addEventListener('click', e => {
      const el = (e.target as any).closest(CLICKABLE);
      if (!el) return;
      if (el.disabled) { Audio.sfx('error', undefined); return; }
      // Los botones con su propio sonido (comprar, tirar, elegir...) lo ponen ellos.
      if (el.dataset.sfx === 'none') return;
      Audio.sfx(el.matches('[data-back]') ? 'back' : el.dataset.sfx || 'click', undefined);
    }, true);
  }

  /** Controles de volumen (se usan en la barra superior y en la pausa). */
  function soundControls(box: any) {
    const st = Audio.settings;
    box.innerHTML = `
      <div class="snd-row">${Icons.html('sound', 18)}<span>Música</span>
        <input type="range" min="0" max="100" value="${Math.round(st.music * 100)}" data-k="music"></div>
      <div class="snd-row">${Icons.html('sound', 18)}<span>Efectos</span>
        <input type="range" min="0" max="100" value="${Math.round(st.sfx * 100)}" data-k="sfx"></div>
      <button class="btn small ${st.muted ? 'gold' : ''}" data-mute>${st.muted ? 'Activar sonido' : 'Silenciar todo'}</button>`;
    box.querySelectorAll('input[type=range]').forEach((r: any) => {
      r.oninput = () => Audio.setVolume(r.dataset.k, r.value / 100);
      r.onchange = () => Audio.sfx('click', undefined);
    });
    box.querySelector('[data-mute]').onclick = () => { Audio.toggleMute(); soundControls(box); refreshSoundIcon(); };
  }

  function refreshSoundIcon() {
    $('btn-sound').innerHTML = Icons.html(Audio.settings.muted ? 'mute' : 'sound', 20);
  }

  // ---------------- aviso legal ----------------

  const CONTACT = 'jpieratorregrosa@gmail.com';
  const REPO = 'https://github.com/JPTER78/pokesurvivor';
  let legalBack: any = null;

  function openLegal() {
    legalBack = SCREENS.find(s => isOpen(s)) || null;
    $('legal-mail').textContent = CONTACT;
    $('legal-mail').href = 'mailto:' + CONTACT + '?subject=Pok%C3%A9Survivor';
    $('legal-repo').textContent = REPO.replace('https://', '');
    $('legal-repo').href = REPO;
    const canDelete = DB.loggedIn && !DB.guest;
    $('legal-delete').disabled = !canDelete;
    $('legal-del-msg').textContent = canDelete ? '' : 'Inicia sesión para poder borrar tu cuenta.';
    $('scr-legal').classList.remove('hidden');
  }

  /**
   * "¿Seguro que quieres borrar la cuenta?". Las cuentas de nombre y
   * contraseña escriben su contraseña (Firebase pide confirmar quién eres);
   * las de Google la confirman en la ventana de Google al seguir.
   * Devuelve { pass } o null si se cancela.
   */
  function confirmDelete(): Promise<{ pass: string } | null> {
    if (!DB.nameAccount) return Promise.resolve(confirm(I18n.t('Se borrarán tu cuenta y toda tu partida, para siempre. ¿Seguro?')) ? { pass: '' } : null);
    return new Promise(done => {
      const el = document.createElement('section');
      el.className = 'scr dim';
      el.style.zIndex = 70 as any;
      el.innerHTML = `<div class="box center" style="max-width:380px">
        <h3>Borrar cuenta</h3>
        <p class="sub">Se borrarán tu cuenta y toda tu partida, para siempre. Para confirmarlo, escribe tu contraseña.</p>
        <input class="field" type="password" maxlength="64" autocomplete="current-password" style="width:100%">
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;flex-wrap:wrap">
          <button class="btn ghost" data-a="no">Cancelar</button>
          <button class="btn danger" data-a="yes">Borrar para siempre</button>
        </div></div>`;
      document.body.appendChild(el);
      const inp = (el.querySelector('input') as any);
      const end = (v: any) => { el.remove(); done(v); };
      (el.querySelector('[data-a=no]') as any).onclick = () => end(null);
      (el.querySelector('[data-a=yes]') as any).onclick = () => { if (inp.value) end({ pass: inp.value }); else inp.focus(); };
      inp.onkeydown = (e: any) => { if (e.key === 'Enter' && inp.value) end({ pass: inp.value }); if (e.key === 'Escape') end(null); };
      setTimeout(() => inp.focus(), 50);
    });
  }

  function closeLegal() { $('scr-legal').classList.add('hidden'); }

  function wireLegal() {
    document.addEventListener('click', e => {
      if ((e.target as any).closest('[data-legal]')) { e.preventDefault(); openLegal(); }
    });
    $('legal-close').onclick = closeLegal;
    $('legal-delete').onclick = async () => {
      const ok = await confirmDelete();
      if (!ok) return;
      $('legal-delete').disabled = true;
      const r = await DB.deleteAccount(ok.pass);
      if (!r.ok) { $('legal-del-msg').textContent = r.error; $('legal-delete').disabled = false; return; }
      closeLegal();
      toast('Cuenta borrada');
      Audio.music(null);
      Flow.toLogin();
    };
  }

  function initChrome() {
    Icons.installCss();
    wireLegal();
    DB.onSync(() => { if (!$('topbar').classList.contains('hidden')) refreshCoins(); });
    const sb = $('btn-save');
    sb.innerHTML = Icons.html('save', 18) + ' <span>Guardar</span>';
    sb.onclick = async () => {
      sb.disabled = true;
      const r = await DB.saveNow();
      sb.disabled = false;
      const MSG = { local: 'Tu partida se guarda en este navegador.', guest: 'Como invitado la partida no se guarda.',
                    done: 'Ya está todo guardado en la nube.', offline: 'Sin conexión: se guardará en cuanto vuelva.',
                    fail: 'No se pudo guardar. Vuelve a probar en un momento.' };
      toast(r.why === 'wait' ? `Se guarda en la nube en ${r.secs} s.` : r.why ? MSG[r.why] : '¡Partida guardada en la nube!', 3000);
    };
    wireSounds();
    refreshSoundIcon();
    $('btn-sound').onclick = () => {
      const p = $('sound-panel');
      p.classList.toggle('hidden');
      if (!p.classList.contains('hidden')) soundControls(p);
    };
  }

  // ---------------- sprites en canvas del DOM ----------------

  const live = new Set<any>();
  const byCanvas = new WeakMap<any, any>();      // canvas -> su animación (para no recorrer todas)
  // Sólo se animan los canvas que están a la vista (la colección tiene cientos).
  const seen = new WeakMap<any, any>();
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(e => seen.set(e.target, e.isIntersecting)), { rootMargin: '80px' })
    : null;

  /**
   * Anima un Pokémon dentro de un <canvas>.
   * opts: { anim='Idle', dir=0, shiny, silhouette, lively (ataca de vez en
   *         cuando), spin (va girando), shadow=true,
   *         scale=2   tamaño de píxel FIJO (×2 como en el juego): todos los
   *                   Pokémon de una vista salen con el mismo píxel, aunque
   *                   los gigantes no quepan enteros
   *         hero      vista de un solo Pokémon: puede reducir la escala para
   *                   que quepa, porque ahí no se compara con nada }
   */
  function sprite(cv: any, dex: any, opts: any = {}) {
    const prev = byCanvas.get(cv);
    if (prev) live.delete(prev);
    const a = new Sprites.Animator(dex, 1, !!opts.shiny);
    a.dir = opts.dir || 0;
    a.loop(opts.anim || 'Idle');
    const s: any = { cv, ctx: cv.getContext('2d'), a, dex, opts, t: Math.random() * 3, spinT: 0, sparkT: 0 };
    live.add(s);
    byCanvas.set(cv, s);
    if (io) io.observe(cv);
    return s;
  }

  function tick(dt: any) {
    for (const s of live) {
      if (!s.cv.isConnected) { live.delete(s); if (io) io.unobserve(s.cv); continue; }
      if (s.cv.offsetParent === null) continue;            // pantalla oculta
      if (io && seen.get(s.cv) === false) continue;         // fuera de la vista
      s.a.update(dt);

      if (s.opts.lively) {
        s.t -= dt;
        if (s.t <= 0) { s.t = U.rand(2.5, 4.5); s.a.play(U.pick(['Attack', 'Shoot', 'Charge'])); }
      }
      if (s.opts.spin) {
        s.spinT += dt;
        if (s.spinT > 1.4) { s.spinT = 0; s.a.dir = (s.a.dir + 7) % 8; }
      }

      const { cv, ctx } = s;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.imageSmoothingEnabled = false;

      // Escala entera para que los píxeles queden nítidos.
      const m = Sprites.animMeta(s.dex, 'Idle');
      const ay = m ? m.ay : 24;
      let k = s.opts.scale || 2;
      if (s.opts.hero) k = Math.max(1, Math.min(k, Math.floor(cv.height * 0.8 / ay)));
      // Encaje sin recortes (posturas): k + centro de pies según meta del dex.
      const fit = Sprites.fitDraw(s.dex, cv.width, cv.height, k);
      k = fit.k;
      s.a.scale = k / Sprites.PX;
      const fx = fit.fx, fy = fit.fy;

      if (s.opts.shadow !== false && !s.opts.silhouette) {
        Sprites.drawShadow(ctx, s.dex, fx, fy, 0.45 * k); // PMD ShadowSize (was fixed ellipse)
      }
      if (s.opts.silhouette) {
        ctx.save();
        ctx.filter = 'brightness(0)';
        ctx.globalAlpha = 0.55;
        s.a.draw(ctx, fx, fy);
        ctx.restore();
      } else {
        s.a.draw(ctx, fx, fy);
      }

      // Centelleos alrededor de los shiny: cada uno nace en un sitio al azar.
      if (s.opts.shiny && !s.opts.silhouette) {
        s.tw = s.tw || [];
        s.sparkT -= dt;
        if (s.sparkT <= 0 && s.tw.length < 4) {
          s.sparkT = U.rand(0.18, 0.45);
          s.tw.push({ x: fx + U.rand(-0.32, 0.32) * cv.width, y: U.rand(0.12, 0.7) * cv.height, t: 0, life: U.rand(0.5, 0.8) });
        }
        for (let i = s.tw.length - 1; i >= 0; i--) {
          const w = s.tw[i];
          w.t += dt;
          if (w.t >= w.life) { s.tw.splice(i, 1); continue; }
          Icons.twinkle(ctx, w.x, w.y, w.t / w.life, Math.max(2, k));
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  /** Crea un <canvas> con un sprite animado (para rejillas). */
  function spriteCanvas(dex: any, w: any, h: any, opts: any) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    sprite(cv, dex, opts);
    return cv;
  }

  /** One-shot move flourish on an existing sprite canvas (autochess combat).
   * Same guard as dungeon player (player.ts): don't restart mid-swing.
   * `face` (rad): turn sprite toward target first (dungeon attackFace).
   * `speed`: dungeon-style animLen/atkCd pace (player.cast); default 1.8. */
  function spriteHit(cv: any, anim = 'Attack', face?: number, speed = 1.8): void {
    const s = byCanvas.get(cv);
    if (!s || !s.cv.isConnected) return;
    if (face != null) s.a.dir = Sprites.dirFromAngle(face);
    if (s.a.busy() && s.a.progress() < 0.65) return;
    s.a.play(anim, { speed });
  }

  /** One-shot held on last frame — dungeon death (enemy.die Faint hold:true). */
  function spriteFaint(cv: any, speed = 1.4): void {
    const s = byCanvas.get(cv);
    if (!s || !s.cv.isConnected || s.a.busy()) return;
    s.a.play('Faint', { speed, hold: true });
  }

  return { $, show, hide, hideAll, isOpen, chrome, refreshCoins, toast, typeChips, stars, confirmDelete,
           sprite, spriteCanvas, spriteHit, spriteFaint, tick, initChrome, soundControls };
})();
register('UI', UI);
export { UI };
export default UI;
