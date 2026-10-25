# QA & Analytics

> Strategi pengujian, regression policy, checklist manual, dan spesifikasi
> analytics (belum diimplementasi — lihat `ROADMAP.md` P23).

## 1. Test strategy (otomatis)

Runner: **Vitest 3** + happy-dom. 18 suite `tests/*.test.ts` + `setup.ts`.

| Layer | Suite | Apa yang dijaga |
|---|---|---|
| Unit murni | `data`, `autochess-data`, `autochess-board`, `autochess-shop`, `autochess-team`, `ac-save`, `ac-rng`, `db` | save v4 migrate/merge/sanitize, wave compose, affix, economy math, RNG deterministik (daily seed) |
| Combat | `autochess-battle` | damage pipeline (typeMult/eff/armor/flank/affix), mob fight-back (chip/bulwark/slot-war), death/respawn, augment effects |
| Mesin state | `autochess-runner`, `autochess-td-runner` | phase transitions, leak, interest/streak, endless, seeded spawn |
| Render/UI (jsdom) | `autochess-ui`, `sprites-fit` | DOM screen, banner/juice hooks, **fitDraw budget 0.94/0.92** |
| FX | `autochess-move-fx` | pipeline animasi move (terkunci — baca `PLAN-move-animation.md` sebelum sentuh) |
| **Balance sim** | `autochess-sim` | 100 run seeded (50 dual + 50 TD), invariants per tick (gold≥0, hp dalam range, wave finit), win-rate |
| Legacy dungeon | `entity`, `evo`, `gacha` | regresi mode dungeon |

### Regression policy (wajib tiap perubahan — konvensi repo)

```bash
npm run typecheck && npm test   # ×2 run untuk flake (test diketahui kadang race)
npm run build                   # pastikan bundle hijau
```

- **Satu commit per fase**; kalau test gagal → fix dulu, jangan amend commit
  yang sudah hijau.
- Test baru = unit dulu, jsdom kalau menyentuh UI. Mock yang selalu dipakai:
  UI (`spriteCanvas` wajib terapkan arg w/h, `spriteFaint/spriteHit` = vi.fn),
  Audio, rAF; `getBoundingClientRect` di-mock per-test saat butuh pitch.
- Jsdom: canvas ctx sering `null` → kode wajib guard (lihat `NON-FUNCTIONAL.md` §5).
- Kalau menambah snapshot/golden: hindari — repo pakai assert behavior.

## 2. Test known-flake

- Dulu: `'hp bar tracks mob hp'` (mob mati saat tick acak) — sudah diperbaiki
  (`m.alive = true` di test). Kalau muncul flake baru → tandai + fix di test
  yang sama commit-nya, jangan di-skip.

## 3. Manual QA checklist (pre-release)

| # | Cek | Expected |
|---|---|---|
| 1 | Desktop portrait + landscape | autochess: dock selalu terlihat; TD: grid tanpa dead-space hitam |
| 2 | Mobile landscape (install PWA) | fullscreen, tanpa scroll aneh, touch drag shop→cell jalan |
| 3 | Mobile portrait | dungeon: overlay rotate; autochess: kolom 440px rapi |
| 4 | Mode switch TD ↔ auto ↔ daily | tidak ada sisa elemen lane/portal/kastle di mode lain (Fase R) |
| 5 | Daily Run banner + seed sama | dua kali buka daily → shop/wave identik |
| 6 | Save lokal | reload → best score/wave bertahan; guest (tanpa login) aman |
| 7 | Offline (dev tools → offline) | gameplay jalan, leaderboard fail-silent |
| 8 | Update PWA | deploy baru terdeteksi (version.json/sw) |
| 9 | Suara + FX | banner wave, leak, place/merge, dmg number berwarna eff |
| 10 | `docs/LEGAL.md` §2 masih valid | kredit SpriteCollab tampil (footer + settings) |

## 4. Analytics — SPESIFIKASI (belum aktif)

Tujuan: ukur retention & funnel **tanpa PII** (privacy: `LEGAL.md` §4;
aktifkan hanya setelah privacy note diperbarui — `ROADMAP.md` P23).

### Event (kandidat final)

| Event | Params (non-PII) | Kapan |
|---|---|---|
| `run_start` | `mode` (td/auto/daily), `seed?` (bool: daily atau tidak), `ver` | `open()` |
| `run_end` | `mode`, `wave`, `score`, `endless`(bool), `win`, `duration_s` | `showOver` lost/won |
| `wave_leak` | `wave`, `boss`, `dmg` | `leakFx()` |
| `buff_pick` | `buff_id`, `wave` | `onBuffPick` |
| `augment_offer` | `ids[]` (offer terekspos) | `offerBuff()` |
| `shop_action` | `action` (buy/sell/reroll), `cost`, `star?` | onBuy/onSell/onReroll |
| `daily_join` | `dateKey` | `open('daily')` |

### Metrik turunan

- **Retention D1/D7**: pemain unik kembali (perlu id anon stabil — Firebase
  auth anonymous uid sudah ada; pakai uid = identitas, jangan email).
- **Funnel**: `run_start` → wave 5 → wave 10 → `run_end win`.
- **Mode split**: td vs auto vs daily share.
- **Difficulty signal**: rata-rata `wave_leak` per wave, win-rate per mode.
- **Augment balance**: win-rate dengan/tanpa tiap `buff_id` (sample size flag).

### Implementasi minimal (saat P23 dikerjakan)

- Batch lokal (array, flush tiap 10 event / 30s / run_end) → satu koleksi
  Firestore `telemetry/{autoId}` dengan TTL manual berkala.
- Tanpa payload device fingerprint, tanpa lokasi, tanpa string bebas dari user.
- Feature flag: kalau `Settings` toggle privacy off → kirim 0 event.
