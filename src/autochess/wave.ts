/* ============ autochess/wave.ts — wave composition generator ============
 * 30 waves. count = 3+floor(wave/2) cap 16. Boss every 5th (single unit hp×8 atk×2).
 * Rarity bias by phase. Gen filter w1-9 gen≤3, w10+ all.
 * Mob stats = pokedex hp/atk/spd × waveMul.
 */
import { register } from '../core/registry';

export interface MobSpec {
  dex: number;
  star: number;
  hp: number;
  atk: number;
  spd: number;
  boss: boolean;
}

export interface WaveComp {
  wave: number;
  mobs: MobSpec[];
  boss: boolean;
}

export const MAX_WAVE = 30;
export const BOSS_EVERY = 5;

/** hp scale: 0.5 + wave*0.15 ; atk scale: 0.4 + wave*0.08 */
function waveMul(wave: number): { hp: number; atk: number } {
  return { hp: 0.5 + wave * 0.15, atk: 0.4 + wave * 0.08 };
}

/** Rarity band for a wave: [min,max]. */
function rarityBand(wave: number): [number, number] {
  if (wave <= 5) return [1, 1];
  if (wave <= 15) return [1, 2];
  return [2, 3];
}

/** Gen cap: w1-9 gen≤3, else all. */
function genCap(wave: number): number {
  return wave <= 9 ? 3 : 9;
}

/** Candidate dex list filtered by rarity band + gen cap + no legendary. */
function candidates(wave: number): any[] {
  const DEX: any[] = (G as any).DEX || [];
  const [rMin, rMax] = rarityBand(wave);
  const gMax = genCap(wave);
  return DEX.filter((e) =>
    e && !e.leg &&
    e.rarity >= rMin && e.rarity <= rMax &&
    e.gen <= gMax
  );
}

/** Compose wave. Deterministic given seed (U.rnd default = Math.random). */
export function compose(wave: number, rnd: () => number = Math.random): WaveComp {
  wave = Math.max(1, Math.min(MAX_WAVE, Math.floor(wave)));
  const mul = waveMul(wave);
  const pool = candidates(wave);
  const isBoss = wave % BOSS_EVERY === 0;
  const count = isBoss ? 1 : Math.min(16, 3 + Math.floor(wave / 2));
  const mobs: MobSpec[] = [];
  for (let i = 0; i < count; i++) {
    const e = pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
    if (!e) break;
    const star = isBoss ? 3 : wave <= 15 ? 1 : rnd() < 0.3 ? 2 : 1;
    const bossMul = isBoss ? { hp: 8, atk: 2 } : { hp: 1, atk: 1 };
    mobs.push({
      dex: e.dex,
      star,
      hp: Math.round(e.hp * mul.hp * bossMul.hp),
      atk: Math.round(e.atk * mul.atk * bossMul.atk),
      spd: Math.max(0.5, Math.min(3, (e.spd ?? 50) / 50)) * (isBoss ? 0.6 : 1),
      boss: isBoss,
    });
  }
  return { wave, mobs, boss: isBoss };
}

/** Win when final wave cleared. */
export function isFinal(wave: number): boolean {
  return wave >= MAX_WAVE;
}

const WaveDef = { compose, waveMul, rarityBand, genCap, MAX_WAVE, BOSS_EVERY, isFinal };
register('WaveDef', WaveDef);
export { WaveDef };
export default WaveDef;
