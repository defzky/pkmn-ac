/* ============ telemetry.ts — analítica local por lotes (P23) ============
 * Especificación: docs/QA-ANALYTICS.md §4 · privacidad: docs/LEGAL.md §4.
 *   - Cola local → flush automático a los 10 eventos o cada 30 s; run_end
 *     fuerza flushNow(). El envío real lo hace G.DB.telemetryWrite(evs).
 *   - Sin PII ni fingerprint: los params los rellena el llamador con enums y
 *     números fijos; este módulo no añade device info.
 *   - Feature flag: Settings.get('telemetry') === false → 0 eventos.
 *
 *   G.Telemetry.track('run_start', { mode: 'td' }) · G.Telemetry.flushNow()
 */
import { register } from './registry';
import Settings from './settings';

export interface TelemetryEvent {
  name: string;
  params: Record<string, unknown>;
  /** epoch ms — cuándo ocurrió (no cuándo se envió) */
  t: number;
}

const MAX_QUEUE = 10;
const FLUSH_MS = 30000;

let q: TelemetryEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  if (!q.length) return;
  const evs = q;
  q = [];
  if (timer != null) { clearTimeout(timer); timer = null; }
  try { ((globalThis as any).G?.DB)?.telemetryWrite?.(evs); } catch { /* nada */ }
}

function schedule(): void {
  if (timer != null || !q.length) return;
  timer = setTimeout(() => { timer = null; flush(); if (q.length) schedule(); }, FLUSH_MS);
}

/** Encola un evento. Silencioso si la flag de privacidad está apagada. */
function track(name: string, params: Record<string, unknown> = {}): void {
  if (Settings.get('telemetry') === false) return;
  q.push({ name, params, t: Date.now() });
  if (q.length >= MAX_QUEUE) flush();
  else schedule();
}

/** Envío inmediato (run_end). No-op con la cola vacía. */
function flushNow(): void { flush(); }

const Telemetry = { track, flushNow, flush };
register('Telemetry', Telemetry);
export default Telemetry;
export { track, flushNow };
