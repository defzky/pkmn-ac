# Roadmap (Scope & Production)

> Status per **2026-10-25**. Eksekusi sebelumnya = `docs/PLAN-autochess-td.md`
> (historis P11–P20) + `docs/PLAN-move-animation.md`. Dokumen ini = arah
> maju. GDD = spec: `docs/game-design-*.md`.

## 1. Selesai (baseline)

| Blok | Isi | Bukti |
|---|---|---|
| P0–P10 | TS strict rewrite, dungeon mode, PWA offline, Firebase | commit `cb3c2b4`+ |
| P11–P17 | autochess data/board/unit/wave/shop/synergy/UI | PLAN §5 |
| P18 | dual-board rework + mode select (TD + auto) | commit `099bab4` |
| Rework UX | landscape full-width, forest backdrop, juice J–L, layout M–Q, HP 3× | commits `7a229ac`…`401d5b7` |
| **D1–D2e** | konsep 5 pilar: mobs-fight-back, lane asimetris+flank, ekonomi 5-menit (interest/streak, base 60, wave 10, score/endless), affix+shop bias, augment rule-changer | GDD tertulis ulang, `54972ef`…`78001bd` |
| **S1–S3** | save v4, daily seed (mulberry32, shop+wave seeded), debug API + balance sim 100 run | `b29c752`,`d06fc19`,`61f51ed` |

Test: **~325** (lihat `npm test`), typecheck+build hijau, 0 runtime deps.
**Tidak pernah di-push ke origin** selama sesi ini (lokal semua).

## 2. Backlog terprioritas (rekomendasi urutan)

### P21 — CI minimal (halangi regresi diam-diam)
GitHub Actions: `npm ci && npm run typecheck && npm test && npm run build`.
Kenapa dulu: 325 test hanya dijalankan manual.

### P22 — I18n diselaraskan
Masalah 3 bahasa: player-facing ES/EN (`lang-en.js`), docs ID, komentar ES.
- Pilih: docs tetap **ID**, komentar kode tetap ES, player UI = ES default +
  EN toggle (sudah ada).
- Fix: `manifest.webmanifest` masih nama **"PokéSurvivor"** / lang `es` —
  rename ke **PokéAutochess** + description baru (dampak PWA install).
- Fix: `index.html` credits/`settings-ui` konsisten (sudah SpriteCollab ✓).

### P23 — Analytics event (spec di `docs/QA-ANALYTICS.md` §4)
Impl ringan: batch event lokal → Firestore koleksi `telemetry` (privacy:
tanpa PII, baca `docs/LEGAL.md` §4) — setelah itu retention diukur.

### P24 — Co-op TD (P20 lama — **diparkir atas permintaan user**)
Dua board, satu base. Reuse `net/` rooms, JANGAN pakai `net/coop.ts` legacy
(specific dungeon host-frame). Estimasi besar — mulai lagi hanya kalau user
minta.

### P25 — Konten & balance
- Roster champion (12 → 20), affix baru (rotasi 4 → 6), augment 13 → 16.
- Balance pass via sim (`tests/autochess-sim.test.ts`) — target win-rate
  dual ≥90%, TD ~95% (baseline sekarang 100%/96% — TD terlalu mudah?).
- Boss lebih ramai (wave 5/10 sudah, tambah mechanic per boss).

### P26 — Kualitas hidup
- Self-serve account delete (privacy, `docs/LEGAL.md` §4).
- Screen-reader labels dasar (NON-FUNCTIONAL §3 — skor aksesibilitas).
- Tutorial singkat onboarding (belum ada).

## 3. Sengaja TIDAK dikerjakan

| Item | Alasan |
|---|---|
| Monetisasi (iklan/IAP) | sprite CC BY-NC **melarang** komersial + janji "sin anuncios" (LEGAL §5) |
| Screen-reader penuh | game canvas-first; ROI kecil saat ini |
| Migration keluar Firebase | belum perlu — biaya 0 di skala sekarang |
| WebGL renderer | Canvas 2D cukup untuk budget saat ini |

## 4. Konvensi phase ke depan

1. Tulis/ubah **GDD dulu** (spec = `game-design-*.md`) → minta approval.
2. Plan singkat di dokumen ini / `PLAN-*.md` kalau multi-langkah.
3. Eksekusi: **satu commit per fase**, pesan `feat(scope): fase — isi`.
4. Verifikasi wajib: `npm run typecheck && npm test` **×2** + `npm run build`.
5. **Jangan push origin** tanpa instruksi eksplisit user.
6. Update status di dokumen ini + PLAN (baris status ber-tanggal).

## 5. Definisi "siap rilis publik"

- [ ] CI hijau (P21)
- [ ] Manifest rename + PWA install flow dicek (P22)
- [ ] `docs/LEGAL.md` final + privacy policy link di game
- [ ] Balance sim TD tidak trivial (≥80% menang dengan play normal)
- [ ] QA checklist `docs/QA-ANALYTICS.md` §3 lulus di 1 iOS + 1 Android + desktop
