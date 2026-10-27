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
| **Docs 8-pillar** | LICENSE MIT, ARCHITECTURE/LEGAL/ART/ROADMAP/PLATFORM/QA/LIVEOPS/NON-FUNCTIONAL | `00eaafe` |
| **AU-1–AU-4** | autochess rework: round-result benar + compose cache + slot-war target + bounty 1/2/10; heart FX + streak pip; preview chips + flank TD-only + tdOnly augment + swarm dual; buff tile +10% + arena identity + star glow | `43fd4c1`,`10c7c98`,`8bc5ec1`,`93a1933` |

Test: **~347** (lihat `npm test`), typecheck+build hijau, 0 runtime deps.
**Tidak pernah di-push ke origin** selama sesi ini (lokal semua).

## 2. Backlog terprioritas (rekomendasi urutan)

### P21 — CI minimal (halangi regresi diam-diam)
✅ selesai (2026-10-25, `2a1b6dd`) — `.github/workflows/ci.yml`:
`npm ci && npm run typecheck && npm test && npm run build` on push main + PR.

### P22 — I18n diselaraskan
✅ selesai (2026-10-25) — manifest rename **PokéAutochess** dilakukan;
keputusan terdokumentasi: docs tetap **ID**, komentar kode tetap ES, player UI = ES default +
EN toggle (sudah ada). Rebrand penuh di luar scope (translation keys = string ES,
legal terikat domain pokesurvivor.com).
- Fix: `index.html` credits/`settings-ui` konsisten (sudah SpriteCollab ✓).

### P23 — Analytics event (spec di `docs/QA-ANALYTICS.md` §4)
✅ selesai (2026-10-25) — `src/core/telemetry.ts` batch lokal → Firestore
`telemetry` (flush 10/30s/run_end), 7 event, flag `Settings.telemetry`
(toggle Ajustes), rules create-only, LEGAL §4 + §4a diperbarui.
Retention diukur pakai uid anonim (hanya sesi login).

### P24 — Co-op TD (P20 lama — **diparkir atas permintaan user**)
Dua board, satu base. Reuse `net/` rooms, JANGAN pakai `net/coop.ts` legacy
(specific dungeon host-frame). Estimasi besar — mulai lagi hanya kalau user
minta.

### P25 — Konten & balance
✅ selesai (2026-10-25) — champion 12 → **20** (Magikarp/Hoothoot/Poliwag/
Growlithe/Pikachu/Exeggcute/Rapidash/Lapras, skill kit reuse), affix 4 → **6**
(+Regen +3%/s, +Enrage ×1.4 <40% HP, rotasi `(wave−3)%6`), augment 13 →
**16** (+Overclock/Bulwark/Eagle Eye trade-off), waveMul hp 0.42→**0.48** /
atk 0.16→**0.20**. Sim bands jadi assertion: dual ≥45/50, TD ≥46/50
(observasi terakhir 50/50 & 49/50). GDD common §1/§2a/§5 disinkronkan.
- Boss mechanic tambahan (per-boss gimmick baru): belum — kandidat lanjutan.
### P25b — Tempo wave +15s (✅ 2026-10-25)
- Permintaan user: tiap wave tempur +±15 detik (prep/beli tetap 25/15/12s).
- `SPAWN_GAP`: dual 0.4 → **6.3s**, TD 0.4 → **5.1s** (durasi ≈ `(n−1)×gap`);
  `SPD_SCALE` 0.6 → **0.4** (crossing ~11–20s).
- Hasil sim (avg combat per wave, 50 seed): dual **3.75 → 19.3s (+15.6)**,
  TD **8.44 → 23.4s (+14.9)**; band menang tetap 50/50 (≥45 / ≥46 hijau).


### P26 — Kualitas hidup
- Self-serve account delete (privacy, `docs/LEGAL.md` §4):
  ✅ **sudah ada** — Settings → Account → "Borrar cuenta" →
  `UI.confirmDelete` → `DB.deleteAccount` → `Flow.toLogin()`
  (`src/ui/settings-ui.ts` renderAccount L155–174). Cukup dicek ulang, bukan
  pekerjaan baru.
- Screen-reader labels dasar (NON-FUNCTIONAL §3 — skor aksesibilitas):
  ✅ selesai (T9, 2026-10-28) — `role`+`aria-label` sel papan (posisi +
  isi + seleksi), kartu shop (`Comprar … — N monedas`), tombol sell/reroll,
  sel musuh `role=img`; 7 entri dict EN (pola `{x}`) + 4 tes a11y.
- Tutorial singkat onboarding (belum ada).

## 6. Log sesi review-loop 2026-10-27/28 (5 jam, MCP browser)

> User: "lakukan improvement tanpa henti sambil review dengan mcp selama
> 5 jam, jika tugas selesai buat tugas lagi dari riset kekurangan".
> Loop: review (playwright) → fix → verify (typecheck+test+browser) →
> commit lokal → riset kekurangan berikutnya. **Semua lokal, tidak di-push.**

| # | Commit | Isi |
|---|---|---|
| T1 | `93fb873` | i18n: 3 `<small>` kartu mode bahasa Indonesia → ES + 5 entri EN |
| T2 | `6408c4f` | konsol 0 error: warning Firestore host (`merge:true`) + `autocomplete="current-password"` |
| T4 | `5c35bf0` | i18n autochess: LAWAN/TIMMU/Ready/aria → ES source + dict EN + tes |
| T5 | `09925c5` | i18n: entri EN toggle telemetría (fragment `Partida`→Save merusak frasa) |
| T6 | `8506c44` | `autocomplete="username"` di `#f-user` |
| T7 | `b19cfa4` | **bug besar**: papan TD landscape collapse 18×18 — selector `.ac-me-grid` mati sejak lahir (DOM pakai `id`), arow → `stretch`. Tes `tests/layout-css.test.ts` |
| T7b | `3dc9615` | dock kompak ≤760px landscape (tienda tak terpotong) + Versión About 3.0 |
| T8 | `dfc8f85` | autochess landscape dual-arena: dock `flex-direction:column` base menang urutan → spesifikasikan; arenas+arow `stretch` (putus lingkaran `fitAutoTiles`); arow `flex:1 1 0` → simetris |
| T9 | *(lihat `git log`)* | **P26b a11y**: `role`+`aria-label` sel papan (posisi/isi/seleksi), kartu shop, tombol sell/reroll, sel musuh `role=img`; 7 entri dict EN (pola `{x}`) + 4 tes a11y |

Hasil: **371 tes / 21 file hijau**, tsc bersih, konsol browser 0 error 0
warning, layout diverifikasi di 1440/1200/667/640 landscape + 375×667
portrait. Temuan review lain (belum dikerjakan): tab Accessibility settings
cuma 1 baris, logo About masih "PokéSurvivor", `synbar` tumpah ~20px di band
pendek (tampilan OK, diparkir).

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
