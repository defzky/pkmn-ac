/* ============ enemies.ts — Pokémon salvajes de todas las generaciones ============
 *
 * Los tramos ya no son listas fijas: cada tramo recoge a todos los Pokémon
 * (de cualquier generación) cuyo total de stats base cae en su rango, y al
 * empezar una run se elige al azar un ELENCO de cada tramo. Así cada partida
 * trae Pokémon distintos sin tener que cargar cientos de sprites a la vez.
 *
 * Los stats de combate salen de la plantilla del tramo, ajustados con la
 * vida y la velocidad propias de cada Pokémon.
 *
 * behavior:
 *   chase    va directo a por ti
 *   charger  se para, apunta y embiste
 *   ranged   se mantiene a distancia y dispara
 *   tank     lento, mucha vida
 *   ---- con personalidad ----
 *   healer   cura a los de alrededor (Chansey, Blissey, Audino...)
 *   shielder pone escudos a sus compañeros (Shuckle, Bronzong, Mr. Mime...)
 *   summoner llama a su manada (Nidoqueen trae Nidoran, Vespiquen Combee...)
 *   bomber   se acerca y explota (Voltorb, Electrode, Koffing, Geodude...)
 *   beamer   rayo que avisa en el suelo antes de disparar
 *   zoner    zonas de daño bajo tus pies que estallan al poco
 *   fan      dispara en abanico
 *   jumper   salta y cae sobre ti (la caída se ve antes en el suelo)
 *   runner   corredor: muy rápido y frágil, va a donde vas a estar (corta el
 *            paso al que sólo huye). Uno por tramo: el más rápido del elenco.
 * Los ataques con aviso están en systems/hazards.js.
 *
 * Jefes: Pokémon fuertes NO legendarios (pseudolegendarios, Slaking...), al
 * azar por franjas de poder. Los legendarios sólo salen en las grietas
 * (systems/rift.js).
 */
import { register } from '../core/registry';
import { U } from '../core/util';

export interface TierDef {
  from: number; bst: [number, number];
  hp: number; spd: number; dmg: number; xp: number; cast: number;
}

export interface BossSlot {
  at: number; hp: number; dmg: number; xp: number; bst: [number, number];
}

export interface EnemyDef {
  dex: number; name: string; behavior: string;
  hp: number; spd: number; dmg: number; xp: number;
  shotDmg?: number; shotCd?: number; range?: number;
  minion?: number; fanN?: number; zones?: number; at?: number;
  [k: string]: any;
}

const TIERS: TierDef[] = [
  { from: 0,   bst: [180, 330], hp: 17,  spd: 56, dmg: 6,  xp: 3.5, cast: 7 },
  { from: 70,  bst: [300, 405], hp: 32,  spd: 62, dmg: 8.5, xp: 5,  cast: 7 },
  { from: 160, bst: [385, 465], hp: 52,  spd: 60, dmg: 11, xp: 8,  cast: 7 },
  { from: 260, bst: [445, 515], hp: 88,  spd: 70, dmg: 14, xp: 13, cast: 7 },
  { from: 380, bst: [495, 560], hp: 150, spd: 66, dmg: 22, xp: 24, cast: 7 },
  { from: 500, bst: [530, 620], hp: 250, spd: 72, dmg: 28, xp: 38, cast: 7 }
];

// Franjas de jefe: minuto en que salen, PV base y franja de BST.
const BOSS_SLOTS: BossSlot[] = [
  { at: 180, hp: 1400,  dmg: 34, xp: 220,  bst: [490, 545] },
  { at: 360, hp: 3200,  dmg: 42, xp: 420,  bst: [520, 580] },
  { at: 540, hp: 5600,  dmg: 48, xp: 680,  bst: [540, 600] },
  { at: 720, hp: 9000,  dmg: 56, xp: 1000, bst: [580, 700] },
  { at: 900, hp: 16000, dmg: 68, xp: 1800, bst: [600, 700] }
];

// Stats base aproximados a partir de los de juego (inverso de fetch_pokedex).
const baseHp = (p: any) => (p.hp - 70) / 0.45;
const baseSpd = (p: any) => (p.spd - 78) / 0.42;

const H = (d: number, s: number) => U.hash(d, 7, s);

// Personalidades fijas de algunos Pokémon.
const HEAL = new Set([35, 36, 113, 173, 183, 184, 242, 301, 440, 531, 594, 700, 764, 858]);
const SHIELD = new Set([95, 122, 208, 213, 227, 306, 375, 410, 411, 436, 437, 439, 476, 703]);
const BOMB = new Set([74, 75, 76, 100, 101, 102, 109, 110, 337, 338, 343, 344]);
// Invocador -> Pokémon de su manada.
const SUMMON: Record<number, number> = { 15: 13, 18: 16, 24: 23, 28: 27, 31: 29, 34: 32, 42: 41, 51: 50, 53: 52, 57: 56, 59: 58,
                 62: 60, 68: 66, 73: 72, 78: 77, 82: 81, 85: 84, 91: 90, 117: 116, 130: 129, 168: 167, 169: 41,
                 199: 79, 230: 116, 262: 261, 334: 333, 405: 403, 416: 415, 462: 81, 466: 239, 553: 551, 637: 636 };

function behaviorOf(p: any): string {
  const t: string[] = p.types, h = H(p.dex, 11);
  const has = (...xs: string[]) => xs.some(x => t.includes(x));
  if (HEAL.has(p.dex)) return 'healer';
  if (SHIELD.has(p.dex)) return 'shielder';
  if (BOMB.has(p.dex)) return 'bomber';
  if (SUMMON[p.dex] && (G as any).SPRITE_META[SUMMON[p.dex]]) return 'summoner';
  // Enjambres: algunos Bicho llaman a más de los suyos (desde el principio).
  if (has('bug') && h >= 0.6 && h < 0.78) return 'summoner';
  if (has('electric', 'psychic', 'dragon', 'ice') && h < 0.18) return 'beamer';
  if (has('fire', 'ground', 'poison') && h < 0.18) return 'zoner';
  if (has('water', 'grass', 'bug', 'fairy') && h >= 0.18 && h < 0.32) return 'fan';
  if (has('fighting', 'ground', 'normal', 'rock') && h >= 0.42 && h < 0.56) return 'jumper';
  if (has('psychic', 'electric', 'ghost', 'fairy') && h < 0.4) return 'ranged';
  if (has('fire', 'water', 'poison', 'ice') && h < 0.22) return 'ranged';
  if (has('fighting', 'normal', 'ground', 'rock', 'dragon', 'steel', 'dark') && h < 0.4) return 'charger';
  if (baseHp(p) > 95 && baseSpd(p) < 50) return 'tank';
  return 'chase';
}

/** Construye la definición de enemigo de un Pokémon para un tramo. */
function defFor(p: any, tier: TierDef, ti: number): EnemyDef {
  const hpK = U.clamp(baseHp(p) / 65, 0.7, 1.6);
  const spdK = U.clamp(0.75 + baseSpd(p) / 260, 0.75, 1.3);
  const behavior = behaviorOf(p);
  const d: EnemyDef = {
    dex: p.dex, name: p.name, behavior,
    hp: Math.round(tier.hp * hpK * (behavior === 'tank' ? 1.5 : 1)),
    spd: Math.round(tier.spd * spdK * (behavior === 'tank' ? 0.7 : 1)),
    dmg: Math.round(tier.dmg * (behavior === 'tank' ? 1.2 : 1)),
    xp: Math.max(3, Math.round(tier.xp * (behavior === 'tank' ? 1.3 : 1)))
  };
  // Los que pelean de lejos: daño del disparo, recarga y distancia.
  const CD: Record<string, number> = { ranged: 2.2 - ti * 0.15, fan: 3.2 - ti * 0.15, beamer: 4.4 - ti * 0.2, zoner: 4.6 - ti * 0.2,
               healer: 3.5, summoner: 7 };
  if (CD[behavior]) {
    d.shotDmg = Math.round(tier.dmg * (behavior === 'fan' ? 0.7 : 0.8));
    d.shotCd = +CD[behavior].toFixed(2);
    d.range = (behavior === 'beamer' ? 260 : behavior === 'healer' || behavior === 'summoner' ? 230 : 190) + ti * 6;
  }
  if (behavior === 'summoner') d.minion = SUMMON[p.dex];
  if (behavior === 'fan') d.fanN = ti < 2 ? 3 : 5;             // abanico más ancho más adelante
  if (behavior === 'zoner') d.zones = ti < 2 ? 1 : ti < 4 ? 2 : 3;   // más zonas más adelante
  if (behavior === 'bomber') { d.spd = Math.round(d.spd * 1.25); d.hp = Math.round(d.hp * 0.8); }
  return d;
}

/** Todos los candidatos de un tramo (sin legendarios ni míticos). */
function candidates(tier: TierDef): any[] {
  return (G as any).DEX.filter((p: any) => p.rarity < 5 && p.bst >= tier.bst[0] && p.bst <= tier.bst[1] && (G as any).SPRITE_META[p.dex]);
}

// ---------------- elenco de la run ----------------

const PLAIN = ['chase', 'charger', 'ranged', 'tank'];
const SUPPORT = ['healer', 'shielder', 'summoner'];

/**
 * Elenco de un tramo: siempre un "apoyo" (curandero, escudo o invocador)
 * y, desde el segundo tramo, también uno de los que atacan con aviso.
 * En el primero no hay más personalidades (para ir aprendiendo).
 */
function castFor(tier: TierDef): any[] {
  const all = candidates(tier);
  const kind = (p: any) => behaviorOf(p);
  // Primero el tipo de apoyo (a partes iguales) y luego el Pokémon.
  const kinds = SUPPORT.filter(k => all.some(p => kind(p) === k));
  const sk = kinds.length ? kinds[Math.floor(Math.random() * kinds.length)] : null;
  const pick = sk ? U.pickN(all.filter(p => kind(p) === sk), 1) : [];
  if (tier.from > 0) pick.push(...U.pickN(all.filter(p => !PLAIN.includes(kind(p)) && !SUPPORT.includes(kind(p))), 1));
  if (tier.from === 0) return pick.concat(U.pickN(all.filter(p => !pick.includes(p) && PLAIN.includes(kind(p))), tier.cast - pick.length));
  return pick.concat(U.pickN(all.filter(p => !pick.includes(p)), tier.cast - pick.length));
}

let cast: { from: number; list: EnemyDef[] }[] | null = null;      // [{ from, list: [def] }]
let bosses: EnemyDef[] | null = null;    // [def de jefe]

/** Sortea el elenco de una run nueva. */
function rollRun() {
  cast = TIERS.map((tier, ti) => ({
    from: tier.from,
    list: castFor(tier).map(p => defFor(p, tier, ti))
  }));
  for (const tier of cast) {
    const plain = tier.list.filter(d => d.behavior === 'chase' || d.behavior === 'charger' || d.behavior === 'tank');
    const r = plain.sort((a, b) => b.spd - a.spd)[0];
    if (r) { r.behavior = 'runner'; r.spd = Math.round(r.spd * 1.6); r.hp = Math.round(r.hp * 0.7); }
  }
  const used = new Set<number>();
  bosses = BOSS_SLOTS.map(slot => {
    const ok = (p: any) => !p.leg && (G as any).SPRITE_META[p.dex] && !used.has(p.dex);
    let pool = (G as any).DEX.filter((p: any) => ok(p) && p.bst >= slot.bst[0] && p.bst <= slot.bst[1]);
    if (!pool.length) pool = (G as any).DEX.filter((p: any) => ok(p) && p.bst >= 580);
    const p: any = U.pick(pool);
    used.add(p.dex);
    return {
      at: slot.at, dex: p.dex, name: p.name,
      // (Desde 2026-10-10 más duros: ×1,35 de vida y ×1,2 de daño.)
      hp: Math.round(slot.hp * 1.35), spd: Math.round(U.clamp(40 + baseSpd(p) * 0.5, 40, 100)),
      dmg: Math.round(slot.dmg * 1.2), xp: slot.xp,
      behavior: behaviorOf(p) === 'ranged' ? 'ranged' : (baseSpd(p) > 90 ? 'charger' : 'chase'),
      shotDmg: Math.round(slot.dmg * 0.55), shotCd: 1.1, range: 260
    };
  });
  return { cast, bosses };
}

// (El "tiempo extra" del minuto 60 se quitó al llegar la Sentencia de Arceus,
//  que acaba todas las partidas en el minuto 30: ver systems/judgment.js.)
function scale(t: number) {
  return { hp: 1 + t / 95, dmg: 1 + t / 420, spd: 1 + Math.min(0.35, t / 1400) };
}

/**
 * Los jefes ya traen su vida base creciente (1.400 ... 16.000), así que
 * escalan mucho más suave: con la curva normal el último llegaba a 168.000 PV.
 */
function bossScale(t: number) { return { hp: 1 + t / 600, dmg: 1 + t / 600, spd: 1 }; }

/** Tramo que toca en el segundo `t`. */
function tierAt(t: number) { let ti = 0; TIERS.forEach((tr, i) => { if (t >= tr.from) ti = i; }); return ti; }

const NO_HORDE = new Set(['bomber', 'healer', 'shielder', 'summoner']);
/** Tipos con bastantes Pokémon en el tramo actual para una horda (events.js). */
function hordeTypes(t: number): string[] {
  const all = candidates(TIERS[tierAt(t)]).filter((p: any) => !NO_HORDE.has(behaviorOf(p)));
  return Object.keys(U.TYPE_COLOR).filter(ty => all.filter((p: any) => p.types.includes(ty)).length >= 3);
}
/** Hasta 4 Pokémon de un tipo, con los stats del tramo actual. */
function hordeDefs(type: string, t: number): EnemyDef[] {
  const ti = tierAt(t);
  const pool = candidates(TIERS[ti]).filter((p: any) => p.types.includes(type) && !NO_HORDE.has(behaviorOf(p)));
  return U.pickN(pool, 4).map((p: any) => defFor(p, TIERS[ti], ti));
}

/** Bolsa de enemigos disponibles en el segundo `t`. */
function bagAt(t: number): EnemyDef[] {
  // Durante una horda de un tipo sólo salen los de ese tipo (systems/events.js).
  const horde = (G as any).Events && (G as any).Events.bag();
  if (horde) return horde;
  if (!cast) rollRun();
  const bag: EnemyDef[] = [];
  for (const tier of cast!) {
    if (t < tier.from) continue;
    const w = t - tier.from > 260 ? 3 : 10;       // los tramos viejos pierden peso
    for (const e of tier.list) for (let i = 0; i < w; i++) bag.push(e);
  }
  return bag.length ? bag : cast![0].list;
}

/** dex del elenco que aparecerán pronto (para precargar sprites). */
function upcomingDex(t: number, ahead = 60): number[] {
  if (!cast) rollRun();
  const out: number[] = [];
  for (const tier of cast!) if (tier.from <= t + ahead) for (const e of tier.list) out.push(e.dex);
  for (const b of bosses!) if (b.at! <= t + ahead) out.push(b.dex);
  return out;
}

const Enemies = {
  TIERS, BOSS_SLOTS, rollRun, scale, bossScale, bagAt, upcomingDex, candidates, hordeTypes, hordeDefs,
  get BOSSES() { if (!bosses) rollRun(); return bosses!; },
  get cast() { if (!cast) rollRun(); return cast!; }
};
register('Enemies', Enemies);
export { TIERS, BOSS_SLOTS, rollRun, scale, bossScale, bagAt, upcomingDex, candidates, hordeTypes, hordeDefs };
export default Enemies;
