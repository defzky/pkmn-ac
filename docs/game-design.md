# Pokémon Auto Chess Tower Defense - Game Design Document (Basic)

---

## BAGIAN 1: Unit Pemain (Defenders)

Sistem *level-up* menggunakan mekanik *merge* 2 unit yang sama:
* **★1 (Base):** Unit dasar dari Shop.
* **★2 (Stage 1):** Gabungan 2x unit ★1.
* **★3 (Final Stage):** Gabungan 2x unit ★2 (total 4x ★1).

### Daftar Line-Up Pokémon

| Cost | ★1 | ★2 | ★3 | Tipe | Skill Dasar |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1 Gold** | Bulbasaur | Ivysaur | Venusaur | Grass | Memberikan *poison damage* per detik (DoT) ke musuh. |
| **1 Gold** | Charmander | Charmeleon | Charizard | Fire | Serangan api area (AoE) yang memberikan efek *burn*. |
| **1 Gold** | Squirtle | Wartortle | Blastoise | Water | Mendorong mundur (*knockback*) musuh di jalur. |
| **1 Gold** | Pidgey | Pidgeotto | Pidgeot | Flying | Serangan tunggal jarak jauh dengan *Attack Speed* cepat. |
| **2 Gold** | Mareep | Flaaffy | Ampharos | Electric | Serangan listrik berantai ke beberapa musuh + peluang *Stun*. |
| **2 Gold** | Machop | Machoke | Machamp | Fighting | Serangan jarak dekat dengan *damage* besar dan pengurang *Armor*. |
| **2 Gold** | Gastly | Haunter | Gengar | Ghost | Menyerang musuh dengan HP terendah (*burst damage*). |
| **3 Gold** | Abra | Kadabra | Alakazam | Psychic | *Single-target magic damage* tinggi untuk melawan Boss. |
| **3 Gold** | Aron | Lairon | Aggron | Steel | Menahan musuh dengan *Defense* dan HP sangat tebal. |
| **3 Gold** | Swinub | Piloswine | Mamoswine | Ice | Memperlambat jalan musuh (*Slow*) di area sekitar. |
| **4 Gold** | Ralts | Kirlia | Gardevoir | Fairy | Meningkatkan *Attack Speed* unit kawan di sekitarnya + serangan AoE. |
| **4 Gold** | Dratini | Dragonair | Dragonite | Dragon | Serangan meteor area luas dengan *damage* sangat tinggi. |

### Sinergi Tipe Dasar

* **Fire:** Tambahan *Attack Damage* & efek *burn*.
* **Water:** Pemulihan *Mana* lebih cepat saat menyerang.
* **Grass:** Regenerasi HP / racun per detik ke musuh.
* **Electric:** Peluang serangan memantul ke musuh lain.
* **Psychic:** Peningkatan *damage skill* aktif.

---

## BAGIAN 2: Gelombang Musuh (Enemy Waves)

Musuh berjalan mengikuti jalur (*path*) menuju Base dan meningkat kekuatannya berdasarkan fase gelombang (*Wave*).

### 1. Musuh Biasa (Early - Mid Wave)

| Nama Pokémon | Tipe Musuh | Karakteristik Dasar |
| :--- | :--- | :--- |
| **Rattata** | Basic | Stat seimbang (HP dan *Movement Speed* standar). Muncul di Wave awal. |
| **Zubat** | Swarm (Gerombolan) | HP tipis, tetapi datang dalam jumlah sangat banyak sekaligus. |
| **Diglett** | Fast (Runner) | HP rendah, *Movement Speed* sangat cepat untuk menerobos garis pertahanan. |
| **Geodude** | Armored (Tank) | Jalan lambat, tetapi memiliki *Physical Defense* tinggi (lemah terhadap serangan Magic/Elemen). |
| **Koffing** | Debuffer | Saat mati, meledakkan asap racun yang memperlambat *Attack Speed* unit di dekatnya. |
| **Magnemite** | Shielded | Memiliki *Shield* tambahan yang harus dihancurkan sebelum HP utamanya berkurang. |

### 2. Musuh Elite (Mid - Late Wave)

| Nama Pokémon | Tipe Musuh | Karakteristik Dasar |
| :--- | :--- | :--- |
| **Raticate** | Elite Basic | Versi kuat dari Rattata dengan HP dan kecepatan gerak menengah ke atas. |
| **Golbat** | Elite Swarm | Bergerak cepat dan memulihkan sedikit HP setiap beberapa detik (*Regen*). |
| **Graveler** | Heavy Tank | HP sangat tebal dan kebal terhadap efek *Knockback* (dorongan). |
| **Scyther** | Elite Runner | Berlari sangat cepat dan bisa menghindari (*Dodge*) 20% serangan biasa. |
| **Haunter (Wild)** | Phasing | Kebal terhadap efek *Slow* dan bisa menembus *unit blocker* di jalur. |

### 3. Boss Wave (Setiap 5 Wave)

| Wave | Nama Boss | Karakteristik Boss |
| :--- | :--- | :--- |
| **Wave 5** | **Onix** | HP besar, jalan sangat lambat, kebal terhadap efek *Stun*. |
| **Wave 10** | **Snorlax** | HP sangat tebal. Saat HP mencapai 50%, berhenti sebentar untuk memulihkan 20% HP (*Rest*). |
| **Wave 15** | **Gyarados** | Mengeluarkan *Roar* setiap 10 detik yang mengurangi *Attack Damage* menara di sekitarnya. |
| **Wave 20** | **Mewtwo (Final Boss)** | Mempunyai *Barrier* penahan *damage*, jalan cepat, dan sesekali menonaktifkan (*Disable*) 1 menara acak selama 3 detik. |

---

## BAGIAN 3: Papan, Penempatan, & Kontrol

* **Grid 3x3 (9 petak batu)** di tengah layar; jalur *ring* 16 sel mengelilinginya — Spawn di tengah-atas, Base di tengah-bawah, dua cabang (kiri/kanan) simetris.
* **Bench 2 slot.** Kapasitas unit di papan = `min(8, 1 + floor(level / 2))`.
* **Cara beli & taruh:**
  * **Drag & Drop:** seret kartu *Shop* ke petak kosong → unit langsung **beli + taruh** di petak itu; seret ke area lain (bench/ruang kosong) → beli ke *bench*. Overlay kartu (*ghost*) mengikuti pointer saat diseret.
  * **Tap (fallback):** tap kartu → beli ke *bench*; tap unit → tap petak → pindah.
  * Jarak drag < 6px dianggap tap (tidak dobel beli).
* **Keyboard:** `1`–`3` beli kartu, `R` reroll (2 Gold), `Space`/`Enter` mulai wave, `Esc` pause.
* **Jangkauan serang (Chebyshev):** Melee = **2 sel**, Ranged = **3 sel** — petak center menjangkau jalur dari jarak 2.
* Saat **combat**: penempatan & penjualan **dikunci**; beli & *merge* tetap boleh (real-time).

---

## BAGIAN 4: Pertempuran (Auto-Attack & Skill)

* **Targeting:** unit menyerang musuh dalam jangkauan dengan **progress terbesar** — yaitu minion **terdepan** (paling dekat mencapai Base); seri jarak → yang paling dekat.
* **Animasi serangan** mengikuti *kind* move (sama seperti dungeon):
  * `melee` / `nova` / `dash` → anim **Attack**
  * `projectile` / `beam` / `chain` / `boomerang` / `cone` → anim **Shoot**
  * `aura` / `buff` / `meteor` / `mine` / `turret` → anim **Charge** (juga dipakai saat cast Skill aktif)
  * Sprite musuh **kedip merah** saat terkena hit.
* **Damage:** `ATK × efektivitas tipe × skill-dmg × (1 − armor − shred)`; ★ menaikkan ATK (`×1 / ×1.8 / ×3.5`) dan kecepatan serang (`×1 / ×1.2 / ×1.5`).
* **Mana & Skill:** setiap pukulan `+10 Mana`; penuh (100) → cast *Skill Dasar* champion (Bagian 1). **★3 = efek skill ×2** (*Efek Skill Maksimal*).
* **Musuh tidak menyerang unit** (TD murni). Lolos ke Base: **−5 HP**, Boss lolos: **−20 HP**.
* **Kecepatan gerak musuh** diskalakan global `×0.6` — lintasan ring 8 sel ±7–13 detik supaya sempat merespons.

---

## BAGIAN 5: Sistem Ekonomi, Scaling, & Alur Game (Core Systems)

---

### 1. Sistem Ekonomi (Gold & Harga Jual)

* **Starting Gold (Wave 1):** 5 Gold (Cukup untuk membeli 3–5 unit Tier 1 di awal).
* **Gold dari Musuh (Kill Bounty):**
  * Musuh Biasa: +1 Gold per 3–5 kill (atau drop koin langsung).
  * Musuh Elite: +2 Gold per kill.
  * Boss: +10 Gold per kill.
* **End of Wave Bonus:** +3 Gold setiap kali berhasil menyelesaikan 1 Wave.
* **Biaya Reroll Shop:** 2 Gold (Tetap/Flat agar simpel).
* **Harga Jual Unit (Refund):**
  * Jual ★1 = Kembali 100% harga beli (Misal: Cost 1 dijual dapat 1 Gold).
  * Jual ★2 = Kembali harga gabungan dikurangi 1 Gold (Misal: Gabungan 2x Cost 1 = 2 Gold, dijual dapat 1 Gold).
  * Jual ★3 = Kembali 75% dari total modal.

### 2. Peluang Kemunculan Unit di Shop (Shop Odds per Wave)

Agar pemain tidak langsung mendapatkan *Dratini (4 Gold)* di Wave 1, peluang isi *Mini-Shop* diatur mengikuti progres Wave:

| Fase Wave | Tier 1 (1 Gold) | Tier 2 (2 Gold) | Tier 3 (3 Gold) | Tier 4 (4 Gold) |
| :--- | :--- | :--- | :--- | :--- |
| **Wave 1 – 4** | 80% | 20% | 0% | 0% |
| **Wave 5 – 9** | 55% | 30% | 15% | 0% |
| **Wave 10 – 14** | 35% | 35% | 25% | 5% |
| **Wave 15 – 20** | 20% | 30% | 35% | 15% |

### 3. Rumus Scaling (Evolusi & Kekuatan Musuh)

* **Multiplier Evolusi Pokémon (Merge-2):**
  Menggabungkan 2 unit ★1 menjadi 1 unit ★2 harus terasa menguntungkan karena jumlah unit di papan berkurang dari 2 menjadi 1:
  * **★1 (Base):** 100% Attack Damage | 100% Attack Speed
  * **★2 (Merge 2x ★1):** 180% Attack Damage | 120% Attack Speed
  * **★3 (Merge 2x ★2):** 350% Attack Damage | 150% Attack Speed + *Efek Skill Maksimal*
* **Scaling HP Musuh per Wave:**
  * `HP Musuh = Base HP × (1 + (Wave Saat Ini × 0.25))`
  * *Contoh:* Rattata (Base HP 100) di Wave 1 punya 125 HP, sedangkan di Wave 10 punya 350 HP.

### 4. Alur State Permainan (Game State Machine)

1. **PREP PHASE (30 Detik atau Klik "Start Wave"):**
   * *Shop* di-refresh **gratis** (3 kartu baru sesuai odds wave) — otomatis setiap wave selesai, atau manual lewat Reroll (2 Gold).
   * Pemain membeli Pokémon (tap atau **drag & drop** ke petak), menaruh ke Grid 3x3, dan melakukan *Merge-2*.
2. **COMBAT PHASE (Wave Berjalan):**
   * Musuh keluar dari titik *Spawn* secara berkala dan berjalan mengelilingi Grid 3x3 menuju Base.
   * Pokémon di atas Grid menyerang otomatis ke musuh **terdepan** dalam jangkauan (*Auto-Attack* animasi Attack/Shoot/Charge & *Auto-Skill* saat Mana penuh — lihat Bagian 4).
   * *Catatan:* Pemain tetap bisa membeli dan melakukan *merge* saat musuh sedang berjalan (Real-time); penempatan terkunci.
3. **BUFF SELECTION PHASE (Setiap Kelipatan 3 Wave):**
   * Permainan *pause* sejenak.
   * Muncul *Pop-up* 3 Kartu Buff acak di layar.
   * Setelah pemain memilih 1 kartu, masuk kembali ke *Prep Phase* Wave berikutnya (shop juga sudah ikut ter-refresh).
4. **WIN / GAME OVER STATE:**
   * **Menang:** Berhasil mengalahkan Boss di Wave 20.
   * **Kalah:** HP Trainer mencapai 0 karena terlalu banyak musuh yang lolos ke Base.

### 5. Daftar Buff (Kartu Pilihan)

Dipilih acak 3 dari 5 berikut, berlaku sisa run:

| Nama Buff | Efek |
| :--- | :--- |
| **Power Up** | ATK tim ×1.1 |
| **Tough Skin** | HP tim ×1.1 |
| **Quick Feet** | Attack Speed tim ×1.1 |
| **Windfall** | +5 Gold langsung |
| **Repair** | Base +15 HP (dibatasi max HP) |
