# Non-Fungsi (Performance, Offline, Aksesibilitas, Device)

> Budget & jaminan yang harus dipertahankan tiap perubahan. QA terkait:
> `docs/QA-ANALYTICS.md`.

## 1. Performance budget

| Metrik | Budget | Penjaga di kode |
|---|---|---|
| DPR render | **≤ 1.5** (`min(1.5, devicePixelRatio)`) | `game.ts:86` — naik = GPU cost naik linear |
| Partikel FX | **350 / 800 / 1400** per kualitas | `entities/fx.ts` `CAP_PARTS`; sprites cap `[110,210,320]`, teks `[25,45,70]` |
| Chunk image cache | **48** offscreen canvas (`MAX_DATA` 400) | `world/world.ts:56` LRU delete |
| DPR/ukuran canvas akuisisi | skip recompute kalau unchanged | `game.ts:90` short-circuit |
| Throttle sfx | `MIN_GAP` per nama (hit 45ms, faint 60ms, …) | `core/audio.ts` |
| DOM churn mob TD | canvas per mob di-cache (`tdMobEls`), hapus saat mati | `ac-ui.ts syncEnemies` |
| Sim balance | 100 run < ~2s di test | `tests/autochess-sim.test.ts` |
| Bundle runtime deps | **0** | `package.json` — pertahankan, jangan tambah lib berat |

Target: 60fps desktop, 30–60fps mobile mid-range saat combat penuh (≥10 mob +
proyektil + FX). Kalau tambah sistem berat → naikkan kualitas tier, jangan
cap global.

## 2. Offline / PWA

`public/sw.js` — 3 cache versioned:

| Cache | Isi | Strategi |
|---|---|---|
| `ps-code-v2` | index.html, css, manifest, version.json, **semua URL dari HTML** (JS/build) | stale-while-revalidate (network update, cache fallback) |
| `ps-art-v2` | `/assets/(pokemon\|icons\|fonts)/` | cache-first (asset jarang berubah) |
| `ps-fire-v2` | firebase/3rd-party | cache-first |

Jaminan:
- **Install pertama online** → main **100% offline** (gameplay tanpa login).
- **Online (login)**: save lokal tetap jalan; leaderboard/friend butuh network
  (gagal → silent skip, game tidak crash).
- **Update**: bump `version.json` + jika asset/code pack berubah → bump
  konstansa `CODE/ART/FIRE` di `sw.js` (`ps-*-v2` → `v3`) agar cache lama
  tidak menyimpangkan. Detail urutan: `docs/PLATFORM.md` §3.
- Gameplay **tidak pernah blocking** pada fetch network.

## 3. Aksesibilitas

| Aspek | Status | Catatan |
|---|---|---|
| Keyboard | ✅ desktop | autochess: select/place/hotkey (GDD per-mode); dungeon: keyboard support |
| Rotate overlay | ⚠️ touch+portrait | `#rotate` menutup layar + auto-pause (`game.ts checkOrientation`) — mobile wajib landscape; desktop portrait diizinkan |
| Screen reader | ❌ | game canvas-first — DOM HUD sedikit; kandidat backlog (`docs/ROADMAP.md`), bukan target saat ini |
| Kontras teks | ✅ | teks utama di atas panel gelap/blur; jangan turunkan opacity teks HUD |
| "Números de daño" | ✅ toggle | Ajustes → hide dmg numbers (`Settings.get('dmgNumbers')` di `FX.dmgText`) — partikel tetap |
| Ukuran font | ✅ rem/px konsisten | minimum ~11px (label kecil shop) |
| Color-only signal | ✅ sebagian | affix punya label teks + warna; eff damage = warna + ukuran angka (super besar) |

## 4. Device matrix

| Target | Status | Quirk diketahui |
|---|---|---|
| Desktop Chrome/Firefox/Safari | ✅ primary dev | DPR 1–2 |
| iOS Safari (PWA) | ✅ didukung | ukuran viewport stale setelah rotate → resize retry **100/350/800ms** (`game.ts resizeSoon`); `visualViewport` listener; jangan pakai `100vw/vh` mentah untuk canvas (`#game` = `position:fixed; inset:0`) |
| Android Chrome (PWA) | ✅ didukung | safe-area insets via `env(safe-area-inset-*)` (`touch.ts`) |
| Portrait phone | ⚠️ dungeon: overlay rotate; autochess: layout portrait didukung (`.ac-app` 440px) | jangan hapus `@media` portrait ac |
| Browser lama tanpa ES modules | ❌ out of scope | Vite build = modern syntax |

## 5. Robustness

- **Save aman**: sanitize clamp setiap load — angka negatif/korup tidak
  menyebar; merge = max (tidak pernah turun).
- **jsdom guard**: semua canvas ctx di-ac-ui di-null-check (tests tanpa GPU).
- **rAF stub di test** — loop tidak jalan sendiri; step manual via `ACUI.step`.
- **Crash policy**: state machine murni → tick tidak throw; UI membaca state.
  Kalau tambah fitur: taruh logika di runner (testable), bukan di render.
