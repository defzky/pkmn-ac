import { U } from '../core/util';
import { Camera } from '../core/camera';
import { Sprites } from '../core/sprites';
import { Audio } from '../core/audio';
import { Enemy } from '../entities/enemy';
import { register } from '../core/registry';

/* ============ spawner.ts — oleadas, jefes y shinies ============
 * Los enemigos aparecen en un anillo justo fuera de la vista, así que nunca
 * se materializan en pantalla. Cada ~45 s hay una "marea": una avalancha
 * concentrada desde un lado concreto, para romper el ritmo.
 *
 * Cada enemigo tiene 1/4096 de salir shiny (como en los juegos clásicos).
 * Una run mata 1.500–4.000, así que sale uno cada 1–3 partidas.
 *
 * Cooperativo (sólo en el anfitrión): aparecen alrededor de un jugador vivo
 * al azar, fuera de la vista de TODOS, y hay más y más fuertes según cuántos
 * jugáis (ver G.Coop.scaleRate / scaleHp).
 */
const Spawner = (() => {
  // Tope de enemigos a la vez (antes 420: con tantos se ralentizaba). Cuando
  // se llega al tope, los que siguen saliendo son "élite" (más vida, daño y
  // experiencia), así la dificultad no baja.
  const CAP = 64, ELITE_FROM = 0.85;
  // Menos Pokémon pero más fuertes (la pantalla no se satura): salen ~24% de
  // los de antes, cada uno con más vida, daño y experiencia.
  const DENSITY = 0.24, DMG_K = 2.4, XP_K = 5.6;
  // La resistencia extra crece con la run: al principio ×3,3 y hasta ×5
  // hacia el minuto 6, cuando ya tienes ataques para tumbarlos.
  const hpK = (t: number) => 3.3 + Math.min(1.7, t / 210);
  const SHINY_RATE = 1 / 4096;
  let acc = 0, bossIdx = 0, surgeT = 32, announce: string | null = null, announceT = 0, preloadT = 0;
  let forceShiny = 0;           // para pruebas: los N próximos salen shiny

  function reset() {
    acc = 0; bossIdx = 0; surgeT = 32; announce = null; announceT = 0; preloadT = 0;
    (G as any).Enemies.rollRun();
    Sprites.preload((G as any).Enemies.upcomingDex(0, 80));
  }

  /** Enemigos por segundo según el minuto de la run. */
  function rate(t: number) {
    return (1.6 + t * 0.028 + Math.pow(t / 60, 1.6) * 0.5) * DENSITY;
  }

  function ringPoint(pl: any, angle: number) {
    const d = Camera.outerRadius() + U.rand(10, 70);
    return [pl.x + Math.cos(angle) * d, pl.y + Math.sin(angle) * d * 0.9];
  }

  let players: any[] = [];

  /** ¿Lo vería algún jugador? (para no aparecer delante de nadie) */
  function seenByAnyone(x: number, y: number) {
    const r = Camera.outerRadius() - 30;
    return players.some(o => U.dist2(o.x, o.y, x, y) < r * r);
  }

  /** Punto del anillo donde quepa: no dentro de paredes ni en el agua. */
  function freePoint(pl: any, angle: number, flying: boolean): [number, number] | null {
    for (let i = 0; i < 8; i++) {
      const a = angle + (i === 0 ? 0 : U.rand(-0.9, 0.9));
      const [x, y] = ringPoint(pl, a);
      if (players.length > 1 && seenByAnyone(x, y)) continue;
      if (flying || (G as any).World.isFree(x, y, 14)) return [x, y];
    }
    return null;
  }

  /** Jugador alrededor del que sale el siguiente enemigo. */
  function anchor() {
    const alive = players.filter(o => !o.dead);
    return alive.length ? U.pick(alive) : players[0];
  }

  function scaled(sc: any, k: number) { return k === 1 ? sc : Object.assign({}, sc, { hp: sc.hp * k }); }

  function isFlyer(def: any) { return Sprites.hovers(def.dex); }

  function rollShiny(dex: string | number) {
    if (!Sprites.hasShiny(dex as string)) return false;
    if (forceShiny > 0) { forceShiny--; return true; }
    return Math.random() < SHINY_RATE;
  }

  // Como mucho 3 curanderos, 3 escuderos y 3 invocadores vivos a la vez
  // (18-10-2026: juntos dejaban a la horda, y a los jefes, casi inmortales).
  // Si ya hay 3 de uno, sale otro del elenco.
  const SUPPORT_MAX = 3, SUPPORT = new Set(['healer', 'shielder', 'summoner']);
  /** Tipos de apoyo que ya tienen 3 vivos. */
  function supportFull() {
    const n: Record<string, number> = {}, full = new Set<string>();
    for (const e of (G as any).EnemyMgr.all()) {
      if (!e.dead && SUPPORT.has(e.behavior) && (n[e.behavior] = (n[e.behavior] || 0) + 1) >= SUPPORT_MAX) full.add(e.behavior);
    }
    return full;
  }

  function spawnOne(pl: any, t: number, angle?: number) {
    const bag = (G as any).Enemies.bagAt(t);
    let def: any = U.pick(bag);
    if (SUPPORT.has(def.behavior)) {
      const full = supportFull();
      if (full.has(def.behavior)) {
        const rest = bag.filter((d: any) => !full.has(d.behavior));
        if (!rest.length) return null;
        def = U.pick(rest);
      }
    }
    const pt = freePoint(pl, angle == null ? Math.random() * 6.2832 : angle, isFlyer(def));
    if (!pt) return null;
    const shiny = rollShiny(def.dex);
    const e = new Enemy(def, pt[0], pt[1], scaled((G as any).Enemies.scale(t), (G as any).Coop.scaleHp(players.length) * hpK(t)));
    e.dmg *= DMG_K; e.xp = Math.round(e.xp * XP_K);
    if ((G as any).EnemyMgr.count >= CAP * ELITE_FROM) { e.maxHp = e.hp = Math.round(e.maxHp * 1.6); e.dmg *= 1.25; e.xp = Math.round(e.xp * 1.6); }
    if (shiny) e.makeShiny();
    if ((G as any).Events.golden) e.makeGolden();
    (G as any).EnemyMgr.add(e);
    if (shiny) {
      say('¡Un ' + e.name + ' shiny anda cerca!', 3.4);
      Audio.sfx('shiny', undefined);
    }
    return e;
  }

  function spawnBoss(pl: any, t: number, b: any) {
    const [x, y] = ringPoint(pl, Math.random() * 6.2832);
    const e = new Enemy(b, x, y, scaled((G as any).Enemies.bossScale(t), (G as any).Coop.scaleHp(players.length) * (players.length > 1 ? 1.4 : 1)), true);
    if (rollShiny(b.dex)) e.makeShiny();
    (G as any).EnemyMgr.add(e);
    say('¡' + e.name + (e.shiny ? ' shiny' : '') + ' salvaje apareció!', 3.2);
    Camera.kick(1.1);
    Audio.sfx('boss', undefined);
    return e;
  }

  /** @param who  el jugador o la lista de jugadores (cooperativo) */
  function update(dt: number, who: any, t: number) {
    players = Array.isArray(who) ? who : [who];
    if (announceT > 0) announceT -= dt;
    // En la arena de la grieta no sale nada más (y el reloj de jefes espera).
    // En la Sentencia de Arceus, sólo sus legendarios (systems/judgment.js).
    if ((G as any).Rift.inArena || (G as any).Judgment.active) return;

    // Precarga lo que va a salir en el próximo minuto.
    preloadT -= dt;
    if (preloadT <= 0) { preloadT = 10; Sprites.preload((G as any).Enemies.upcomingDex(t, 60)); }

    // --- jefes ---
    const b = (G as any).Enemies.BOSSES[bossIdx];
    if (b && t >= b.at) { spawnBoss(anchor(), t, b); bossIdx++; }

    // Combate de jefe: las oleadas bajan al 25% y no hay mareas, para que el
    // jefe sea un momento propio y se le pueda apuntar entre la multitud.
    const bossFight = (G as any).EnemyMgr.bossAlive();

    // --- goteo normal ---
    if ((G as any).EnemyMgr.count < CAP) {
      acc += rate(t) * (G as any).Coop.scaleRate(players.length) * (bossFight ? 0.25 : 1) * dt;
      let n = Math.floor(acc);
      acc -= n;
      while (n-- > 0 && (G as any).EnemyMgr.count < CAP) spawnOne(anchor(), t);
    }

    // --- marea ---
    if (!bossFight) surgeT -= dt;
    if (surgeT <= 0) {
      surgeT = U.rand(38, 56);
      const base = Math.random() * 6.2832;
      const target = anchor();
      const n = Math.min(CAP - (G as any).EnemyMgr.count, Math.round((14 + Math.floor(t / 22)) * (G as any).Coop.scaleRate(players.length) * 0.4));
      for (let i = 0; i < n; i++) spawnOne(target, t, base + U.rand(-0.55, 0.55));
      say('¡Marea de Pokémon!', 2.2);
      Audio.sfx('surge', undefined);
    }
  }

  /** Unos cuantos de golpe desde un lado (al empezar una horda). */
  function burst(n: number) {
    const base = Math.random() * 6.2832, target = anchor() || (G as any).Game.player, t = (G as any).Game.st.time;
    for (let i = 0; i < n && (G as any).EnemyMgr.count < CAP + 10; i++) spawnOne(target, t, base + U.rand(-0.6, 0.6));
  }

  /**
   * Un rezagado vuelve a salir por delante del jugador (hacia donde corre),
   * fuera de la vista. Devuelve false si no hay sitio (entonces se quita).
   */
  function ahead(e: any, pl: any) {
    if (!players.length) players = [pl];
    const sp = Math.hypot(pl._vx || 0, pl._vy || 0);
    const a0 = sp > 20 ? Math.atan2(pl._vy, pl._vx) : Math.random() * 6.2832;
    const pt = freePoint(pl, a0 + U.rand(-0.9, 0.9), e.flying);
    if (!pt) return false;
    e.x = pt[0]; e.y = pt[1]; e.kx = e.ky = 0;
    e.phase = 'walk'; e.pt = 0; e.jump = null; e.jumpLift = 0;
    return true;
  }

  /** Aviso grande en pantalla (también lo usan el bioma y los shinies). */
  /** @param local  sólo en este ordenador (no se manda a los compañeros) */
  function say(text: string, secs = 2.6, local = false) {
    announce = text; announceT = secs;
    if ((G as any).Coop.isHost && !local) (G as any).Coop.say(text, secs);
  }

  function banner() { return announceT > 0 ? { text: announce, t: announceT } : null; }

  /** Invitado en cooperativo: sólo corre el reloj del aviso. */
  function tickBanner(dt: number) { if (announceT > 0) announceT -= dt; }

  return { reset, update, ahead, burst, tickBanner, banner, say, rate, SHINY_RATE, CAP,
           debugForceShiny(n = 1) { forceShiny = n; } };
})();
register('Spawner', Spawner);
export { Spawner };
export default Spawner;
