import { register } from '../core/registry';
import { Audio } from '../core/audio';
import DB from '../core/db';
import { Game, Flow } from '../game';

/* ============ social-ui.js — apodo, amigos, sala e invitaciones ============ */
const $ = (G as any).UI.$;
const esc = (s: any) => String(s).replace(/[&<>"']/g, c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]));

/** ¿Se puede usar lo online? Si no, explica por qué. */
function needOnline() {
  if (DB.online) return true;
  (G as any).UI.toast(DB.guest ? 'Crea una cuenta para jugar con amigos y salir en el ranking.'
    : 'Esto necesita la versión online del juego (con la nube).', 3200);
  return false;
}

// ======================= APODO =======================

const NickUI = (() => {
  let then: any = null, skipped = false;

  function init() {
    $('nick-form').onsubmit = async (e: any) => {
      e.preventDefault();
      $('nick-err').textContent = '';
      $('nick-ok').disabled = true;
      const r = await (G as any).Social.claimNick($('nick-in').value);
      $('nick-ok').disabled = false;
      if (!r.ok) { $('nick-err').textContent = r.error; Audio.sfx('error', undefined); return; }
      Audio.sfx('confirm', undefined);
      (G as any).UI.toast('Tu apodo es ' + (G as any).Social.me.name);
      const cb = then; then = null;
      if (cb) cb(); else (G as any).MenuUI.open();
    };
    $('nick-later').onclick = () => { skipped = true; then = null; (G as any).MenuUI.open(); };
  }

  /** @param next  qué abrir después de elegirlo */
  function open(next?: any) {
    then = next || null;
    (G as any).UI.show('scr-nick');
    $('nick-err').textContent = '';
    $('nick-in').value = '';
    setTimeout(() => $('nick-in').focus(), 50);
  }

  return { init, open, get skipped() { return skipped; } };
})();

/** Abre `fn` si tienes apodo; si no, pide el apodo primero. */
function withNick(fn: any) {
  if (!needOnline()) return;
  if ((G as any).Social.me) { fn(); return; }
  (G as any).Social.start().then((r: any) => { if (r === 'ok') fn(); else NickUI.open(fn); });
}

// ======================= AMIGOS =======================

const FriendsUI = (() => {
  function init() {
    $('fr-add').onsubmit = async (e: any) => {
      e.preventDefault();
      const name = $('fr-name').value;
      msg('');
      const r = await (G as any).Social.request(name);
      msg(r.ok ? r.msg : r.error, !r.ok);
      if (r.ok) $('fr-name').value = '';
    };
    $('fr-room').onclick = () => (G as any).LobbyUI.open();
    (G as any).Social.on(() => { if ((G as any).UI.isOpen('scr-friends')) render(); });
  }

  function msg(t: any, bad?: any) {
    $('fr-msg').textContent = t || '';
    $('fr-msg').style.color = bad ? '#ffb0b8' : '';
    if (t) Audio.sfx(bad ? 'error' : 'confirm', undefined);
  }

  function open() { withNick(() => { (G as any).UI.show('scr-friends', true); msg(''); render(); (G as any).Social.refreshPresence(); }); }

  /** "hace 5 min", "hace 2 h", "hace 3 días". */
  function ago(t: any) {
    const m = Math.max(1, Math.round(((G as any).Social.now() - t) / 60000));
    if (m < 60) return 'hace ' + m + ' min';
    const h = Math.round(m / 60);
    if (h < 48) return 'hace ' + h + ' h';
    return 'hace ' + Math.round(h / 24) + ' días';
  }

  function stateText(f: any) {
    if (f.status === 'in') return 'Quiere ser tu amigo';
    if (f.status === 'out') return 'Solicitud enviada';
    if (!f.online) return f.seen ? 'Visto ' + ago(f.seen) : 'Desconectado';
    return f.play ? 'Jugando' : 'En línea';
  }

  function render() {
    const room = (G as any).Social.room;
    $('fr-me').innerHTML = 'Tu apodo: <b class="gold" translate="no">' + esc((G as any).Social.me ? (G as any).Social.me.name : '') + '</b> · dáselo a tus amigos para que te añadan.';
    $('fr-room').classList.toggle('hidden', !room);
    const list = (G as any).Social.friends.sort((a: any, b: any) => {
      const rank = (f: any) => f.status === 'in' ? 0 : f.status === 'ok' ? (f.online ? (f.play ? 2 : 1) : 3) : 4;
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
    const box = $('fr-list');
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<p class="sub">Aún no tienes amigos añadidos. Escribe arriba el apodo de un amigo.</p>';
      return;
    }
    for (const f of list) {
      const el = document.createElement('div');
      el.className = 'fr-row';
      const dot = f.status !== 'ok' ? 'pend' : !f.online ? 'off' : f.play ? 'play' : 'on';
      const inRoom = room && room.members.some((m: any) => m.uid === f.uid);
      el.innerHTML = `<i class="dot ${dot}"></i><b translate="no"><a href="#" class="plink" title="Ver su perfil">${esc(f.name)}</a></b><span class="st">${inRoom ? 'En tu sala' : stateText(f)}</span><span class="grow"></span>`;
      if (f.status === 'ok') (el.querySelector('.plink') as HTMLElement).onclick = e => { e.preventDefault(); (G as any).ProfileUI.show(f.uid); };
      else (el.querySelector('.plink') as HTMLElement).onclick = e => e.preventDefault();
      const btn = (txt: any, cls: any, fn: any) => {
        const b = document.createElement('button');
        b.className = 'btn small ' + cls; b.textContent = txt; b.onclick = fn; el.appendChild(b); return b;
      };
      if (f.status === 'in') {
        btn('Aceptar', 'gold', async () => { const r = await (G as any).Social.accept(f.uid); msg(r.ok ? r.msg : r.error, !r.ok); });
        btn('Rechazar', 'ghost', () => (G as any).Social.remove(f.uid));
      } else if (f.status === 'out') {
        btn('Cancelar', 'ghost', () => (G as any).Social.remove(f.uid));
      } else {
        if (f.online && !f.play && !inRoom && (!room || room.isHost)) {
          btn('Invitar', 'gold', async () => {
            const r = await (G as any).Social.invite(f.uid);
            msg(r.ok ? r.msg : r.error, !r.ok);
            if (r.ok) (G as any).LobbyUI.open();
          });
        }
        btn('Quitar', 'ghost', () => { if (confirm('¿Quitar a ' + f.name + ' de tus amigos?')) (G as any).Social.remove(f.uid); });
      }
      box.appendChild(el);
    }
  }

  return { init, open, render };
})();

// ======================= SALA =======================

const LobbyUI = (() => {
  let membersKey = '';

  function init() {
    $('lobby-leave').onclick = async () => {
      await (G as any).Social.leaveRoom();
      (G as any).Net.close();
      (G as any).MenuUI.open();
    };
    $('lobby-menu').onclick = () => (G as any).MenuUI.open();
    $('lobby-start').onclick = start;
    $('lobby-start').dataset.sfx = 'confirm';
    // Conecta / desconecta la red al entrar o salir de una sala.
    (G as any).Social.on((what: any) => {
      const room = (G as any).Social.room;
      if (room) {
        (G as any).Net.open(room.id, room.isHost, room.host);
        (G as any).Net.syncMembers(room.members.map((m: any) => m.uid));
      } else if ((G as any).Net.open_) (G as any).Net.close();
      if (what === 'room-closed') {
        (G as any).UI.toast('La sala se ha cerrado', 2600);
        if ((G as any).UI.isOpen('scr-lobby')) (G as any).MenuUI.open();
      }
      if ((G as any).UI.isOpen('scr-lobby')) render();
    });
    (G as any).Net.onPeer(() => { if ((G as any).UI.isOpen('scr-lobby')) render(); });
  }

  function open() {
    if (!(G as any).Social.room) { (G as any).MenuUI.open(); return; }
    (G as any).Social.refreshMember();
    (G as any).Social.refreshPresence();
    (G as any).UI.show('scr-lobby', true);
    membersKey = '';
    render();
  }

  function close() { (G as any).UI.hide('scr-lobby'); }

  function connText(m: any, room: any) {
    if (m.uid === room.host) return 'Anfitrión';
    if (!room.isHost) return m.uid === (G as any).Social.uid ? 'Tú' : 'En la sala';
    const mode = (G as any).Net.mode(m.uid);
    return mode === 'direct' ? 'Conectado' : mode === 'relay' ? 'Conectado (por servidor)' : mode === 'failed' ? 'No se pudo conectar (reintentando…)' : 'Conectando…';
  }

  function render() {
    const room = (G as any).Social.room;
    if (!room) return;
    const ms = room.members;
    $('lobby-sub').textContent = room.isHost
      ? 'Eres el anfitrión. Invita a tus amigos (hasta ' + (G as any).Social.MAX_PLAYERS + ') y empezad cuando estéis.'
      : 'Estás en la sala de ' + ((ms.find((m: any) => m.uid === room.host) || {}).name || '…') + '. El anfitrión empezará la partida.';

    // Las tarjetas sólo se rehacen si cambian los miembros (los sprites no parpadean).
    const key = ms.map((m: any) => m.uid + ':' + m.dex + ':' + (m.shiny ? 1 : 0)).join('|');
    const box = $('lobby-members');
    if (key !== membersKey) {
      membersKey = key;
      box.innerHTML = '';
      for (let i = 0; i < (G as any).Social.MAX_PLAYERS; i++) {
        const m = ms[i];
        const c = document.createElement('div');
        c.className = 'lob-card' + (m ? '' : ' empty');
        if (m) {
          c.style.setProperty('--pc', (G as any).Coop.COLORS[i]);
          c.appendChild((G as any).UI.spriteCanvas(m.dex, 120, 96, { scale: 2, lively: true, shiny: !!m.shiny }));
          c.insertAdjacentHTML('beforeend', `<b translate="no">${esc(m.name)}</b><small>${esc(((G as any).DEX_BY[m.dex] || {}).name || '')}</small><span class="conn" data-u="${m.uid}"></span>`);
        } else c.innerHTML = '<span>Libre</span>';
        box.appendChild(c);
      }
    }
    box.querySelectorAll('.conn').forEach((el: any) => {
      const m = ms.find((x: any) => x.uid === el.dataset.u);
      if (!m) return;
      const t = connText(m, room);
      el.textContent = t;
      el.className = 'conn' + (t === 'Conectando…' ? ' wait' : '');
    });

    // Invitar (sólo el anfitrión y si queda sitio).
    const canInvite = room.isHost && ms.length < (G as any).Social.MAX_PLAYERS;
    $('lobby-inv-title').classList.toggle('hidden', !canInvite);
    const inv = $('lobby-invite');
    inv.classList.toggle('hidden', !canInvite);
    if (canInvite) {
      inv.innerHTML = '';
      const free = (G as any).Social.friends.filter((f: any) => f.status === 'ok' && f.online && !ms.some((m: any) => m.uid === f.uid));
      if (!free.length) inv.innerHTML = '<p class="sub" style="margin:0">Ningún amigo en línea ahora mismo.</p>';
      for (const f of free) {
        const el = document.createElement('div');
        el.className = 'fr-row';
        el.innerHTML = `<i class="dot ${f.play ? 'play' : 'on'}"></i><b translate="no">${esc(f.name)}</b><span class="st">${f.play ? 'Jugando' : 'En línea'}</span><span class="grow"></span>`;
        const b = document.createElement('button');
        b.className = 'btn small gold'; b.textContent = 'Invitar';
        b.onclick = async () => { const r = await (G as any).Social.invite(f.uid); (G as any).UI.toast(r.ok ? r.msg : r.error); };
        el.appendChild(b);
        inv.appendChild(el);
      }
    }

    const btn = $('lobby-start');
    btn.classList.toggle('hidden', !room.isHost);
    const connecting = ms.some((m: any) => m.uid !== room.host && (G as any).Net.mode(m.uid) === 'connecting');
    const failed = ms.some((m: any) => m.uid !== room.host && (G as any).Net.mode(m.uid) === 'failed');
    btn.disabled = !room.isHost || ms.length < 2 || connecting || failed;
    btn.textContent = 'Empezar partida (' + ms.length + '/' + (G as any).Social.MAX_PLAYERS + ')';
    $('lobby-note').textContent = !room.isHost ? 'Cuando el anfitrión empiece, entraréis todos a la vez.'
      : ms.length < 2 ? 'Necesitas al menos un amigo en la sala.'
      : failed ? 'No se puede conectar con algún amigo: su red (o la tuya) no deja jugar en grupo. Probad con otra wifi o datos móviles; se reintenta solo.'
      : connecting ? 'Conectando con tus amigos…' : 'La partida empieza para todos a la vez.';
  }

  function start() {
    const room = (G as any).Social.room;
    if (!room || !room.isHost || room.members.length < 2) return;
    const cfg = {
      k: 'start', seed: Math.floor(Math.random() * 1e6), host: room.host,
      members: room.members.map((m: any) => ({ uid: m.uid, name: m.name, dex: m.dex, shiny: !!m.shiny }))
    };
    (G as any).Social.setOpen(false);
    (G as any).Net.broadcast(cfg);
    Flow.startCoop(cfg);
  }

  return { init, open, close, render };
})();

// ======================= INVITACIONES =======================

const InvitePop = (() => {
  let cur: any = null;

  function init() {
    $('inv-yes').onclick = async () => {
      if (!cur) return;
      const from = cur.from;
      hide();
      const r = await (G as any).Social.acceptInvite(from);
      if (!r.ok) { (G as any).UI.toast(r.error, 3000); return; }
      (G as any).LobbyUI.open();
    };
    $('inv-no').onclick = () => { if (cur) (G as any).Social.declineInvite(cur.from); hide(); };
    (G as any).Social.on((what: any) => { if (what === 'invites' || what === 'room') refresh(); });
  }

  function hide() { cur = null; $('invite-pop').classList.add('hidden'); }

  /** Enseña la invitación más antigua si estás en los menús (no en plena partida). */
  function refresh() {
    const room = (G as any).Social.room;
    const list = (G as any).Social.invites.filter((i: any) => !room || i.room !== room.id).sort((a: any, b: any) => a.at - b.at);
    if (!list.length || Game.state !== 'ui' || !DB.loggedIn) { hide(); return; }
    if (cur && cur.from === list[0].from) return;
    cur = list[0];
    $('inv-text').innerHTML = `${(G as any).Icons.html('friends', 22)} <b class="gold" translate="no">${esc(cur.name)}</b> te invita a jugar en su sala`;
    $('invite-pop').classList.remove('hidden');
    Audio.sfx('shiny', undefined);
  }

  return { init, refresh };
})();

const SocialUI = {
  init() { NickUI.init(); FriendsUI.init(); LobbyUI.init(); InvitePop.init(); },
  withNick, needOnline
};

register('NickUI', NickUI);
register('FriendsUI', FriendsUI);
register('LobbyUI', LobbyUI);
register('InvitePop', InvitePop);
register('SocialUI', SocialUI);
export { NickUI, FriendsUI, LobbyUI, InvitePop, SocialUI, withNick, needOnline };
export default SocialUI;
