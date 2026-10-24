# Desain UI & Chessboard — Grid 3×3 Compact

> ⚠️ **SEBAGIAN BESAR DEPRECATED (2026-10-24, rework dual-board `099bab4`).**
> Layout satu papan + ring path di bawah ini sudah diganti **arena kembar**
> (musuh atas / pemain bawah, tanpa path/bench). Spesifikasi berlaku sekarang:
> GDD `docs/game-design.md` Bagian 3–4 + kode `src/autochess/ac-ui.ts`.
> Yang masih relevan: prinsip 3×3 compact, drag-drop buy, tap fallback,
> pill ★/ATK, hurt flash.

> Spesifikasi visual + teknis untuk redesign screen autochess (`scr-ac`).
> Ukuran **3×3 (9 petak)** memberi tombol & karakter besar di layar *mobile*,
> serta menciptakan posisi strategis di petak tengah (*Center Tile*).
> Sumber desain: GDD `docs/game-design.md`.

---

## 1. Visualisasi Tata Letak Layar (3×3 Grid)

```
+---------------------------------------+
| [HP: ♥ 20/20]   WAVE 5/20   [Gold: 45]|  <-- TOP BAR
+---------------------------------------+
|  [🔥 2/3]  [💧 3/3]  [⚡ 1/3]         |  <-- SYNERGY BAR (Tier1 @2, Max @3)
+---------------------------------------+
|               [ SPAWN ]               |
|                   |                   |
|     +---JALUR-----+-----JALUR---+     |
|     |                           |     |
|   JALUR     +---+---+---+     JALUR   |
|     |       | C | B | P |       |     |
|     v       +---+---+---+       v     |
|   JALUR     | M | R | S |     JALUR   |  <-- CHESSBOARD 3×3 (9 Petak Besar)
|     |       +---+---+---+       |     |      (R = Ralts di tengah mem-buff 8 petak)
|     v       | . | C | . |       v     |
|   JALUR     +---+---+---+     JALUR   |
|     |                           |     |
|     +---JALUR----->-----JALUR---+     |
|                   |                   |
|            [ BASE / TRAINER ]         |
+---------------------------------------+
| BENCH:  [ Slot 1 ]  [ Slot 2 ] [Jual] |  <-- 2 Slot Cadangan & Tombol Jual
+---------------------------------------+
| MINI-SHOP:                            |
| +---------+ +---------+ +---------+   |
| |Bulbasaur| |  Mareep | |  Pidgey |   |  <-- 3 Kartu Pilihan + Reroll
| |  1 Gold | |  2 Gold | |  1 Gold |   |
| +---------+ +---------+ +---------+   |
|        [ REROLL SHOP (2 Gold) ]       |
+---------------------------------------+
```

**Alur musuh:** SPAWN (tengah atas) → jalur bercabang kiri & kanan mengelilingi
papan 3×3 → kembali bertemu di tengah bawah → **BASE / TRAINER**.
Musuh *berjalan* sepanjang jalur (sprite animasi `Walk`, bukan badge per-petak).

---

## 2. Keunggulan Taktis Papan 3×3

- **8 Petak Luar (Outer Ring):** berbatasan langsung dengan jalur jalan musuh
  (jarak sel 1). Ideal untuk unit serangan jarak dekat, AoE, atau CC
  (*Machop, Squirtle, Aron, Swinub, Charmander*).
- **1 Petak Tengah (Center Tile):** jarak paling jauh dari jalur (jarak sel 2),
  bersentuhan langsung dengan ke-8 petak lain. Tempat terbaik untuk unit
  *Buffer* (*Ralts/Gardevoir*) atau *Sniper/Single-target* jarak jauh
  (*Abra, Pidgey, Dratini*).
- **Sinergi 2/3 unit:** kapasitas papan 9 slot → efek sinergi elemen aktif pada
  **2 unit (Tier 1)** dan **3 unit (Tier 2/Max)**.

Jarak ini cocok persis dengan stat range yang ada: **melee = 2, ranged = 3**
(`unit-stats.ts`) — melee menjangkau jalur dari semua petak (termasuk center,
jarak 2), ranged menjangkau dari jarak 3. **Range tidak perlu diubah lagi.**

---

## 3. Anatomi Layar & Komponen

| # | Komponen | Isi / Aturan | Status kode |
| :--- | :--- | :--- | :--- |
| 1 | **Top Bar** | Base HP `♥ cur/max`, `WAVE n/20`, Gold, tombol Start/Pause/Exit | Sudah ada (`ac-hud`, `renderHud`) — tambah teks angka HP |
| 2 | **Synergy Bar** | Chip per sinergi `[ikon tipe n/3]`, posisi di bawah top bar; tier1 @2, max @3 | Panel `.ac-syn` (side) → pindah jadi bar atas; threshold `t4`→3 di `synergy.ts` |
| 3 | **Stage 5×5** | 16 sel jalur (ring) + 9 sel rock (3×3) di tengah; marker `SPAWN` atas, `BASE` bawah | Baru (ganti `.ac-board` 8×5) |
| 4 | **Chessboard 3×3** | 9 `.ac-cell` rock; **drag kartu shop → petak** (beli+taruh) atau tap-to-place; unit friendly sprite `Idle` + star + HP bar | Ubah loop render 3×3 |
| 5 | **Walker layer** | Sprite musuh animasi `Walk` di atas jalur, posisi = interpolasi `progress`; HP bar mini di kepala | Baru (ganti badge `.ac-mob`) |
| 6 | **Status FX** | Shield bar, icon status (Stun/Slow/Burn), barrier/rest boss | Mekanik **sudah ada** di `unitAI.ts`/`skills.ts`, tampilan **belum ada** → slot di walker layer |
| 7 | **Bench** | **2 slot** cadangan + tombol **Jual** (jual per star: ★1 = harga beli, ★2 = `2c−1`, ★3 = `3c`) | `BENCH_SIZE` 9 → 2 |
| 8 | **Mini-Shop** | **3 kartu** + tombol `REROLL (2 Gold)` | `SHOP_SIZE` 5 → 3; reroll 2g **sudah sesuai** |
| 9 | **Overlay** | Reward / Victory / Defeat / Pause | Tidak berubah |

---

## 4. Geometry Teknis (untuk `path.ts` / `board.ts`)

Koordinat sel (cell units) — rock 3×3 di tengah, ring jalur mengelilinginya:

```
        x=-1   x=0  x=1  x=2  x=3
 y=-1   (-1,-1) ─── (1,-1) ─── (3,-1)   ← atas: spawn di (1,-1), cabang ke kiri/kanan
 y=0    (-1,0)  [ R ][ R ][ R ]  (3,0)
 y=1    (-1,1)  [ R ][ C ][ R ]  (3,1)   ← C = center tile
 y=2    (-1,2)  [ R ][ R ][ R ]  (3,2)
 y=3    (-1,3) ─── (1,3) ─── (3,3)       ← bawah: base di (1,3), kedua cabang menyatu
```

- **Rock (placement):** `x ∈ {0,1,2}`, `y ∈ {0,1,2}` — 9 petak.
- **Jalur (ring):** 16 sel di `x=-1|x=3` atau `y=-1|y=3`.
- **Dua cabang simetris** (spawn → base), panjang sama = 9 sel:
  - Cabang Kiri: `(1,-1)→(0,-1)→(-1,-1)→(-1,0)→(-1,1)→(-1,2)→(-1,3)→(0,3)→(1,3)`
  - Cabang Kanan: `(1,-1)→(2,-1)→(3,-1)→(3,0)→(3,1)→(3,2)→(3,3)→(2,3)→(1,3)`
  - Musuh pilih cabang saat spawn (acak / selang-seling). `laneCells()` →
    `branchCells(0|1)`; `mobCell()`/leak per cabang (`cells.length-1` tetap 9).
- **Jarak sel (Chebyshev) ke jalur:** petak luar = 1, center = 2. (Sesuai §2.)
- **`inside()` / placement** = rock saja; sel jalur tidak bisa ditempati.
- **Stage UI** = grid CSS 5×5 (indeks `(x+1, y+1)` → 0..4); layer terpisah:
  `.ac-path` (16 sel), `.ac-rocks` (9 sel), `.ac-mobs` (sprite absolut).
- Spawn terlihat di tengah atas (gerbang), leak = sampai `(1,3)` → anim jalan ke
  marker BASE → flash marker + base HP turun (sudah dihitung `wave-runner`).
- `SERPENTINE` dihapus (GDD: satu jalur menuju Base; struktur waypoints tetap
  mendukung multi-path bila nanti perlu).

---

## 5. Walker & Status (mekanik sudah ada, tampilan menyusul)

`unitAI.ts` **sudah** menghitung: `statuses` (burn/poison/slow/stun), `shield`
(Magnemite), `barrier`+`rest`+`roar`+`disable` (boss), `dodge`, `regen`,
`kbImmune`/`slowImmune`/`stunImmune`. Yang belum ada = tampilan di layer jalur:

| Elemen visual | Sumber data | Catatan |
| :--- | :--- | :--- |
| Sprite `Walk` + arah hadap | `progress` → posisi px | `translate3d` per frame, tanpa rebuild DOM |
| HP bar mini | `hp/maxHp` | di atas kepala |
| Shield bar ke-2 | `shield` | di atas HP, tampil bila `>0` |
| Icon status | `statuses[]`, `barrier>0`, `resting` | 🔥☠️❄️⚡ kecil di atas sprite |
| Boss | `boss`, scale + 👑 | Rest (Snorlax) → `loop('Idle')` berhenti jalan, heal pulse |
| Mati | `alive=false` | pop `Hurt` 1× → fade → remove |
| Dodge miss | — | angka "miss" kecil (opsional) |

---

## 6. Delta vs Kode Sekarang (ringkas)

| Item | Sekarang | Desain ini |
| :--- | :--- | :--- |
| Grid board | 8×5 datar, lane row y=2 | 3×3 rock + ring jalur 16 sel (stage 5×5) |
| Path | `lane` lurus + `serpentine` | ring 2 cabang simetris, spawn atas, base bawah |
| Musuh di UI | badge 👾/👑 per-cell, rebuild/frame | sprite `Walk` interpolasi `progress` |
| Range unit | melee 1 / ranged 2 (dulunya) | **melee 2 / ranged 3** (center menjangkau jalur) |
| Bench | 9 slot | **2 slot** + tombol Jual |
| Shop | 5 kartu | **3 kartu** (reroll 2g tetap) |
| Sinergi | threshold 2/4, panel samping | threshold **2/3**, bar atas `[ikon n/3]` |
| Shortcut beli | `[1]–[5]` | `[1]–[3]` |
| Top bar HP | bar tanpa angka | `♥ cur/max` |
| Status/shield/boss UI | tidak ada | slot di walker layer (data sudah ada) |
| `boardCap(level)` | `min(8, 1+floor(l/2))` (Lv8 → 5) | tetap level-gated (9 = kapasitas fisik papan) — flag keputusan |

---

## 7. Keputusan (sudah dijawab — arsip)

1. **Cabang jalur:** → **2 cabang simetris** (dipilih, terimplementasi di `path.ts`).
2. **`boardCap`:** → **tetap** `min(8, 1+floor(l/2))` (Lv8 → 5 unit).
3. **Label bahasa tombol:** → **EN** (`Sell`/`Reroll`, konsisten UI).
