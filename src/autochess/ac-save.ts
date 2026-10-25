/* ============ autochess/ac-save.ts — save v4 meta (P18): best score, daily best ============
 * Pure logic (mergeAc/initAc) testable tanpa DB; recordRun() mutate DB.save.ac + commit.
 * Guest tanpa save: tetap return hitungan (Best lokal sesi, tak persist).
 */
import { DB } from '../core/db';
import type { SaveAc } from '../types/save';

export interface AcRunRec {
  mode: 'td' | 'auto';
  wave: number;
  score: number;
  /** run berlanjut via Endless (bestEndless) */
  endless?: boolean;
  /** daily seed key YYYY-MM-DD (S2) — simpan best per seed */
  dateKey?: string;
  at?: number;
}

const num = (v: any): number => (Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0);

export function initAc(): SaveAc {
  return { bestScore: 0, bestWave: 0, bestEndless: 0, runs: 0, daily: {} };
}

/** Pure: normalize + apply one run onto ac meta. Daily cap 30 newest. */
export function mergeAc(ac: SaveAc | null | undefined, run: AcRunRec): SaveAc {
  const r: SaveAc = ac && typeof ac === 'object' ? ac : initAc();
  r.bestScore = Math.max(num(r.bestScore), num(run.score));
  r.bestWave = Math.max(num(r.bestWave), num(run.wave));
  if (run.endless) r.bestEndless = Math.max(num(r.bestEndless), num(run.wave));
  r.runs = num(r.runs) + 1;
  if (run.dateKey) {
    if (!r.daily || typeof r.daily !== 'object') r.daily = {};
    const prev = r.daily[run.dateKey];
    if (!prev || num(run.score) > num(prev.score)) {
      r.daily[run.dateKey] = { score: num(run.score), wave: num(run.wave), at: num(run.at) || Date.now() };
    }
    const keys = Object.keys(r.daily);
    if (keys.length > 30) {
      keys.sort((a, b) => (r.daily[b].at || 0) - (r.daily[a].at || 0));
      for (const k of keys.slice(30)) delete r.daily[k];
    }
  }
  return r;
}

/** Rekam run berakhir → save v4. Returns best/isBest untuk overlay. */
export function recordRun(run: AcRunRec): { best: number; isBest: boolean; runs: number } {
  const s: any = DB.save;
  const prevBest = s && s.ac && Number.isFinite(+s.ac.bestScore) ? +s.ac.bestScore : 0;
  const isBest = run.score > prevBest;
  if (!s) return { best: Math.max(prevBest, num(run.score)), isBest, runs: 0 };
  s.ac = mergeAc(s.ac, run);
  DB.commit();
  return { best: num(s.ac.bestScore), isBest, runs: num(s.ac.runs) };
}

/** Best score global atau per daily seed (untuk mode-select + overlay). */
export function bestOf(dateKey?: string): number {
  const s: any = DB.save;
  if (!s || !s.ac) return 0;
  if (dateKey && s.ac.daily && s.ac.daily[dateKey]) return num(s.ac.daily[dateKey].score);
  return num(s.ac.bestScore);
}

const AcSave = { initAc, mergeAc, recordRun, bestOf };
export default AcSave;
