# PokéAutochess — Plan TD/Autochess Rework

> Fork of `pkm-autochess` (clone of `pkmonsrvr`, commit `cb3c2b4`).
> Survivor-roguelike → **autochess tower defence**.
> Phases P11–P20. Existing P0–P10 (full TS strict + offline PWA) preserved as base.

---

## 1. Concept delta

```
lama:  kontrol 1 partner, jalan, wave kejar, hold-out time
baru:  taruh unit di grid → auto-battle wave → gold → shop → repeat
```

Run = N wave. Kalah = base HP 0. Menang = boss wave N. Ranking = **waves survived** (bukan time).

### Core loop

```
PREP (15s)        BATTLE              REWARD
shop 5 slot   →   units auto-kill  →  gold += kills+wave
bench 9       →   mobs march path  →  augment pick (every 5)
drag place    →   base HP -= leak  →  star merge check
reroll 2g     →   boss every 5     →  next wave timer
```

---

## 2. Reuse map

| Sistem lama | Jadi |
|---|---|
| `Gacha.pool/pull` | Shop pool — beli unit dgn gold; pity → shop refresh odds |
| `Types` chart | Synergy — hitung type di board → buff team |
| `Upgrades` | Tech-tree antar run (persist) + star system (3 copy → 2★, 3×2★ → 3★) |
| `Spawner` + `Events` | Wave director — fixed path TD, boss tiap 5 wave |
| `Combat`/`Moves`/`Projectiles` | Unit auto-battle: acquire nearest, attack, pakai move asli |
| `World`/`Tiles` | Board grid + lane path tile khusus |
| `Enemy`/`Pathing` | Wave mobs jalan path, bukan AI kejar player |
| `LevelUp` cards | Augment antar wave (selera roguelike dipertahankan) |
| `Items` | Di-equip ke unit |
| `DB` save v4 | roster + stars + board layout + gold + wave |
| `Ranking` | metric: waves survived |
| Missions/ach | mostly keep, tambah target wave |
| Coop | P2: co-op board 1 map, gold terpisah |

**Yang MATI:** joystick/movement in-run, `player.hurt`/revive, thief event, magnet radius, anti-cheat `debugTime` lama (ganti: wave count + gold sanity di firestore.rules).

---

## 3. Architecture (module plan)

```
src/autochess/         # semua baru
  board.ts             # grid cells, place/remove, occupancy, bench
  path.ts              # lane waypoints per arena
  unit.ts              # UnitBoard: pos, star, hp, atk timer, target
  unitAI.ts            # acquire → range check → cast move → cooldown
  wave.ts              # WaveDirector: composition, spawn timing, boss
  shop.ts              # pool roll, buy/sell/reroll, bench(9), merge star
  synergy.ts           # count types → modifiers (atkMul/defMul/spdMul)
  gold.ts              # economy: kill reward, round income, interest
  base.ts              # base HP, leak penalty
  combat.ts            # battle tick loop (glue unit/enemy/projectile)
  save.ts              # save v4 shape + migrate v3→v4
```

Modified (not replaced): `db.ts` (v4+migrate), `game.ts` (state machine prep→battle→reward), `ui/*` (board screen, shop bar, bench bar), `ranking.ts` (waves metric), `firestore.rules` (sanity gold/wave).

Deleted later: `player.ts` movement path (fields pindah ke `unit.ts`), joystick/touch stick, `spawner` free-AI mode.

---

## 4. Data spec (P11 details)

### Board
- Grid 8×5 cells (enemy path row 3 runs through it). Cell 96px.
- Bench: 9 slots below board.
- Max units on board: `min(8, 1 + floor(playerLevel/2))` — level via XP items / augments.

### Path
- Single lane, waypoints `[{x:0,y:2},{x:7,y:2}]` per arena; rift arena: serpentine 3-leg.
- Mobs walk waypoint list at `spd` cell/s; leak when x > board.w.

### Wave table
- 30 waves. Composition = f(wave#):
  - count = `3 + floor(wave/2)` mobs (cap 16)
  - rarity bias: w1-5 mostly ★1, w6-15 ★1-2, w16+ ★2-3
  - every 5th = boss (single unit, hp ×8, atk ×2, size big)
- Gen filter: w1-9 gen≤3, w10+ all gens.
- Mob stats = pokedex `hp/atk/spd` × waveMul (hp: 0.5+wave*0.15, atk: 0.4+wave*0.08).

### Unit board stats (dari pokedex)
```
hp  = dex.hp * starMul(star)        starMul: 1★=1, 2★=1.8, 3★=3.2
atk = dex.atk * starMul
spd = clamp(dex.spd/50, 0.5, 3)     cell/s movement (unit melee chase)
range = dex.pa > dex.sa ? 1 : 2     phys → melee 1 cell, spec → ranged 2 cell
atkCd = 1.2 - dex.spd/400           seconds (clamp 0.4..1.6)
move  = strongest of first 2 dex moves
```

### Synergy (threshold by distinct units of type on board)
| Type group | T2 | T4 | Effect |
|---|---|---|---|
| fire/water/grass | +10% atk | +25% atk | type-boosted moves ×1.3 (seperti weather lama) |
| electric/ice/rock | +8% atkSpd | +20% atkSpd | crit +10% |
| normal/psychic/fairy | +15% baseHP | +35% baseHP | lifesteal 5% |
| fighting/ground/steel | +10% dmgReduce | +25% dmgReduce | thorns 20% |
| dark/ghost/dragon | +20% bounty | +50% bounty | gold per kill |
| flying/bug/poison | +15% range | +30% range | slows hit 20% |

Thresholds count unique dex (bukan copy). Cap 6 type max aktif (top-6 dari synergy graph).

### Economy
- Start gold 20. Round income: `5 + floor(wave/3)` + interest `floor(gold/10)` (cap 5).
- Kill bounty: `1 + rarity` (boss ×10). Leak: base HP −5 (boss −20).
- Shop: 5 slot, refresh 2g. Unit cost = `rarity × 2` (★1=2 … ★5=10).
- Sell: ceil(cost/2). Bench 9, board max 8.

### Star merge
- 3 copy identical (dex+star) on bench/board → auto-merge to next star.
- 3★ cap. Merge picks lowest star first.

---

## 5. Phases

| # | Isi | Test |
|---|---|---|
| **P11** | Data spec: `path.ts`, `wave.ts` defs, `synergy.ts`, unit-stat derive + data tests | 966 unit punya stat board valid; synergy graph; wave comp legal |
| **P12** | `board.ts` grid place/remove/occupancy/bench + merge star check | grid unit test: place/overlap/bench full/merge |
| **P13** | `unit.ts` + `unitAI.ts` + `base.ts`: auto-attack pakai Moves, projectile reuse, target nearest, death; base HP leak | battle test: 1 unit vs 1 mob resolve, kill → gold |
| **P14** | `wave.ts` director: spawn along path, boss flag, end detect | wave test: comp valid, boss, win/lose |
| **P15** | `shop.ts`: pool roll odds, buy/sell/reroll, merge star | shop test: pool, merge, gold clamp |
| **P16** | `synergy.ts` engine: counts → mods applied to unit stat | synergy test: threshold hit → mul |
| **P17** | UI: board canvas (Tiles render reuse), drag-place, bench bar, shop bar (5+reroll), wave timer, gold HUD, base HP | manual + placement click test |
| **P18** | Save v4: `roster{dex:count,star}`, `board[{dex,x,y}]`, `gold`, `wave`; migrate v3→v4 (partner→starter unit, coins→gold 1:1); ranking waves; rules sanity | db migrate test; ranking metric |
| **P19** | Augment antar wave (adapt levelup), items equip unit, pity gacha tetap buka roster | augment pilih → buff applied |
| **P20** | Coop TD (2 board 1 base), balance sim 50 wave, debug API (`debugWave(n)`, `debugGold(n)`) | full sim 1000 run tak crash |

---

## 6. Risk

- `game.ts` (1033 baris) ganti state machine `prep→battle→reward→prep` — paling berat.
- `player.ts` (642) hancur sebagai karakter; field battle (atk/cdMul/moves) pindah ke `unit.ts`.
- Ranking/coop lama invalid — reset leaderboard opsional di deploy.
- Gacha monetisasi tetap: pull = roster/star fodder.

---

## 7. Commands

```
npm run dev          # :5173
npm test             # 59 baseline + phase tests
npm run build        # dev bundle
npm run build:prod   # obfuscated prod + version.json
npm run preview
```
