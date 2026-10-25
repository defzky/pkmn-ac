# Legal, Atribusi & Privasi

> Berlaku untuk distribusi publik. Kode = MIT (`LICENSE`). Asset pihak ketiga =
> lisensi masing-masing (di bawah). Fan project non-profit.

## 1. Disclaimer fan game

- **Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc.**
- Proyek ini fan project tanpa orientasi profit ("Sin anuncios" — tanpa iklan).
- Tidak berafiliasi, tidak disponsori, tidak didukung ketiga perusahaan di atas.
- Nama "Pokémon" adalah trademark pemiliknya. Judul proyek: **PokéAutochess**
  (fan usage; jangan daftarkan trademark serupa).
- Aturan platform (jika nanti ada store/itch.io): wajib tulis disclaimer fan
  game + tidak mengaku resmi.

## 2. Atribusi asset

| Asset | Sumber | Lisensi | Lokasi |
|---|---|---|---|
| Sprite Pokémon (sheet stance per dex) | [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab) + artistanya | **CC BY-NC 4.0** (non-komersial, atribusi wajib) | `public/assets/pokemon/{dex}/{Idle,Walk,Attack,Shoot,Charge,Hurt,Faint}.png` (+ `s/` shiny) |
| Geometri sheet (anchor/frame) | `src/data/sprites-meta.js` (hasil `tools/fetch_sprites.py` — **script belum ada di repo**, metadata ter-commit) | bagian dari pipeline sendiri | src/data |
| Font Pixelify Sans | The Pixelify Sans Project | **SIL OFL 1.1** | `public/assets/fonts/` + `OFL.txt` |
| Ikon app | buatan sendiri (pixel) | MIT (bagian repo) | `public/assets/icons/` |
| Data evolusi (evo-map) | [PokéAPI](https://pokeapi.co) | disebutkan sesuai ketentuan PokéAPI | `src/data/evo-map.ts` (generated) |
| Nama/stat Pokémon (dex, types, moves) | data game fan — referensi dari PokéAPI | referensi non-komersial | `src/data/pokedex.js`, `moves` |

Atribusi **sudah tampil di game**: baris `#credits-line` (footer) + menu
Settings → kredit (`src/ui/settings-ui.ts`) + dialog legal (`index.html`
`[data-legal]`). Jangan hapus saat refactor.

### Konsekuensi CC BY-NC 4.0 (sprite)

- Boleh didistribusikan/dimodifikasi **non-komersial** dengan atribusi ke
  SpriteCollab + artist.
- Kode MIT ≠ asset MIT: **gabungan ini tidak boleh dijual** (NC di sprite).
- Kalau ada monetisasi apa pun (donasi berbayar, premium, iklan) → langgar
  NC. Cek `docs/LIVEOPS.md` §4 sebelum ubah model bisnis.

## 3. Panduan trademark

- ❌ Jangan pakai logo/wordmark resmi Pokémon, Pikachu silhouette resmi, atau
  desain UI yang meniru produk berlisensi resmi.
- ❌ Jangan sebut "official", "licensed", "dari The Pokémon Company".
- ✅ Boleh: mekanik autochess/TD orisinal + sprite fan (CC BY-NC) + nama
  Pokémon dalam konteks fan game dengan disclaimer.
- Ikon app & nama "PokéAutochess"/"PokéSurvivor" = buatan sendiri.

## 4. Privasi (Firebase)

Backend: Firebase project `pokesurvivor-free` (lihat `.firebaserc`).
**Tidak ada server sendiri, tidak ada SDK analytics Google** — telemetría
in-house (P23) memakai Firestore koleksi `telemetry` biasa (lihat §4a).

### Data yang dikumpulkan

| Data | Koleksi | Kapan | Siapa bisa lihat |
|---|---|---|---|
| Save game (roster, star, gold, wave, skor, best, daily) | `saves/{uid}` | main + login | pemilik saja (rules `request.auth.uid == uid`) |
| Nama unik player | `names/{lower}`, `profiles/{uid}` | pilih nama | publik (leaderboard) |
 | Profil publik | `profiles/{uid}` | login | publik terbatas |
| Entry leaderboard | `lb/{board}/e/{id}`, `lbs/{board}` | selesai run | publik read |
| Friend code / pertemanan | `friendships/{pid}` | add friend | publik terbatas |
| Laporan abuse | `reports/{rid}` | fitur report | admin saja |
| Presence (online) | `pres/{uid}` | login | publik terbatas |
| Event analitik anónima (P23) | `telemetry/{autoId}` | run/oleada/tienda (hanya sesi login) | admin saja (rules: client create-only) |

- **Tidak ada**: email/telefon di DB game (auth Firebase hanya token UID),
  payment data, lokasi, kontak, data pihak ketiga untuk iklan.
- Penyimpanan lokal (tanpa login): `localStorage` via `db.ts` (save v4) —
  hanya di perangkat pemain.

### Retensi & hapus

- Data Firebase mengikut project settings (belum ada TTL khusus).
- Hapus akun/data = hapus dokumen `saves/profiles/names` (manual via
  Firebase console saat ini — belum ada self-serve delete; kandidat backlog
  di `docs/ROADMAP.md`).
- Anti-cheat: validasi server `firestore.rules` (skor sanity: wave/gold cap,
  anti-duplikasi entry) — lihat komentar rules `lb`.

### §4a Telemetría (P23 — aktif 2026-10-25)

- **Isi**: 7 event enum + angka (`run_start/run_end/wave_leak/buff_pick/
  augment_offer/shop_action/daily_join`) — daftar lengkap di
  `docs/QA-ANALYTICS.md` §4. Tanpa nama, email, lokasi, IP, fingerprint
  device, atau string bebas dari pemain.
- **Identitas**: kolom `uid` = uid Firebase (pseudonymous, bukan PII) — hanya
  untuk retensi D1/D7. Sesi **tanpa login (guest) tidak mengirim apa pun**.
- **Kontrol pemain**: Ajustes → "Análisis anónimo" (default menyala) —
  matikan = 0 event dikirim.
- **Retensi**: dokumen `telemetry` boleh di-TTL/hapus berkala dari Firebase
  console (tidak mempengaruhi save game).

## 5. Monetisasi

- **Saat ini: nihil** — tanpa iklan, tanpa IAP, tanpa paid DLC.
- Gacha in-game (roster pull) = pakai gold in-game saja (lihat
  `docs/game-design-common.md`) — bukan transaksi nyata.
- Kalau berubah → wajib: (1) kompatibilitas NC sprite (kemungkinan besar
  perlu ganti sprite pack), (2) store policies, (3) update dokumen ini.

## 6. Lisensi kode

MIT — lihat `LICENSE`. Dependensi dev (vite, vitest, typescript, terser,
javascript-obfuscator, happy-dom) punya lisensi masing-masing, tidak
dibundel ke hasil build selain hasil compile sendiri.
