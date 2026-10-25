# Platform & Distribution

> Target platform, pipeline build, deploy, dan release process.

## 1. Target platform

| Platform | Bentuk | Catatan |
|---|---|---|
| **Desktop** (Chrome/FF/Safari) | web app via `npm run dev` / deploy URL | primary dev environment |
| **Mobile** (iOS Safari, Android Chrome) | **PWA installable** — `manifest.webmanifest`: `display: fullscreen`, `orientation: landscape` | main landscape; portrait → overlay rotate (dungeon) / layout portrait (autochess) |
| Store (Play/App Store) | ❌ belum | kandidat via TWA/PWA-to-store kalau perlu (backlog `ROADMAP.md`) |
| Offline | ✅ gameplay penuh setelah install pertama | detail `NON-FUNCTIONAL.md` §2 |

Firebase (opsional untuk gameplay inti): project **`pokesurvivor-free`**
(`.firebaserc`) — Auth, Firestore (save/leaderboard/friend), RTDB (presence).
Rules: `firestore.rules` + `database.rules.json`; emulator local:
auth `:9099`, firestore `:8080`, db `:9000` (`firebase.json`).

## 2. Pipeline build

| Command | Output | Kapan pakai |
|---|---|---|
| `npm run dev` | dev server `:5173` (HMR) | development |
| `npm run build` | `tsc --noEmit` **lalu** `vite build` → `dist/` | verifikasi + build biasa |
| `npm run build:prod` | build + **terser + javascript-obfuscator** via `tools/make-prod.mjs`, sourcemap OFF | **rilis publik** |
| `npm test` | vitest run (18 suite) | sebelum commit |
| `npm run typecheck` | `tsc --noEmit` | sebelum commit |

Fakta:
- **0 dependency runtime** → `dist/` = aset + bundle sendiri; tidak ada node_modules di production.
- Obfuscation di `build:prod` = proteksi ringan kode produksi (bukan security boundary).
- Aset pokok: `public/assets/pokemon/**` (~13rb file sprite) — cache terpisah di sw (`ps-art-v2`).

## 3. Versi & cache

| File | Peran | Aturan update |
|---|---|---|
| `package.json` `version` | versi semver repo (3.0.0) | bump untuk release bermakna |
| `public/version.json` `{"v","at"}` | cap build — dibaca PWA/sw | **regenerate tiap deploy** (isi = hash/commit + timestamp) |
| `public/sw.js` `CODE/ART/FIRE` (`ps-*-v2`) | nama cache per kategori | bump suffix (`v2`→`v3`) **hanya** kalau isi kategori itu berubah supaya klien tarik baru; kalau tidak, cache lama + SWR sudah cukup |

## 4. Release checklist

1. `npm run typecheck && npm test` (hijau) — lihat `QA-ANALYTICS.md` §1.
2. Update `docs/ROADMAP.md` status + baris versi (kalau release bermakna).
3. `npm run build:prod` → verifikasi `dist/` jalan (`npm run preview`).
4. Bump `version.json` (dan `sw.js` const bila pack asset berubah).
5. Deploy `dist/` ke hosting target (Firebase Hosting / static host apa pun —
   **konfigurasi hosting belum dikunci**; `firebase.json` saat ini hanya rules+emulators).
6. Smoke test di 1 mobile PWA (install/update flow) — `QA-ANALYTICS.md` §3.
7. Tag git lokal. **Push origin hanya dengan instruksi eksplisit owner.**

## 5. Konfigurasi yang jangan di-commit/diubah sembarangan

- `src/core/firebase-config.ts` — API key Firebase **by-design publik**
  (dilindungi `firestore.rules`, bukan secret). Jangan pindah ke `.env` tanpa
  alasan; kalau pindah → update `ARCHITECTURE.md`.
- `firestore.rules` / `database.rules.json` — perubahan rules = audit
  security review (leaderboard anti-cheat ada di sana).
- `.firebaserc` — project id `pokesurvivor-free`.
- Tidak ada `.env` / secrets lain di repo (verified: tanpa `.env.example`).
