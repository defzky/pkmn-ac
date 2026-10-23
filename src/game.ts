/* ============ game.ts — flujo del juego y bucle principal ============
 *
 *   login ──> test de personalidad ──> menú ──> run ──> resumen ──> menú
 *                (sólo la 1ª vez)          │
 *                                          ├─ Pokémon (colección)
 *                                          ├─ Mejoras
 *                                          └─ Gacha
 *
 * Estados del bucle: 'ui' (menús, con el mundo de fondo), 'playing',
 * 'levelup', 'paused', 'over'.
 *
 * Cooperativo ((G as any).Coop.active): el anfitrión lleva enemigos, objetos y
 * experiencia; cada uno su Pokémon. La pausa no para el juego, las cartas de
 * nivel esperan a que elijan todos y un compañero caído se levanta si otro
 * se queda a su lado. Ver net/coop.js.
 */
import { register } from './core/registry';
import { U, LIFT } from './core/util';
import { Camera } from './core/camera';
import { Audio } from './core/audio';
import { Sprites } from './core/sprites';
import { Input } from './core/input';
import { Touch } from './core/touch';
import { Pad } from './core/gamepad';
import Settings from './core/settings';
import DB from './core/db';
import Updater from './core/updater';
import { BIOME_MUSIC } from './data/music';
import { startMoveOf } from './data/starters';
import Upgrades from './data/upgrades';
import Moves from './data/moves';
import Items from './data/items';
import { Player } from './entities/player';
import { EnemyMgr } from './entities/enemy';
import { Projectiles } from './entities/projectile';
import { Pickups } from './entities/pickup';
import { FX } from './entities/fx';
import { Combat } from './systems/combat';
import { Spawner } from './systems/spawner';
import { LevelUp } from './systems/levelup';
import { Interact } from './systems/interact';
import { Rift } from './systems/rift';
import { Judgment } from './systems/judgment';
import { Events } from './systems/events';
import { Weather } from './systems/weather';
import { Path } from './systems/pathing';
import { Progress } from './systems/progress';
import { Hazards } from './systems/hazards';

const Game = (() => {
  let cv!: HTMLCanvasElement, ctx!: CanvasRenderingContext2D, dpr = 1, w = 0, h = 0;
  let state = 'ui';
  let time = 0, last = 0, pendingLevels = 0;
  let pl: any = null;
  let caught: any[] = [];          // shinies conseguidos en esta run
  let biome = -1;

  const st = { get time() { return time; } };

  // ---------------- arranque ----------------

  function init() {
    cv = document.getElementById('game') as HTMLCanvasElement;
    ctx = cv.getContext('2d')!;
    resize();
    addEventListener('resize', resizeSoon);
    // iPhone: al girarlo o al abrirlo desde la pantalla de inicio avisa del
    // cambio ANTES de recolocar la página, y con esas medidas viejas el juego
    // se quedaba estirado. Se vuelve a medir cuando el lienzo cambia de verdad
    // (ResizeObserver) y, por si acaso, un poco después de cada aviso.
    addEventListener('orientationchange', resizeSoon);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeSoon);
    if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(cv);
    Touch.init(cv);
    // En móvil: al cambiar de app o girarlo en vertical, la partida se pausa.
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
    (G as any).RunUI.wirePause(() => { state = 'playing'; (G as any).UI.hideAll(); }, quitRun);
    Backdrop.init();
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function resize() {
    // Resolución interna como mucho ×1,5: en pantallas ×2 dibujar el doble de
    // píxeles era de lo que más costaba, y con el pixel art no se nota.
    const d = Math.min(1.5, window.devicePixelRatio || 1);
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (!cw || !ch) return;
    Touch.resetSafe();
    if (cw === w && ch === h && d === dpr && cv.width === Math.round(cw * d) && cv.height === Math.round(ch * d)) { checkOrientation(); return; }
    dpr = d; w = cw; h = ch;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    Camera.resize(w, h, dpr);
    checkOrientation();
  }
  let resizeTs: any[] = [];
  function resizeSoon() {
    resize();
    resizeTs.forEach(clearTimeout);
    resizeTs = [100, 350, 800].map(ms => setTimeout(resize, ms));
  }

  /** Móvil en vertical: aviso de girarlo (y pausa). */
  function checkOrientation() {
    const portrait = Touch.active && innerHeight > innerWidth;
    const el = document.getElementById('rotate');
    if (!el) return;
    if (portrait && !document.getElementById('rotate-ico')!.innerHTML) document.getElementById('rotate-ico')!.innerHTML = (G as any).Icons.html('phone', 48);
    el.classList.toggle('hidden', !portrait);
    if (portrait) autoPause();
  }

  /** Pausa sola (sólo en solitario: en grupo los demás siguen). */
  function autoPause() {
    Touch.reset();
    if (state === 'playing' && !(G as any).Coop.active) { state = 'paused'; (G as any).RunUI.showPause(); }
  }

  /** Pausa/continúa (tecla Esc o P, o el botón de pausa del móvil). */
  let holdBy: any[] = [];                   // grupo: quién está eligiendo fusión (todo parado)

  function togglePause() {
    // En grupo la pausa no para el juego (los demás siguen jugando).
    if ((G as any).Coop.active) {
      if (state !== 'playing') return;
      if ((G as any).UI.isOpen('scr-pause')) (G as any).UI.hide('scr-pause');
      else { (G as any).RunUI.showPause(true); Audio.sfx('pause', undefined); }
      return;
    }
    if (state === 'playing') { state = 'paused'; (G as any).RunUI.showPause(); Audio.sfx('pause', undefined); }
    else if (state === 'paused') { state = 'playing'; (G as any).UI.hideAll(); }
  }

  // ---------------- run ----------------

  /** @param coop  { seed, host, members } para una partida en grupo */
  function startRun(coop: any = null) {
    holdBy = []; awayBy = null;
    const save: any = DB.save;
    const mon = (G as any).DEX_BY[save.partner];
    const perks = Upgrades.perks(DB.upgradesOf(mon.dex));

    (G as any).UI.hideAll();
    (G as any).UI.chrome(false);
    FX.clear();
    Projectiles.clear();
    Combat.clearFields(undefined);
    EnemyMgr.clear();
    Pickups.clear();
    Spawner.reset();
    Rift.reset();
    Judgment.reset();
    Events.reset();
    Weather.reset();
    Path.clear();
    Hazards.clear();
    (G as any).World.reset(coop ? coop.seed : Math.floor(Math.random() * 1e6));
    (G as any).World.setBiome(0, true);
    biome = 0;
    time = 0; pendingLevels = 0;
    runReal = performance.now(); tampered = false;

    pl = new Player(mon, perks, !!save.partnerShiny && DB.ownsShiny(mon.dex));
    banked = { t1: 0, t10: 0 };
    caught = [];
    // Atajos: movimientos con hueco fijo (save.pbind[dex] = [id del 1, id del 2, ...]),
    // antes de aprender nada: addMove ya los coloca.
    (save.pbind && save.pbind[mon.dex] || []).forEach((id: any, i: number) => { if (id) pl.bind[id] = i; });
    pl.addMove(startMoveOf(mon.dex));
    // Mejora "Veto": movimientos que no quieres que te salgan.
    pl.banned = new Set((save.pban && save.pban[mon.dex] || []).slice(0, perks.bans));
    // Mejora "Repertorio": un segundo movimiento de ataque al azar.
    if (perks.startMoves >= 2) {
      const pool = Moves.poolFor(mon).filter(id => !pl.hasMove(id) && !pl.banned.has(id) && Moves.BY_ID[id].kind !== 'buff');
      if (pool.length) pl.addMove(U.pick(pool));
      pl.setActive(0);
    }

    if (coop) {
      (G as any).Coop.begin(coop, pl, coopApi);
      (G as any).Social.setPlaying(true);
    }
    Camera.x = pl.x; Camera.y = pl.y; Camera.shake = 0;
    // Hojas de sprites locales: el compañero y los primeros enemigos.
    Sprites.preload([mon.dex], 8000, pl.shiny);
    Audio.music(BIOME_MUSIC[0]);
    // Para el ranking: el servidor apunta cuándo empieza la partida (anti-trampas).
    if (!coop || (G as any).Coop.isHost) (G as any).Ranking.runStarted(coop ? 'g' : 's');
    deathT = 0;

    state = 'playing';
  }

  function quitRun() {
    if ((G as any).Coop.active) (G as any).Coop.leave();
    endRun(false);
  }

  /** Todos los jugadores de la partida (tú primero). */
  function everyone(): any[] { return (G as any).Coop.active ? (G as any).Coop.players() : [pl]; }

  /** Experiencia que hace falta para el siguiente nivel (cofres con candado). */
  function levelXp(): number {
    if (!pl) return 20;
    const k = ((G as any).Coop.active ? (G as any).Coop.xpFactor() : 1) * (pl.xpMul || 1);
    return Math.ceil((pl.xpNext - pl.xp + 1) / k);
  }

  // Destello de pantalla completa (viaje a la grieta).
  let flashT = 0, flashDur = 1, flashCol = '#fff';
  function flash(col: string, dur: number) { flashCol = col; flashDur = dur; flashT = dur; }

  function teamState() {
    return { time, level: pl.level, xp: pl.xp, xpNext: pl.xpNext, kills: pl.kills, bosses: pl.bosses, coins: pl.coins, t1: pl.t1, t10: pl.t10 };
  }
  function summary() { return { t: time, ki: pl.kills, bo: pl.bosses, co: pl.coins, lv: pl.level, t1: pl.t1, t10: pl.t10 }; }

  /** Lo que el cooperativo necesita del juego. */
  /**
   * Los tickets recogidos se guardan en cuanto los coges (como los shinies):
   * antes sólo al acabar, y si la pestaña se cerraba de golpe se perdían.
   * `banked` = los de esta partida que ya están en la partida guardada.
   */
  let banked = { t1: 0, t10: 0 };
  function bankTickets(save_ = true) {
    const sv: any = DB.save;
    if (!sv || !pl) return;
    sv.tickets = sv.tickets || { t1: 0, t10: 0 };
    const d1 = Math.max(0, pl.t1 - banked.t1), d10 = Math.max(0, pl.t10 - banked.t10);
    if (!d1 && !d10) return;
    sv.tickets.t1 += d1; sv.tickets.t10 += d10;
    banked = { t1: pl.t1, t10: pl.t10 };
    if (save_) DB.commit('run' as any);
  }

  const coopApi = {
    team: teamState,
    summary,
    // Invitado: el anfitrión manda el reloj y lo del equipo.
    syncTeam(t: any) {
      if (Math.abs(t.time - time) > 0.4) time = t.time;
      if (t.level > pl.level) Audio.sfx('xp', undefined);
      pl.level = t.level; pl.xp = t.xp; pl.xpNext = t.xpNext;
      pl.kills = t.kills; pl.bosses = t.bosses; pl.coins = t.coins;
      if (t.t1 > pl.t1 || t.t10 > pl.t10) Audio.sfx('shiny', undefined);
      pl.t1 = t.t1 || 0; pl.t10 = t.t10 || 0;
      bankTickets();
    },
    levelStart(level: any) {
      // (Si tenías abierta la elección de objeto, vuelve al terminar: afterLevelUp.)
      if (state === 'choice' && openItem && (G as any).Coop.active) (G as any).Coop.holdEnd();
      state = 'levelup';
      (G as any).UI.hide('scr-pause');
      Audio.sfx('levelup', undefined);
      (G as any).RunUI.showLevelUp(level, LevelUp.offer(pl), (card: any) => {
        Audio.sfx('confirm', undefined);
        card.apply(pl);
        (G as any).Coop.localPicked();
      }, true);
    },
    waiting(names: any) { (G as any).RunUI.setWaiting(names); },
    resume() {
      (G as any).RunUI.closeLevelUp();
      if (state === 'levelup') { state = holdBy.length ? 'held' : 'playing'; afterLevelUp(); }
    },
    /** ¿Estás eligiendo algo que para la partida (objeto o vínculo)? */
    choosing() { return state === 'choice'; },
    inLevelUp() { return state === 'levelup'; },
    shiny(dex: any) { (G as any).onShinyCaught({ dex, name: ((G as any).DEX_BY[dex] || {}).name || '' }); },
    over(d: any) {
      if (d) Object.assign(pl, { kills: d.ki, bosses: d.bo, coins: d.co, level: Math.max(pl.level, d.lv || 1), t1: d.t1 || pl.t1, t10: d.t10 || pl.t10 });
      if (d && d.t) time = d.t;
      if (d && d.why === 'host') (G as any).UI.toast('El anfitrión ha terminado la partida', 3200);
      endRun(!(d && d.why === 'host'));
    },
    lost(msg: any) { (G as any).UI.toast(msg, 3600); endRun(false); },
    item(id: any) { offerItem(id); },
    mateLeft() {},
    /** Grupo: quién está eligiendo fusión. Mientras haya alguien, todo parado. */
    hold(names: any) {
      holdBy = names || [];
      const mine = (G as any).UI.isOpen('scr-bond');
      if (holdBy.length) {
        if (state === 'playing') state = 'held';
        if (pl && pl.bonds > 0) offerBond(true);      // si tú también tienes vínculo, eliges a la vez
        const others = holdBy.filter((n: any) => n !== ((G as any).Social.me && (G as any).Social.me.name) && n !== 'Tú');
        if (!mine && others.length) Spawner.say('Pausa: ' + others.join(', ') + ' ' + (others.length > 1 ? 'están eligiendo…' : 'está eligiendo…'), 999, true);
        else if (!others.length) Spawner.say(awayBy ? awayText() : '', awayBy ? 999 : 0, true);   // sólo tú: sin aviso viejo
      } else {
        if (state === 'held' && !awayBy) state = 'playing';
        Spawner.say(awayBy ? awayText() : '', awayBy ? 999 : 0, true);
      }
    },
    /** Grupo (invitado): el anfitrión se ha ido de la pestaña o no responde: todo parado. */
    away(name: any) {
      awayBy = name || null;
      if (awayBy) {
        if (state === 'playing') state = 'held';
        Spawner.say(awayText(), 999, true);
      } else if (!holdBy.length) {
        if (state === 'held') state = 'playing';
        Spawner.say('', 0, true);
      }
    }
  };
  let awayBy: any = null;
  const awayText = () => 'Pausa: esperando a ' + awayBy + ' (anfitrión)…';

  /** Has llevado a casa a un Pokémon perdido y se une a ti (events.js). */
  (G as any).onRescue = (dex: any, name: any) => {
    if (!DB.save || !pl) return;
    const isNew = !DB.owns(dex);
    if (isNew) { DB.grant(dex, 'rescue'); DB.commit(true); }
    else pl.coins += 150;
    Spawner.say(isNew ? '¡' + name + ' se une a tu equipo!' : '¡' + name + ' te da las gracias! (+150 monedas, ya lo tenías)', 4);
    Audio.sfx('shinyGet', undefined);
  };

  /** Un shiny salvaje cae: te lo quedas (y la versión normal si no la tenías). */
  (G as any).onShinyCaught = (e: any) => {
    if (!DB.save || !pl) return;
    if ((G as any).Coop.isHost) (G as any).Coop.shinyCaught(e);
    const isNew = DB.grantShiny(e.dex, 'wild');
    DB.save!.stats.shinies++;
    DB.commit(true);
    caught.push({ dex: e.dex, isNew });
    Spawner.say(isNew ? '¡Has conseguido a ' + e.name + ' shiny!' : '¡Otro ' + e.name + ' shiny! (+300 monedas)', 4);
    if (!isNew) pl.coins += 300;
    Audio.sfx('shinyGet', undefined);
  };

  function endRun(dead = true) {
    if (state === 'over' || !pl) return;
    const coop = !!pl.uid;                    // sólo las partidas en grupo le ponen uid
    const wasHost = !!pl.coopHost;
    const team = coop ? (G as any).Coop.members.slice() : [];
    if ((G as any).Coop.active) (G as any).Coop.end();
    if (coop) (G as any).Social.setPlaying(false);
    state = 'over';
    Audio.music(null);
    Audio.sfx(dead ? 'gameover' : 'back', undefined);
    const save: any = DB.save;
    const mul = pl.coinMul;
    const parts = {
      tiempo: Math.floor(time / 5),
      derrotados: Math.floor(pl.kills * 0.25),
      jefes: pl.bosses * 80,
      recogidas: pl.coins
    };
    const coins = Math.round((parts.tiempo + parts.derrotados + parts.jefes + parts.recogidas) * mul);
    const record = time > save.stats.bestTime;

    save.coins += coins;
    bankTickets(false);
    save.stats.runs++;
    save.pused = save.pused || {};
    save.pused[pl.dex] = (+save.pused[pl.dex] || 0) + 1;     // para "más usados" en la colección
    save.stats.totalKills += pl.kills;
    save.stats.bestTime = Math.max(save.stats.bestTime, Math.floor(time));
    if (coop) save.stats.bestGroupTime = Math.max(save.stats.bestGroupTime || 0, Math.floor(time));
    save.stats.bestLevel = Math.max(save.stats.bestLevel, pl.level);
    save.stats.coinsEarned += coins;
    const judge = Judgment.summary();
    if (judge) Progress.event('judgeEnd', judge);
    Judgment.reset();
    Progress.event('runEnd', { time, level: pl.level, coins: pl.coins, types: pl.mon.types, group: coop });
    Progress.checkAch();
    // A la nube al acabar la partida (como mucho cada 30 min); si la marca entra
    // en un top (hoy, semana o mes), enseguida (abajo, tras subirla al ranking).
    DB.commit('run' as any);
    if ((G as any).Social.me) (G as any).Social.publishProfile();

    // Ranking: en solitario cada uno lo suyo; en grupo lo sube el anfitrión.
    const mark = { t: Math.floor(time), lv: pl.level, kills: pl.kills };
    // Si la partida se ha tocado (ver clean()), no sube al ranking (sin avisar); lo demás, sí.
    const ok = clean();
    const sent = ok && !coop ? (G as any).Ranking.submitSolo(Object.assign(mark, { dex: pl.dex, shiny: pl.shiny }))
               : ok && wasHost ? (G as any).Ranking.submitGroup(Object.assign(mark, { members: team })) : null;
    if (sent) sent.then((b: any) => { if (b && b.some((p: any) => p !== 'a')) DB.commit(true); }).catch(() => {});

    (G as any).RunUI.showOver({
      dead, time, level: pl.level, kills: pl.kills, bosses: pl.bosses, coins, record, t1: pl.t1, t10: pl.t10, judge,
      moves: pl.moves, caught,
      breakdown: Object.entries(parts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ') +
                 (mul > 1 ? ` · ×${mul.toFixed(2)} Fortuna` : '')
    }, () => { pl = null; Flow.afterRun(); });
  }

  /*
   * ¿Partida limpia? Sólo cosas que ningún jugador legal puede hacer, con
   * márgenes enormes (el sistema del 10-10 daba falsos positivos):
   *   - el reloj de la partida va más deprisa que el real (trucos de velocidad)
   *   - funciones de tu Pokémon sustituidas (así se hace uno invencible)
   *   - vida, ataque, velocidad o recarga muy por encima de lo posible
   *   - se han usado las funciones de pruebas (saltar el reloj...)
   * Si algo salta, esa partida no sube al ranking (sin avisar) y nada más.
   */
  let runReal = 0, tampered = false;
  function clean() {
    if (tampered) return false;
    if (time > (performance.now() - runReal) / 1000 + 10) return false;
    for (const k of ['hurt', 'update', 'heal', 'gainXp']) if (Object.prototype.hasOwnProperty.call(pl, k)) return false;
    if (!isFinite(pl.hp) || !isFinite(pl.maxHp) || pl.hp > pl.maxHp + 1 || pl.maxHp > 50000) return false;
    if (pl.atkMul > 2000 || pl.spdMul > 25 || pl.cdMul < 0.03 || pl.level > 20 + time / 3) return false;
    return true;
  }

  // ---------------- subida de nivel ----------------

  function maybeLevelUp() {
    if (pendingLevels <= 0 || state !== 'playing') return;
    if ((G as any).Coop.active) {
      // En grupo, las cartas salen a la vez para todos y se espera a que elijan.
      if ((G as any).Coop.players().every((p: any) => p.dead)) return;
      pendingLevels--;
      (G as any).Coop.levelStart(pl.level);
      return;
    }
    // Nunca abras cartas con el Pokémon caído (morir y recoger XP en el mismo frame).
    if (pl.dead) return;
    pendingLevels--;
    state = 'levelup';
    Audio.sfx('levelup', undefined);
    (G as any).RunUI.showLevelUp(pl.level, LevelUp.offer(pl), (card: any) => {
      Audio.sfx('confirm', undefined);
      card.apply(pl);
      state = 'playing';
    });
  }

  // ---------------- vínculos ----------------

  /**
   * Vínculo de un legendario: eliges qué movimientos se fusionan.
   * Si ahora no se puede (no hay dos sueltos), se guarda hasta que aprendas
   * otro movimiento. Se mira en cada fotograma: si otra pantalla la tapa (cartas
   * de nivel en grupo, pausa), vuelve a salir al cerrarla.
   * @param quiet  no avisar si todavía no se puede
   */
  function offerBond(quiet = false) {
    if (!pl || pl.bonds <= 0 || pl.dead || (state !== 'playing' && state !== 'held') || Rift.inArena) return;
    if (['scr-bond', 'scr-pause', 'scr-item', 'scr-levelup'].some((G as any).UI.isOpen)) return;
    const opt = pl.bondOptions();
    if (!opt) {
      if (!quiet) Spawner.say('Guardas el vínculo: aprende otro movimiento para usarlo', 3, true);
      return;
    }
    // Se para el juego; en grupo, para todos hasta que cada uno elige ((G as any).Coop.holdStart).
    state = 'choice';
    if ((G as any).Coop.active) (G as any).Coop.holdStart();
    Audio.sfx('levelup', undefined);
    (G as any).RunUI.showBond(opt, (picked: any) => {
      const group = pl.fuse(picked, opt.group);
      Audio.sfx('legend', undefined);
      FX.ring(pl.x, pl.y, 8, 130, '#ff8ad8', 0.8, 6);
      FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffb3e6', 40, 240);
      Spawner.say('¡Vínculo! ' + group.length + ' movimientos a la vez', 2.6, true);
      if (state === 'choice') state = holdBy.length ? 'held' : 'playing';
      if ((G as any).Coop.active) (G as any).Coop.holdEnd();
    });
  }

  // ---------------- recogida ----------------

  const PICK_SFX: Record<string, string> = { xp: 'xp', xpBig: 'xp', coin: 'coin', heal: 'heal', bomb: 'break', magnet: 'confirm', ticket: 'shiny', ticket10: 'legend', item: 'legend' };

  /*
   * Cooperativo: la elección de objeto y las cartas de nivel no pueden taparse.
   * Si llega un objeto con las cartas abiertas, espera a que elijas carta; y si
   * las cartas llegan con la elección de objeto abierta, ésta vuelve a salir al
   * terminar. (Antes una cerraba la otra, nadie podía terminar de elegir y la
   * partida se quedaba parada para todos.)
   */
  let openItem: any = null;           // { cur, next, take } elección de objeto sin terminar
  const laterItems: any[] = [];         // objetos recogidos con las cartas de nivel abiertas
  function afterLevelUp() {
    if (state !== 'playing' && state !== 'held') return;
    if (openItem && !(G as any).UI.isOpen('scr-item')) {
      const o = openItem;
      if (o.mine) { state = 'choice'; if ((G as any).Coop.active) (G as any).Coop.holdStart(); }
      (G as any).RunUI.showItemChoice(o.cur, o.next, o.take);
      return;
    }
    if (laterItems.length) offerItem(laterItems.shift());
  }

  /** Has cogido un objeto: si no llevas ninguno te lo pones; si no, eliges. */
  function offerItem(id: any) {
    if (!pl || !Items.BY[id]) return;
    if (state === 'levelup' || (G as any).UI.isOpen('scr-levelup')) { laterItems.push(id); return; }
    let mine = false;            // esta elección es la que ha parado el juego
    const take = (got: any) => {
      openItem = null;
      if (got !== pl.item) {
        pl.equip(got);
        Spawner.say('¡Llevas ' + Items.BY[got].name + '!', 2.6, true);
        Progress.event('item', { id: got });
      }
      if (!mine) { afterLevelUp(); return; }
      if (state === 'choice') state = holdBy.length ? 'held' : 'playing';
      if ((G as any).Coop.active) (G as any).Coop.holdEnd();
      afterLevelUp();
    };
    if (!pl.item) { take(id); return; }
    if (pl.item === id) { Spawner.say('Ya llevas ' + Items.BY[id].name, 2, true); return; }
    // Se para el juego mientras eliges; en grupo, para todos (como con las
    // fusiones). Antes en grupo seguía y te pegaban mientras elegías.
    if (state === 'playing' || state === 'held') {
      mine = true;
      state = 'choice';
      if ((G as any).Coop.active) (G as any).Coop.holdStart();
    }
    openItem = { cur: pl.item, next: id, take, get mine() { return mine; } };
    (G as any).RunUI.showItemChoice(pl.item, id, take);
  }

  /** @param who  quien lo ha cogido (en cooperativo puede ser un compañero) */
  function onCollect(p: any, who: any = pl) {
    const mine = who === pl;
    if ((G as any).Coop.active && !(G as any).Coop.isHost) {
      // Copia de un objeto del anfitrión: el efecto lo decide él.
      if (mine) Audio.sfx(PICK_SFX[p.kind], undefined);
      return;
    }
    if ((G as any).Coop.active) (G as any).Coop.collected(p, who);
    if (mine || p.kind === 'bomb') Audio.sfx(PICK_SFX[p.kind], undefined);
    if (p.kind === 'xp' || p.kind === 'xpBig') {
      pendingLevels += pl.gainXp(p.value * ((G as any).Coop.active ? (G as any).Coop.xpFactor() : 1));
      return;
    }
    if (p.kind === 'coin') {
      pl.coins += p.value;
      FX.dmgText(who.x, who.y - who.bodyH - 6, '+' + p.value, '#ffd23f');
      return;
    }
    if (p.kind === 'item') {
      if (mine) offerItem(p.value);
      return;
    }
    if (p.kind === 'ticket' || p.kind === 'ticket10') {
      if (p.kind === 'ticket') pl.t1++; else pl.t10++;
      bankTickets();
      FX.dmgText(who.x, who.y - who.bodyH - 8, p.kind === 'ticket' ? '+1 ticket' : '¡Ticket ×10!', p.kind === 'ticket' ? '#ffd23f' : '#d9a6ff', true);
      FX.ring(who.x, who.y, 6, 50, p.kind === 'ticket' ? '#ffd23f' : '#c47bff', 0.4, 3);
      return;
    }
    if (p.kind === 'heal') {
      if (mine) pl.heal(pl.maxHp * 0.3);
      FX.ring(who.x, who.y, 6, 60, '#5fe08a', 0.4, 3);
      return;
    }
    if (p.kind === 'magnet') {
      Pickups.pullAll();
      FX.ring(who.x, who.y, 10, 420, '#ff9ed8', 0.6, 4);
      return;
    }
    if (p.kind === 'bomb') {
      if (U.dist2(who.x, who.y, pl.x, pl.y) < 500 * 500) Camera.kick(0.8);
      const R = Camera.outerRadius();
      FX.ring(who.x, who.y, 20, R, '#ff7b3d', 0.5, 6);
      for (const e of EnemyMgr.all()) {
        if (mine ? !Camera.sees(e.x, e.y, 0) : U.dist2(e.x, e.y, who.x, who.y) > R * R) continue;
        e.hurt(60 + pl.level * 14, '#ff7b3d', e.x - who.x, e.y - who.y, 160);
      }
    }
  }

  // ---------------- teclado ----------------

  function handleKeys() {
    if ((G as any).SettingsUI.isOpen) { if (Input.tap('escape')) (G as any).SettingsUI.close(); return; }
    // La Sentencia de Arceus: Espacio, Intro o Esc saltan la animación (si se puede).
    if (Judgment.cinematic && state === 'playing') {
      if (['space', 'enter', 'escape'].some(k => Input.tap(k))) Judgment.skip();
      return;
    }
    if (state === 'levelup') {
      for (let i = 0; i < 3; i++) {
        if (Input.tap('digit' + (i + 1)) || Input.tap('numpad' + (i + 1))) (G as any).RunUI.pick(i);
      }
      if (Input.tap('keyr')) (G as any).RunUI.reroll();
      return;
    }
    if ((G as any).UI.isOpen('scr-bond')) {
      for (let i = 0; i < 4; i++) {
        if (Input.tap('digit' + (i + 1)) || Input.tap('numpad' + (i + 1))) (G as any).RunUI.pickBond(i);
      }
      return;
    }
    if ((G as any).UI.isOpen('scr-item')) {
      for (let i = 0; i < 2; i++) {
        if (Input.tap('digit' + (i + 1)) || Input.tap('numpad' + (i + 1))) (document.querySelectorAll('#item-cards .card')[i] as HTMLElement).click();
      }
      return;
    }
    if (state === 'ui') {
      // Esc en una subpantalla del menú vuelve al menú.
      if (Input.tap('escape') && !(G as any).UI.isOpen('scr-profile') && ['scr-dex', 'scr-upgrades', 'scr-gacha', 'scr-friends', 'scr-rank', 'scr-goals'].some((G as any).UI.isOpen)
          && document.getElementById('pull-fx')!.classList.contains('hidden')) (G as any).MenuUI.open();
      return;
    }
    if (Input.tap('escape') || Input.tap('keyp')) { togglePause(); return; }
    if (state !== 'playing' || !pl) return;
    for (let i = 0; i < 4; i++) {
      if (Input.tap('digit' + (i + 1)) || Input.tap('numpad' + (i + 1))) pl.setActive(i);
    }
    if (Input.tap('keyq')) pl.cycle(-1);
    if (Input.tap('keye') || Input.tap('tab')) pl.cycle(1);
  }

  // ---------------- bucle ----------------

  let deathT = 0;

  let frameDt = 0, speedK = 1;
  let fpsShown = 60, fpsAcc = 0, fpsN = 0;
  // El siguiente fotograma se pide ANTES de nada: si algo falla a mitad, el
  // juego sigue (antes se quedaba congelado para siempre y había que recargar;
  // así se perdió una partida enorme al abrirse una grieta).
  // Si falla fotograma tras fotograma (el juego ya no avanza ni se ve), la
  // partida se da por terminada a los ~3 s y se guarda: tiempo, derrotados,
  // récords y ranking. Mejor eso que una pantalla negra y perderlo todo.
  let loopErrs = 0, errRun = 0;
  function loop(ts: number) {
    requestAnimationFrame(loop);
    try { frame(ts); errRun = 0; }
    catch (e) {
      if (loopErrs++ < 5) console.error('[Game] fallo en un fotograma:', e);
      Input.endFrame();
      if (++errRun === 180 && pl && state !== 'ui' && state !== 'over') {
        try {
          (G as any).UI.hideAll();
          quitRun();
          (G as any).UI.toast('El juego ha fallado: tu partida se ha guardado hasta aquí', 5000);
        } catch (e2) { console.error('[Game] no se pudo cerrar la partida:', e2); }
      }
    }
  }

  function frame(ts: number) {
    const real = (ts - last) / 1000 || 0;
    const dt = Math.min(1 / 30, real) * speedK;
    last = ts;
    if (state === 'playing') Settings.sample(real);
    fpsAcc += real; fpsN++;
    if (fpsAcc >= 0.5) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    frameDt = state === 'playing' ? dt : 0;

    Pad.poll(real);
    handleKeys();

    if (state === 'playing') update(dt);
    else if (pl && state !== 'ui') { FX.update(dt * 0.25); pl.anim.update(dt * 0.25); }
    // La red se atiende siempre (también con las cartas de nivel abiertas).
    if ((G as any).Coop.active && pl && state !== 'ui' && state !== 'over') (G as any).Coop.tick(dt);

    if (pl && state !== 'ui') render(); else Backdrop.render(ctx, w, h, dpr, dt);
    (G as any).UI.tick(dt);

    Input.endFrame();
  }

  function update(dt: number) {
    const coop = (G as any).Coop.active;
    if (flashT > 0) flashT -= dt;
    // La Sentencia de Arceus: mientras dura la animación, todo lo demás se para.
    if (Judgment.cinematic) {
      Judgment.cineTick(dt);
      pl.anim.update(dt);
      if (coop) for (const p of (G as any).Coop.puppets()) p.netUpdate(dt);
      (G as any).World.update(dt, Camera);
      FX.update(dt);
      Audio.music(Judgment.music);
      return;
    }
    // Tras caer, deja que se vea la animación de Faint antes del resumen.
    // (En la arena de la grieta no: allí caer sólo te echa de vuelta.)
    if (pl.dead && !coop && !Rift.inArena) {
      deathT += dt;
      pl.update(dt);
      EnemyMgr.update(dt * 0.3, pl);
      FX.update(dt);
      Camera.follow(pl.x, pl.y, dt);
      if (deathT > 1.3) { deathT = 0; endRun(true); }
      return;
    }
    time += dt;

    const b = Math.floor(time / 240);
    if (b !== biome && !Rift.inArena && !Judgment.active) {
      biome = b;
      (G as any).World.setBiome(b);
      Audio.sfx('biome', undefined);
      Spawner.say('— ' + (G as any).World.biomeName() + ' —', 3);
      FX.ring(pl.x, pl.y, 10, Camera.outerRadius(), '#ffffff', 0.7, 6);
    }

    pl.frozen = coop && ((G as any).UI.isOpen('scr-pause') || (G as any).UI.isOpen('scr-item'));
    pl.update(dt);
    if (coop) {
      for (const p of (G as any).Coop.puppets()) { p.netUpdate(dt); Combat.ghostOrbit(p, dt, time); }
      if (pl.dead) reviveTick(dt);
    }
    Camera.follow(pl.x, pl.y, dt);
    (G as any).World.update(dt, Camera);

    const all = everyone();
    if (!coop || (G as any).Coop.isHost) { Path.update(dt, all); Spawner.update(dt, all, time); }
    else Spawner.tickBanner(dt);
    EnemyMgr.update(dt, all);
    EnemyMgr.rebuildGrid();
    Combat.tick(dt, pl, time);
    Projectiles.update(dt, pl, EnemyMgr.all());
    Combat.resolve(dt, pl, time);
    Combat.updateFields(dt);
    Pickups.update(dt, all, onCollect);
    Hazards.update(dt);
    Interact.update(dt, pl);
    Rift.update(dt, pl, time);
    Judgment.update(dt, pl, time);
    Events.update(dt, all, time);
    Weather.update(dt, time, pl);
    FX.update(dt);

    Audio.music(Judgment.active ? Judgment.music : Rift.inArena ? 'rift' : EnemyMgr.bossAlive() ? 'boss' : BIOME_MUSIC[biome % BIOME_MUSIC.length]);
    if (!coop || (G as any).Coop.isHost) maybeLevelUp();
    if (pl.bonds > 0) offerBond(true);
    if ((G as any).Coop.isHost) checkAllDown(dt);
  }

  /** Caído en grupo: un compañero a tu lado te va levantando. */
  function reviveTick(dt: number) {
    const helper = (G as any).Coop.puppets().some((p: any) => !p.dead && U.dist2(p.x, p.y, pl.x, pl.y) < 56 * 56);
    pl.reviveT = helper ? (pl.reviveT || 0) + dt : Math.max(0, (pl.reviveT || 0) - dt * 0.5);
    if (pl.reviveT >= Player.REVIVE_TIME) pl.revive(0.5);
  }

  /** Anfitrión: si caéis todos, se acaba (tras ver caer al último). */
  function checkAllDown(dt: number) {
    if (Rift.inArena || !(G as any).Coop.players().every((p: any) => p.dead)) { deathT = 0; return; }
    deathT += dt;
    if (deathT > 1.6) {
      deathT = 0;
      (G as any).Coop.over(summary());
      endRun(true);
    }
  }

  // ---------------- dibujo ----------------

  function drawScene(cam: any, extra: any[]) {
    const t = performance.now() / 1000;
    (G as any).World.drawGround(ctx, cam);
    (G as any).World.drawLiquid(ctx, cam, t);
    Hazards.draw(ctx);
    Combat.drawGroundFields(ctx);
    Pickups.draw(ctx);

    // Todo lo que tiene "pies" se ordena por Y: objetos, enemigos, jugador.
    const items: any[] = [];
    // Los planos (manantiales, trampas) siempre debajo de todo lo demás.
    for (const p of (G as any).World.visibleProps(cam)) items.push({ y: p.flat ? p.y - 4000 : p.y, prop: p });
    for (const e of EnemyMgr.drawables(cam)) items.push({ y: e.y, ent: e });
    for (const e of extra) items.push({ y: e.y, ent: e });
    const rift = Rift.drawable();
    if (rift) items.push({ y: rift.y, ent: rift });
    const arceus = pl && state !== 'ui' ? Judgment.drawable() : null;
    if (arceus) items.push({ y: arceus.y, ent: arceus });
    if (pl && state !== 'ui') for (const d of Events.drawables()) items.push({ y: d.y, ent: d });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.prop) (G as any).World.drawProp(ctx, it.prop, t);
      else it.ent.draw(ctx);
    }
  }

  /*
   * Apuntar a mano: una mira donde está el ratón (y el cursor en cruz), o
   * delante de tu Pokémon si apuntas con el stick derecho.
   */
  function drawAimMark() {
    const on = state === 'playing' && pl && pl.manualAim && !Judgment.cinematic;
    const cur = on && !Pad.aim() ? 'crosshair' : '';
    if (cv.style.cursor !== cur) cv.style.cursor = cur;
    if (!on) return;
    let x: number, y: number;
    if (Pad.aim()) {
      const k = Camera.scale;
      x = (pl.x - Camera.left() + Math.cos(pl.aim) * 90) * k;
      y = (pl.y - LIFT * 0.5 - Camera.top() + Math.sin(pl.aim) * 90) * k;
    } else ({ x, y } = Input.mouse());
    ctx.save();
    ctx.lineCap = 'round';
    for (const [col, lw] of [['rgba(0,0,0,.65)', 4], ['#ffe9a8', 1.6]] as [string, number][]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 5, y + dy * 5); ctx.lineTo(x + dx * 14, y + dy * 14); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.scale(Camera.scale, Camera.scale);
    Camera.apply(ctx);
    drawScene(Camera, (G as any).Coop.active ? [pl, ...(G as any).Coop.puppets()] : [pl]);
    Projectiles.draw(ctx);
    Combat.drawAirFields(ctx);
    FX.draw(ctx);
    Judgment.drawAir(ctx);
    ctx.restore();

    Weather.draw(ctx, w, h, frameDt);
    (G as any).World.drawVignette(ctx, w, h);
    // Niebla: la viñeta se cierra un poco (sin tapar el centro).
    const fog = Weather.vignette;
    if (fog > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
      g.addColorStop(0, 'rgba(200,205,220,0)');
      g.addColorStop(1, `rgba(200,205,220,${0.45 * fog})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (!Judgment.cinematic) (G as any).HUD.draw(ctx, w, h, pl, st);
    Judgment.drawOverlay(ctx, w, h);
    Touch.draw(ctx);
    drawAimMark();
    if (Settings.get('fps')) {
      ctx.save();
      ctx.font = '700 11px Pixelify, monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = fpsShown >= 50 ? '#5fe08a' : fpsShown >= 30 ? '#ffd23f' : '#ff5f6d';
      ctx.fillText(fpsShown + ' FPS', w - 10, h - 8);
      ctx.restore();
    }
    if (flashT > 0) {
      ctx.save();
      // "Menos destellos": el fogonazo de pantalla se queda en un tercio.
      ctx.globalAlpha = Math.min(1, flashT / flashDur * 1.4) * (Settings.get('calm') ? 0.3 : 1);
      ctx.fillStyle = flashCol;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // ---------------- fondo de los menús ----------------

  /**
   * El mundo de verdad, con Pokémon salvajes paseando y la cámara a la deriva.
   * Así el menú enseña desde el primer segundo cómo se ve el juego.
   */
  const Backdrop = (() => {
    let wanderers: any[] = [], t = 0, ready = false, biomeT = 0, bi = 0;
    const CAST = [1, 4, 7, 25, 133, 52, 39, 35, 16, 43, 60, 69, 74, 92, 129, 147, 113, 143, 54, 79];

    function init() {
      (G as any).World.reset(4242);
      (G as any).World.setBiome(0, true);
      Camera.x = 0; Camera.y = 0;
      wanderers = CAST.map(dex => spawn(dex, true));
      ready = true;
    }

    function spawn(dex: any, anywhere: boolean) {
      const a = new Sprites.Animator(dex, 1);
      const r = Sprites.bodyRadius(dex);
      let x = 0, y = 0;
      for (let i = 0; i < 20; i++) {
        x = Camera.x + U.rand(-1, 1) * (anywhere ? Camera.w * 0.6 : Camera.w * 0.7);
        y = Camera.y + U.rand(-1, 1) * (anywhere ? Camera.h * 0.6 : Camera.h * 0.7);
        if ((G as any).World.isFree(x, y, r)) break;
      }
      return { dex, anim: a, x, y, r, vx: 0, vy: 0, t: 0, draw(ctx: CanvasRenderingContext2D) {
        Sprites.drawShadow(ctx, this.dex, this.x, this.y);
        this.anim.draw(ctx, this.x, this.y);
      } };
    }

    function step(dt: number) {
      t += dt;
      (G as any).World.update(dt, Camera);
      // Deriva lenta de la cámara.
      Camera.x += Math.cos(t * 0.05) * 14 * dt;
      Camera.y += Math.sin(t * 0.037) * 10 * dt;
      Camera.follow(Camera.x, Camera.y, dt);

      biomeT += dt;
      if (biomeT > 30) { biomeT = 0; bi = (bi + 1) % 3; (G as any).World.setBiome(bi); }

      for (const wd of wanderers) {
        wd.t -= dt;
        if (wd.t <= 0) {
          // Pasea, se para o "ataca" al aire de vez en cuando.
          wd.t = U.rand(1, 3.5);
          const r = Math.random();
          if (r < 0.55) {
            const a = Math.random() * 6.2832, s = U.rand(25, 55);
            wd.vx = Math.cos(a) * s; wd.vy = Math.sin(a) * s;
          } else {
            wd.vx = wd.vy = 0;
            if (r > 0.85) wd.anim.play(U.pick(['Attack', 'Shoot', 'Charge']));
          }
        }
        wd.x += wd.vx * dt; wd.y += wd.vy * dt;
        (G as any).World.collide(wd);
        const moving = Math.abs(wd.vx) + Math.abs(wd.vy) > 1;
        if (moving) wd.anim.dir = Sprites.dirFromAngle(Math.atan2(wd.vy, wd.vx));
        wd.anim.loop(moving ? 'Walk' : 'Idle');
        wd.anim.update(dt);
        // Si se queda fuera de cámara, reaparece dentro.
        if (!Camera.sees(wd.x, wd.y, 120)) Object.assign(wd, spawn(wd.dex, false));
      }
    }

    function render(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, dt: number) {
      if (!ready) return;
      step(dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.scale(Camera.scale, Camera.scale);
      Camera.apply(ctx);
      drawScene(Camera, wanderers);
      ctx.restore();
      (G as any).World.drawVignette(ctx, w, h);
    }

    /** Al volver de una run, recupera el mundo del menú. */
    function restore() {
      (G as any).World.reset(4242);
      (G as any).World.setBiome(bi, true);
      FX.clear(); Projectiles.clear(); Combat.clearFields(undefined); EnemyMgr.clear(); Pickups.clear();
      wanderers = CAST.map(dex => spawn(dex, true));
    }

    return { init, render, restore };
  })();

  return {
    init, startRun, everyone, levelXp, flash, offerBond,
    /** Para pruebas: salta el reloj de la run. */
    debugTime(t: number) { tampered = true; time = t; },
    /** Para grabar vídeos: cámara lenta (0,5 = mitad de velocidad). */
    debugSpeed(k: number) { if (k > 1) tampered = true; speedK = k; },
    togglePause,
    /** Abandona la partida en curso (p. ej. al cerrar sesión desde Ajustes). */
    quit() { if (state !== 'ui' && state !== 'over') quitRun(); },
    /** Para grabar vídeos: abre las cartas de subir de nivel. */
    debugLevelUp() { tampered = true; pl.level++; pendingLevels++; },
    toUI() { state = 'ui'; if (cv) cv.style.cursor = ''; Backdrop.restore(); },
    get state() { return state; }, get player() { return pl; }, st
  };
})();
register('Game', Game);

/* ============ Flow — transiciones entre pantallas ============ */
const Flow = {
  boot() {
    (G as any).UI.initChrome();
    (G as any).LoginUI.init(); (G as any).TestUI.init(); (G as any).MenuUI.init(); (G as any).GachaUI.init();
    (G as any).SocialUI.init(); (G as any).RankingUI.init(); (G as any).ModUI.init(); (G as any).GoalsUI.init(); (G as any).ProfileUI.init(); (G as any).SettingsUI.init(); (G as any).SupportUI.init(); (G as any).NewsUI.init(); Updater.init();
    // Tu nombre arriba a la derecha abre tu perfil.
    document.getElementById('user-pill')!.onclick = () => (G as any).GoalsUI.open('profile');
    Audio.music('village');     // suena tras el primer clic (lo exige el navegador)
    Game.init();
    // La base de datos (nube o local) recupera la sesión anterior.
    DB.ready().then(restored => {
      document.getElementById('boot')!.classList.add('hidden');
      // En otra tarea: crear el sonido para comprobarlo cuesta ~60 ms y no debe bloquear la carga.
      setTimeout(() => this.tapToStart(() => { if (restored) this.afterLogin(); else this.toLogin(); }), 0);
    });
  },
  /**
   * "Pulsa para empezar": los navegadores no dejan que una web suene hasta
   * que se toca algo. Con esta pantalla la música empieza en cuanto entras.
   * (Si el navegador ya deja sonar, no sale.)
   */
  tapToStart(then: () => void) {
    Audio.unlock();
    if (Audio.canPlay()) { then(); return; }
    const el = document.getElementById('tap-start')!;
    el.classList.remove('hidden');
    const go = (e: any) => {
      if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      Audio.unlock();
      el.classList.add('hidden');
      el.removeEventListener('click', go); removeEventListener('keydown', go, true);
      then();
    };
    el.addEventListener('click', go);
    addEventListener('keydown', go, true);
  },
  toLogin() { Audio.music('village'); (G as any).LoginUI.open(); },
  afterLogin() {
    Audio.music('village');
    if (!DB.save!.partner) (G as any).TestUI.start();
    else this.goMenu();
  },
  goMenu() {
    if (Game.state !== 'ui') Game.toUI();
    Audio.music('village');
    (G as any).MenuUI.open();
    if (!(G as any).LoginUI.updateNotices()) (G as any).LoginUI.offerRecovery();
  },
  /** Al cerrar el resumen: a la sala si sigues en una, si no al menú. */
  afterRun() {
    if ((G as any).Social.room) {
      if (Game.state !== 'ui') Game.toUI();
      Audio.music('village');
      if ((G as any).Social.room.isHost) (G as any).Social.setOpen(true);
      (G as any).LobbyUI.open();
    } else this.goMenu();
  },
  play() { Game.startRun(); },
  /** Empieza la partida en grupo (el anfitrión la manda a todos). */
  startCoop(cfg: any) {
    if (Game.state !== 'ui' || !(G as any).Social.room) return;
    (G as any).LobbyUI.close();
    Game.startRun(cfg);
  }
};
register('Flow', Flow);

export { Game, Flow };
export default Game;
