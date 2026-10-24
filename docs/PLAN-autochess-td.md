# PokéAutochess — Plan TD/Autochess Rework

> Fork of `pkm-autochess` (clone of `pkmonsrvr`, commit `cb3c2b4`).
> Survivor-roguelike → **autochess tower defence**.
> Phases P11–P20. Existing P0–P10 (full TS strict + offline PWA) preserved as base.

---

## 1. Concept delta

```
lama:  kontrol 1 partner, jalan, wave kejar, hold-out time
baru:  2 arena 3×3 → auto-battle → gold → shop → repeat
```

> **Revisi P18 (2026-10-24): mode dual-board.** Tidak ada jalur TD — musuh
> berdiri di arena atas (slot y −1..−3), tim di arena bawah (y 0..2).
> Menang round = musuh habis → heart musuh (20 HP) kena 1+penyintas;
> kalah round = tim kosong → heart pemain (45 HP) kena 3+floor(w/4).

Run = N wave. Kalah = heart pemain 0. Menang = heart musuh 0 atau wave 20. Ranking = **waves survived** (bukan time).

### Core loop (final — sinkron GDD `game-design.md`)

```
PREP (30s)         BATTLE               ROUND WIN
shop 3 kartu   →   units auto-kill  →   +3 gold + shop refresh
auto-place     →   target baris depan→   buff pick (tiap 3 round)
drag/tap place →   tim kosong = kalah→   next round / menang @20
reroll 1g      →   boss tiap 5      →   foe heart −(1+survivors)
```

---

## 2. Reuse map

| Sistem lama | Jadi |
|---|---|
| `Gacha.pool/pull` | Shop pool — beli unit dgn gold; pity → shop refresh odds |
| `Types` chart | Synergy — hitung type di board → buff team |
| `Upgrades` | Tech-tree antar run (persist) + star system (**merge-2**: 2 copy → 2★, 2×2★ → 3★) |
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

## 3. Architecture (final — kode `src/autochess/*` sekarang)

```
src/autochess/
  path.ts         # legacy ring (dual-board tidak pakai; board masih cek Path.inside)
  board.ts        # grid 3×3, tanpa bench utk buy (auto-place), cap min(8,1+floor(lvl/2)), merge-2
  unit-stats.ts   # derive dari pokedex (ATK_SCALE 40, range melee 2/ranged 3)
  unit.ts         # UnitBattle: mana, star, swing (nama anim), totalAtk, effCd
  unitAI.ts       # tdist lintas arena, target baris depan, damage pipeline, KIND_ANIM
  skills.ts       # 11 skill aktif (trigger mana 100)
  champions.ts    # 12 chain GDD, cost 1–4, odds per band wave
  shop.ts         # 3 kartu, buy/sell/reroll 1g, sell by star (c / 2c−1 / 3c)
  synergy.ts      # 5 tipe GDD, tier 2/3
  team.ts         # board → synergy mods → spawn battle units
  wave.ts         # komposisi, roles, elite w10+, boss tetap, HP waveMul
  wave-runner.ts  # state machine prep/combat/buff/won/lost, 2 heart (45/20)
  buffs.ts        # pool 5 buff, roll 3
  base.ts         # heart state (player 45 / foe 20 via createRun)
  ac-ui.ts        # screen scr-ac: twin arena render, drag-drop buy, loop, syncEnemies
```

Sisa rencana lama yang **belum** diimplementasi (kandidat tahap lanjut):
save v4 roster/star (P18), augment/items (P19), co-op (P20).

---

## 4. Data spec

> **Pindah ke GDD:** spesifikasi data berlaku ada di `docs/game-design.md`
> (Bagian 1–5). Spec lama di dokumen ini (grid 8×5, bench 9, shop 5,
> start gold 20 + interest, merge-3, synergy 6 grup T2/T4, 30 waves,
> range melee 1/ranged 2) sudah **deprecated dan dihapus** — jangan dipakai.

---

## 5. Phases

> **Status: P11–P17 ✅ selesai** (2026-10-24, semua test hijau).
> **Revisi P18 ✅: dual-board rework** (2026-10-24 — arena kembar, heart 45/20,
> tanpa path; commit `099bab4`). Save v4 roster/star **belum**.
> Sisa: save v4, augment/items (P19), co-op (P20).

| # | Isi | Test |
|---|---|---|
| **P11** | Data spec: `path.ts`, `wave.ts` defs, `synergy.ts`, unit-stat derive + data tests | 966 unit punya stat board valid; synergy graph; wave comp legal |
| **P12** | `board.ts` grid place/remove/occupancy/bench + merge star check | grid unit test: place/overlap/bench full/merge |
| **P13** | `unit.ts` + `unitAI.ts` + `base.ts`: auto-attack pakai Moves, projectile reuse, target nearest, death; base HP leak | battle test: 1 unit vs 1 mob resolve, kill → gold |
| **P14** | `wave.ts` director: spawn along path, boss flag, end detect | wave test: comp valid, boss, win/lose |
| **P15** | `shop.ts`: pool roll odds, buy/sell/reroll, merge star | shop test: pool, merge, gold clamp |
| **P16** | `synergy.ts` engine: counts → mods applied to unit stat | synergy test: threshold hit → mul |
| **P17** | UI: board canvas (Tiles render reuse), drag-place, bench bar, shop bar (5+reroll), wave timer, gold HUD, base HP | manual + placement click test |
| **P18** | ✅ Dual-board rework (done) — sisanya: Save v4: `roster{dex:count,star}`, `board[{dex,x,y}]`, `gold`, `wave`; migrate v3→v4; ranking waves; rules sanity | db migrate test; ranking metric |
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
