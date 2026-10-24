# Pokémon Auto Chess — Game Design: Sistem Bersama (Shared)

> Berlaku untuk **kedua mode** (Full Autochess & Tower Defence).
> Mode-specific: lihat `game-design-autochess.md` / `game-design-td.md`.

---

## 1. Unit Pemain (Defenders)

Sistem *level-up* menggunakan mekanik *merge* 2 unit yang sama:
* **★1 (Base):** Unit dasar dari Shop.
* **★2 (Stage 1):** Gabungan 2x unit ★1.
* **★3 (Final Stage):** Gabungan 2x unit ★2 (total 4x ★1).

**Aturan merge (same-cell drop):** 2 unit sama **boleh** berada di petak berbeda (beli tidak auto-merge). Naik bintang **hanya** saat satu unit di-*drop* ke petak berisi unit dengan **dex + star sama** (drag kartu shop ke petak champion ★1, atau tap-select lalu tap petak target) — hasil merge ada di petak target. ★3 adalah batas.

**Evolusi saat merge:** ★2/★3 menampilkan **bentuk evolusi** (sprite, nama, tipe, dan base stats HP/ATK/spd mengikuti entri evolusi, di-*multiply* star multiplier seperti biasa). Data rantai dari PokeAPI → `src/data/evo-map.ts` (generate: `node tools/fetch-evo.mjs`). Yang **tetap** identitas champion: Skill Dasar, signature move, harga jual — semua tetap di-key base dex (`unit.dex` tidak pernah berubah saat merge). Contoh: Charmander ★3 = sprite/stats/tipe Charizard (Fire+Flying), skill tetap skill line Charmander.

### Daftar Line-Up Pokémon

| Cost | ★1 | ★2 | ★3 | Tipe | Skill Dasar |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1 Gold** | Bulbasaur | Ivysaur | Venusaur | Grass | Memberikan *poison damage* per detik (DoT) ke musuh. |
| **1 Gold** | Charmander | Charmeleon | Charizard | Fire | Serangan api area (AoE) yang memberikan efek *burn*. |
| **1 Gold** | Squirtle | Wartortle | Blastoise | Water | Mendorong mundur (*knockback*) musuh. |
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

## 2. Gelombang Musuh (Enemy Waves)

Kekuatan meningkat per gelombang (*Wave*). 20 wave total.

### 1. Musuh Biasa (Early - Mid Wave)

| Nama Pokémon | Tipe Musuh | Karakteristik Dasar |
| :--- | :--- | :--- |
| **Rattata** | Basic | Stat seimbang (HP dan *Movement Speed* standar). Muncul di Wave awal. |
| **Zubat** | Swarm (Gerombolan) | HP tipis, tetapi datang dalam jumlah sangat banyak sekaligus. |
| **Diglett** | Fast (Runner) | HP rendah, *Movement Speed* sangat cepat untuk menerobos garis pertahanan. |
| **Geodude** | Armored (Tank) | Jalan lambat, tetapi memiliki *Physical Defense* tinggi (lemah terhadap serangan Magic/Elemen). |
| **Koffing** | Debuffer | **Wave ≥ 10 (pool MID).** Saat mati, meledakkan asap racun yang memperlambat *Attack Speed* unit di dekatnya. |
| **Magnemite** | Shielded | **Wave ≥ 10 (pool MID).** Memiliki *Shield* tambahan yang harus dihancurkan sebelum HP utamanya berkurang. |

### 2. Musuh Elite (Mid - Late Wave)

| Nama Pokémon | Tipe Musuh | Karakteristik Dasar |
| :--- | :--- | :--- |
| **Raticate** | Elite Basic | Versi kuat dari Rattata dengan HP dan kecepatan gerak menengah ke atas. |
| **Golbat** | Elite Swarm | Bergerak cepat dan memulihkan sedikit HP setiap beberapa detik (*Regen*). |
| **Graveler** | Heavy Tank | HP sangat tebal dan kebal terhadap efek *Knockback* (dorongan). |
| **Scyther** | Elite Runner | Berlari sangat cepat dan bisa menghindari (*Dodge*) 20% serangan biasa. |
| **Haunter (Wild)** | Phasing | Kebal terhadap efek *Slow*; kemampuan *phasing* menyusul (ditunda v2). |

### 3. Boss Wave (Setiap 5 Wave)

| Wave | Nama Boss | Karakteristik Boss |
| :--- | :--- | :--- |
| **Wave 5** | **Onix** | HP besar, kebal terhadap efek *Stun*. |
| **Wave 10** | **Snorlax** | HP sangat tebal. Saat HP mencapai 50%, berhenti sebentar untuk memulihkan 20% HP (*Rest*). |
| **Wave 15** | **Gyarados** | Mengeluarkan *Roar* setiap 10 detik yang mengurangi *Attack Damage* menara di sekitarnya. |
| **Wave 20** | **Mewtwo (Final Boss)** | Mempunyai *Barrier* penahan *damage* dan sesekali menonaktifkan (*Disable*) 1 unit acak selama 3 detik. |

---

## 3. Pertempuran (Auto-Attack & Skill)

* **Animasi serangan** mengikuti *kind* move (sama seperti dungeon):
  * `melee` / `nova` / `dash` → anim **Attack**
  * `projectile` / `beam` / `chain` / `boomerang` / `cone` → anim **Shoot**
  * `aura` / `buff` / `meteor` / `mine` / `turret` → anim **Charge** (juga dipakai saat cast Skill aktif)
  * Kecepatan anim disetel otomatis `animLen / (atkCd × 0.9)` seperti `player.cast` di dungeon; SFX *shot* mengikuti *kind*/*type* move.
  * Sprite musuh **kedip merah** saat terkena hit.
* **Damage:** `ATK × efektivitas tipe × skill-dmg × (1 − armor − shred)`; ★ menaikkan ATK (`×1 / ×1.8 / ×3.5`) dan kecepatan serang (`×1 / ×1.2 / ×1.5`).
* **Mana & Skill:** setiap pukulan `+10 Mana`; penuh (100) → cast *Skill Dasar* champion. **★3 = efek skill ×2** (*Efek Skill Maksimal*).
* **Musuh tidak menyerang balik** (saat ini); musuh tetap memakai *ability* pendukungnya (Snorlax *Rest*, Gyarados *Roar*, Mewtwo *Disable*, regen, shield, dll).

---

## 4. Sistem Ekonomi (Gold & Harga Jual)

* **Starting Gold (Wave 1):** 5 Gold (Cukup untuk membeli 3–5 unit Tier 1 di awal).
* **Gold dari Musuh (Kill Bounty):**
  * Musuh Biasa: +1 Gold per 3–5 kill (atau drop koin langsung).
  * Musuh Elite: +2 Gold per kill.
  * Boss: +10 Gold per kill.
* **End of Wave Bonus:** `3 + floor(wave / 2)` Gold setiap kali berhasil menyelesaikan 1 Wave (wave 1 → 3, wave 10 → 8, wave 20 → 13).
* **Biaya Reroll Shop:** 1 Gold (flat).
* **Harga Jual Unit (Refund):**
  * Jual ★1 = Kembali 100% harga beli (Misal: Cost 1 dijual dapat 1 Gold).
  * Jual ★2 = Kembali harga gabungan dikurangi 1 Gold (Misal: Gabungan 2x Cost 1 = 2 Gold, dijual dapat 1 Gold).
  * Jual ★3 = Kembali 75% dari total modal.

### Peluang Kemunculan Unit di Shop (Shop Odds per Wave)

| Fase Wave | Tier 1 (1 Gold) | Tier 2 (2 Gold) | Tier 3 (3 Gold) | Tier 4 (4 Gold) |
| :--- | :--- | :--- | :--- | :--- |
| **Wave 1 – 4** | 80% | 20% | 0% | 0% |
| **Wave 5 – 9** | 55% | 30% | 15% | 0% |
| **Wave 10 – 14** | 35% | 35% | 25% | 5% |
| **Wave 15 – 20** | 20% | 30% | 35% | 15% |

### Rumus Scaling (Evolusi & Kekuatan Musuh)

* **Multiplier Evolusi Pokémon (Merge-2):**
  * **★1 (Base):** 100% Attack Damage | 100% Attack Speed
  * **★2 (Merge 2x ★1):** 180% Attack Damage | 120% Attack Speed
  * **★3 (Merge 2x ★2):** 350% Attack Damage | 150% Attack Speed + *Efek Skill Maksimal*
* **Scaling HP Musuh per Wave:**
  * `HP Musuh = Base HP × (1 + (Wave Saat Ini × 0.25))`

### Daftar Buff (Kartu Pilihan)

Dipilih acak 3 dari 5 berikut, berlaku sisa run:

| Nama Buff | Efek |
| :--- | :--- |
| **Power Up** | ATK tim ×1.1 |
| **Tough Skin** | HP tim ×1.1 |
| **Quick Feet** | Attack Speed tim ×1.1 |
| **Windfall** | +5 Gold langsung |
| **Repair** | Heart pemain +15 HP (dibatasi max HP). |
