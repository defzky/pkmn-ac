/* ============ autochess/wave.ts — wave composition generator (GDD Bagian 2) ============
 * 20 waves. count = 3+floor(wave/2) cap 16. Boss every 5th (fixed named boss).
 * Early waves (1–9): Rattata/Zubat/Diglett/Geodude roles.
 * Mid/late (10–19): + Golbat/Graveler/Scyther/Haunter/Koffing/Magnemite elites.
 * Mob stats = pokedex hp/atk/spd × waveMul × role modifiers.
 */
import { register } from '../core/registry';

export interface MobSpec {
  dex: number;
  star: number;
  hp: number;
  atk: number;
  spd: number;
  boss: boolean;
  /** GDD: mid-lane mobs are elites (bounty 2 gold) */
  elite: boolean;
  // ---- roles / elites / bosses ----
  armor: number;       // flat physical dmg reduce 0..1
  shield: number;      // absorb-before-hp pool
  dodge: number;       // dodge chance 0..1
  regen: number;       // hp regen fraction/s
  barrier: number;     // boss dmg reduce 0..1
  stunImmune: boolean;
  slowImmune: boolean;
  kbImmune: boolean;
  rest: boolean;       // snorlax
  roar: boolean;       // gyarados
  disable: boolean;    // mewtwo
  /** TD lane side (D2b): 0 = left runner lane, 1 = right bulwark lane */
  side?: 0 | 1;
  /** D2d wave affix tag (swarm/fast/armored/elemental) */
  affix?: string;
}

export type Affix = 'swarm' | 'fast' | 'armored' | 'elemental';

export const AFFIXES: readonly Affix[] = ['swarm', 'fast', 'armored', 'elemental'];
export const AFFIX_LABEL: Record<Affix, string> = {
  swarm: 'Swarm', fast: 'Fast', armored: 'Armored', elemental: 'Elemental',
};

/** Rotating affix from wave 3, one per wave (GDD common §2a). */
export function affixFor(wave: number): Affix | null {
  if (wave < 3) return null;
  return AFFIXES[(wave - 3) % AFFIXES.length];
}

export interface WaveComp {
  wave: number;
  mobs: MobSpec[];
  boss: boolean;
  /** active affix for this wave (null before wave 3) */
  affix?: Affix | null;
}

export const MAX_WAVE = 10; // D2c: 5-min sprint (endless opt-in past this)
export const BOSS_EVERY = 5;

/** hp scale: 1 + wave*0.42 (10-wave sprint ≈ old wave-20 power); atk scale: 0.4 + wave*0.16 */
function waveMul(wave: number): { hp: number; atk: number } {
  return { hp: 1 + wave * 0.42, atk: 0.4 + wave * 0.16 };
}

/** Prep window per wave (GDD common §4): 25s first, 15s mid, 12s late. */
export function prepSeconds(wave: number): number {
  return wave <= 1 ? 25 : wave <= 7 ? 15 : 12;
}

/** Banked-gold interest at wave clear (cap +5). */
export function interest(gold: number): number {
  return Math.min(5, Math.floor(gold / 10));
}

/** Win-streak bonus (3+ streak → +2/+3/+4). */
export function streakBonus(streak: number): number {
  return streak >= 5 ? 4 : streak >= 4 ? 3 : streak >= 3 ? 2 : 0;
}

/** Early-wave role table (GDD musuh biasa). */
interface RoleDef {
  dex: number;
  hpMul?: number;
  atkMul?: number;
  spdMul?: number;
  armor?: number;
  shield?: number;
  dodge?: number;
  regen?: number;
  kbImmune?: boolean;
  slowImmune?: boolean;
}

const EARLY: RoleDef[] = [
  { dex: 19 },                              // Rattata basic
  { dex: 41, hpMul: 0.6 },                  // Zubat swarm (many, thin)
  { dex: 50, hpMul: 0.7, spdMul: 1.8 },     // Diglett fast runner
  { dex: 74, hpMul: 1.3, spdMul: 0.7, armor: 0.4 }, // Geodude armored
];

const MID: RoleDef[] = [
  { dex: 20, hpMul: 1.1, atkMul: 1.1 },     // Raticate elite basic
  { dex: 42, regen: 0.02 },                 // Golbat elite regen
  { dex: 75, hpMul: 1.5, spdMul: 0.7, armor: 0.5, kbImmune: true }, // Graveler heavy tank
  { dex: 123, hpMul: 0.9, spdMul: 1.5, dodge: 0.2 }, // Scyther elite runner dodge 20%
  { dex: 93, slowImmune: true },            // Haunter (Wild) phasing: slow-immune
  { dex: 109 },                             // Koffing debuffer (death-slow, handled in unitAI)
  { dex: 81, hpMul: 0.9, shield: 0.5 },     // Magnemite shielded (shield = 50% of hp)
];

/** Fixed boss table (GDD boss wave). */
interface BossDef {
  dex: number;
  hpMul: number;
  atkMul: number;
  spdMul: number;
  barrier?: number;
  stunImmune?: boolean;
  rest?: boolean;
  roar?: boolean;
  disable?: boolean;
}

const BOSSES: Record<number, BossDef> = {
  5:  { dex: 95,  hpMul: 8,  atkMul: 2,   spdMul: 0.5, stunImmune: true },            // Onix
  10: { dex: 143, hpMul: 10, atkMul: 2,   spdMul: 0.6, rest: true },                  // Snorlax
  15: { dex: 130, hpMul: 10, atkMul: 2.5, spdMul: 0.7, roar: true },                  // Gyarados
  20: { dex: 150, hpMul: 12, atkMul: 3,   spdMul: 1.5, barrier: 0.3, disable: true },// Mewtwo
};

function dexEntry(dex: number): any {
  return ((globalThis as any).G?.DEX_BY || {})[dex] || {};
}

/**
 * Global movement scale (cells/s). Pokedex spd/50 puts typical mob at
 * 1.0–1.8 c/s → crosses 8-cell ring in ~4–5s (too fast to react).
 * ×0.6 → typical 0.6–1.1 c/s, crossing ~7–13s; fast runners ~6s.
 */
const SPD_SCALE = 0.6;

/** Mob cells/s from pokedex spd + role/boss multiplier, clamped then scaled. */
function mobSpd(base: number, mul = 1): number {
  return Math.max(0.5, Math.min(3, base / 50)) * mul * SPD_SCALE;
}

function baseSpec(e: any): Omit<MobSpec, 'hp' | 'atk' | 'spd'> {
  return {
    dex: e.dex,
    star: 1,
    boss: false,
    elite: false,
    armor: 0, shield: 0, dodge: 0, regen: 0, barrier: 0,
    stunImmune: false, slowImmune: false, kbImmune: false,
    rest: false, roar: false, disable: false,
  };
}

/** Compose wave. Deterministic given seed (U.rnd default = Math.random).
 * No upper clamp — endless mode composes waves past MAX_WAVE (scaling keeps rising). */
/** Apply wave affix to a composed mob list (mutates specs; D2d). */
function applyAffix(mobs: MobSpec[], affix: Affix | null): MobSpec[] {
  if (!affix || !mobs.length) return mobs;
  for (const m of mobs) {
    m.affix = affix;
    if (affix === 'swarm') m.hp = Math.max(1, Math.round(m.hp * 0.7));
    else if (affix === 'fast') m.spd *= 1.5;
    else if (affix === 'armored') m.armor = Math.min(0.9, m.armor + 0.25);
    // elemental: burn/poison immune + ×1.25 attack power (unitAI hitUnit/addBurn)
  }
  if (affix === 'swarm') {
    const base = [...mobs];
    const target = Math.min(20, Math.ceil(mobs.length * 1.4));
    while (mobs.length < target) mobs.push({ ...base[mobs.length % base.length]! });
  }
  return mobs;
}

export function compose(wave: number, rnd: () => number = Math.random): WaveComp {
  wave = Math.max(1, Math.floor(wave));
  const mul = waveMul(wave);
  const affix = affixFor(wave);

  // boss wave → single named boss + one escort per lane (both lanes press)
  const bossDef = BOSSES[wave];
  if (bossDef) {
    const e = dexEntry(bossDef.dex);
    const hp = Math.round((e.hp ?? 100) * mul.hp * bossDef.hpMul);
    const escorts: MobSpec[] = ([0, 1] as const).map((side) => {
      const role = EARLY[wave % EARLY.length] || EARLY[0];
      const ee = dexEntry(role.dex);
      const ehp = Math.round((ee.hp ?? 100) * mul.hp * 0.5);
      return {
        ...baseSpec(ee),
        dex: role.dex,
        hp: ehp,
        atk: Math.round((ee.atk ?? 20) * mul.atk * 0.7),
        spd: mobSpd(ee.spd ?? 50, (role.spdMul ?? 1) * 1.2),
        side,
      };
    });
    return {
      wave,
      boss: true,
      affix,
      mobs: applyAffix([{
        ...baseSpec(e),
        dex: bossDef.dex,
        star: 3,
        hp,
        atk: Math.round((e.atk ?? 20) * mul.atk * bossDef.atkMul),
        spd: mobSpd(e.spd ?? 50, bossDef.spdMul),
        boss: true,
        barrier: bossDef.barrier ?? 0,
        stunImmune: !!bossDef.stunImmune,
        rest: !!bossDef.rest,
        roar: !!bossDef.roar,
        disable: !!bossDef.disable,
        side: 0,
      }, ...escorts], affix),
    };
  }

  const pool = wave <= 9 ? EARLY : MID;
  const count = Math.min(16, 3 + Math.floor(wave / 2));
  const mobs: MobSpec[] = [];
  for (let i = 0; i < count; i++) {
    const role = pool[Math.floor(rnd() * pool.length)];
    if (!role) break;
    const e = dexEntry(role.dex);
    const hp = Math.round((e.hp ?? 100) * mul.hp * (role.hpMul ?? 1));
    const spd = mobSpd(e.spd ?? 50, role.spdMul ?? 1);
    mobs.push({
      ...baseSpec(e),
      dex: role.dex,
      star: wave >= 15 && rnd() < 0.3 ? 2 : 1,
      hp,
      atk: Math.round((e.atk ?? 20) * mul.atk * (role.atkMul ?? 1)),
        spd,
        elite: wave >= 10, // GDD: wave 10+ mobs are elites (bounty 2)
        armor: role.armor ?? 0,
      shield: role.shield ? Math.round(hp * role.shield) : 0,
      dodge: role.dodge ?? 0,
      regen: role.regen ?? 0,
      kbImmune: !!role.kbImmune,
      slowImmune: !!role.slowImmune,
      // D2b side: odd waves press LEFT (80%), even press RIGHT (80%)
      side: (wave % 2 === 1 ? (i % 5 === 4 ? 1 : 0) : (i % 5 === 0 ? 0 : 1)) as 0 | 1,
    });
  }
  return { wave, mobs: applyAffix(mobs, affix), boss: false, affix };
}

/** Win when final wave cleared. */
export function isFinal(wave: number): boolean {
  return wave >= MAX_WAVE;
}

const WaveDef = { compose, waveMul, MAX_WAVE, BOSS_EVERY, isFinal, prepSeconds, interest, streakBonus, affixFor, AFFIX_LABEL, BOSSES, EARLY, MID };
register('WaveDef', WaveDef);
export { WaveDef };
export default WaveDef;
