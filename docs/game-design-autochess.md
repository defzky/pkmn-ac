# Pokémon Auto Chess — Game Design: Mode Full Autochess

> Mode **dual-board auto-battler** (P18). Dua arena 3x3 berdampingan —
> musuh di atas, tim di bawah. Tidak ada jalur (*path*); musuh berdiri
> tetap di slot arena dan dihabisi di tempat.
> Sistem bersama (unit, shop, sinergi, ekonomi, buff): `game-design-common.md`.

---

## 1. Arena, Penempatan, & Kontrol

* **Dua arena 3x3 berdampingan:**
  * **Arena musuh (atas):** slot tetap y −1 … y −3 (baris depan y −1). Musuh spawn berurutan dari baris depan; maksimum 9 terlihat sekaligus.
  * **Arena pemain (bawah):** grid 3x3 y 0 … y 2. Tanpa *bench* di alur beli — unit langsung auto-place ke petak kosong pertama (*back-to-front*). (Infra bench `BENCH_SIZE=2` masih ada di kode tapi tidak dipakai alur buy.) **Tanpa batas unit** — grid 3x3 (9 petak) adalah limitnya.
* **Cara beli & taruh:**
  * **Drag & Drop:** seret kartu *Shop* ke petak kosong → unit langsung **beli + taruh** di petak itu; seret ke area lain → beli (auto-place petak kosong). Overlay kartu (*ghost*) mengikuti pointer.
  * **Tap (fallback):** tap kartu → beli + auto-place; tap unit → tap petak → pindah.
  * Jarak drag < 6px dianggap tap (tidak dobel beli).
* **Keyboard:** `1`–`3` beli kartu, `R` reroll (**1 Gold**), `Space`/`Enter` mulai round, `Esc` pause.
* **Jangkauan serang (Chebyshev lintas arena):** Melee = **2 sel**, Ranged = **3 sel**; jarak baris depan↔depan dipadatkan (y2 ↔ y−1 = 0 sel vertikal) sehingga unit baris depan langsung menjangkau musuh di depannya.
* **Tile buff harian:** 2 petak arena pemain diberi penanda *buff* acak per round (visual).
* Saat **combat**: penempatan & penjualan **dikunci**; **beli** tetap boleh (auto-place). *Merge* butuh drop ke petak target → hanya saat **prep**.
* **Ready button:** mulai round lebih awal; kalau tidak ada unit terpasang, tolak dengan toast "Place units first".

## 2. Pertempuran (Targeting & Round)

* **Targeting:** unit menyerang musuh dalam jangkauan dengan **posisi paling depan** — baris depan arena musuh (y −1) didahulukan; seri → yang paling dekat.
* **Round tanpa jalur:** musuh **berdiri tetap** di slotnya (tidak berjalan, tidak lolos). Kemenangan round = semua musuh mati.
* **Tim kosong** (tidak ada unit terpasang / habis terbunuh) → round kalah → heart pemain terkena damage.

## 3. Alur State Permainan (Game State Machine)

1. **PREP PHASE (30 Detik atau Klik "Ready"):**
   * *Shop* di-refresh **gratis** (3 kartu baru sesuai odds wave) — otomatis setiap round selesai, atau manual lewat Reroll (1 Gold).
   * Pemain membeli Pokémon (tap atau **drag & drop** ke petak), unit **auto-place** ke petak kosong pertama (2 unit sama beda petak = boleh, tak auto-merge), lalu susun ulang / *Merge-2* dengan **drop ke petak berisi unit sama**.
   * Timer bar menunjukkan sisa waktu; tombol **Ready** menekan waktu habis (wajib sudah ada unit).
2. **COMBAT PHASE (Round Berjalan):**
   * Musuh spawn bertahap ke slot arena atas (baris depan dulu, maks 9).
   * Pokémon di arena bawah menyerang otomatis musuh **paling depan** dalam jangkauan (*Auto-Attack* animasi Attack/Shoot/Charge + SFX & FX proyektil dungeon, *Auto-Skill* saat Mana penuh — lihat common Bagian 3).
   * *Catatan:* Pemain tetap bisa membeli saat round berjalan (real-time, auto-place); penempatan & merge (drop) terkunci — hanya prep.
3. **ROUND RESULT (otomatis):**
   * **Menang round:** semua musuh mati → heart musuh terkena **1 + jumlah penyintas**; bonus **`3 + floor(wave/2)` Gold**. Heart musuh = 20 HP.
   * **Kalah round:** tim kosong/terhabisi → heart pemain terkena **3 + floor(wave/4)**; heart pemain = 45 HP.
4. **BUFF SELECTION PHASE (Setiap Kelipatan 3 Round):**
   * Permainan *pause* sejenak; muncul *Pop-up* 3 Kartu Buff acak.
   * Setelah memilih 1 → kembali ke *Prep Phase* (shop sudah ter-refresh).
5. **WIN / GAME OVER STATE:**
   * **Menang:** heart musuh mencapai 0 **atau** round 20 dimenangkan.
   * **Kalah:** heart pemain mencapai 0 (biasanya 2–3 kekalahan round berturut-turut).
