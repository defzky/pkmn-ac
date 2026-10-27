/* ============ autochess/unitAI.ts — auto-battle tick ============
 * Units stand on cells; acquire nearest alive mob in range; attack on cooldown.
 * Mobs advance along lane cells (progress in cell units); leak handled by caller.
 * Damage = totalAtk × typeMult(move type vs mob types) via Types chart (soft).
 * Statuses: burn/poison DoT, slow (spd), stun (halt). Roles: armor, shield,
 * dodge, regen, death-slow (koffing). Boss abilities: rest, roar, barrier, disable.
 * Mobs fight back (Pilar 1): dual slot-war vs front row; TD lane aggro —
 * runner (branch 0) chips 50% while walking, bulwark (branch 1) stops & fights
 * (stop capped STOP_CAP s anti-stall). Unit death → alive=false; respawns at prep.
 */
import { register } from '../core/registry';
import Types from '../data/types';
import { Path } from './path';
import { UnitBattle, totalAtk, effCd, FLANK_ATK_MUL, TILE_ATK_MUL } from './unit';
import { SynergyMods, NONE } from './synergy';
import { cast as castSkill, MANA_PER_ATTACK } from './skills';

/** move kind → sprite anim (same table as dungeon player.ts cast) */
const KIND_ANIM: Record<string, string> = {
  melee: 'Attack', nova: 'Attack', dash: 'Attack',
  beam: 'Shoot', projectile: 'Shoot', boomerang: 'Shoot', chain: 'Shoot', cone: 'Shoot',
  aura: 'Charge', buff: 'Charge', orbit: 'Charge', mine: 'Charge', meteor: 'Charge', turret: 'Charge',
  trail: 'Walk',
};

export interface MobStatus {
  type: 'burn' | 'poison' | 'slow' | 'stun';
  /** seconds remaining */
  t: number;
  /** DoT damage per second (burn/poison) */
  dps?: number;
  /** slow amount 0..1 (slow) */
  mul?: number;
}

export interface MobBattle {
  dex: number;
  hp: number;
  /** max hp (regen / snorlax rest scale off this) */
  maxHp: number;
  atk: number;
  spd: number;      // cells/s
  types: string[];
  star: number;
  boss: boolean;
  /** ring branch: 0 = left, 1 = right (path-mode mobs; default branch 0) */
  branch?: number;
  /**
   * dual-board mode: fixed cell on the shared grid (y −1..−3 = enemy arena front..back).
   * When set the mob never walks/leaks — it stands and fights.
   */
  cx?: number;
  cy?: number;
  /** distance travelled along lane in cells (path-mode mobs only) */
  progress: number;
  alive: boolean;
  /** bounty in gold */
  bounty: number;
  // ---- roles / elites / bosses ----
  /** flat physical damage reduction 0..1 (geodude/graveler) */
  armor: number;
  /** absorb-before-hp pool (magnemite) */
  shield: number;
  /** dodge chance 0..1 (scyther) */
  dodge: number;
  /** hp regen fraction of maxHp per second (golbat) */
  regen: number;
  /** damage reduction 0..1 (mewtwo barrier) */
  barrier: number;
  stunImmune: boolean;
  slowImmune: boolean;
  kbImmune: boolean;
  /** snorlax rest */
  rest: boolean;
  rested: boolean;
  restT: number;
  /** gyarados roar */
  roar: boolean;
  roarCd: number;
  /** mewtwo disable tower */
  disable: boolean;
  disT: number;
  // ---- P25c: boss gimmick baru ----
  /** onix harden */
  harden?: boolean;
  hardened?: boolean;
  /** gyarados rain dance */
  raindance?: boolean;
  /** mewtwo future sight */
  future?: boolean;
  futureUsed?: boolean;
  statuses: MobStatus[];
  /** temporary armor shred (machop skill) */
  shred: number;
  shredT: number;
  /** mob→unit attack cooldown (s) */
  atkT: number;
  /** TD bulwark stop-&-fight seconds accumulated (0 = walking) */
  stopT: number;
  /** D2d wave affix tag (swarm/fast/armored/elemental) */
  affix?: string;
}

export interface TickResult {
  kills: number;
  gold: number;
  /** mobs that reached path end this tick (leaks) */
  leaks: MobBattle[];
}

/** Cell position of a mob given progress along laneCells. */
export function mobCell(m: MobBattle, cells: Array<{ x: number; y: number }>): { x: number; y: number } {
  const i = Math.min(cells.length - 1, Math.max(0, Math.floor(m.progress)));
  return cells[i];
}

/** Cells of a mob's branch; fallback = shared array (no branch set).
 * Dual-board mobs (cx/cy set) stand on a single fixed cell. */
export function cellsOf(m: MobBattle, fallback: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (typeof m.cx === 'number' && typeof m.cy === 'number') return [{ x: m.cx, y: m.cy }];
  return typeof m.branch === 'number' ? Path.branchCells(m.branch) : fallback;
}

/** Mob's current cell, honoring its branch. */
export function mobPos(m: MobBattle, fallback: Array<{ x: number; y: number }>): { x: number; y: number } {
  return mobCell(m, cellsOf(m, fallback));
}

/** Chebyshev-ish cell distance (max of dx,dy — grid-friendly). */
export function cellDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Distance across the dual-board gap: player rows y0..2, enemy rows y−1..−3.
 * Cross-team pairs compress the 3-row offset: front-to-front (py2 ↔ ey−1) = 0.
 * Same-team pairs (or both on enemy board) = plain cellDist.
 */
export function tdist(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  if (ay >= 0 && by < 0) return Math.max(dx, (2 - ay) + (-1 - by));
  if (ay < 0 && by >= 0) return Math.max(dx, (2 - by) + (-1 - ay));
  return cellDist(ax, ay, bx, by);
}

/** Damage multiplier: move type vs mob types, softened. Returns 1 if no move type. */
export function typeMult(moveType: string, mobTypes: string[]): number {
  if (!moveType || !mobTypes?.length) return 1;
  return Types.mult(moveType, mobTypes);
}

// ---------------- mob→unit combat (GDD common §1 — Pilar 1) ----------------

/** seconds between mob auto-attacks (GDD autochess §4) */
export const MOB_ATK_CD = 1.2;
/** TD bulwark: max continuous stop before resuming walk (anti-stall) */
export const STOP_CAP = 2;
/** TD runner lane: chip dps fraction while walking */
export const RUNNER_CHIP = 0.5;

/** Nearest alive unit within Chebyshev/tdist ≤ maxD. */
export function nearestUnit(x: number, y: number, units: UnitBattle[], maxD: number): UnitBattle | null {
  let best: UnitBattle | null = null, bestD = Infinity;
  for (const u of units) {
    if (!u.alive) continue;
    const d = tdist(x, y, u.x, u.y);
    if (d > maxD || d >= bestD) continue;
    bestD = d; best = u;
  }
  return best;
}

/** GDD autochess §2 slot-war pick: (A) adjacent combat tdist ≤ 1, frontmost → nearest;
 * (B) no adjacent → fallback tiers y2 → y1 → y0, nearest within tier, reach tdist ≤ 3. */
export function slotWarTarget(x: number, y: number, units: UnitBattle[]): UnitBattle | null {
  const alive = units.filter((u) => u.alive);
  let adj: UnitBattle | null = null, adjD = Infinity;
  for (const u of alive) {
    const d = tdist(x, y, u.x, u.y);
    if (d > 1) continue;
    if (!adj || u.y > adj.y || (u.y === adj.y && d < adjD)) { adj = u; adjD = d; }
  }
  if (adj) return adj;
  for (const ty of [2, 1, 0]) {
    let tier: UnitBattle | null = null, tierD = Infinity;
    for (const u of alive) {
      if (u.y !== ty) continue;
      const d = tdist(x, y, u.x, u.y);
      if (d <= 3 && d < tierD) { tier = u; tierD = d; }
    }
    if (tier) return tier;
  }
  return null;
}

/** Mob hits unit: typeMult(mob primary type vs unit types) on raw dmg. */
export function hitUnit(m: MobBattle, u: UnitBattle, dmg: number): void {
  let d = dmg * typeMult(m.types?.[0] || '', u.types || []);
  if (m.affix === 'elemental') d *= 1.25; // D2d Elemental: +% attack type power
  if (m.affix === 'enrage' && m.hp <= m.maxHp * 0.4) d *= 1.4; // P25 Enrage: low hp fury
  if (u.dmgReduce) d *= 1 - u.dmgReduce;  // D2e Frontline Bond
  if (d <= 0) return;
  u.hpCur -= d;
  if (u.hpCur <= 0) { u.hpCur = 0; u.alive = false; }
}

/** PREP start: everyone back on their feet, full HP (GDD common §1). */
export function respawnUnits(units: UnitBattle[]): void {
  for (const u of units) {
    u.alive = true;
    u.hpCur = u.hp;
    u.disabledT = 0;
    u.slowT = 0;
    u.roarT = 0;
  }
}

// ---------------- status helpers (exported for skills.ts) ----------------

export function addBurn(m: MobBattle, type: 'burn' | 'poison', t: number, dps: number): void {
  if (m.affix === 'elemental') return; // D2d: immune burn/poison
  (m.statuses = m.statuses || []).push({ type, t, dps });
}

export function addSlow(m: MobBattle, t: number, mul: number): void {
  if (m.slowImmune) return;
  (m.statuses = m.statuses || []).push({ type: 'slow', t, mul });
}

export function addStun(m: MobBattle, t: number): void {
  if (m.stunImmune) return;
  (m.statuses = m.statuses || []).push({ type: 'stun', t });
}

/** Apply damage: snorlax block (rest) → barrier reduce → shield absorb → hp. */
export function applyDamage(m: MobBattle, dmg: number): void {
  let d = dmg;
  if (m.restT > 0) d *= 0.4; // P25c Snorlax Block: selama rest damage ×0.4
  if (m.barrier > 0) d *= 1 - m.barrier;
  if (m.shield > 0) {
    const absorbed = Math.min(m.shield, d);
    m.shield -= absorbed;
    d -= absorbed;
  }
  m.hp -= d;
}

/** Koffing-style death explosion: slow nearby unit attack speed. */
function onMobDeath(m: MobBattle, units: UnitBattle[], cells: Array<{ x: number; y: number }>): void {
  if (m.dex !== 109) return; // koffing
  const c = mobCell(m, cells);
  for (const u of units) {
    if (!u.alive) continue;
    if (cellDist(c.x, c.y, u.x, u.y) <= 1) {
      u.slowT = 3; // AS −50% for 3s (handled in effCd)
    }
  }
}

/**
 * Advance battle by dt seconds.
 * mods: team synergy (atkSpd, rangeAdd, bountyMul, typeBoostMul, manaRegenMul, skillDmgMul,
 * burnOnHit, poisonOnHit, chainChance, regen).
 */
export function tick(
  units: UnitBattle[],
  mobs: MobBattle[],
  dt: number,
  mods: SynergyMods = NONE,
  cells: Array<{ x: number; y: number }> = Path.laneCells(),
): TickResult {
  let kills = 0, gold = 0;
  const leaks: MobBattle[] = [];

  // unit timers + grass regen
  for (const u of units) {
    if (!u.alive) {
      // D2e Second Wind: timed auto-respawn while dead
      if ((u.respawnT ?? 0) > 0) {
        u.respawnT = u.respawnT! - dt;
        if (u.respawnT <= 0) { u.respawnT = 0; u.alive = true; u.hpCur = u.hp; }
      }
      continue;
    }
    if (u.disabledT > 0) u.disabledT = Math.max(0, u.disabledT - dt);
    if (u.slowT > 0) u.slowT = Math.max(0, u.slowT - dt);
    if (u.roarT > 0) u.roarT = Math.max(0, u.roarT - dt);
    if (u.asBuffT > 0) u.asBuffT = Math.max(0, u.asBuffT - dt);
    if ((u.slipT ?? 0) > 0) u.slipT = Math.max(0, u.slipT! - dt); // D2e Slipstream
    const regen = (mods as any).regen || 0;
    if (regen > 0) u.hpCur = Math.min(u.hp, u.hpCur + u.hp * regen * dt);
  }

  // mobs: statuses, abilities, movement
  for (const m of mobs) {
    if (!m.alive) continue;

    // status tick
    let slowAmt = 0;
    let stunned = false;
    const sts = m.statuses || [];
    for (const s of sts) {
      s.t -= dt;
      if (s.type === 'burn' || s.type === 'poison') m.hp -= (s.dps || 0) * dt;
      else if (s.type === 'slow') slowAmt = Math.max(slowAmt, s.mul || 0);
      else if (s.type === 'stun') stunned = true;
    }
    m.statuses = sts.filter((s) => s.t > 0);
    if (m.shredT > 0) {
      m.shredT -= dt;
      if (m.shredT <= 0) m.shred = 0;
    }
    if (m.hp <= 0) {
      m.alive = false;
      kills++;
      gold += Math.round(m.bounty * ((mods as any).bountyMul ?? 1));
      onMobDeath(m, units, cellsOf(m, cells));
      continue;
    }

    // role regen (golbat)
    if (m.regen > 0) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * m.regen * dt);

    // P25c Onix Harden: HP ≤50% → armor +0.3 sekali
    if (m.harden && !m.hardened && m.hp <= m.maxHp * 0.5) {
      m.hardened = true;
      m.armor = Math.min(0.9, m.armor + 0.3);
    }

    // P25c Mewtwo Future Sight: HP ≤40% → disable semua unit 1.5s sekali
    if (m.future && !m.futureUsed && m.hp <= m.maxHp * 0.4) {
      m.futureUsed = true;
      (m as any).futurePulse = true; // UI: ring + sfx (ac-ui stepFx, reuse roarPulse)
      for (const u of units) {
        if (u.alive) u.disabledT = Math.max(u.disabledT, 1.5);
      }
    }

    // snorlax rest at 50%: stop 2s then heal 20%
    if (m.rest && !m.rested && m.hp <= m.maxHp * 0.5) {
      m.rested = true;
      m.restT = 2;
    }
    if (m.restT > 0) {
      m.restT -= dt;
      if (m.restT <= 0) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.2);
      continue; // halted while resting
    }

    if (stunned) continue;

    // mewtwo disable tower every 8s
    if (m.disable) {
      m.disT -= dt;
      if (m.disT <= 0) {
        m.disT = 8;
        const candidates = units.filter((u) => u.alive && u.disabledT <= 0);
        if (candidates.length) {
          const t = candidates[Math.floor(Math.random() * candidates.length)];
          t.disabledT = 3;
        }
      }
    }

    // gyarados roar every 10s: −30% AD to units within 3 cells, 3s
    if (m.roar) {
      m.roarCd -= dt;
      if (m.roarCd <= 0) {
        m.roarCd = 10;
        (m as any).roarPulse = true; // UI: ring + sfx at mob pos (ac-ui stepFx)
        if (m.raindance) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.05); // P25c: heal 5%
        const c = mobPos(m, cells);
        for (const u of units) {
          if (!u.alive) continue;
          if (tdist(u.x, u.y, c.x, c.y) <= 3) u.roarT = 3;
        }
      }
    }

    // move (slow status unless immune) — dual-board mobs (cx set) stand still
    if (m.cx == null) {
      // bulwark stop & fight: hold while stopT within cap (after cap walk on = anti-stall)
      const halting = (m.branch ?? 0) !== 0 && (m.stopT || 0) > 0 && (m.stopT || 0) < STOP_CAP;
      if (!halting) {
        const spdMul = m.slowImmune ? 1 : 1 - slowAmt;
        m.progress += m.spd * spdMul * dt;
        if (m.progress >= cellsOf(m, cells).length - 1) {
          m.alive = false;
          leaks.push(m);
        }
      }
    }
  }

  // ---- mobs fight back (Pilar 1): dual slot-war + TD lane aggro ----
  for (const m of mobs) {
    if (!m.alive) continue;
    if ((m.statuses || []).some((s) => s.type === 'stun')) continue;
    if (m.cx != null) {
      // slot war (autochess): frontline-first + tier fallback (GDD autochess §2)
      const t = slotWarTarget(m.cx, m.cy as number, units);
      if (t) {
        m.atkT = (m.atkT || 0) - dt;
        if (m.atkT <= 0) { hitUnit(m, t, m.atk); m.atkT = MOB_ATK_CD; }
      } else m.atkT = 0;
    } else {
      const c = mobPos(m, cells);
      const t = nearestUnit(c.x, c.y, units, 2);
      if ((m.branch ?? 0) === 0) {
        // runner lane (kiri): chip 50% DOT, never stops
        if (t) hitUnit(m, t, m.atk * RUNNER_CHIP * dt);
      } else if (t) {
        // bulwark lane (kanan): stop & fight (stopT accumulates, capped by movement gate)
        m.stopT = (m.stopT || 0) + dt;
        m.atkT = (m.atkT || 0) - dt;
        if (m.atkT <= 0) { hitUnit(m, t, m.atk); m.atkT = MOB_ATK_CD; }
      } else {
        m.stopT = 0; m.atkT = 0; // disengaged → reset so re-engage is instant
      }
    }
  }

  // units attack
  for (const u of units) {
    if (!u.alive) continue;
    if (u.disabledT > 0) continue;
    u.cd -= dt;
    if (u.cd > 0) continue;
    // frontmost alive mob in range: max progress (path) or front row (dual-board)
    // D2b: corner flank +1 range
    const range = u.range + ((mods as any).rangeAdd || 0) + (u.flankRange ? 1 : 0);
    let best: MobBattle | null = null, bestP = -Infinity, bestD = Infinity;
    for (const m of mobs) {
      if (!m.alive) continue;
      const c = mobPos(m, cells);
      const d = tdist(u.x, u.y, c.x, c.y);
      if (d > range) continue;
      // frontness: path mobs by progress; board mobs by row (cy −1 front → rank 2, −3 back → 0)
      const p = m.cx != null ? 3 + (m.cy as number) : m.progress;
      if (!best || p > bestP || (p === bestP && d < bestD)) {
        bestP = p; bestD = d; best = m;
      }
    }
    if (!best) { /* idle: keep cd at 0 so first in-range shot is instant */ u.cd = 0; continue; }

    // mana gain on attack (water synergy speeds this via manaRegenMul)
    u.mana = Math.min(100, (u.mana || 0) + MANA_PER_ATTACK * ((mods as any).manaRegenMul ?? 1));
    // UI flourish: one-shot move anim by kind on this unit's stage sprite (dungeon-style)
    const move = (u as any).move || '';
    const moveKind = move ? ((globalThis as any).G?.Moves?.BY_ID?.[move]?.kind ?? '') : '';
    u.swing = KIND_ANIM[moveKind] || 'Attack';
    // UI: face the target cell (sprite dir; dungeon attackFace equivalent)
    const ftc = mobPos(best, cells);
    u.face = Math.atan2(ftc.y - u.y, ftc.x - u.x);

    // dodge (scyther)
    if (best.dodge > 0 && Math.random() < best.dodge) {
      u.cd = effCd(u, mods);
      continue; // missed
    }

    // fire
    const moveType = move ? ((globalThis as any).G?.Moves?.BY_ID?.[move]?.type ?? '') : '';
    const tm = typeMult(moveType, best.types);
    // D2b flank: +10% ATK when standing on a lane-touching cell
    // AU-4: daily buff tile +10% ATK (flag set in enterCombat, auto only)
    let dmg = totalAtk(u) * tm * (u.flankAtk ? ((mods as any).flankAtkMul ?? FLANK_ATK_MUL) : 1)
      * (u.tileAtk ? TILE_ATK_MUL : 1);
    dmg *= (mods as any).typeBoostMul ?? 1;
    // armor (geodude): flat reduce of direct attack damage
    if (best.armor > 0) dmg *= 1 - best.armor;
    // machop shred: bonus damage taken
    if (best.shred > 0) dmg *= 1 + best.shred;
    applyDamage(best, dmg);
    u.cd = effCd(u, mods);
    // UI: impact point + damage for projectile/slash vfx + damage number
    // eff = type effectiveness → dungeon-style dmgText color (super yellow / weak gray)
    u.hit = { x: ftc.x, y: ftc.y, dmg, eff: tm > 1.15 ? 'super' : tm < 0.9 ? 'weak' : null };

    // synergy on-hit effects
    const burnOnHit = (mods as any).burnOnHit || 0;
    if (burnOnHit > 0 && Math.random() < burnOnHit) addBurn(best, 'burn', 2, dmg * 0.15);
    const poisonOnHit = (mods as any).poisonOnHit || 0;
    if (poisonOnHit > 0 && Math.random() < poisonOnHit) addBurn(best, 'poison', 3, dmg * 0.1);
    const chainChance = (mods as any).chainChance || 0;
    if (chainChance > 0 && Math.random() < chainChance && best.alive) {
      const bc = mobPos(best, cells);
      for (const m of mobs) {
        if (!m.alive || m === best) continue;
        const mc = mobPos(m, cells);
        if (cellDist(bc.x, bc.y, mc.x, mc.y) <= 2) { applyDamage(m, dmg * 0.5); break; }
      }
    }

    if (best.hp <= 0 && best.alive) {
      best.alive = false;
      kills++;
      gold += Math.round(best.bounty * ((mods as any).bountyMul ?? 1));
      onMobDeath(best, units, cellsOf(best, cells));
    }

    // skill cast on full mana
    if (u.mana >= 100) {
      u.mana = 0;
      // GDD ★3: max skill — skill damage ×2 at star 3
      const starSkillMul = u.star >= 3 ? 2 : 1;
      if (castSkill(u, mobs, best.alive ? best : null, cells, ((mods as any).skillDmgMul ?? 1) * starSkillMul)) {
        u.skillFx = true; // skill flourish (dungeon aura/buff/meteor → Charge)
      }
      // skill kills
      for (const m of mobs) {
        if (m.alive && m.hp <= 0) {
          m.alive = false;
          kills++;
          gold += Math.round(m.bounty * ((mods as any).bountyMul ?? 1));
          onMobDeath(m, units, cellsOf(m, cells));
        }
      }
    }
  }

  return { kills, gold, leaks };
}

/** True when all mobs dead or leaked. */
export function over(mobs: MobBattle[]): boolean {
  return mobs.every((m) => !m.alive);
}

const UnitAI = { tick, over, mobCell, cellsOf, mobPos, cellDist, tdist, typeMult, addBurn, addSlow, addStun, applyDamage, hitUnit, nearestUnit, slotWarTarget, respawnUnits, MOB_ATK_CD, STOP_CAP, RUNNER_CHIP };
register('UnitAI', UnitAI);
export { UnitAI };
export default UnitAI;
