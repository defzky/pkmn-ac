# PokéSurvivor — Debug & Cheat Cheatsheet


> Reverse-engineered dari build prod `https://pokesurvivor.com` + source repo `JPTER78/pokesurvivor`.
> Untuk **testing di akun sendiri**. Jangan dipakai untuk curang di leaderboard — server menolak entry yang tidak sah.

---

## 1. Akses debug

| Jalur | Cara | `window.G` |
|---|---|---|
| **Dev build** | Buka `https://pokesurvivor.com/dev.html` | Terbuka (penuh) |
| **Prod build** | `https://pokesurvivor.com/` (`app.min.js`) | Terbungkus IIFE (`tools/build.js:25`) |

`dev.html` memuat source mentah (`js/core/db.js` dll.) dan menjalankan mode **cloud** dengan akun Firebase asli — semua cheat di bawah bisa menulis ke save cloud.

**Proteksi build (prod only):**

- `tools/build.js:31-33` — wrap `(() => { var G = {}; ... })()`, `window.G` tidak ada.
- `tools/build.js:46-52` — terser + javascript-obfuscator (self-defending, seed 7, base64 string array).

---

## 2. Arsitektur save

Semua state di `G.DB.save` (`js/core/db.js:69`, `newSave()`):

```js
{
  v, name, created, updated,
  coins,                    // number, TANPA cap atas (hanya clamp <=0 → 0)
  owned: { [dex]: {at, from} },
  shiny: { [dex]: true },
  partner, partnerShiny, starter, personality,
  upgrades: { [id]: true },
  pupg: { [dex]: { [upgradeId]: lvl } },   // capped def.max oleh sanitize()
  tickets: { t1, t10 },
  pity: { [gen]: count },   // reset di 5★, PITY_5 = 70
  legends, arenas, itemsFound, evoMoves, ach, missions,
  profile: { favs, title },
  stats: { runs, bestTime, bestLevel, totalKills, pulls, coinsEarned, ... }
}
```

Mode: `G.DB.mode` ∈ `cloud` | `local` | `guest`.

**localStorage keys** (`db.js:28-29`):

| Key | Isi |
|---|---|
| `ps.session` | key save aktif |
| `ps.save.<key>` | save lokal |
| `ps.cloud.<uid>` | salinan save cloud |
| `ps.cloudok.<uid>` | throttle push (MIN_GAP 65 s) |
| `ps.accounts`, `ps.migrated.<key>`, `ps.nick.*`, `ps.rk.*` | lain-lain |

**Host whitelist** (`db.js:352`): `pokesurvivor.com`, `www`, `jpter78.github.io`, `localhost`, `127.0.0.1` — selain itu mode `local`.

**Push cloud** (`db.js:640`, `commit(urgent)`):

- local → tulis `ps.save.<key>` segera.
- cloud → tulis `ps.cloud.<uid>` + jadwal push: normal 2 jam, `urgent=true` 15 s, saat run 30 min, throttle 65 s.
- Push memakai `merge(a,b)` — sisi **newer** (`updated`) menang untuk `coins`/`pity`/`partner`; union untuk koleksi; `max` untuk `stats`/`upgrades`/`pupg`.

---

## 3. Cheatsheet — console di `/dev.html`

```js
// ==== POKÉSURVIVOR TEST CHEATS (dev build, window.G open) ====
const s = G.DB.save;

// --- 1. UNLIMITED GOLD ------------------------------------
s.coins = 1e9;              // sanitize() hanya clamp <=0 (db.js:124)
G.UI.refreshCoins();        // refresh HUD (#coins + tickets pill)
G.DB.commit(true);          // urgent push → cloud

// --- 2. TICKETS -------------------------------------------
s.tickets = { t1: 9999, t10: 999 };
G.DB.commit(true);

// --- 3. GACHA ---------------------------------------------
// Rates: ★1 45% | ★2 30% | ★3 17% | ★4 6.5% | ★5 1.5%
// Pity ★5 di pull ke-70; shiny 1%; refund koin per rarity.
G.Gacha.debugForceShiny(10);              // 10 pull berikutnya = shiny
// ⚠ force hanya jalan kalau species punya shiny-art (sprites meta .sh)
//   DAN shiny rarity itu belum dimiliki semua — lihat §8
G.Gacha.pull(s, 10, 1, 't1');             // gen 1..9; hasil {dex,rarity,shiny,isNew,refund}
s.pity[1] = 69;                           // pull berikut = guaranteed ★5
// Refund: ★1 15 | ★2 30 | ★3 60 | ★4 120 | ★5 300 (×3 kalau shiny dup)

// --- 4. UNLOCK SEMUA POKÉMON ------------------------------
G.DEX.forEach(p => {
  G.DB.grant(p.dex, 'gacha');
  if (G.Sprites.hasShiny(p.dex)) G.DB.grantShiny(p.dex, 'gacha');
});
G.DB.commit(true);

// --- 5. MAX UPGRADES (per Pokémon, cap def.max) -----------
const u = G.DB.upgradesOf(s.partner);
for (const [id, def] of Object.entries(G.Upgrades.BY)) u[id] = def.max;
G.DB.commit(true);
// Harga: data/upgrades.js:23 → round(base * grow^lvl / 10) * 10

// --- 6. DURING RUN (G.Game.state === 'playing') -----------
G.Game.debugTime(1800);     // jam → 30 menit (sets tampered=true)
G.Game.debugSpeed(0.5);     // slow-mo rekaman; >1 = tampered
G.Game.debugLevelUp();      // paksa layar level-up
const p = G.Game.player;
p.maxHp = 50000; p.hp = 50000;             // tanky (cap clean(): 50000)

G.Events.debugStart('gold');  // 'horde' | 'gold' | 'lost'
G.Events.debugThief();        // spawn Meowth thief sekarang
G.Weather.debugStart('rain', 60);          // sun|rain|sand|fog|...
G.Rift.debugOpen();           // buka rift
G.Rift.debugArena('fire');    // arena tipe sekarang
G.Rift.debugNextType('dragon');            // rift berikut = tipe
G.Judgment.debugStart();      // Sentencia de Arceus segera
G.Spawner.debugForceShiny(5); // 5 wild spawn berikutnya shiny
```

### Anti-tamper leaderboard

`js/game.js:347-359` `clean()` — run TIDAK dikirim ke ranking kalau:

- `tampered === true` (dibuat oleh `debugTime` / `debugSpeed > 1` / `debugLevelUp`)
- waktu run > elapsed real + 10 s
- player punya `hurt`/`update`/`heal`/`gainXp` properti sendiri
- `maxHp > 50000`, `atkMul > 2000`, `spdMul > 25`, `cdMul < 0.03`
- `level > 20 + time/3`

Server juga memvalidasi (`firestore.rules:129-147`): `t ≤ elapsed real + 30`, `lv ≤ 10 + t/4`, `kills ≤ 100 + t*12`, max 1 jam, `t` naik.

---

## 4. Prod TANPA `/dev.html` (edit localStorage)

```js
// Mode local (akun lokal / offline)
const k = JSON.parse(localStorage.getItem('ps.session'));
const key = 'ps.save.' + k;
const s = JSON.parse(localStorage.getItem(key));
s.coins = 1e9;
s.tickets = { t1: 9999, t10: 999 };
s.updated = Date.now();   // merge() ambil coins dari sisi NEWER
localStorage.setItem(key, JSON.stringify(s));

// Mode cloud — salinan lokal:
//   Object.keys(localStorage).filter(x => x.startsWith('ps.cloud.'))
// Setelah edit, bump `updated`. Push otomatis / throttle 65 s via ps.cloudok.<uid>.
```

---

## 5. Rumus & angka penting

| Kuantitas | Rumus / nilai | Lokasi |
|---|---|---|
| Gold akhir run | `round((floor(time/5) + floor(kills*0.25) + bosses*80 + runCoins) * coinMul)` | `js/game.js:299` |
| START_COINS | 500 | `db.js:31` |
| Harga upgrade | `round(base * grow^lvl / 10) * 10` | `data/upgrades.js:23` |
| Pity ★5 | 70 | `gacha.js` |
| Shiny rate | 1/100 | `gacha.js` |
| Gacha rates | 45 / 30 / 17 / 6.5 / 1.5 % | `gacha.js` |
| Event cycle | setiap 240–300 s, durasi 30 s | `systems/events.js` |
| Thief pertama | 120–240 s, hidup 15 s | `systems/events.js` |
| Push cloud gap | normal 2 h, urgent 15 s, throttle 65 s | `db.js:329,452` |

### Upgrade table

| id | max | base | grow |
|---|---|---|---|
| hp | 10 | 60 | 1.35 |
| atk | 10 | 80 | 1.38 |
| spd | 8 | 70 | 1.4 |
| cd | 8 | 90 | 1.42 |
| def | 8 | 80 | 1.4 |
| regen | 5 | 120 | 1.5 |
| magnet | 6 | 50 | 1.4 |
| xp | 8 | 100 | 1.42 |
| coins | 8 | 120 | 1.45 |
| moves | 1 | 1500 | 1 |
| crit | 10 | 90 | 1.4 |
| reroll | 5 | 150 | 1.6 |
| ban | 3 | 300 | 1.9 |

---

## 6. ⚠️ Catatan keamanan (untuk pemilik game)

1. **`/dev.html` + raw `js/**` publicly served di prod** → bypass total anti-cheat client. Block di deploy (nginx/CI).
2. **`firestore.rules:51-54` `saneSave`** hanya cek `coins >= 0`, `tickets >= 0` — tanpa upper bound / delta check. Tambah cap atau validasi delta via Cloud Function.
3. Leaderboard sudah dilindungi server-side (`validEntry`) + client `clean()`.
4. Admin UID hardcoded di `firestore.rules:20` — pertimbangkan environment-based allowlist.

---

## 7. Referensi file

| File | Isi |
|---|---|
| `js/core/db.js` | save schema, sanitize, merge, commit, cloud push |
| `js/core/db.js:745` | `upgradesOf(dex)` → `save.pupg[dex]` |
| `js/systems/gacha.js` | rates, pity, shiny, refund, `pull`, `debugForceShiny` |
| `js/core/sprites.js:44` | `hasShiny(dex)` — cek shiny-art (meta `.sh`) |
| `js/ui/ui.js:30` | `refreshCoins()` |
| `js/ui/menu.js:276` | beli upgrade |
| `js/data/upgrades.js` | harga & max upgrade, `perks()` |
| `js/data/upgrades.js:12` | def `magnet` — max 6, base 50, grow 1.4 |
| `js/data/upgrades.js:29` | `perks(levels)` — clamp max, `magnetMul` :39 |
| `js/entities/player.js:25` | `Player.magnet = 78 * perks.magnetMul` |
| `js/entities/pickup.js:131` | radius magnet gameplay |
| `js/game.js:92` | `startRun()` → `perks(upgradesOf(partner))` |
| `js/game.js:290-313` | payout akhir run |
| `js/game.js:347-359` | `clean()` anti-tamper |
| `js/game.js:868-875` | `debugTime` / `debugSpeed` / `debugLevelUp` |
| `js/systems/events.js:354` | `debugStart` / `debugThief` |
| `js/systems/weather.js:179` | `debugStart(kind,dur)` |
| `js/systems/rift.js:276` | `debugOpen` / `debugArena` / `debugNextType` |
| `js/systems/judgment.js:704` | `debugStart` (Sentencia) |
| `js/systems/spawner.js:183` | `debugForceShiny` (wild) |
| `js/systems/levelup.js:22` | kartu level-up `mag` ×1.30 (sistem beda) |
| `js/systems/progress.js:115` | `grant(r)` hadiah misi |
| `tools/build.js` | build: IIFE wrap + obfuscator |
| `firestore.rules` | `saneSave`, `validEntry`, admin UID |

---

## 8. Gacha — ubah rate legendary & shiny

### Def (`js/systems/gacha.js`)

| Simbol | Baris | Nilai |
|---|---|---|
| `RATES` | `gacha.js:24` | `[[1,45],[2,30],[3,17],[4,6.5],[5,1.5]]` |
| `PITY_5` | `gacha.js:25` | `70` |
| `SHINY_RATE` | `gacha.js:26` | `1/100` |
| `forceShiny` | `gacha.js:28` | counter closure (`debugForceShiny(n)`) |
| roll shiny | `gacha.js:100` | `Sprites.hasShiny(dex) && (force ? ... : rnd < SHINY_RATE)` |

### Runtime — legendary weight (`/dev.html`)

`RATES` array by reference → mutasi in-place langsung ngaruh ke `rollRarity()`:

```js
(() => {
  // ★5 = 100%, lain 0 — atau atur sendiri: {1:5,2:5,3:5,4:65,5:20}
  G.Gacha.RATES.forEach(w => (w[1] = 0));
  G.Gacha.RATES[4][1] = 100;
  console.log('RATES', G.Gacha.RATES);
})();
```

### Runtime — shiny: kenapa `debugForceShiny` kadang tidak jalan

`gacha.js:100`:

```js
let shiny = G.Sprites.hasShiny(mon.dex) && (forceShiny > 0 ? (forceShiny--, true) : Math.random() < SHINY_RATE);
```

Force **skip** (tidak jalan) kalau:

1. Mon yang keluar **tidak punya shiny-art** — `G.Sprites.hasShiny(mon.dex)` false (`sprites.js:44`, meta `.sh`).
2. Semua shiny di rarity itu sudah dimiliki → fallback normal (`gacha.js:103-106`).

> **Catatan hasil test:** gen 1 ★5 = `0/6` tersedia (semua sudah owned) — force kelihatan "gagal" padahal masuk jalur #2. Rarity lain masih ada slot (★4 28/31, ★3 34/38, ★2 29/41, ★1 15/35). Test shiny → pakai rarity/gen yang slot-nya masih kosong, atau `delete s.shiny[dex]` dulu.

Workaround — patch `hasShiny` sementara supaya force selalu lolos:

```js
(() => {
  const orig = G.Sprites.hasShiny;
  G.Sprites.hasShiny = () => true;      // semua species dianggap punya shiny-art
  G.Gacha.debugForceShiny(1);
  const r = G.Gacha.pull(G.DB.save, 1, 1, 't1');
  G.Sprites.hasShiny = orig;            // restore
  console.log(r);
  G.UI.refreshCoins();
  G.DB.commit(true);
})();
```

Loop untuk banyak pull:

```js
(() => {
  const orig = G.Sprites.hasShiny;
  G.Sprites.hasShiny = () => true;
  const s = G.DB.save;
  for (let i = 0; i < 10; i++) {
    G.Gacha.debugForceShiny(1);
    console.log(G.Gacha.pull(s, 1, 1, 't1'));
  }
  G.Sprites.hasShiny = orig;
  G.UI.refreshCoins();
  G.DB.commit(true);
})();
```

**Caveat:** mon tanpa shiny-art → flag `save.shiny[dex]` tersimpan, tapi render tetap normal (`sprites.js:161`: `this.shiny = shiny && hasShiny(dex)`). Flag owned lolos `sanitize()` / `saneSave`.

Cek pool mana yang punya shiny-art tersedia:

```js
(() => {
  const s = G.DB.save, gen = 1;
  for (const r of [5, 4, 3, 2, 1]) {
    const list = G.Gacha.pool(r, gen).filter(p => G.SPRITE_META[p.dex]);
    const ok = list.filter(p => G.Sprites.hasShiny(p.dex) && !s.shiny[p.dex]);
    console.log({ rarity: r, pool: list.length, shinyAvailable: ok.length });
  }
})();
```

### Permanent — edit source

`js/systems/gacha.js`:

```js
// line 24-26
const RATES = [[1, 35], [2, 25], [3, 20], [4, 10], [5, 10]];  // ★5 10%
const PITY_5 = 50;
const SHINY_RATE = 0.05;                                      // 5%

// line 100 — force shiny tanpa syarat shiny-art (opsional):
let shiny = forceShiny > 0 ? (forceShiny--, true)
           : (G.Sprites.hasShiny(mon.dex) && Math.random() < SHINY_RATE);
```

Deploy: `dev.html` cukup push `js/`; prod rebuild `node tools/build.js` → upload `js/app.min.js` + `version.json` + `sw.js`.

---

## 9. Magnet max sejak awal game

Chain: `save.pupg[dex].magnet` (0..6) → `upgradesOf` (`db.js:745`) → `startRun` (`game.js:92`) → `perks` (`upgrades.js:29`, `magnetMul:39`) → `Player.magnet = 78 × mul` (`player.js:25`). Dibaca **hanya saat konstruksi Player** — set sebelum run.

### Def

| Simbol | Baris | Nilai |
|---|---|---|
| `magnet` def | `upgrades.js:12` | max 6, base 50, grow 1.4 |
| `magnetMul` | `upgrades.js:39` | `1 + L('magnet')*0.12` (clamp max) |
| `upgradesOf` | `db.js:745` | `save.pupg[dex] = {id: lvl}` |
| `Player.magnet` | `player.js:25` | `78 * perks.magnetMul` |
| pickup radius | `pickup.js:131` | `pl.magnet * pl.magnet` |

### Runtime (`/dev.html`)

```js
(() => {
  const s = G.DB.save;
  const d = s.partner;
  s.pupg[d] = s.pupg[d] || {};
  s.pupg[d].magnet = G.Upgrades.BY.magnet.max;   // 6 → mul 1.72 → radius ≈134
  G.DB.commit(true);
  console.log('magnet lvl =', s.pupg[d].magnet);
})();
```

Semua partner:

```js
(() => {
  const s = G.DB.save;
  G.DEX.forEach(p => {
    s.pupg[p.dex] = s.pupg[p.dex] || {};
    s.pupg[p.dex].magnet = G.Upgrades.BY.magnet.max;
  });
  G.DB.commit(true);
})();
```

Sedang dalam run (Player sudah jadi):

```js
G.Game.player.magnet = 78 * (1 + 6 * 0.12);
```

### Permanent (source)

`db.js` `newSave()` → preseed:

```js
pupg: { [starter]: { magnet: 6 } },
```

Cheat max upgrade umum (semua id) — lihat §3 item 5. In-run card `mag` (`levelup.js:22`) = sistem terpisah ×1.30 per pick, max 6 pick.

---

## 10. Gacha hanya drop Pokémon baru (no dup)

Dup di `gacha.js:99` — `mon = G.U.pick(list)` tanpa filter owned; dup cuma dikasih refund (line 115-118). Shiny dup sudah punya jalur sendiri (line 103-106).

### Runtime — patch `G.U.pick` sementara (`/dev.html`)

`pull()` manggil `G.U.pick(list)` via namespace → bisa dibungkus. Flag `filtering` cegah patch kena sistem lain.

```js
(() => {
  const origPick = G.U.pick;
  const s = G.DB.save;
  s.owned = s.owned || {};
  let filtering = false;
  G.U.pick = (list) => {
    if (filtering && Array.isArray(list)) {
      const un = list.filter(p => !s.owned[p.dex]);
      if (un.length) return origPick(un);
    }
    return origPick(list);
  };
  filtering = true;
  const r = G.Gacha.pull(s, 10, 1, 't1');
  filtering = false;
  G.U.pick = origPick;                 // restore
  console.table(r.map(x => ({ dex: x.dex, rarity: x.rarity, isNew: x.isNew, shiny: x.shiny, refund: x.refund })));
  G.UI.refreshCoins();
  G.DB.commit(true);
})();
```

> Console bisa cetak `undefined` di bawah log — itu completion value IIFE terakhir (`commit` return undefined), **bukan error**. Preview `Object { dex, rarity, shiny, … }` — `…` = `isNew` + `refund`, expand untuk lihat. `isNew: false` + `refund > 0` = patch tidak nempel atau pool sudah habis.

Catatan:

- Kalau **seluruh pool rarity itu sudah owned** → fallback dup + refund (rarity tidak di-roll ulang).
- Kombinasi shiny: `debugForceShiny` + filter ini = shiny baru saja.

### Permanent (source) — `js/systems/gacha.js:97-99`

```js
const { rarity, list } = poolNear(want, gen);
if (rarity === 5) save.pity[gen] = 0;
const unowned = list.filter(p => !save.owned[p.dex]);
let mon = G.U.pick(unowned.length ? unowned : list);
```

### Prod (G tertutup) — blunt option

`owned = {}` di save → semua pull dianggap baru, tapi dex list ikut reset:

```js
(() => {
  const cloudKey = Object.keys(localStorage).find(
    x => x.startsWith('ps.cloud.') && !x.startsWith('ps.cloudok.')
  );
  const s = JSON.parse(localStorage.getItem(cloudKey));
  s.owned = {};
  s.shiny = {};
  s.updated = Date.now();
  localStorage.setItem(cloudKey, JSON.stringify(s));
  localStorage.removeItem(cloudKey.replace('ps.cloud.', 'ps.cloudok.'));
})();
```

---

## 11. Unlock semua Pokémon + skip animasi gacha

### Unlock semua (owned + shiny)

`G.DB.grant(dex, from)` / `grantShiny(dex, from)` (`db.js:752`, shiny otomatis grant owned). Shiny hanya untuk species dengan shiny-art (`sprites.js:44`).

```js
(() => {
  const s = G.DB.save;
  let n = 0, m = 0;
  G.DEX.forEach(p => {
    if (!G.SPRITE_META[p.dex]) return;
    if (!s.owned[p.dex])  { G.DB.grant(p.dex, 'debug'); n++; }
    if (G.Sprites.hasShiny(p.dex) && !s.shiny[p.dex]) { G.DB.grantShiny(p.dex, 'debug'); m++; }
  });
  G.UI.refreshCoins();
  G.DB.commit(true);
  console.log('owned baru:', n, '· shiny baru:', m);
})();
```

Flag "legendario vencido" (rift — key `p.legend`, bukan dex; `progress.js:140`, `rift.js:95`):

```js
(() => {
  const s = G.DB.save;
  s.legends = s.legends || {};
  G.DEX.filter(p => p.legend).forEach(p => { s.legends[p.legend] = s.legends[p.legend] || Date.now(); });
  G.DB.commit(true);
})();
```

### Skip animasi gacha

Alur: `gacha-ui.js:97` `await G.Slots.play(slot, res)` (slot machine) → loop kartu `wait(150ms)` (line 114). Keduanya patchable via namespace/`setTimeout`:

```js
(() => {
  const origSlots = G.Slots.play;
  const origTO = window.setTimeout;
  G.Slots.play = async () => {};                                // slot instan
  window.setTimeout = (fn, ms, ...a) => origTO(fn, ms === 150 ? 0 : ms, ...a);
  origTO(() => {                                                // restore setelah 3 dtk
    G.Slots.play = origSlots;
    window.setTimeout = origTO;
  }, 3000);
  document.getElementById('pull-10').click();                   // pull ×10 via UI
})();
```

`busy` (`gacha-ui.js:6`) dikelola UI — tombol normal lagi setelah reveal. Tanpa UI sama sekali → `G.Gacha.pull` langsung (§3/§10).

---

## 12. XP leveling ×3

Chain: enemy mati → `Pickups.dropXp` (`enemy.js:178`) → orb dikumpel → `pl.gainXp(v)` (`pickup.js:172`) → `player.js:272` `xp += amount * xpMul`.

| Simbol | Baris | Nilai |
|---|---|---|
| `Player.xpMul` | `player.js:26` | dari `perks.xpMul` |
| `gainXp` | `player.js:272-273` | `xp += amount * xpMul` |
| save perk `xp` | `upgrades.js:40` | `1 + L('xp')*0.05` (cap lvl 8 → 1.4 max) |
| kartu level-up `xp` | `levelup.js:25` | `xpMul *= 1.12` (max 8) |
| golden hour / boss | `enemy.js:96,88` | xp ×2 / ×5 (sumber musuh) |

Save edit **tidak bisa** capai 3× (perks clamp max 1.4). Pilih salah satu:

### A. Dalam run (langsung, reset tiap run baru)

```js
(() => {
  const p = G.Game.player;
  console.log('xpMul', p.xpMul, '→ 3');
  p.xpMul = 3;                 // atau p.xpMul *= 3; kalau mau stack dari base
})();
```

### B. Otomatis tiap run (wrap `perks` — game.js:92 via namespace)

```js
(() => {
  const orig = G.Upgrades.perks;
  G.Upgrades.perks = (levels) => { const k = orig(levels); k.xpMul = 3; return k; };
  console.log('xpMul 3x otomatis tiap startRun');
})();
```

### C. Permanent (source) — `js/data/upgrades.js:40`

```js
xpMul: 3 * (1 + L('xp') * 0.05),
```

### ⚠ Leaderboard

`clean()` (`game.js:347`) cek `level > 20 + time/3` → leveling 3× lebih cepat gampang lewat cap itu → run **tidak dikirim ke ranking** (silent). `xpMul` sendiri tidak dicek, tapi efeknya ke level. Test ranking → pakai pace normal.

---

## 13. Magnet radius seluruh map

Logic (`pickup.js:116-152`):

- line 133 — tarik kalau `d2 < pl.magnet²`; **`p.pulled = true` permanen** sampai dikumpel
- line 136 — pull speed `240 + 1400/d` (jauh pelan, tetap jalan)
- line 147 — kumpel di radius 15 px

Radius besar → semua orb (xp/coin/ticket/item) langsung kena dari mana pun.

### In-run

```js
G.Game.player.magnet = 1e6;      // atau Infinity — mag2 = Infinity, d2 < mag2 selalu true
```

### Otomatis tiap run — wrap `perks` (player.js:25 `78 * perks.magnetMul`)

```js
(() => {
  const orig = G.Upgrades.perks;
  G.Upgrades.perks = (levels) => { const k = orig(levels); k.magnetMul = 1e3; return k; };
  // 78 * 1000 = 78.000 px radius
})();
```

### Permanent — `js/entities/player.js:25`

```js
this.magnet = 1e6;
```

Catatan:

- Save edit tidak sanggup — `perks` clamp `magnetMul` max 1.72 (§9).
- Item `interact.js:22` magnet ×4 on/off → tetap aman (angka besar ×4/÷4).
- `clean()` tidak cek magnet → ranking aman.
- **Timing:** nilai magnet dibaca saat konstruksi Player (`startRun`). Di menu `G.Game.player` belum ada → set error/kelewat; wrap `perks` baru ngaruh **run berikutnya**. Gabungan:

```js
(() => {
  const orig = G.Upgrades.perks;
  G.Upgrades.perks = (levels) => { const k = orig(levels); k.magnetMul = 1e3; return k; };
  const p = G.Game.player;
  console.log('state:', G.Game.state, 'player:', !!p, 'magnet:', p && p.magnet);
  if (p) p.magnet = 1e6;
})();
```

- Pull speed jauh pelan (`pickup.js:136` `240 + 1400/d`) — radius besar tetap kena, cuma butuh 1-3 dtk.

---

## 14. Auto-click pilihan #1

Level-up card: `run-ui.js:57` `el.onclick = () => pick(i)`, screen `#scr-levelup`, kartu `#cards .card`, `G.RunUI.pick` di-export (`run-ui.js:236`, no-op kalau `offers` null).

### Tiap 3 detik (toggle — jalankan ulang untuk OFF)

```js
(() => {
  if (window.__auto1) { clearInterval(window.__auto1); window.__auto1 = null; return console.log('auto OFF'); }
  window.__auto1 = setInterval(() => {
    const lvl = document.getElementById('scr-levelup');
    const card = document.querySelector('#cards .card');
    if (lvl && !lvl.classList.contains('hidden') && card) {
      card.click();   // = pick(0)
      console.log('auto-pick #1', new Date().toLocaleTimeString());
    }
  }, 3000);
  console.log('auto ON');
})();
```

### Instan (MutationObserver, langsung pas kartu muncul)

```js
(() => {
  if (window.__auto1obs) { window.__auto1obs.disconnect(); window.__auto1obs = null; return console.log('auto OFF'); }
  window.__auto1obs = new MutationObserver(() => {
    const lvl = document.getElementById('scr-levelup');
    if (lvl && !lvl.classList.contains('hidden')) {
      const c = document.querySelector('#cards .card');
      if (c) c.click();
    }
  });
  window.__auto1obs.observe(document.body, { childList: true, subtree: true });
  console.log('instant auto-pick ON');
})();
```

### Via API

```js
const id = setInterval(() => {
  if (!document.getElementById('scr-levelup').classList.contains('hidden')) G.RunUI.pick(0);
}, 3000);
// clearInterval(id);  → stop
```

### Gacha `#pull-1` tiap 3 dtk

```js
(() => {
  if (window.__pull1) { clearInterval(window.__pull1); window.__pull1 = null; return console.log('OFF'); }
  window.__pull1 = setInterval(() => {
    const b = document.getElementById('pull-1');
    if (b && !b.disabled && !document.getElementById('scr-gacha').classList.contains('hidden')) b.click();
  }, 3000);
  console.log('auto pull-1 ON');
})();
```

`busy` (`gacha-ui.js:6`) amankan klik saat animasi. Pilihan item (`#item-cards`) dan bond card punya struktur sama — ganti selector.

---

## 15. Ganti tab tanpa pause

Penyebab: `game.js:36` `visibilitychange → if (document.hidden) autoPause()` → `autoPause` (`game.js:65`) `state='paused'` + `RunUI.showPause()` (solo). Listener anonymous — tak bisa dihapus. `document.hidden` cuma dibaca `game.js:36` + `coop.js:307` (away status).

### Runtime — override `document.hidden`

```js
Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
// restore: delete document.hidden;
```

Efek: tab switch → state tetap `playing`, layar pause tak muncul; browser tetap stop `rAF` saat background → freeze visual, balik tab langsung lanjut; jam in-game berhenti saat hidden (aman `clean()`). `db.js:386` flush tetap jalan (pakai `visibilityState`), `updater.js:77` tetap jalan, `coop.js:307` away selalu 0.

### Alternatif — auto-resume pas balik tab

```js
window.__noPause = true;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && G.Game.state === 'paused' && window.__noPause) {
    G.Game.togglePause();
  }
});
```

### Permanent — `js/game.js:36` → comment baris listener

Catatan:

- Pause manual (Esc/P/tombol) tetap jalan — hanya auto-pause tab dimatikan.
- Portrait mobile tetap auto-pause (`checkOrientation`, `game.js:58`).
- Game benar-benar jalan di background → loop harus pindah dari `requestAnimationFrame` (`game.js:34`) ke `setInterval` — mod terpisah.

---

## 16. Defence unlimited (tahan pukul)

Chain:

- `player.js:23` — `this.dmgReduce = perks.dmgReduce` (save cap 8 lvl → 0.16)
- `player.js:96` — `get reduction() { return Math.min(0.8, dmgReduce + buffs.def) }` — **cap 80%**
- `player.js:236` — `d = pure ? max(1,amount) : max(1, amount*(1-reduction)*close)` — **min 1 damage** walau reduction 100%; `pure` (Arceus) abaikan reduction
- `hurt` (`player.js:228`) — early return kalau `invuln > 0` (0.45 dtk per hit)

`clean()` (`game.js:349`) — cek **own prop** `hurt/update/heal/gainXp` via `hasOwnProperty` → patch **prototype** tidak kena deteksi; `dmgReduce`/`reduction` tidak dicek.

### A. Full immunity — disable `hurt` via prototype (persist semua run)

```js
(() => {
  window.__origHurt = G.Player.prototype.hurt;   // simpan reference dulu
  G.Player.prototype.hurt = function () {};
  console.log('hurt OFF — restore: G.Player.prototype.hurt = window.__origHurt');
})();
// restore:  G.Player.prototype.hurt = window.__origHurt; delete window.__origHurt;
// atau:     location.reload();  (runtime patch hilang, script asli balik)
```

Bukan own prop → `clean()` lolos. Boss/Arceus `pure` juga nihil. Reference dalam IIFE tanpa simpan ke `window` hilang setelah script selesai — restore via reload ATAU jalur fetch di bawah.

**Restore tanpa reload (run aktif aman)** — `/js/entities/player.js` public, extract method `hurt` dari source live:

```js
(async () => {
  const t = await (await fetch('/js/entities/player.js')).text();
  const m = t.match(/hurt\(amount, type = null, pure = false\) \{([\s\S]*?)\n  \}/);
  if (!m) { console.error('gagal parse'); return; }
  G.Player.prototype.hurt = new Function('amount', 'type = null', 'pure = false', m[1]);
  console.log('hurt restored');
})();
```

Tanpa `window.__origHurt`, tanpa reload — run aktif tetap jalan, prototype lookup langsung aktif. HP yang sudah terpotong tidak auto-balance: `G.Game.player.hp = G.Game.player.maxHp` bila perlu. Fallback offline: paste ulang isi `player.js:229-259` sebagai function di atas prototype.

### B. 100% reduction (masih kena 1 dmg minimum + pure tetap masuk)

```js
Object.defineProperty(G.Player.prototype, 'reduction', { configurable: true, get: () => 1 });
// d = max(1, 0) = 1 per hit; invuln 0.45 dtk antar hit
```

### C. Cap legit 80% — wrap `perks` (player.js:23)

```js
(() => {
  const orig = G.Upgrades.perks;
  G.Upgrades.perks = (levels) => { const k = orig(levels); k.dmgReduce = 0.8; return k; };
})();
```

Save edit sendiri mentok 0.16 (8 lvl × 0.02) — tidak cukup; harus runtime/source.

### Combo biar "abadi" selain defence

```js
(() => {
  const p = G.Game.player;
  p.maxHp = 50000; p.hp = 50000;      // cap clean()
  const origHeal = G.Player.prototype.heal;
  G.Player.prototype.heal = function (a) { this.hp = Math.min(this.maxHp, this.hp + a); };
})();
```

⚠ `maxHp > 50000` → gagal `clean()` (game.js:352). `atkMul > 2000` / `spdMul > 25` juga dicek — jangan kelewatan.

---

## 17. Run time +40 menit

- `st` (`game.js:25`) — `{ get time() { return time; } }` — read-only live getter.
- `debugTime(t)` (`game.js:868`) — `tampered = true; time = t` — satu-satunya jalur tulis waktu via API publik.

```js
(() => {
  const t = G.Game.st.time;
  const add = 40 * 60;                       // 2400 detik
  G.Game.debugTime(t + add);
  console.log('time', Math.floor(t), '→', Math.floor(G.Game.st.time), 's');
})();
```

Efek:

- `tampered = true` + `time >> real elapsed` → `clean()` gagal 2× (`game.js:349-350`) → run **tidak masuk ranking**.
- Payout akhir naik otomatis (`game.js:299` `floor(time/5)` → +480 komponen koin).
- Level cap longgar (`level > 20 + time/3`).
- Spawn/skala musuh ikut `time` — lompatan +40 mnt bisa tiba-tiba hard (boss/rift/event timer ikut posisi waktu baru).

Restore waktu ke semula tidak ada API — cuma `debugTime(nilaiLama)` setelah catat nilai awal.

---

## 18. Tetap masuk ranking (kenapa cheat waktu tak lolos)

Dobel gate:

1. Client `clean()` (`game.js:347-359`) — `tampered` + `time > real elapsed + 10`.
2. Server `firestore.rules` `validEntry` — `t ≤ (request.time − runs/uid.startedAt).seconds + 30`, `lv ≤ 10+t/4`, `kills ≤ 100+t*12`.

`debugTime` mustahil lolos keduanya tanpa ubah rules (owner).

### Cheats RANKING-SAFE (tidak dicek `clean()`)

- coins / tickets / gacha (rates, shiny, only-new) — save-level
- magnet radius (§13), auto-pick (§14), tab tanpa pause (§15)
- defence via **prototype** patch (§16A — bukan own prop)
- xpMul (hati-hati `level > 20 + time/3`)

### Pastilah Dibuang dari ranking

- `debugTime`, `debugSpeed > 1`, `debugLevelUp` → `tampered`
- own-prop `hurt/update/heal/gainXp` (patch instance, bukan prototype)
- `maxHp > 50000`, `atkMul > 2000`, `spdMul > 25`, `cdMul < 0.03`

### Owner route (test project / jangan prod publik)

- `firestore.rules` `validEntry` — longgarkan syarat waktu, atau board test terpisah
- deploy rules ke Firebase project **test**, bukan prod
- Admin SDK (emulator) untuk tulis entry langsung — bypass rules
