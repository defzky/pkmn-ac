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

### Core loop (final — sinkron GDD `docs/game-design-common.md` + `game-design-autochess.md`)

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
  path.ts         # ring branches (TD mobs alternate lane 0/1 — serpentine removed)
  board.ts        # grid 3×3 tanpa bench utk buy (auto-place), tanpa cap unit (9 petak = limit), merge same-cell drop (tryMergeAt)
  unit-stats.ts   # derive dari pokedex (ATK_SCALE 40, range melee 2/ranged 3)
  unit.ts         # UnitBattle: mana, star, swing (nama anim), totalAtk, effCd
  unitAI.ts       # tdist lintas arena, target baris depan / progress, damage pipeline, KIND_ANIM
  skills.ts       # 11 skill aktif (trigger mana 100)
  champions.ts    # 12 chain GDD, cost 1–4, odds per band wave
  shop.ts         # 3 kartu, buy/sell/reroll 1g, sell by star (c / 2c−1 / 3c)
  synergy.ts      # 5 tipe GDD, tier 2/3
  team.ts         # board → synergy mods → spawn battle units
  wave.ts         # komposisi, roles, elite w10+, boss tetap, HP waveMul
  wave-runner.ts  # autochess state machine prep/combat/buff/won/lost, 2 heart (45/20)
  wave-runner-td.ts # TD state machine: path walk, base leak, win @20, no foe heart
  buffs.ts        # pool 5 buff, roll 3
  base.ts         # generic leak model (START_HP 100 / LEAK 5 / BOSS 20); hearts via wave-runner createBase
  move-fx.ts      # move animation FX pipeline (attack/projectile VFX)
  ac-ui.ts        # screen scr-ac: mode select → twin arena (auto) / path board (td), drag-drop buy, loop, syncEnemies
```

Sisa rencana lama yang **sudah** diimplementasi kemudian: save v4 (S1),
augment rule-changer (D2e), daily seed (S2), debug+sim (S3).
Co-op (P20) = **di-skip atas permintaan user** (lihat `docs/ROADMAP.md` P24).

---

## 4. Data spec

> **Pindah ke GDD:** spesifikasi data berlaku ada di `docs/game-design-common.md`
> (sistem bersama) + `docs/game-design-autochess.md` / `docs/game-design-td.md`
> (per-mode). Spec lama di dokumen ini (grid 8×5, bench 9, shop 5,
> start gold 20 + interest, merge-3, synergy 6 grup T2/T4, 30 waves,
> range melee 1/ranged 2) sudah **deprecated dan dihapus** — jangan dipakai.

---

## 5. Phases

> **Status: P11–P17 ✅ selesai** (2026-10-24, semua test hijau).
> **Revisi P18 ✅: dual-board rework** (2026-10-24 — arena kembar, heart 45/20,
> tanpa path; commit `099bab4`). Save v4 roster/star **belum**.
> **Dual mode ✅ (2026-10-24): mode select + TD runner + TD UI** —
> `wave-runner-td.ts`, `pathThroughBoard()`, scr-ac-mode, GDD split per mode.
> **Landscape refresh ✅ (2026-10-24): layout landscape full-width + backdrop
> Bosque** — `#scr-ac.td-land` grid (arena tengah, dock bawah, syn rail kanan),
> `paintAcBg()` = `Tiles.paintChunk` biome 0 identik dungeon, pitch-scaled
> mob/ghost/lane via `--ac-pitch`/`--ac-lane-pad`; 256 test hijau.
> **Juice ✅ (2026-10-24): TD feel rework Fase J+K+L** — combat juice (wave/leak
> banners, base flash, eff-colored dmgText, dungeon hurt/death Faint+fade, ground
> telegraph/status FX, timer blink) + interaction juice (land/merge/sell FX,
> drag ghost sprite) + landscape juice (dirt lanes, spawn portal, base HP ring,
> cell hover, round pulse); 266 test hijau (GDD §1b).
> **Layout rework ✅ (2026-10-24): Fase M+N+O+P** — struktur HUD terpadu
> (`.ac-dock` display:contents, power di topbar, ac-bg full-viewport child
> `#scr-ac`), grid landscape zero dead-space, sprite full-scale (cell
> canvas 100%, kartu 70%, mob pitch×0.72, ghost ×0.85), polish Round/gold 15px,
> Ready/Reroll hover, kartu −5px shadow; 268 test hijau (GDD §1a).
> **Proporsi ✅ (2026-10-24): Fase Q** — pill star/atk pojok kanan-atas tile,
> dock fit-content terpusat + divider + timer ⏳ legible + gold 18px, kartu
> shop canvas 72px + nama tak terpotong, mob spawn min 44px + drop-shadow,
> castle HP pill `#ac-td-hptext` di bawah ring (heart lama sembunyi di TD),
> synbar pindah `.ac-arow` gap 32px dari papan + kontras chip; 270 test hijau
> (GDD §1a).
> **Konsep rework ✅ (2026-10-25): D1** — 5 pilar senior-designer pass,
> dokumen ditulis ulang (common/td/autochess): 5-menit sprint (10 wave, prep
> 25/15/12, base 60, leak 6/15), **monsters fight back** (unit HP mati/respawn,
> TD runner-chip vs bulwark-stop, auto slot war), lane asimetris + flank bonus,
> interest/streak, affix + shop bias, augment rule-changer P19, score/endless.
> **Sisa D2a–D2e implementasi**, lalu save v4, co-op P20.
> **D2a–D2e ✅ (2026-10-25)** — mobs-fight-back (chip/bulwark/slot-war + death/
> respawn), lane asimetris + flank + preview chip, economy 5-menit (interest/
> streak, base 60, leak 6/15, wave 10 score/endless), affix 4 rotasi + shop bias,
> augment rule-changer (pool 13: Fortified/Compound/Second Wind/Slipstream/
> Flank Master/Frontline Bond/Elementalist/Blood Money wired ke battleMods);
> 310 test hijau. Sisa: co-op P20 (user pilih skip).
> **Save v4 ✅ (2026-10-25)** — `SAVE_VERSION` 3→4, `Save.ac` {bestScore,
> bestWave, bestEndless, runs, daily (cap 30)}; migrate/sanitize/merge
> (max + daily per-key best); `ac-save.ts` (mergeAc pure + recordRun →
> DB.commit, guest safe); overlay `· Best N ★ NEW BEST` sekali per run
> (endless resume reset flag); best line di mode select. 315 test hijau.
> **Daily seed ✅ (2026-10-25)** — `rng.ts` (mulberry32/hashSeed/dailyKey/
> seedFromDate/waveRnd/shopRnd); RNG per-wave/per-batch (fresh tiap call →
> preview === startCombat, jumlah frame tak mempengaruhi); `RunState.seed` +
> `createRun(gold,prep,seed)`; ac-ui `acSeed/acDailyKey/acShopN` (4 situs
> shop + 3 compose seeded); kartu ke-3 "Daily Run (TD)" + banner DAILY RUN;
> recordRun simpan `dateKey` → best per seed. 322 test hijau.
> **Debug + balance sim ✅ (2026-10-25)** — `ACUI.debug.{wave,gold,base,win}`
> (tanpa UI); sim 100 run seeded (50 dual + 50 TD, dt 0.25, invariants
> gold/hp/wave per tick): dual 50W/0L, TD 48W/2L, ~1s. 325 test hijau.
> **Co-op P20: di-skip atas permintaan user.**
> **Mode-switch fix ✅ (2026-10-24): Fase R** — cleanup TD→autochess
> (`clearTdLayers()`: lanes+portal+castle+wave strip+`--ac-pitch`/`--ac-lane-pad`
> di-wipe di awal `renderStage` & `close()`, CSS scoping `#scr-ac.mode-td` /
> `.mode-autochess` + `.ac-td-base[hidden]`), layout auto anti-overflow
> (`.ac-app` grid `auto/1fr/auto` → dock selalu tampil, `fitAutoTiles()` set
> `--ac-tile` 36–76px persegi dari rect arena, landscape auto board
> side-by-side + dock horizontal), topbar terpadu (Round · ♥45 · ♥20 · ⚔ ·
> pause/close — heart pindah dari arena, `.ac-foehud`/`.ac-me-hud` disembunyi
> di auto); 275 test hijau (GDD §1a autochess).
> Sisa: co-op P20 (di-skip user; save v4 + daily seed + debug/sim ✅).

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
npm test             # vitest: 18 test files, ~325 tests (baseline 2026-10-25)
npm run build        # dev bundle
npm run build:prod   # obfuscated prod + version.json
npm run preview
```
