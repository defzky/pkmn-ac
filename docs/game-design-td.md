# Pokémon Auto Chess — Game Design: Mode Tower Defence

> Mode **TD path-walk**. Musuh spawn di tepi atas, berjalan menyusuri *path*
> serpentine yang melewati board pemain 3×3, menuju base di bawah-tengah.
> **Musuh menyerang unit yang mereka lewati** (Pilar 1) — leak = base damage.
> Sprint **10 wave** ≈ 5 menit. Sistem bersama (unit, shop, sinergi, ekonomi,
> augment, skor): `game-design-common.md`.

---

## 1. Arena, Path, & Penempatan

* **Satu board pemain 3×3** (y 0 … y 2) — semua cell placeable, **khusus
  pokemon**. Portrait: grid di-center 56% lebar. Landscape (`.td-land`): board
  square full-height (lihat §1a).
* **Lane kiri = RUNNER, kanan = BULWARK** (asimetris — Pilar 2):
  * **Runner lane (kiri):** mob cepat, tipis, **chip damage 50% sambil jalan**
    (tak berhenti) — ancaman jumlah & kecepatan.
  * **Bulwark lane (kanan):** mob lambat, tebal/armor, **berhenti & fight**
    unit terdekat (aggro); stop dibatasi **2s** lalu lanjut jalan (anti-stall).
  * Wave komposisi: wave ganjil menekan kiri, genap menekan kanan, boss =
    kedua lane. Preview menampilkan side hint (⬅ / ⭢ / ⬌).
* **Path** (`Path.branchCells`, sama seperti sekarang):
  * Spawn `{x:1, y:−1}`, base `{x:1, y:3}`; cabang kiri x −1, kanan x 3.
  * Chebyshev petak board ke lane terdekat ≤ 2 (melee range 2 tetap relevan).
* **Flank bonus (Pilar 2):** unit di petak yang **menyentuh lane** (Chebyshev
  ≤ 1 ke sel lane) → **+10% ATK**; petak **sudut** (0,0 / 2,0 / 0,2 / 2,2)
  dapat tambahan **+1 range**. Saat prep, petak flank di-highlight (glow tipis)
  dan coverage tiap unit (sel yang bisa dicapai) ditampilkan saat unit dipilih.
* **Placement:** drag & drop / tap, auto-place back-to-front, limit = 9 petak.
  Penempatan & merge (drop) terkunci saat combat; beli tetap boleh.
* **Keyboard:** `1`–`3` beli, `R` reroll (1 Gold), `Space`/`Enter` Ready, `Esc`
  pause.

### 1a. Layout Landscape + Backdrop Dungeon (rework M–P + Q)

* **Aktivasi:** class `#scr-ac.td-land` (di-toggle `renderStage`, TD saja) +
  `@media (orientation: landscape)`. Dual-board (`auto`) tetap portrait-column.
* **Grid penuh tanpa dead-space** (rework M+N, refined Q): `.ac-app` → grid
  **1 kolom**, areas `"top" "arena" "dock"`:
  * Baris 1: **topbar glass pill terpusat** — Round kiri · power pill ·
    pause/exit kanan.
  * Baris 2: **arena** — wrapper `.ac-arow` flex row terpusat: board square
    height-driven + lane pad proporsional + wave strip · **synbar glass
    sidebar** `gap: 32px` dari papan (chips 16px, non-aktif
    `rgba(255,255,255,.75)`). Portrait: `.ac-arow { display:contents }`.
  * Baris 3: **dock glass fit-content terpusat** (`.ac-dock`:
    `width:fit-content; max-width:90vw; margin:0 auto; gap:24px;
    padding:12px 24px`) — gold 18px · reroll + Ready + timer ⏳ legible ·
    divider 1px · shop 3 kartu. Portrait: `.ac-dock { display:contents }`.
  * `ac-kbd` disembunyikan (touch layout).
* **Backdrop dungeon:** `#ac-bg` child pertama `#scr-ac` (z0, full viewport) →
  `Tiles.paintChunk` biome 0 (Bosque) + blob dirt sinus + vignette — identik
  `World.chunkImage`.
* **Sprite penuh (rework O):** cell canvas 100%, kartu shop 72px (min 64),
  mob `max(44px, pitch×0.72)` + drop-shadow, ghost `pitch×0.85`.
* **HUD polish (P) + proporsi (Q):** pill star/atk chip pojok kanan-atas tile;
  nama kartu utuh; castle HP pill `#ac-td-hptext` di bawah ring; heart lama
  disembunyikan di TD.

### 1b. Juice / Feedback (Fase J+K+L)

Combat:
* **Wave banner** `#ac-banner`: wave-start (`Wave N` / `BOSS — Wave`),
  wave-cleared (`+N ☀ gold`), leak (`Base hit! −N`).
* **Leak feedback:** base flash + heart pulse + red banner + `hurt` sfx.
* **Dungeon hit polish:** `u.hit.eff` → dmgText kuning (super) / abu (weak);
  hit → `Hurt` anim + `hit` sfx; death → `Faint hold` + `.ac-dying` fade ~0.9s.
  Shadow = `Sprites.drawShadow` (PMD `ShadowSize`).
* **Telegraph:** radial/aura/meteor/mine → dashed ring tumbuh. Status ground
  FX: burn/poison ellipse; shield bubble; roar → ring merah + `boss` sfx.
* **Prep timer:** blink di 3 detik terakhir.

Interaksi (prep): buy/place `land` FX + squash-pop; merge gold ring + ★N +
`levelup` + cell flash; sell coin burst; drag ghost = mini live-sprite.

Lanskap: lane dirt path + `FX.trail('dirt')`; spawn portal putar di `(1,−1)`;
castle 🏰 + ring conic-gradient + pill HP; cell hover lift; Round pill pulse.

---

## 2. Pertempuran (Pilar 1 — mobs menyerang unit)

* **Targeting unit:** menyerang musuh dalam jangkauan (melee 2 / ranged 3)
  dengan **progress terbesar** (paling dekat ke base) — tetap.
* **Mobs menyerang unit:**
  * **Runner lane (kiri):** selama melewati petak dengan unit dalam 2 sel —
    **chip 50% `mob.atk` per detik** (DOT) ke unit terdekat; mob **tidak
    berhenti**.
  * **Bulwark lane (kanan):** unit dalam 2 sel → **stop & fight**: serang
    `mob.atk` tiap 1.2s ke unit terdekat; berhenti maks **2 detik** (stopT
    cap) lalu lanjut walau unit masih hidup (anti-stall, base tetap terancam).
  * Kedua lane: type effectiveness tetap berlaku (atk mob vs tipe unit).
* **Unit mati:** Faint + fade; petak `ac-dead` (abu, tak menyerang/move,
  boleh sell). **Respawn满血** di prep berikutnya (common §1).
* **Leak:** tetap `progress ≥ pathLength − 1` → base −6 (normal) / −15 (boss).
* **Base HP 60.** 0 → game over.
* **Wave clear:** semua mob mati → interest (common §4) + streak bonus +
  `2 + floor(wave/2)` gold; wave kelipatan 3 → augment pick.
* **Animasi & damage formula:** sama common (anim mengikuti move kind, mana
  10/hit, ★3 skill ×2).

---

## 3. Alur State Permainan

1. **PREP (25s wave 1; 15s wave 2+; 12s wave 8+ / Ready):**
   * Semua unit **respawn** (hidup, HP penuh) di sini.
   * Shop refresh gratis; beli/susun; merge drop same-cell.
   * Lane highlight + flank glow; coverage saat unit dipilih.
   * Wave preview: sprite + type chip + affix + side hint.
2. **COMBAT:** mob spawn (side sesuai komposisi wave); unit auto-attack; mob
   menyerang unit (§2); leak → base damage.
3. **ROUND RESULT:** clear → interest + streak + wave bonus; kelipatan 3 →
   augment (3 pilihan).
4. **WAVE 10 CLEAR → RUN COMPLETE:** tampil **skor** (`wave×100 + HP×5 +
   gold`); tombol **Endless** (lanjut wave 11+, skor akumulasi) / **Menu**.
5. **GAME OVER:** base 0 → skor tetap dihitung & disimpan (best local).

---

## 4. Konstanta (TD-specific, 5-menit sprint)

| Konstanta | Nilai | Catatan |
| :--- | :--- | :--- |
| `TD_BASE_HP` | 60 | `base.ts` |
| `LEAK_NORMAL` | 6 | |
| `LEAK_BOSS` | 15 | |
| `START_GOLD` | 5 | |
| `PREP_SECONDS` | 25 → 15 → 12 | wave 1 / 2–7 / 8+ |
| `WAVE_BONUS` | `2 + floor(wave/2)` | |
| `INTEREST` | +1 per 10 gold, cap +5 | |
| `STREAK_BONUS` | +2/+3/+4 (3+ win streak) | |
| `BUFF_EVERY` | 3 | augment pick |
| `MAX_WAVE` | 10 | endless setelahnya |
| `MOB_ATK_CD` | 1.2s | bulwark stop-fight |
| `STOP_CAP` | 2s | anti-stall |
| `RUNNER_CHIP` | 0.5 | 50% atk DOT |
| `FLANK_ATK` | +10% | petak menyentuh lane |
| `FLANK_RANGE` | +1 | petak sudut |

---

## 5. UI Notes

* Foe arena **disembunyikan** (`td-mode`).
* Mobs sprite absolut di atas arenas (Walk/Idle/facing path + **Attack** saat
  fight unit bulwark) — `Sprites.Animator` per mob.
* Base HP = ring conic + pill `#ac-td-hptext`; heart HUD disembunyikan.
* **Unit mati:** petak `.ac-dead` (greyscale + red rim), Faint anim hold.
* **Flank glow:** prep-only class di petak flank; coverage = outline cell saat
  unit selected.
* Wave strip: sprite ghost + type chip + affix tag + side hint.
* Score screen = overlay `#ac-over` (ikon + skor breakdown + Endless/Menu).
* Layout landscape + backdrop forest: §1a; juice: §1b.

## 6. Tutorial onboarding (P26c)

> Spes ditulis 2026-10-28 (sesi review-loop). Implementasi = kartu coach
> mini di TD, sekali seumur hidup.

* **Kapan:** `open('td')` pertama kali (flag localStorage `ps.tut !== '1'`).
  Mode `auto`/`daily` tidak pernah menampilkan (TD = mode rekomendasi).
* **Isi (2 langkah memandu):**
  1. Prep pertama: "Compra un Pokémon de la tienda" + highlight ring pada
     `#ac-shop`. Maju saat pembelian pertama berhasil.
  2. "Pulsa Listo para luchar" + highlight pada `#ac-start`. Selesai saat
     `onStart`.
* **Dismiss:** tombol "Saltar" (skip) kapan saja, atau selesai langkah 2 →
  set `ps.tut='1'` → tidak pernah muncul lagi.
* **Implementasi:** `#ac-tut` overlay di `ac-ui.ts` (state `tutStep`), CSS
  glass panel; teks ES source + dict EN (pola `{x}` tidak perlu — string
  statis). Tamat run / ganti mode saat tutorial aktif → dismiss tanpa flag
  (muncul lagi run berikutnya).
* **Tes:** open('td') pertama → kartu tampil step 1; buy → step 2; start →
  hilang + flag; open lagi → tidak tampil; Saltar → hilang + flag.
