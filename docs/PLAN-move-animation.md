# Plan — Move Animation Autochess

> Status: **selesai** (2026-10-24). Target: animasi move elemental (contoh Razor Leaf)
> dari unit pemain menuju minion, memakai pipeline VFX/FX dungeon.
> Basis: dual-board P18 (`099bab4`), animasi awal `eac7ddf`.

---

## 1. Masalah

Framework animasi sudah ada:

- `src/autochess/unitAI.ts:305-330` — set `u.swing`, `u.face`, `u.hit`.
- `src/autochess/ac-ui.ts:663` — `playSwings()` memutar anim sprite.
- `src/autochess/ac-ui.ts:685` — `spawnMoveFx()` memilih projectile/beam/slash.
- `src/autochess/ac-ui.ts:725` — `stepFx()` update + draw projectile.
- `src/data/moves.ts:215` — Razor Leaf (`kind: 'boomerang'`).
- `src/entities/vfx.ts:333` — bentuk `leaf` untuk Razor Leaf.

Akar masalah: `src/autochess/unit-stats.ts:67` memilih move dari
`poolFor(e).slice(0, 2)`. Pool `normal` selalu di depan, jadi hampir semua
unit memilih `tackle`/`quick-attack`. `quick-attack` (kind `dash`) menang
damage → animasi hanya slash, tidak pernah projectile elemental.

Masalah sekunder:

- `boomerang`, `cone`, `meteor`, `nova`, `aura` belum punya perilaku visual
  sendiri; semuanya jatuh ke projectile lurus / burst kasar.
- `mfx()` memakai grid 3×7 hardcode, tidak mengikuti padding/border/gap DOM.
- Skill cast bisa menimpa animasi attack pada tick yang sama.

---

## 2. Keputusan

Mode **A**: map move eksplisit per champion + fallback heuristic tipe untuk
unit non-champion.

Damage formula tidak berubah. `move.dmg` tidak dipakai untuk DPS autochess;
yang berubah hanya `move.type` (type effectiveness) dan `move.kind` (visual).

### Mapping champion

| Dex | Champion | Move | Kind |
|---|---|---|---|
| 1 | Bulbasaur | `razor-leaf` | boomerang |
| 4 | Charmander | `ember` | projectile |
| 7 | Squirtle | `water-gun` | projectile |
| 16 | Pidgey | `wing-attack` | melee |
| 179 | Mareep | `thunder-shock` | projectile |
| 66 | Machop | `karate-chop` | melee |
| 92 | Gastly | `shadow-ball` | projectile |
| 63 | Abra | `confusion` | projectile |
| 304 | Aron | `metal-claw` | melee |
| 220 | Swinub | `ice-beam` | beam |
| 280 | Ralts | `psybeam` | beam |
| 147 | Dratini | `dragon-rage` | beam |

### Fallback non-champion

1. Ambil move bertipe sama dengan Pokémon (`poolFor`), buang `normal` & `buff`.
2. Ranged (`range === 3`) utamakan `projectile|boomerang|beam|chain|cone`.
3. Melee (`range === 2`) utamakan `melee|dash`.
4. Pilih `dmg` tertinggi; tie-break `cd`, lalu id.
5. Fallback `Moves.startFor(e)` → `tackle`.

---

## 3. FX planner

Modul baru `src/autochess/move-fx.ts`: fungsi murni
`planMoveFx(move, from, to)` → deskriptor visual. `ac-ui.ts` hanya
mengeksekusi plan.

Per kind:

- `projectile` — lurus, `count` + `spread`.
- `boomerang` — keluar ke target lalu kembali; Razor Leaf 2 daun berputar.
- `cone` — fan beberapa projectile.
- `beam` — `FX.beam`.
- `melee` / `dash` — slash di target.
- `meteor` — jatuh dari atas target.
- `mine` — drop di target lalu impact.
- `nova` — radial di caster.
- `aura` — ring/partikel di caster.
- `buff` / `turret` — charge effect di caster.
- `trail` — patch di caster.
- `chain` — arc pendek caster → target.
- `orbit` — projectile berputar di caster.

Damage number tetap sekali di impact, tidak dobel walau `count > 1`.

---

## 4. Alignment + sprite

- `cellCenter(x, y)` dari `getBoundingClientRect()` cell asli, cache setelah
  `renderStage`, refresh `ResizeObserver`/resize.
- Fallback `mfx()` untuk jsdom/test.
- Samakan helper untuk projectile, impact, dan death burst.
- `KIND_ANIM`: ranged → `Shoot`, melee → `Attack`, buff/skill → `Charge`.
- Pisahkan flag `skillFx` agar cast skill tidak menghapus animasi attack.

---

## 5. Test

- `autochess-data.test.ts` — 12 champion punya move sesuai tabel.
- `autochess-battle.test.ts` — Bulbasaur `swing === 'Shoot'`, `hit` ke minion,
  move kind `boomerang`.
- `autochess-move-fx.test.ts` — plan projectile/boomerang/cone/nova/beam.
- `autochess-ui.test.ts` — projectile queue bertambah; jsdom tidak error.
- Verifikasi: `npm test`, `npm run typecheck`, `npm run build`.

---

## 6. Acceptance

- Bulbasaur mengeluarkan 2 daun berputar ke minion lalu kembali.
- Tidak ada champion yang default ke `quick-attack`.
- Proyektil align dengan sprite di portrait mobile.
- Semua test + typecheck + build hijau.

---

## 7. Hasil Implementasi

File berubah:

- `src/autochess/champions.ts` — `move` per champion + `moveOf()`.
- `src/autochess/unit-stats.ts` — `moveFor()` (signature → heuristic tipe).
- `src/autochess/move-fx.ts` — planner visual per kind.
- `src/autochess/ac-ui.ts` — eksekusi planner, boomerang/cone/meteor/radial,
  `cellCenter()` berbasis DOM rect, skill flourish terpisah.
- `src/autochess/unit.ts` + `src/autochess/unitAI.ts` — flag `skillFx`.
- Test: `autochess-data`, `autochess-battle`, `autochess-ui`,
  `autochess-move-fx`.

Verifikasi:

```
npm test              # 13 files, 217 tests passed
npm run typecheck     # ok
npm run build         # ok
```

Hasil: Bulbasaur memakai `razor-leaf` (2 daun berputar, keluar–balik),
Charmander `ember`, Squirtle `water-gun`, dll. Semua champion tidak lagi
default `quick-attack`.

## 8. Catatan

- Mob tidak menyerang unit di dual-board; animasi tetap player → minion.
- Perubahan move mengubah type matchup; cek `autochess-sim.test.ts`.
- Scope kind: semua kind di atas. Bisa dipotong ke projectile family bila perlu.
