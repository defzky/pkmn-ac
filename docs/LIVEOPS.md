# Live Ops & Retention

> Bagaimana game ini bertahan setelah rilis: loop retention, cadence konten,
> leaderboard, dan tuning. Saat ini = **live-ops ringan, semua lokal/offline**
> kecuali leaderboard Firebase.

## 1. Loop retention yang SUDAH ada

| Loop | Mekanisme | Lokasi |
|---|---|---|
| **Daily Run** | seed = tanggal lokal (`mulberry32`), wave + shop seeded → semua pemain main seed sama; best per-tanggal disimpan (cap 30 hari) | `src/autochess/rng.ts`, `ac-save.ts` |
| **Skor & meta** | `runScore = wave×100 + hp×5 + gold`; best global + best endless; overlay `★ NEW BEST` | `base.ts runScore`, `ac-save.ts recordRun` |
| **Endless** | menang wave 10 → lanjut tanpa batas (skor makin tinggi) | `resumeEndless` (kedua runner) |
| **Run pendek (5 menit)** | sprint 10 wave — barrier rendah untuk repeat session | GDD common §2 |
| **Leaderboard Firebase** | koleksi `lb/{board}/e`, `lbs/{board}` top-50, anti-cheat server-side di rules | `firestore.rules` |
| **Friend code** | `friendships` + presence | `firestore.rules` |

## 2. Kandidat loop berikutnya (urut nilai/effort)

1. **Streak harian** — main Daily Run N hari berturut → badge/angka di mode
   select (data lokal, 0 infra baru).
2. **Weekly seed** — seed mingguan kompetitif (seed = ISO week) di samping
   harian; leaderboard board terpisah `lb/weekly`.
3. **Misi harian** (3 misi: "win tanpa leak", "merge 2★", "pakai affix X") —
   reuse pool buff/affix, hadiah gold awal; data di save v4 (`ac.daily`).
4. **Season/leaderboard reset** — kalau meta berubah besar (ROADMAP P25),
   reset `lbs` + note di changelog.

Semua = data lokal dulu; jangan tambah backend baru sebelum `ROADMAP.md` P23
(analytics) selesai agar efektifitas terukur.

## 3. Content cadence

| Jenis | Sumber data | Frekuensi ideal |
|---|---|---|
| Champion baru | `champions.ts` + pokedex stat | tiap 2–4 minggu (batch 2–4) |
| Affix baru | `wave.ts AFFIXES` (rotasi 4 sekarang) | per season |
| Augment baru | `buffs.ts POOL` (13 sekarang) | per season |
| Boss/bisa mechanic | `unitAI.ts` boss flags | per season |

Sync wajib: GDD (`game-design-common.md` §2/§5) → kode → test → `ROADMAP.md`
status. **Spec dulu, kode kemudian** (konvensi ROADMAP §4).

## 4. Tuning loop (berbasis data, bukan perasaan)

```
sim otomatis (tests/autochess-sim.test.ts, 100 run seeded)
        │
        ▼
run_end events (setelah P23) → win-rate per mode / wave leak histogram
        │
        ▼
ubah 1 variabel (waveMul, interestCap, affix params…)
        │
        ▼
typecheck + test ×2 + sim hijau → commit → GDD update kalau spec berubah
```

- Baseline sim sekarang: dual **50W/0L**, TD **48W/2L** — TD menang terlalu
  mudah → kandidat tuning pertama (`ROADMAP.md` P25).
- Jangan balance dari 1 playtest; pakai sim (sample 100+) + event (nanti).

## 5. Update & rollback

- Deploy = upload `dist/` statis (lihat `PLATFORM.md` §4 checklist).
- Rollback = upload ulang build lama (simpan artifact per tag) + `version.json`
  lama; sw cache memaksa refresh dengan bump `ps-*` const.
- Save schema: **forward-only** (`SAVE_VERSION` naik + `migrate()`) — tidak
  ada rollback save; pastikan migrate selalu menambah field (tanpa hapus).
- Rules Firebase: ubah rules = review sendiri dulu (leaderboard anti-cheat);
  emulator lokal untuk uji (`firebase emulators:start`).

## 6. Komunitas & feedback

- Kanal utama saat ini: langsung ke owner (belum ada Discord/issue publik).
- Kalau buka publik: README jadi pintu — tambahkan link feedback + `ROADMAP.md`
  §5 (siap-rilis) sebelumnya.
- Patch note = ringkas dari `git log` per tag; format bebas (tidak ada
  CHANGELOG file — kandidat kecil di ROADMAP).
