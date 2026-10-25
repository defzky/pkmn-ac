/* Save v4 ac meta (P18): mergeAc pure + recordRun bestOf safety. */
import { describe, it, expect, beforeAll } from 'vitest';

let AcSave: any;
beforeAll(async () => {
  (globalThis as any).G = (globalThis as any).G || {};
  ({ default: AcSave } = await import('../src/autochess/ac-save.ts'));
});

describe('mergeAc (pure)', () => {
  it('init + apply run: best/runs/wave update', () => {
    const ac = AcSave.mergeAc(undefined, { mode: 'td', wave: 7, score: 812 });
    expect(ac.bestScore).toBe(812);
    expect(ac.bestWave).toBe(7);
    expect(ac.runs).toBe(1);
    const ac2 = AcSave.mergeAc(ac, { mode: 'td', wave: 3, score: 400 });
    expect(ac2.bestScore).toBe(812); // tak turun
    expect(ac2.bestWave).toBe(7);
    expect(ac2.runs).toBe(2);
  });

  it('endless: bestEndless naik', () => {
    const ac = AcSave.mergeAc(undefined, { mode: 'td', wave: 14, score: 2000, endless: true });
    expect(ac.bestEndless).toBe(14);
  });

  it('daily: best per dateKey, cap 30 newest', () => {
    let ac = AcSave.initAc();
    ac = AcSave.mergeAc(ac, { mode: 'td', wave: 5, score: 500, dateKey: '2026-10-25', at: 100 });
    ac = AcSave.mergeAc(ac, { mode: 'td', wave: 8, score: 900, dateKey: '2026-10-25', at: 200 });
    expect(ac.daily['2026-10-25'].score).toBe(900); // naik
    ac = AcSave.mergeAc(ac, { mode: 'td', wave: 2, score: 100, dateKey: '2026-10-25', at: 300 });
    expect(ac.daily['2026-10-25'].score).toBe(900); // turun → tolak
    for (let i = 0; i < 35; i++) ac = AcSave.mergeAc(ac, { mode: 'td', wave: 1, score: 1, dateKey: 'k' + i, at: 1000 + i });
    expect(Object.keys(ac.daily).length).toBe(30);
    expect(ac.daily['k34']).toBeTruthy(); // terbaru tetap
  });
});

describe('recordRun / bestOf (DB save null-safe)', () => {
  it('tanpa save: hitung best lokal, tak crash', () => {
    const res = AcSave.recordRun({ mode: 'td', wave: 4, score: 300 });
    expect(res.best).toBe(300);
    expect(res.isBest).toBe(true);
    expect(AcSave.bestOf()).toBe(0); // tak persist tanpa save
  });
});
