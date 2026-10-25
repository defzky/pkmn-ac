# Pokémon Auto Chess — Game Design: Sistem Bersama (Shared)

> Berlaku untuk **kedua mode** (Full Autochess & Tower Defence).
> Mode-specific: lihat `game-design-autochess.md` / `game-design-td.md`.

## 0. Pilar Desain (rework konsep 2026-10-25)

Target sesi **≈ 5 menit** — sprint ketat, tiap keputusan berbobot:

1. **Monsters Fight Back** — musuh menyerang unit pemain (kedua mode, aturan
   per-mode di doc masing-masing). Unit bisa mati & respawn. Tank/healer jadi
   nyata; posisi bukan kosmetik.
2. **Positioning bermakna** — TD: lane asimetris + flank bonus; Autochess:
   slot war baris depan. Papan kecil (3×3) tapi tiap petak punya aturan.
3. **Ekonomi dalam** — interest + streak di atas kill/wave bonus; keputusan
   "simpan gold vs beli sekarang" ada.
4. **Counter-building** — wave mengumumkan type + affix sebelum jalan; shop
   sedikit bias ke type penangkal.
5. **Longevity** — score, endless opt-in, augment rule-changer (bukan
   stat-stick), daily seed (lokal).

---

## 1. Unit Pemain (Defenders)

Merge-2 tetap: ★1 → ★2 (2×) → ★3 (4× ★1). Same-cell drop, prep-only, ★3 batas.
Evolusi sprite/stats mengikuti rantai evo (`evo-map.ts`); skill/ harga jual tetap
di-key base dex. ★ multiplier: ATK ×1/×1.8/×3.5, ATK-speed ×1/×1.2/×1.5,
★3 = skill effect ×2.

### Kehidupan unit (baru — Pilar 1)

* Unit punya **HP** (`hpCur/hp`, dari boardStats) dan **`alive`**.
* **Mati** (HP 0): Faint anim + fade; unit tetap di petak tapi **nonaktif**
  (abu/greyed, tak menyerang, tak bisa di-move; **boleh di-sell**).
* **Respawn:** di awal **PREP** berikutnya semua unit hidup lagi dengan penuh HP
  (`hpCur = hp`), posisi tetap. Tanpa biaya — keputusan pemain = jual-sisa atau
  bertahan dengan slot kosong selama combat.
* HP bar unit tampil di petak (sudah ada), menyusut saat kena damage.
* Regen (Grass synergy, dll) tetap jalan selama hidup.

Line-up **20 champion** (P25, pool tetap — tanpa evo-vektor baru):
Bulbasaur, Charmander, Squirtle, Pidgey, Mareep, Machop, Gastly, Abra, Aron,
Swinub, Ralts, Dratini + **Magikarp, Hoothoot, Poliwag, Growlithe, Pikachu,
Exeggcute, Rapidash, Lapras** (dex baru di luar chain ★-lama; skill reuse
kit yang sudah ada, data `champions.ts`).

### Sinergi tipe dasar (tetap)

* **Fire:** +ATK & burn on-hit. **Water:** mana lebih cepat. **Grass:**
  regen / poison. **Electric:** chain chance. **Psychic:** +skill damage.
* Tambahan yang sudah ada di kode (armor/geodude shred/dll) dipertahankan.

---

## 2. Gelombang Musuh (Enemy Waves)

* **10 wave per run** (dari 20) — sesi 5 menit. **Boss di wave 5 & 10.**
* Setelah wave 10 beres: layar **RUN COMPLETE** (skor) → pilihan
  **Endless** (lanjut, skor akumulasi) atau **Menu**.
* Preview wave (strip): sprite + **type chip** + **affix tag** (lihat §2a) +
  **side hint** (TD saja: kiri/kanan/both).
* Pool musuh, role, elite, boss table: **tetap** seperti tabel lama
  (Rattata…Mewtwo) dengan scaling wave yang disesuaikan 10-wave
  (`hp = base × (1 + wave×0.48)`, `atk × (0.4 + wave×0.20)` — P25 balance,
  band sim: dual ≥90% menang, TD ~95%).

### 2a. Affix (mulai wave 3, berputar)

| Affix | Efek wave |
| :--- | :--- |
| **Swarm** | TD: +40% count · auto: tanpa pad, semua mob atk ×1.08 · HP ×0.7 |
| **Fast** | SPD ×1.5 |
| **Armored** | armor +0.25 |
| **Elemental** | mobs immune burn/poison; +% type power |
| **Regen** (P25) | semua mob regen +3% maxHp/detik |
| **Enrage** (P25) | mob < 40% HP → damage ×1.4 |

Affix di-tag di preview. Affix tidak menumpuk (1 per wave). Rotasi 6
(berputar `(wave−3) % 6`): swarm → fast → armored → elemental → regen →
enrage → …

### 2b. Shop bias (counter-building)

Odds per-tier tetap per wave band (tabel lama §4). Tambahan: **+15% bobot**
ke champion yang type-nya *super effective* vs type dominan wave berikutnya
(dihitung dari preview comp). Bias dihitung di `Shop` saat refresh.

---

## 3. Pertempuran

* Animasi, mana (10/hit → cast), skill, ★3 ×2, damage formula tetap.
* **Musuh menyerang unit** (Pilar 1) — aturan detail per mode:
  * **TD:** unit di jangkauan 2 sel jadi target; lihat `game-design-td.md` §2.
  * **Autochess:** slot war baris depan; lihat `game-design-autochess.md` §2.
* Type effectiveness (`typeMult`) tetap; dmgText kuning (super) / abu (weak)
  sudah aktif.

---

## 4. Ekonomi (rework — Pilar 3)

* **Start gold:** 5.
* **Kill bounty:** biasa 1 / elite 2 / boss 10 (tetap).
* **Wave bonus:** `2 + floor(wave/2)` (turun 1 dari spec lama — interest
  menggantikan).
* **Interest:** **+1 gold per 10 gold yang disimpan** (maks +5) — dihitung di
  akhir wave, sebelum wave bonus.
* **Streak:** kemenangan beruntun 3+ → bonus **+2 / +3 / +4** (cap +4);
  kekalahan beruntun (autochess) 2+ → konsolasi +1/+2.
* **Reroll:** 1 gold (tetap). **Sell refund** tetap (100% / −1 / 75%).
* **Prep timer:** wave 1 = 25s; wave 2+ = 15s; wave 8+ = 12s. Ready tetap
  override. (Sesi 5 menit: prep singkat, keputusan cepat.)

---

## 5. Buff → Augment (P19 — rework filosofi)

Lama: 5 stat-stick (Power Up, dst). **Baru:** pool **16 augment** (11
rule-changer + 5 dasar), pilih 1 dari 3 tiap kelipatan 3 wave (tetap), contoh:

| Augment | Efek |
| :--- | :--- |
| **Flank Master** | unit flank TD +25% atk (bukan +10%) |
| **Fortified** | leak damage separuh; leak boss dobel |
| **Second Wind** | 1 unit pertama yang mati per wave respawn setelah 4s |
| **Compound** | interest cap +5 → +8 |
| **Frontline Bond** | unit bersebelahan saling +8% shield |
| **Elementalist** | skill cast ikut kena typeBoost |
| **Slipstream** | unit pertama tiap prep +30% atk speed 5s |
| **Blood Money** | kill bounty ×1.5 |
| **Overclock** (P25) | +20% ATK, +15% atk speed, −15% HP (trade-off) |
| **Bulwark** (P25) | +35% HP tapi −10% atk speed (trade-off) |
| **Eagle Eye** (P25) | semua unit +1 range |

Stat-stick lama boleh tetap sebagai 2 kartu "dasar" (Power Up / Tough Skin).

---

## 6. Skor & Meta

* **Score** (akhir run): `wave×100 + sisa HP base×5 + sisa gold`.
* **Endless:** setelah wave 10, skor terus naik; tidak ada batas; HP/timer
  mengikuti kurva terbuka (scaling wave lanjut).
* **Daily seed (lokal):** seed RNG (shop + wave comp) = tanggal hari ini —
  semua pemain di device yang sama dapat run identik; best score per seed
  disimpan lokal. (Leaderboard server = nanti.)
* Roster unlock via progresi dungeon: **nanti** (di luar batch ini).
