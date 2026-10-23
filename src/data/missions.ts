/* ============ missions.ts — plantillas de misiones diarias y semanales ============
 * Cada día salen 3 diarias y cada semana 2 semanales (hora de España), con
 * objetivos y tipos sorteados. Se completan jugando y el premio se recoge en
 * la pantalla de Misiones. La lógica está en systems/progress.js.
 *
 *   ev      evento que la hace avanzar (ver G.Progress.event)
 *   match   (datos, parámetro) -> ¿cuenta este evento?
 *   value   datos -> cuánto vale; con mode 'max' se queda el mayor, con
 *           'add' (por defecto) se suma (1 si no hay value)
 *   param   'type': sortea un tipo Pokémon para la misión
 */
import { register } from '../core/registry';
import { U, TYPE_NAME } from '../core/util';

const T = (t: string) => (TYPE_NAME as Record<string, string>)[t];
const min = (d: { time: number }) => Math.floor(d.time / 60);

export interface MissionReward { t1?: number; t10?: number; coins?: number; }
export interface MissionDef {
  id: string; ev: string; param?: string; mode?: 'max' | 'add';
  goals: number[]; reward: MissionReward;
  match?(d: any, p?: any): boolean;
  value?(d: any): number;
  text(n: number, t?: string): string;
}

const daily: MissionDef[] = [
  { id: 'kill', ev: 'kill', goals: [300, 500, 800], reward: { t1: 2, coins: 150 },
    text: n => `Derrota a ${n} Pokémon` },
  { id: 'killType', ev: 'kill', param: 'type', goals: [30, 50, 80], reward: { t1: 2, coins: 200 },
    match: (d, t) => d.types.includes(t), text: (n, t) => `Derrota a ${n} Pokémon de tipo ${T(t!)}` },
  { id: 'survive', ev: 'runEnd', mode: 'max', value: min, goals: [5, 7, 9], reward: { t1: 3, coins: 200 },
    text: n => `Aguanta ${n} minutos en una run` },
  { id: 'level', ev: 'runEnd', mode: 'max', value: d => d.level, goals: [8, 12, 15], reward: { t1: 2, coins: 200 },
    text: n => `Llega al nivel ${n} en una run` },
  { id: 'boss', ev: 'kill', match: d => d.boss, goals: [1, 2], reward: { t1: 3, coins: 250 },
    text: n => (n === 1 ? 'Derrota a un jefe' : `Derrota a ${n} jefes`) },
  { id: 'chest', ev: 'chest', goals: [1, 2], reward: { t1: 2, coins: 200 },
    text: n => (n === 1 ? 'Abre un cofre con candado' : `Abre ${n} cofres con candado`) },
  { id: 'coins', ev: 'runEnd', value: d => d.coins, goals: [100, 200, 300], reward: { t1: 2, coins: 150 },
    text: n => `Recoge ${n} monedas en tus runs` },
  { id: 'playType', ev: 'runEnd', param: 'type', mode: 'max', value: min, goals: [3], reward: { t1: 3, coins: 200 },
    match: (d, t) => d.types.includes(t), text: (n, t) => `Aguanta ${n} minutos con un Pokémon de tipo ${T(t!)}` },
  { id: 'item', ev: 'item', goals: [1], reward: { t1: 2, coins: 150 },
    text: () => 'Encuentra un objeto equipable' },
  { id: 'evolve', ev: 'evolve', goals: [1], reward: { t1: 3, coins: 250 },
    text: () => 'Evoluciona un movimiento' }
];

const weekly: MissionDef[] = [
  { id: 'wkill', ev: 'kill', goals: [4000, 6000], reward: { t10: 1, coins: 800 },
    text: n => `Derrota a ${n.toLocaleString('es')} Pokémon` },
  { id: 'wrift', ev: 'rift', goals: [1, 2], reward: { t10: 1, coins: 1000 },
    text: n => (n === 1 ? 'Gana una pelea en una grieta' : `Gana ${n} peleas en grietas`) },
  { id: 'wboss', ev: 'kill', match: d => d.boss, goals: [4, 6], reward: { t10: 1, coins: 900 },
    text: n => `Derrota a ${n} jefes` },
  { id: 'wsurvive', ev: 'runEnd', mode: 'max', value: min, goals: [12, 15], reward: { t10: 1, coins: 1000 },
    text: n => `Aguanta ${n} minutos en una run` },
  { id: 'wevolve', ev: 'evolve', goals: [3, 5], reward: { t10: 1, coins: 900 },
    text: n => `Evoluciona ${n} movimientos` },
  { id: 'wdaily', ev: 'missionDone', match: d => d.daily, goals: [8, 12], reward: { t10: 1, coins: 800 },
    text: n => `Completa ${n} misiones diarias` }
];

const BY: Record<string, MissionDef> = {};
for (const m of daily.concat(weekly)) BY[m.id] = m;

const MissionDefs = { daily, weekly, BY };
register('MissionDefs', MissionDefs);
export { daily, weekly, BY };
export default MissionDefs;
