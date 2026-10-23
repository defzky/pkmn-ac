/* ============ rift.ts — grietas y arena del legendario ============
 *
 * De vez en cuando (pocas veces por partida) se abre una GRIETA cerca de un
 * jugador. Dura GRIETA_TTL segundos; si entras, te lleva (con todo el grupo)
 * a una arena cerrada en el Mundo Distorsión, contra un Pokémon LEGENDARIO.
 *
 *   ganas    el legendario suelta tickets (el ×10, la mitad de las veces) y monedas, y cada uno se lleva un
 *            VÍNCULO (fusiona movimientos, ver Player.fuse); a los pocos
 *            segundos volvéis al mapa donde estabais y se elige la fusión
 *   pierdes  (caéis todos o se acaba el tiempo) volvéis sin premio, con algo
 *            de vida; la partida sigue
 *
 * Mientras dura la arena, los enemigos del mapa se guardan (EnemyMgr.stash) y
 * no aparecen nuevos; al volver todo sigue como estaba.
 *
 * Cooperativo: lo decide el anfitrión. Mensajes (ver coop.js):
 *   'rift' x y ttl · 'riftx' · 'arena' cfg · 'aw' (ganada) · 'al' (perdida)
 *   y del invitado al anfitrión 're' (he entrado en la grieta).
 */
import { register } from '../core/registry';
import { U } from '../core/util';
import { Camera } from '../core/camera';
import { Audio } from '../core/audio';
import { Sprites } from '../core/sprites';
import { Enemy } from '../entities/enemy';
import { FX } from '../entities/fx';
import { Pickups } from '../entities/pickup';
import { Projectiles } from '../entities/projectile';

const Rift = (() => {
  // (0.14 hasta el 11-10-2026: más grietas para que se vean los vínculos)
  // Menos azar (12-10-2026): cada vez que no sale, la siguiente es más
  // probable (20 %, 40 %, 60 %, 80 %, 100 %): como mucho 2,5 min sin grieta.
  // Desde 2 min antes de la Sentencia de Arceus (minuto 30) ya no se abren.
  const CHECK = 30, CHANCE = 0.2, TTL = 45;
  const ARENA_R = 11, ARENA_TIME = 120, FROM = 75;
  let rift: any = null;          // { x, y, ttl, t }
  let arena: any = null;         // { tx, ty, r, dex, shiny, x, y, back, biome, t, phase, endT, bossId }
  let checkT = CHECK, asked = false, downT = 0, misses = 0;
  const authority = () => !(G as any).Coop.active || (G as any).Coop.isHost;
  const TS = () => (G as any).Tiles.T * Sprites.PX;

  function reset() { rift = null; arena = null; checkT = CHECK; asked = false; downT = 0; misses = 0; }

  // ---------------- grieta en el mapa ----------------

  function update(dt: number, pl: any, time: number) {
    if (rift) {
      rift.t += dt;
      rift.ttl -= dt;
      if (rift.ttl <= 0) { rift = null; return; }
      if (!arena && !pl.dead && U.dist2(pl.x, pl.y, rift.x, rift.y - 10) < 30 * 30) enter();
    } else if (!arena && authority() && time > FROM && time < (G as any).Judgment.AT - 120) {
      checkT -= dt;
      if (checkT <= 0) {
        checkT = CHECK;
        if ((G as any).EnemyMgr.bossAlive()) return;           // con un jefe vivo no cuenta como intento
        if (Math.random() < CHANCE * (1 + misses)) { misses = 0; open(); }
        else misses++;
      }
    }
    if (arena) arenaTick(dt, pl);
  }

  function open() {
    const alive = (G as any).Game.everyone().filter((p: any) => !p.dead);
    const near = U.pick<any>(alive.length ? alive : [(G as any).Game.player]);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * 6.2832, d = U.rand(380, 560);
      const x = near.x + Math.cos(a) * d, y = near.y + Math.sin(a) * d * 0.85;
      if (!(G as any).World.isFree(x, y, 22)) continue;
      show(x, y, TTL);
      if ((G as any).Coop.isHost) (G as any).Coop.broadcast(['rift', Math.round(x), Math.round(y), TTL]);
      return;
    }
  }

  /** Aparece la grieta (también la que manda el anfitrión). */
  function show(x: number, y: number, ttl: number) {
    rift = { x, y, ttl, t: 0 };
    asked = false;
    // (El aviso grande lo dibuja hud.js mientras rift.t < 4,5 s.)
    Audio.sfx('rift', undefined);
    FX.ring(x, y, 6, 80, '#b48aff', 0.7, 5);
  }

  function enter() {
    if (asked) return;
    asked = true;
    if (authority()) start();
    else (G as any).Coop.toHost(['re']);
  }

  // ---------------- arena ----------------

  /** Quien manda: elige legendario y lugar, y avisa a todos. */
  let nextType: any = null;          // pruebas/vídeos: tipo de la próxima arena

  function start(forceType?: any) {
    if (arena) return;
    forceType = forceType || nextType; nextType = null;
    let pool = (G as any).DEX.filter((p: any) => p.leg && (G as any).SPRITE_META[p.dex]);
    if (forceType && pool.some((p: any) => p.types.includes(forceType))) pool = pool.filter((p: any) => p.types.includes(forceType));
    // Los legendarios que aún no has vencido salen 4 veces más (menos repetidos).
    const beaten = ((G as any).DB.save && (G as any).DB.save.legends) || {};
    const ws = pool.map((p: any) => (beaten[p.dex] ? 1 : 4));
    let r = Math.random() * ws.reduce((a: number, b: number) => a + b, 0), mi = 0;
    while (mi < pool.length - 1 && (r -= ws[mi]) > 0) mi++;
    const mon = pool[mi];
    const cfg = {
      tx: 5000 + Math.floor(Math.random() * 3000), ty: 5000 + Math.floor(Math.random() * 3000), r: ARENA_R,
      dex: mon.dex, shiny: Sprites.hasShiny(mon.dex) && Math.random() < 1 / 512,
      // La arena es la de uno de sus tipos, al azar.
      type: forceType || U.pick<any>(mon.types)
    };
    if ((G as any).Coop.isHost) (G as any).Coop.broadcast(['arena', cfg]);
    begin(cfg);
    spawnLegend();
  }

  /** En cada ordenador: viaje a la arena. */
  function begin(cfg: any) {
    const pl = (G as any).Game.player;
    const ts = TS();
    arena = Object.assign({}, cfg, {
      x: cfg.tx * ts + ts / 2, y: cfg.ty * ts + ts / 2,
      back: { x: pl.x, y: pl.y }, biome: (G as any).World.biome, t: 0, phase: 'fight', endT: 0, bossId: 0
    });
    rift = null; asked = false; downT = 0;
    if (authority()) (G as any).EnemyMgr.stash(); else (G as any).EnemyMgr.clearRemote();
    Projectiles.clear();
    (G as any).Combat.clearFields();
    (G as any).Hazards.clear();
    (G as any).World.setArena({ tx: cfg.tx, ty: cfg.ty, r: cfg.r, type: cfg.type });
    (G as any).World.setBiome((G as any).Tiles.arenaBiome(cfg.type), true);
    // Cada arena trae su clima (el volcán, sol; el glaciar, nieve...).
    const th = (G as any).Tiles.ARENA_THEMES[cfg.type];
    if (th && th.weather) (G as any).Weather.force(th.weather, ARENA_TIME + 15);
    // Todos al sur de la arena, en fila; el legendario aparece al norte.
    const ps = (G as any).Game.everyone();
    ps.forEach((p: any, i: number) => { p.x = arena.x + (i - (ps.length - 1) / 2) * 34; p.y = arena.y + ts * 3; });
    Camera.x = pl.x; Camera.y = pl.y;
    (G as any).Game.flash('#c9a6ff', 0.9);
    Audio.sfx('rift', undefined);
    (G as any).Spawner.say('Has entrado en la grieta…', 2.4, true);
  }

  function spawnLegend() {
    const mon = (G as any).DEX_BY[arena.dex];
    const t = (G as any).Game.st.time;
    const n = (G as any).Game.everyone().length;
    const ts = TS();
    const def = {
      dex: mon.dex, name: mon.name,
      hp: Math.round((3200 + t * 9) * (G as any).Coop.scaleHp(n) * (n > 1 ? 1.4 : 1)),
      spd: Math.round(U.clamp(48 + (mon.spd - 78) * 0.6, 48, 105)),
      dmg: Math.round(36 + t / 20), xp: Math.round(500 + t * 1.2),
      behavior: mon.types.some((x: any) => ['psychic', 'electric', 'ghost', 'fairy', 'fire', 'water', 'ice', 'dragon'].includes(x)) ? 'ranged' : 'charger',
      shotDmg: Math.round(18 + t / 40), shotCd: 0.9, range: 300
    };
    const e = new Enemy(def, arena.x, arena.y - ts * 3.5, { hp: 1, spd: 1, dmg: 1 }, true);
    e.legend = true;
    // Choca con las paredes y columnas como tú: si volara por encima de las
    // rocas, tus disparos no podrían alcanzarle (bug de Celebi).
    e.flying = false;
    if (arena.shiny) e.makeShiny();
    (G as any).EnemyMgr.add(e);
    arena.bossId = e.id;
    (G as any).Spawner.say('¡' + e.name + (e.shiny ? ' shiny' : '') + ' te esperaba en la grieta!', 3.2);
    Camera.kick(1.1);
    Audio.sfx('boss', undefined);
  }

  /** Nadie sale del círculo de la arena (por si algo empuja demasiado). */
  function keepInside() {
    const ts = TS(), max = (arena.r - 1.4) * ts;
    for (const e of (G as any).EnemyMgr.all()) {
      if (e.remote) continue;
      const dx = e.x - arena.x, dy = e.y - arena.y, d = Math.hypot(dx, dy);
      if (d > max) { e.x = arena.x + dx / d * max; e.y = arena.y + dy / d * max; }
    }
  }

  function arenaTick(dt: number, pl: any) {
    arena.t += dt;
    if (arena.phase === 'fight') {
      if (!authority()) return;
      keepInside();
      const boss = (G as any).EnemyMgr.get(arena.bossId);
      if (!boss || boss.dead) { (G as any).Coop.isHost && (G as any).Coop.broadcast(['aw']); won(); return; }
      const allDown = (G as any).Game.everyone().every((p: any) => p.dead);
      downT = allDown ? downT + dt : 0;
      if (downT > 1.4 || arena.t > ARENA_TIME) { (G as any).Coop.isHost && (G as any).Coop.broadcast(['al']); lost(); }
      return;
    }
    arena.endT -= dt;
    if (arena.endT <= 0) finish();
  }

  function won() {
    if (!arena || arena.phase !== 'fight') return;
    arena.phase = 'won'; arena.endT = 5;
    (G as any).Progress.event('rift', { type: arena.type });
    Pickups.pullAll();
    (G as any).Spawner.say('¡Has vencido a ' + (G as any).DEX_BY[arena.dex].name + '! Recoge el premio…', 3.4, true);
    Audio.sfx('legend', undefined);
    const pl = (G as any).Game.player;
    if (pl) {
      pl.bonds++;
      FX.dmgText(pl.x, pl.y - pl.bodyH - 10, '¡Vínculo!', '#ff8ad8', true);
      FX.ring(pl.x, pl.y, 8, 90, '#ff8ad8', 0.7, 5);
    }
  }

  function lost() {
    if (!arena || arena.phase !== 'fight') return;
    arena.phase = 'lost'; arena.endT = 1.2;
    (G as any).Spawner.say('La grieta os ha expulsado…', 2.6, true);
    Audio.sfx('back', undefined);
  }

  /** En cada ordenador: vuelta al mapa. */
  function finish() {
    const pl = (G as any).Game.player;
    const a = arena;
    arena = null;
    (G as any).World.setBiome(a.biome, true);
    (G as any).Weather.clear();
    // Invitado: no se borra nada. El anfitrión avisa de los de la arena que se
    // van y de los del mapa que vuelven; si el invitado terminaba su cuenta
    // atrás un poco más tarde (pasa casi siempre), borraba los que acababan de
    // volver y no se veían hasta que caían (sólo sus ataques).
    if (authority()) (G as any).EnemyMgr.restore();
    Projectiles.clear();
    (G as any).Combat.clearFields();
    (G as any).Hazards.clear();
    for (const p of (G as any).Game.everyone()) { p.x = a.back.x; p.y = a.back.y; }
    pl.x = a.back.x; pl.y = a.back.y;
    if (pl.dead) pl.revive(0.3);
    Camera.x = pl.x; Camera.y = pl.y;
    (G as any).Game.flash('#c9a6ff', 0.8);
    if (pl.bonds > 0) (G as any).Game.offerBond();
  }

  // ---------------- dibujo ----------------

  /** La grieta, para ordenarla por Y con el resto de la escena. */
  function drawable() {
    if (!rift) return null;
    return {
      y: rift.y,
      draw(ctx: any) {
        const P = Sprites.PX;
        const img = (G as any).Tiles.propSprite(0, 'rift', Math.floor(rift.t * 8) % 4);
        const w = img.width * P, h = img.height * P;
        const fadeIn = Math.min(1, rift.t * 2), fadeOut = Math.min(1, rift.ttl / 1.5);
        ctx.save();
        ctx.globalAlpha = 0.25 * fadeIn * fadeOut;
        ctx.fillStyle = '#7b3cff';
        ctx.beginPath(); ctx.ellipse(rift.x, rift.y, 34, 12, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = fadeIn * fadeOut;
        ctx.drawImage(img, Math.round(rift.x - w / 2), Math.round(rift.y - h + 4), w, h);
        ctx.restore();
        if (Math.random() < 0.3) FX.px(rift.x + U.rand(-14, 14), rift.y - U.rand(10, 80), '#d9c2ff', { vy: -40, life: 0.6 });
      }
    };
  }

  // ---------------- red ----------------

  function onEvent(ev: any) {
    switch (ev[0]) {
      case 'rift': show(ev[1], ev[2], ev[3]); break;
      case 'riftx': rift = null; break;
      case 'arena': begin(ev[1]); break;
      case 'aw': won(); break;
      case 'al': lost(); break;
    }
  }

  return {
    reset, update, drawable, onEvent, enterRequest() { if (!arena) start(); },
    get rift() { return rift; }, get arena() { return arena; },
    get inArena() { return !!arena; },
    get timeLeft() { return arena ? Math.max(0, ARENA_TIME - arena.t) : 0; },
    debugOpen() { open(); },
    /** Para pruebas: arena de un tipo ya. */
    debugArena(type: any) { start(type); },
    /** Para vídeos: la próxima grieta en la que entres será de este tipo. */
    debugNextType(type: any) { nextType = type; }
  };
})();
register('Rift', Rift);
export { Rift };
export default Rift;
