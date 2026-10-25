# Arsitektur (Technical Design)

> Sumber kebenaran struktur kode. GDD = *apa* yang dimainkan (`docs/game-design-*.md`);
> dokumen ini = *bagaimana* dibangun.

## 1. Stack

| Layer | Pilihan | Alasan |
|---|---|---|
| Runtime | **Vite 7 + TypeScript strict** (`tsc --noEmit` di tiap build) | tanpa framework, 0 dependency runtime |
| Test | **Vitest 3** (happy-dom environment) | unit + integration + sim dalam 1 runner |
| Render | Canvas 2D (dungeon) + DOM/canvas hybrid (autochess) | pixel art, DPR-aware |
| Persist lokal | `localStorage` via `src/core/db.ts` (save **v4**) | offline-first, tanpa akun wajib |
| Backend | **Firebase** (Auth + Firestore + RTDB) — opsional | leaderboard/friend, project `pokesurvivor-free` |
| Deploy | PWA (`sw.js` + `manifest.webmanifest`) | installable, offline cache |

Build scripts: `dev` · `build` (tsc+vite) · `build:prod` (terser+obfuscator, `tools/make-prod.mjs`) · `test` · `typecheck` · `preview`.

## 2. Peta module

```
index.html → src/main.ts → src/game.ts        # dungeon mode + Flow state machine
                              ├─ core/        # registry, util, db (save v4), audio, sprites, camera, touch, i18n
                              ├─ world/       # tiles (procedural), world chunks, props
                              ├─ systems/     # dungeon: stats, gacha, progress, judgment
                              ├─ entities/    # player, enemy, fx (partikel/slash/dmgText), projectiles
                              ├─ ui/          # menu, settings, ui helpers (spriteCanvas/spriteHit/tick)
                              └─ net/         # co-op legacy (dungeon-specific)
src/autochess/                             # auto-battler (dua mode, satu screen scr-ac)
src/data/                                  # pokedex, moves, sprites-meta, evo-map, lang-*
tests/                                     # 18 suite *.test.ts + setup.ts
docs/                                      # GDD ×3, PLAN ×2, + dokumen standar (ini)
```

### `src/autochess/*` (16 modul, inti proyek)

| Modul | Tanggung jawab |
|---|---|
| `ac-ui.ts` (~1700 baris) | screen `scr-ac`: render arena/shop/HUD, drag-drop, loop render, `syncEnemies`, FX wrappers (banner/placeFx/telegraph), mode select (td/auto/daily) |
| `wave-runner.ts` / `wave-runner-td.ts` | mesin state **dual** / **TD**: `prep → combat → buff → won/lost`, interest/streak, leak, endless resume, seeded RNG |
| `wave.ts` | komposisi wave, affix rotasi, scaling, `prepSeconds/interest/streakBonus` |
| `unit.ts` + `unitAI.ts` | `UnitBattle` factory, damage pipeline (typeMult, armor, flank, dmgReduce), mob fight-back (chip/bulwark/slot-war), death/respawn |
| `board.ts` / `path.ts` | grid 3×3, merge star, placement; path lane TD (`branchCells`) |
| `shop.ts` / `champions.ts` / `buffs.ts` | 3-slot shop + bias; pool champion; **pool augment 13 kartu** (`RunBuffs` rule-changer) |
| `synergy.ts` / `team.ts` / `unit-stats.ts` | type synergy → mods; board → battle units; derive stat dari pokedex |
| `skills.ts` / `move-fx.ts` | skill aktif (mana 100); pipeline VFX move |
| `base.ts` | leak model + `runScore` |
| `ac-save.ts` / `rng.ts` | persist run (v4), best/daily; mulberry32 + hashSeed (wave/shop/daily seed) |

## 3. Alur data utama

### Loop dungeon (`game.ts`)
```
requestAnimationFrame → update(dt) → systems tick → drawScene()
Flow: menu → play → pause/gameover → menu
resize() (DPR ≤1.5, retry 100/350/800ms iOS) + checkOrientation()
```

### Loop autochess (`ac-ui.ts`)
```
open(mode) → ensureDom → reset → renderStage → loop(step):
  Runner.tick(dt)  →  prep: prepLeft↓ / combat: UnitAI.tick + mob path walk
  phase changes    →  banner/sfx/refresh/offerBuff
  renderAll = renderStage (DOM/DOM-positioning) + renderHud (bars/strip)
  syncEnemies      →  sprite canvas per mob (TD) / per cell (dual) + HP + hurt/death
  stepFx           →  impact queue, projectiles, telegraph, ground status FX, FX layer
```

Mesin state (kedua runner): `prep → combat → buff → won/lost`; `won` +
`resumeEndless()` → prep wave+1 tanpa re-advance. Semua transisi di `tick()`
murni state — UI membaca state, tidak sebaliknya (test-friendly: `ACUI.step(t)`).

### Render pipeline sprites
```
SpriteCollab sheet → G.SPRITE_META (anchor ax/ay per stance)
Animator(dex, scale) → per-frame draw di anchor
Sprites.fitDraw(dex, cvW, cvH, prefer) → scale + offset pas untuk sel
  (budget 0.94/0.92, stance Idle/Walk/Charge/Hurt/Shoot/Faint — lihat docs/ART-DIRECTION.md §3)
```

## 4. Spec save format v4

`src/types/save.ts` (tipe) + `src/core/db.ts` (persist):

```
Save {
  v: 4                       # SAVE_VERSION — naik = wajib tambah migrasi
  ...field dungeon (stats, roster, owned, settings)...
  ac?: SaveAc {
    bestScore, bestWave, bestEndless   # global best (max)
    runs                                # counter
    daily: Record<'YYYY-MM-DD', {score, wave, at}>   # best per seed, cap 30 entri
  }
}
```

| Operasi | Semantik |
|---|---|
| `newSave()` | baseline v4 (clone via `JSON.parse(AC_INIT)`) |
| `migrate()` | isi field hilang dari `newSave()` (loop base) — aman v1→v4 |
| `sanitize()` | clamp numerik positif, validasi entri daily, cap 30 (urut `at` desc) |
| `merge()` | **max semantics**: skor/wave max, owned union, daily per-key (skor lebih tinggi menang, tie → lebih baru) |
| `DB.save` | objek mutable; `DB.commit()` tulis localStorage + flag guest |

API autochess: `ac-save.ts` → `initAc()`, `mergeAc()` (pure), `recordRun()`,
`bestOf(dateKey?)`. Recording sekali per run (`runRecorded` flag, reset saat
endless resume).

## 5. Sistem kunci

| Sistem | Lokasi | Catatan |
|---|---|---|
| Audio | `core/audio.ts` | `Audio.sfx(name, opts)` + throttle `MIN_GAP` (hit 45ms, dll), catalog ~45 nama |
| FX | `entities/fx.ts` | burst/ring/slash/beam/dmgText/trail; cap per kualitas `CAP_PARTS [350,800,1400]` |
| Input | `core/touch.ts` + keyboard di ac-ui | safe-area insets, rotate overlay (touch+portrait) |
| i18n | `core/i18n.ts` + `data/lang-*.js` | player-facing ES/EN; docs proyek = Indonesia |
| Registry pattern | semua modul = IIFE + `register()`/`export default` | singleton lazy via `G.*` |

## 6. Konvensi kode

- **Strict TS**, no `any` baru tanpa perlu; explicit return type di fungsi besar.
- Modul = IIFE singleton + `register('Name')` (registry) — ikuti pola tetangga.
- Komentar dalam bahasa Spanyol (kode) / Indonesia (dokumen) — jangan ubah
  kebiasaan lama.
- **Jangan sentuh**: `spawnMoveFx`/`playSwings`/`stepFx`/`unitAI` tanpa baca
  `docs/PLAN-move-animation.md` (pipeline animasi move rapuh, terkunci test).
- Test: jsdom — `getBoundingClientRect` di-mock per-test bila butuh pitch;
  UI di-mock (`spriteCanvas` harus terapkan arg w/h); `ACUI.step(performance.now()+50)`.
