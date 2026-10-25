/**
 * tests/telemetry.test.ts — P23: batched anonymous analytics.
 * Spec: docs/QA-ANALYTICS.md §4 · flag: Settings.telemetry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Telemetry from '../src/core/telemetry';
import Settings from '../src/core/settings';

describe('telemetry (P23)', () => {
  const write = vi.fn();

  beforeEach(() => {
    (globalThis as any).G = { ...(globalThis as any).G, DB: { telemetryWrite: write } };
    Settings.set('telemetry', true);
    Telemetry.flushNow(); // drain leftovers from other tests in this file
    write.mockClear();
  });
  afterEach(() => {
    Telemetry.flushNow();
    Settings.set('telemetry', true);
  });

  it('auto-flush batch di 10 event (nama + params + t)', () => {
    for (let i = 0; i < 9; i++) Telemetry.track('shop_action', { action: 'buy', cost: i });
    expect(write).not.toHaveBeenCalled();
    Telemetry.track('shop_action', { action: 'reroll', cost: 1 });
    expect(write).toHaveBeenCalledTimes(1);
    const evs = write.mock.calls[0][0] as any[];
    expect(evs).toHaveLength(10);
    expect(evs[0]).toMatchObject({ name: 'shop_action', params: { action: 'buy', cost: 0 } });
    expect(typeof evs[0].t).toBe('number');
    expect(evs[9].params).toEqual({ action: 'reroll', cost: 1 });
  });

  it('flag privacidad off → 0 event masuk antrean', () => {
    Settings.set('telemetry', false);
    for (let i = 0; i < 12; i++) Telemetry.track('run_start', { mode: 'td' });
    expect(write).not.toHaveBeenCalled();
    Telemetry.flushNow();
    expect(write).not.toHaveBeenCalled(); // queue kosong = tidak pernah diisi
    Settings.set('telemetry', true);
  });

  it('flushNow dengan antrean kosong = no-op', () => {
    Telemetry.flushNow();
    expect(write).not.toHaveBeenCalled();
  });

  it('flushNow mengirim event tunggal (jalur run_end / timer)', () => {
    Telemetry.track('buff_pick', { buff_id: 'compound', wave: 3 });
    Telemetry.flushNow();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toHaveLength(1);
    expect(write.mock.calls[0][0][0]).toMatchObject({ name: 'buff_pick' });
  });

  it('tanpa G.DB → flush gagal diam-diam, antrean tetap bersih', () => {
    const G: any = (globalThis as any).G;
    const saved = G.DB;
    G.DB = undefined;
    Telemetry.track('daily_join', { dateKey: '2026-10-25' });
    expect(() => Telemetry.flushNow()).not.toThrow();
    Telemetry.track('run_start', { mode: 'daily', seed: true });
    Telemetry.flushNow(); // queue kosong → tidak ada panggilan ganda error
    G.DB = saved;
    expect(write).not.toHaveBeenCalled();
  });
});
