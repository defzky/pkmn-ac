# PokéSurvivor — Script Edit Koin (Gold)

> Untuk testing di akun sendiri. Pilih jalur sesuai environment.

## Ringkasan

| Jalur | Environment | Perlu `window.G`? | Sinkron cloud? |
|---|---|---|---|
| A | `/dev.html` (debug build) | Ya | Langsung (`commit(true)`) |
| B | Prod, mode **local** | Tidak | Tidak (localStorage saja) |
| C | Prod, mode **cloud** | Tidak | Via salinan `ps.cloud.<uid>` + push |

**Lokasi nilai koin:** `G.DB.save.coins` — `js/core/db.js:69` (`newSave`).
**Validasi server:** `firestore.rules:51-54` hanya cek `coins >= 0`, tanpa cap atas.
**Client sanitize:** `db.js:124` — nilai positif dibiarkan apa adanya (`floor`), ≤0 → 0.

---

## Jalur A — Console di `/dev.html`

Buka `https://pokesurvivor.com/dev.html`, login dulu, lalu:

```js
// 1. Set koin
G.DB.save.coins = 1e9;

// 2. Refresh HUD (#coins + tickets pill)
G.UI.refreshCoins();

// 3. Persist — urgent = push cloud segera (15s) atau tulis lokal langsung
G.DB.commit(true);
```

Tambahan opsional:

```js
// Via progress grant (juga menambah stats.coinsEarned)
G.Progress.grant({ coins: 9999999 });

// Verifikasi
console.log(G.DB.save.coins, G.DB.mode, G.DB.syncState);
```

Catatan:

- `G.DB.mode === 'local'` → tulis segera ke `ps.save.<key>`.
- `G.DB.mode === 'cloud'` → tulis `ps.cloud.<uid>` + jadwal push; `urgent` paksa 15 s, throttle min 65 s (`ps.cloudok.<uid>`).
- Salinan **harus lebih baru** (`updated`) supaya menang di `merge()` — `commit` mengurus ini otomatis.

---

## Jalur B — Prod, mode local (tanpa `G`)

```js
// 1. Cari key save aktif
const k = JSON.parse(localStorage.getItem('ps.session'));   // db.js:28
const key = 'ps.save.' + k;

// 2. Baca → edit → tulis
const s = JSON.parse(localStorage.getItem(key));
s.coins = 1e9;
s.updated = Date.now();                 // merge(): sisi newer menang utk coins
localStorage.setItem(key, JSON.stringify(s));

// 3. Refresh HUD (evaluasi ulang runtutan JS, atau reload halaman)
location.reload();
```

---

## Jalur C — Prod, mode cloud (edit salinan lokal)

```js
// 1. Cari salinan cloud
const cloudKey = Object.keys(localStorage)
  .find(x => x.startsWith('ps.cloud.') && !x.startsWith('ps.cloudok.'));
// contoh: 'ps.cloud.rshaa5gKD3fXw6lE4PPXITbowaG2'

// 2. Edit + bump updated supaya menang saat merge transaction
const s = JSON.parse(localStorage.getItem(cloudKey));
s.coins = 1e9;
s.updated = Date.now();
localStorage.setItem(cloudKey, JSON.stringify(s));

// 3. Buka throttle push agar upload jalan (opsional)
//    ps.cloudok.<uid> berisi timestamp push terakhir; hapus agar boleh push:
localStorage.removeItem(cloudKey.replace('ps.cloud.', 'ps.cloudok.'));

// 4. Tunggu push (restart tab / mainkan run) atau tunggu siklus commit.
```

Push cloud (`db.js:640`):

- normal → gap 2 jam
- `urgent` → 15 s
- saat run → 30 min
- throttle MIN_GAP 65 s via `ps.cloudok.<uid>`
- transaksi push memakai `merge(a,b)` — `updated` baru menang

---

## Rumus koin run (referensi)

```text
gold = round( ( floor(time/5) + floor(kills*0.25) + bosses*80 + runCoins ) × coinMul )
```

`js/game.js:299`. Statistik `coinsEarned` ikut naik.

---

## Troubleshooting

| Gejala | Penyebab | Fix |
|---|---|---|
| Nilai balik lama setelah reload | `updated` tidak dibump / push kalah merge | `s.updated = Date.now()` sebelum tulis |
| HUD tidak berubah | `refreshCoins()` belum dipanggil | `G.UI.refreshCoins()` atau reload |
| Push cloud tidak jalan | throttle `ps.cloudok.<uid>` < 65 s | hapus key `ps.cloudok.<uid>` |
| Turun terus di login cloud | server/sanitasi clamp ≤0 saja — harusnya tidak terjadi; cek apakah edit key yang salah (`ps.save` vs `ps.cloud`) | pastikan edit key sesuai mode |
| `G` undefined | halaman prod (`index.html`) | pakai `/dev.html` |

---

## Referensi

- `js/core/db.js:69` — schema `newSave`
- `js/core/db.js:124` — `sanitize()` (clamp ≤0)
- `js/core/db.js:160` — `merge()` (newer wins utk coins)
- `js/core/db.js:640` — `commit(urgent)`
- `js/core/db.js:452` — MIN_GAP 65 s push cloud
- `js/ui/ui.js:30` — `refreshCoins()`
- `js/systems/progress.js:115` — `grant(r)`
- `firestore.rules:51-54` — `saneSave` (tanpa cap coins)
