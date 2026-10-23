/**
 * team.ts — P16 glue: BoardState → synergy mods / UI list / battle units.
 *
 * Synergy counts UNIQUE dex among placed (on-board) units only — bench ignored.
 */
import { register } from '../core/registry';
import { Board, type BoardState } from './board';
import { mods, active, type SynergyMods } from './synergy';
import { makeUnit, type UnitBattle } from './unit';

/** merged synergy modifiers for current board placement */
export function teamMods(board: BoardState): SynergyMods {
  return mods(Board.placed(board));
}

/** UI list: [{def,count,tier}] for synergy panel */
export function teamActive(board: BoardState): ReturnType<typeof active> {
  return active(Board.placed(board));
}

/**
 * battle instances for placed units (synergy + items baked at make time).
 * bench units excluded — null stats (unknown dex) skipped.
 */
export function spawnUnits(board: BoardState, m: SynergyMods = teamMods(board)): UnitBattle[] {
  const out: UnitBattle[] = [];
  for (const bu of board.units) {
    if (bu.x === null || bu.y === null) continue;
    const u = makeUnit(bu, m);
    if (u) out.push(u);
  }
  return out;
}

const Team = { teamMods, teamActive, spawnUnits };
register('TeamAC', Team);
export { Team };
export default Team;
