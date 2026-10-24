# Pokémon Auto Chess — Game Design: Mode Full Autochess

> Mode **dual-board auto-battler** (P18). Dua arena 3x3 berdampingan —
> musuh di atas, tim di bawah. Tidak ada jalur (*path*): musuh **berdiri dan
> saling berkelahi** dengan unit baris depan (Pilar 1 — *slot war*).
> Sistem bersama (unit, shop, sinergi, ekonomi, augment, skor):
> `game-design-common.md`.

---

## 1. Arena, Penempatan, & Kontrol

* **Dua arena 3x3 berdampingan:**
  * **Arena musuh (atas):** slot tetap y −1 … y −3 (baris depan y −1). Musuh
    spawn berurutan dari baris depan; maksimum 9 terlihat sekaligus.
  * **Arena pemain (bawah):** grid 3x3 y 0 … y 2 (frontline = **y 2**,
    menyentuh baris musuh y −1). Tanpa bench — auto-place petak kosong
    pertama (back-to-front). Limit = 9 petak.
* **Cara beli & taruh:** drag & drop (beli+taruh) / tap fallback; jarak drag
  < 6px = tap. Merge = drop same-cell, prep only.
* **Keyboard:** `1`–`3` beli, `R` reroll, `Space`/`Enter` Ready, `Esc` pause.
* **Jangkauan serang (Chebyshev lintas arena, `tdist`):** Melee = 2 sel,
  Ranged = 3 sel; baris depan↔depan dipadatkan (y 2 ↔ y −1 = 0 sel vertikal).
* **Tile buff harian:** 2 petak arena pemain penanda visual per round.
* Combat: penempatan & sell terkunci; **beli** boleh; merge prep-only.
* **Ready:** mulai round lebih awal; tanpa unit → tolak ("Place units first").

### 1a. Layout & Pindah Mode (Fase R)

* Shell `.ac-app` mode auto = grid 3 baris (`auto / minmax(0,1fr) / auto`) +
  `height:100dvh` → dock mustahil terdorong keluar layar.
* `fitAutoTiles()`: `--ac-tile` persegi clamp 36–76px, RO `#ac-arenas`.
* Landscape: dua papan berdampingan (foe | pemain+sinergi) + dock horizontal.
* Scoping: `renderStage` toggle `.mode-td` / `.mode-autochess`
  (+ `.td-land` TD-only); `clearTdLayers()` saat ganti mode/close.
* Top bar terpadu: `Round · ♥ pemain · ♥ musuh · ⚔ power · Pause · Close`.

---

## 2. Pertempuran — SLOT WAR (Pilar 1)

* **Targeting unit:** musuh dalam jangkauan, **posisi paling depan** (y −1
  didahulukan) → seri: terdekat.
* **Musuh menyerang unit (baru):**
  * Tiap mob menyerang **unit frontline hidup terdekat** (`tdist ≤ 1` baris
    depan↔depan = sel seberang) **tiap 1.2s** dengan `mob.atk` (× typeMult vs
    tipe unit).
  * Kalau frontline mati, mob lanjut ke unit baris belakang terdepat (urutan
    y 2 → y 1 → y 0).
  * Musuh tetap pakai ability pendukungnya (Rest/Roar/Disable/regen/shield).
  * **Unit mati:** Faint + fade + petak `.ac-dead`; **respawn HP penuh**
  saat prep berikutnya (common §1). Tanpa biaya.
* **Tim kosong** (semua unit `!alive` / tak ada unit) → **round kalah** —
  heart pemain kena `3 + floor(wave/4)`. (Aturan GDD lama yang dulu tak
  pernah jalan karena musuh tak menyerang — kini nyata.)
* **Menang round:** semua musuh mati → heart musuh kena `1 + jumlah
  penyintas` + interest + streak + `2 + floor(wave/2)` gold.
* **Animasi & formula:** common §3 (anim per move kind, mana/skill ★3, eff
  dmgText).

---

## 3. Alur State Permainan

1. **PREP (25s wave 1; 15s selanjutnya; 12s wave 8+ / Ready):**
   * Respawn semua unit (HP penuh). Shop refresh gratis; beli/atur/merge.
   * Wave preview: sprite musuh + type chip + affix (common §2a).
2. **COMBAT:** musuh spawn bertahap; slot war (§2); beli masih boleh.
3. **ROUND RESULT (otomatis):** menang → heart musuh −(1+penyintas) + economy;
   kalah → heart pemain −(3+floor(wave/4)). Kelipatan 3 → augment pick.
4. **BUFF/AUGMENT (kelipatan 3):** pause, 3 kartu, pilih 1.
5. **WIN / GAME OVER (10-wave sprint):**
   * **Menang run:** heart musuh 0 **atau** wave 10 selesai → **RUN COMPLETE**
     + skor (common §6) → Endless / Menu.
   * **Kalah:** heart pemain 0 → skor & best local tersimpan.

---

## 4. Konstanta (mode auto, 5-menit sprint)

| Konstanta | Nilai |
| :--- | :--- |
| Heart pemain | 45 |
| Heart musuh | 20 |
| Mob atk CD | 1.2s |
| Round-lose heart dmg | `3 + floor(wave/4)` |
| Round-win heart dmg | `1 + survivors` |
| Max wave | 10 (endless opt-in) |
| Prep | 25s / 15s / 12s (wave band) |

Ekonomi, interest, streak, augment, skor: `game-design-common.md` §4–6.
