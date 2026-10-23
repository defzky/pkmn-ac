/* ============ progress.ts — misiones, logros y estadísticas de cuenta ============
 * El juego avisa de lo que pasa con G.Progress.event(tipo, datos):
 *
 *   kill      { types, boss, legend }  (también en las copias del cooperativo)
 *   chest     cofre con candado abierto
 *   item      { id }        objeto equipado
 *   evolve    { move }      movimiento evolucionado
 *   rift      { type }      pelea de grieta ganada
 *   runEnd    { time, level, coins, types, group }
 *   judge     llegas a la Sentencia de Arceus (minuto 30)
 *   judgeEnd  { time, bosses }  aguantado ante Arceus (al acabar la partida)
 *   missionDone { daily }   (lo lanza claim)
 *
 * y esto actualiza en la partida guardada:
 *   stats.bossesTotal · riftWins · evolutions · missionsDone · groupRuns
 *   stats.judged · judgeTime (mejor tiempo ante Arceus) · judgeBosses (mejor nº de jefes)
 *   legends{dex} · arenas{tipo} · itemsFound{id} · evoMoves{id} · ach{id}
 *   missions { day, daily[], rerolled, week, weekly[] }
 *
 * Misiones: 3 diarias + 2 semanales, sorteadas con una semilla de la fecha y
 * la cuenta (en cualquier ordenador salen las mismas). El premio se recoge
 * a mano; los logros se dan solos al conseguirlos.
 */
import { register } from '../core/registry';
import { U } from '../core/util';
import { Audio } from '../core/audio';
import MissionDefs from '../data/missions';
import AchDefs from '../data/achievements';

const Progress = (() => {
  const TYPES = Object.keys(U.TYPE_NAME);
  let achT = 0, toastQ: any[] = [], toastT = 0;

  // ---------------- misiones ----------------

  function rng(seedStr: string) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function make(def: any, r: any) {
    const goal = def.goals[Math.floor(r() * def.goals.length)];
    const param = def.param === 'type' ? TYPES[Math.floor(r() * TYPES.length)] : null;
    return { id: def.id, goal, param, prog: 0, claimed: false, told: false };
  }

  function pickSet(defs: any, n: number, r: any, avoid: any[] = []) {
    const pool = defs.filter((d: any) => !avoid.includes(d.id));
    const out: any[] = [];
    while (out.length < n && pool.length) out.push(make(pool.splice(Math.floor(r() * pool.length), 1)[0], r));
    return out;
  }

  /** Crea las misiones del día / semana si han cambiado. */
  function ensure(s: any) {
    if (!s) return;
    const ids = (G as any).Ranking.periodIds();
    const key = String(s.created || 0);
    s.missions = s.missions || {};
    const M = s.missions;
    if (M.day !== ids.d) {
      M.day = ids.d; M.rerolled = false;
      M.daily = pickSet(MissionDefs.daily, 3, rng(ids.d + key));
    }
    if (M.week !== ids.w) {
      M.week = ids.w;
      M.weekly = pickSet(MissionDefs.weekly, 2, rng(ids.w + key));
    }
  }

  function text(m: any) { return MissionDefs.BY[m.id].text(m.goal, m.param); }
  function done(m: any) { return m.prog >= m.goal; }

  function advance(list: any, kind: any, d: any) {
    for (const m of list || []) {
      if (m.claimed || done(m)) continue;
      const def = MissionDefs.BY[m.id];
      if (!def || def.ev !== kind) continue;
      if (def.match && !def.match(d, m.param)) continue;
      const v = def.value ? def.value(d) : 1;
      m.prog = def.mode === 'max' ? Math.max(m.prog, v) : m.prog + v;
      if (done(m) && !m.told) {
        m.told = true;
        notify('Misión completada: ' + text(m), 'Recoge el premio en Misiones');
      }
    }
  }

  /** Recoge el premio de una misión terminada. */
  function claim(m: any, weekly = false) {
    const s = (G as any).DB.save;
    if (!s || m.claimed || !done(m)) return false;
    m.claimed = true;
    grant(MissionDefs.BY[m.id].reward);
    s.stats.missionsDone = (s.stats.missionsDone || 0) + 1;
    event('missionDone', { daily: !weekly });
    (G as any).DB.commit(true);
    return true;
  }

  /** Cambia una diaria sin terminar por otra (una vez al día). */
  function reroll(i: number) {
    const s = (G as any).DB.save;
    ensure(s);
    const M = s.missions;
    const m = M.daily[i];
    if (!m || M.rerolled || m.claimed) return false;
    const r = rng(M.day + 'cambio' + Date.now());
    const [n] = pickSet(MissionDefs.daily, 1, r, M.daily.map((x: any) => x.id));
    if (!n) return false;
    M.daily[i] = n;
    M.rerolled = true;
    (G as any).DB.commit();
    return true;
  }

  function grant(r: any) {
    const s = (G as any).DB.save;
    if (!r) return;
    s.tickets = s.tickets || { t1: 0, t10: 0 };
    if (r.coins) s.coins += r.coins;
    if (r.t1) s.tickets.t1 += r.t1;
    if (r.t10) s.tickets.t10 += r.t10;
    if ((G as any).UI && (G as any).UI.refreshCoins && !(document.getElementById('topbar') as any).classList.contains('hidden')) (G as any).UI.refreshCoins();
  }

  function rewardText(r: any) {
    const p: any[] = [];
    if (r.t10) p.push((G as any).Icons.html('ticket10', 12) + ' ' + r.t10 + ' ×10');
    if (r.t1) p.push((G as any).Icons.html('ticket', 12) + ' ' + r.t1);
    if (r.coins) p.push('<span class="coin"></span> ' + r.coins);
    return p.join(' &nbsp;');
  }

  // ---------------- eventos ----------------

  function event(kind: any, d: any = {}) {
    const s = (G as any).DB.save;
    if (!s) return;
    ensure(s);
    const S = s.stats;
    switch (kind) {
      case 'kill':
        if (d.boss) S.bossesTotal = (S.bossesTotal || 0) + 1;
        if (d.legend) { s.legends = s.legends || {}; if (!s.legends[d.legend]) s.legends[d.legend] = Date.now(); }
        break;
      case 'rift':
        S.riftWins = (S.riftWins || 0) + 1;
        if (d.type) { s.arenas = s.arenas || {}; s.arenas[d.type] = s.arenas[d.type] || Date.now(); }
        break;
      case 'evolve':
        S.evolutions = (S.evolutions || 0) + 1;
        s.evoMoves = s.evoMoves || {}; s.evoMoves[d.move] = s.evoMoves[d.move] || Date.now();
        break;
      case 'item':
        s.itemsFound = s.itemsFound || {}; s.itemsFound[d.id] = s.itemsFound[d.id] || Date.now();
        break;
      case 'runEnd':
        if (d.group) S.groupRuns = (S.groupRuns || 0) + 1;
        break;
      case 'judge':
        S.judged = (S.judged || 0) + 1;
        break;
      case 'judgeEnd':
        S.judgeTime = Math.max(S.judgeTime || 0, Math.floor(d.time));
        S.judgeBosses = Math.max(S.judgeBosses || 0, d.bosses);
        break;
    }
    advance(s.missions.daily, kind, d);
    advance(s.missions.weekly, kind, d);
    // Los logros se miran como mucho una vez por segundo (hay cientos de bajas).
    if (kind !== 'kill' || d.boss || d.legend) checkAch();
    else if (performance.now() - achT > 1000) checkAch();
  }

  /** Un enemigo ha caído (anfitrión, solitario o copia en el invitado). */
  function kill(e: any) {
    // Los legendarios de la Sentencia de Arceus no cuentan como jefes (ni para
    // misiones ni para logros de jefes): tienen su propio contador.
    if ((G as any).Judgment.active && e.boss) { (G as any).Judgment.bossDown(); event('kill', { types: e.types || [], boss: false, legend: 0 }); return; }
    const legend = e.legend || ((G as any).Rift.inArena && e.boss) ? e.dex : 0;
    event('kill', { types: e.types || [], boss: !!e.boss, legend });
  }

  // ---------------- logros ----------------

  function checkAch() {
    const s = (G as any).DB.save;
    if (!s) return;
    achT = performance.now();
    s.ach = s.ach || {};
    for (const a of AchDefs.LIST) {
      if (s.ach[a.id]) continue;
      if (a.value(s) < a.goal) continue;
      s.ach[a.id] = Date.now();
      grant(a.reward);
      notify('¡Logro: ' + a.name + '!', a.title ? 'Nuevo título: ' + a.title : '', a);
    }
  }

  /** Títulos que tienes (de los logros conseguidos). */
  function titles() {
    const s = (G as any).DB.save;
    return AchDefs.LIST.filter(a => a.title && s && s.ach && s.ach[a.id]).map(a => a.title);
  }

  /** Premios de misiones por recoger (para el aviso del menú). */
  function pending() {
    const s = (G as any).DB.save;
    if (!s) return 0;
    ensure(s);
    return [...s.missions.daily, ...s.missions.weekly].filter(m => done(m) && !m.claimed).length;
  }

  // ---------------- avisos ----------------

  function notify(title: any, sub?: any, ach?: any) {
    toastQ.push({ title, sub, ach });
    if (toastQ.length === 1) showNext();
  }

  function showNext() {
    const n = toastQ[0];
    if (!n) return;
    let el: any = document.getElementById('ach-pop');
    if (!el) { el = document.createElement('div'); el.id = 'ach-pop'; el.className = 'box ach-pop'; document.body.appendChild(el); }
    const icon = n.ach ? (n.ach.dex ? '' : (G as any).Icons.html('medal' + n.ach.tier, 24)) : (G as any).Icons.html('medal2', 24);
    el.innerHTML = `${icon}<div><b>${n.title}</b>${n.sub ? `<small>${n.sub}</small>` : ''}</div>`;
    if (n.ach && n.ach.dex) el.prepend((G as any).UI.spriteCanvas(n.ach.dex, 48, 40, { scale: 1 }));
    el.classList.remove('hidden');
    Audio.sfx(n.ach ? 'legend' : 'confirm', undefined);
    clearTimeout(toastT);
    toastT = setTimeout(() => {
      el.classList.add('hidden');
      toastQ.shift();
      setTimeout(showNext, 250);
    }, 2800);
  }

  return { ensure, event, kill, claim, reroll, checkAch, titles, pending, text, done, rewardText, grant };
})();
register('Progress', Progress);
export { Progress };
export default Progress;
