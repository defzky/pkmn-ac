/* ============ autochess/rng.ts — seeded RNG untuk daily seed (GDD common §6) ============
 * Determinisme: compose wave + shop roll pakai seed PER-WAVE/per-batch dari
 * hash(baseSeed, tujuan, wave, n) — jumlah pemanggilan preview tak mempengaruhi
 * hasil startCombat (fresh rng tiap call → preview identik dengan wave asli).
 */
import { register } from '../core/registry';

/** mulberry32 — PRNG 32-bit deterministik. */
export function mulberry32(a: number): () => number {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a-ish hash parts → uint32 (stabil lintas session). */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Key harian lokal YYYY-MM-DD. */
export function dailyKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Seed dari tanggal (lokal) — semua run hari ini di device ini identik. */
export function seedFromDate(d: Date = new Date()): number {
  return hashSeed(dailyKey(d));
}

/** RNG komposisi wave: fresh tiap call (preview = asli). */
export function waveRnd(seed: number, wave: number): () => number {
  return mulberry32(hashSeed(seed, 'wave', wave));
}

/** RNG batch shop ke-n pada wave w: fresh tiap call. */
export function shopRnd(seed: number, wave: number, n: number): () => number {
  return mulberry32(hashSeed(seed, 'shop', wave, n));
}

const Rng = { mulberry32, hashSeed, dailyKey, seedFromDate, waveRnd, shopRnd };
register('AcRng', Rng);
export default Rng;
