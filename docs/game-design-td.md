# Pokémon Auto Chess — Game Design: Mode Tower Defence

> Mode **TD path-walk**. Musuh spawn di tepi atas, berjalan menyusuri *path*
> serpentine yang melewati board pemain 3×3, menuju base di kanan-bawah.
> Leak = base HP damage. Bertahan 20 wave = menang.
> Sistem bersama (unit, shop, sinergi, ekonomi, buff): `game-design-common.md`.

---

## 1. Arena, Path, & Penempatan

* **Satu board pemain 3×3** (y 0 … y 2) — semua cell placeable, **khusus pokemon**. Portrait: grid di-center 56% lebar. Landscape (`.td-land`): board square full-height (sisi = tinggi arena kolom), semua ruang layar dipakai (lihat §1a).
* **Jalur minion = ring lane DI LUAR board** (2 cabang simetris, `Path.branchCells`, spawn alternating kiri/kanan) — minion **tidak pernah** menempati petak pokemon:
  * Spawn gate: top-center `{x:1, y:−1}` (dua cabang sama)
  * Cabang kiri: `(1,−1) → (0,−1) → (−1,−1) → (−1,0) → (−1,1) → (−1,2) → (−1,3) → (0,3) → (1,3)`
  * Cabang kanan: cermin (x 3), Base: bottom-center `{x:1, y:3}`
  * Jarak Chebyshev tiap petak board ke lane terdekat ≤ 2 → melee range 2 tetap kena semua petak.
* **Lane di-highlight** tile kuning tipis `.ac-td-lane` di luar grid. Ukuran = `pitch × 0.86`; pad atas/bawah host = `pitch × 0.28` via CSS var `--ac-lane-pad` (di-set JS dari rect cell — bukan 56px fixed).
* **Musuh ghost-walk:** berjalan melewati unit tanpa *blocking* — unit murni DPS tower.
* **Placement:** sama seperti autochess — drag & drop / tap, auto-place back-to-front, **tanpa batas unit** (grid 3x3 = 9 petak = limit). Penempatan & merge (drop) terkunci saat combat; beli tetap boleh.
* **Keyboard:** `1`–`3` beli, `R` reroll (1 Gold), `Space`/`Enter` Ready, `Esc` pause.

### 1a. Layout Landscape + Backdrop Dungeon (refresh)

* **Aktivasi:** class `#scr-ac.td-land` (di-toggle `renderStage`, TD saja) + `@media (orientation: landscape)`. Dual-board (`auto`) tetap desain portrait-column lama.
* **Grid penuh** (`.ac-app` → CSS grid, `max-width:none`):
  * Baris 1: topbar (round kiri, pause/exit kanan).
  * Baris 2: **arena** kiri (board square height-driven + lane pad proporsional + wave strip) · **synbar** right-rail kanan.
  * Baris 3 (dock): gold pill (start) · reroll + Ready + timer (tengah-kiri) · **shop strip 3 kartu** (kanan, dekat jempol kanan).
  * `ac-kbd` disembunyikan (touch layout).
* **Kartu shop compact:** 96×112 (sprite 48px), reroll 44px circle, Ready horizontal 44px + timer 60px.
* **Backdrop dungeon:** canvas `#ac-bg` (z0, child pertama `.ac-arenas`) → `Tiles.paintChunk` biome **0 (Bosque)** floor-only + blob dirt sinus + radial vignette — pixel ground **identik** dengan `World.chunkImage` dungeon (32px/tile = T × Sprites.PX). Bake ulang saat resize (debounce by size key). `#scr-ac` bg solid `#061009`; arena `.me` transparent di landscape supaya forest floor tembus.
* **Skala elemen = pitch:** mob display `pitch×0.55` (maks), HP bar mob `pitch×0.45`, ghost preview `pitch×0.5` — semua via var `--ac-pitch` (fallback px untuk jsdom).

## 2. Pertempuran (Targeting & Leak)

* **Targeting:** unit menyerang musuh dalam jangkauan dengan **progress terbesar** (paling dekat ke base).
* **Mobs jalan** mengikuti path: `progress` bertambah per detik (`spd × slowMul`). Leak saat `progress ≥ pathLength − 1`.
* **Leak penalty** (`base.ts`):
  * Mob normal: base HP −5
  * Boss: base HP −20
* **Base HP:** 100. Base mati → **Game Over**.
* **Round win:** semua musuh mati (terbunuh) → `3 + floor(wave/2)` Gold, advance wave.
* **Tidak ada foe heart** — TD klasik, murni defend base.
* **Animasi & damage formula:** sama dengan common (auto-attack, skill, ★3 skill ×2, mana 10/hit → 100). Mob jalan: anim **Walk** + facing mengikuti arah path, berhenti → **Idle** (gaya dungeon, `Sprites.Animator` per mob).

## 3. Alur State Permainan (Game State Machine)

1. **PREP PHASE (30 detik atau "Ready"):**
   * Shop refresh gratis (3 kartu), beli/susun unit di board; merge via drop same-cell (prep only).
   * Path cells highlight kuning.
   * Spawn marker (⬇) di top-center sebagai preview.
2. **COMBAT PHASE:**
   * Mobs spawn bertahap di path[0] (top-center), langsung jalan.
   * Unit board auto-attack mobs dalam jangkauan.
   * Leak → base damage; base 0 → **lost**.
3. **ROUND RESULT:**
   * Semua mobs mati → `3 + floor(wave/2)` Gold, advance wave.
   * Wave kelipatan 3 → BUFF SELECTION PHASE (pop-up 3 kartu).
4. **WIN / GAME OVER:**
   * **Menang:** wave 20 dimenangkan (semua mobs wave 20 mati).
   * **Kalah:** base HP mencapai 0.

## 4. Konstanta (TD-specific)

| Konstanta | Nilai | Catatan |
| :--- | :--- | :--- |
| `TD_BASE_HP` | 100 | `base.ts START_HP` |
| `LEAK_NORMAL` | 5 | `base.ts` |
| `LEAK_BOSS` | 20 | `base.ts` |
| `START_GOLD` | 5 | Sama autochess |
| `PREP_SECONDS` | 30 | Sama |
| `WAVE_BONUS` | `3 + floor(wave/2)` | `waveBonus()` — wave 1 → 3, wave 20 → 13 |
| `BUFF_EVERY` | 3 | Sama |
| `MAX_MOBS` | 12 | Cap concurrent walking mobs |
| `MAX_WAVE` | 20 | Win condition |

## 5. UI Notes

* Foe arena **disembunyikan** (`td-mode` class).
* Path cells di-highlight kuning di player grid.
* Mobs dirender sebagai sprite absolut-positioned di atas arenas, posisi = interpolate path cells berdasarkan `progress`. Sprite punya canvas + `Sprites.Animator` sendiri (Walk/Idle, facing dari segmen path) — bukan cell-sprite bersama.
* Base HP tampil di HUD (heart badge), foe heart disembunyikan.
* Layout landscape + backdrop forest: §1a (desain baru, TD-only).
