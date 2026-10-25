# Art Direction

> Bagaimana game ini terlihat & terasa. GDD (`game-design-*.md`) menentukan
> *apa* yang muncul; dokumen ini menentukan *gaya* penyajiannya.

## 1. Identitas visual

- **Style**: pixel art retro 16-bit (Pokémon Mystery Dungeon-flavoured) di
  atas tile prosedural, ditambah chrome UI modern semi-transparan (glass
  panel: `backdrop-filter: blur`) — kontras pixel-alam vs UI-panel-licin itu
  identitas proyek.
- **Resolusi dasar**: 1 unit dunia = 16px tile × `Sprites.PX` (= 2) → 32px
  efektif. Semua sprite dunia share PX yang sama.
- **`image-rendering: pixelated` global** — jangan pernah haluskan sprite
  (aturan `canvas { image-rendering: pixelated }` di `style.css`).
- **Warna**: gelap-dingin sebagai dasar (`body #050914`, arena `#061009`),
  aksen **emas** `var(--gold)` untuk ekonomi/elite, merah untuk bahaya
  (leak/boss), biru-ungu untuk info.

## 2. Aset & pipeline sprite

| Aset | Sumber | Lihat |
|---|---|---|
| Sheet Pokémon per stance | SpriteCollab (CC BY-NC 4.0) | `docs/LEGAL.md` §2 |
| Sheet format | kolom = frame, baris = **8 arah** (0 Down … 7 DownLeft) | `core/sprites.ts` |
| Stance tersedia | `Idle Walk Attack Shoot Charge Hurt Faint` — **7, tidak ada lebih** | `SPRITES` anims |
| Geometri anchor | `src/data/sprites-meta.js` (`G.SPRITE_META`): frame w/h + `ax/ay` (anchor kaki), `d[]` durasi frame, `r` radius | generated, ter-commit |
| Shiny | subfolder `s/` per dex | toggle `Sprites.Animator(dex, scale, shiny)` |
| Tile dunia | **prosedural** — `src/world/tiles.ts` menulis `ImageData` (palet `BIOMES`: Bosque/Cueva/Volcán), bukan PNG | identik untuk dungeon & backdrop autochess (`Tiles.paintChunk`) |

Aturan produksi aset baru:
- Aset pixel baru = integer scale only (2×/3×), palet dari `BIOMES`/`TYPE_COLOR`.
- Sheet stance baru wajib 7-frame-class berikut atau menambah fallback di
  `Animator` (dicek test `sprites-fit.test.ts`).
- Font UI: **Pixelify Sans** (OFL) — hanya untuk display; label kecil boleh
  system-ui bold.

## 3. Penempatan sprite di sel (fitDraw)

`Sprites.fitDraw(dex, cvW, cvH, prefer=2)` — **satu-satunya** cara menaruh
sprite besar kecil di kotak (locking test: `tests/sprites-fit.test.ts`):

- `STANCE = Idle/Walk/Charge/Hurt/Shoot/Faint` (**Attack sengaja dikecualikan**
  — swing boleh luber keluar sel).
- `k = min(prefer, cvW*0.94/wmax, cvH*0.92/(up+down))` — budget **0.94/0.92**.
- Floor hanya bila hampir integer (`k>=1 && k-floor < 0.15`) — mon mid-size
  boleh scaled >1 (dex25 ≈1.38) asal tajam.
- Resolusi **internal** sel dinaikkan (cell 96, shop 96, mob TD 80×88) —
  display CSS dipisah via `max-width` — **jangan menurunkan attr canvas**
  untuk memperbaiki tampilan, ubah CSS.

## 4. Konvensi UI

- **Chrome**: topbar pill tengah (blur+border), synergy = sidebar kanan,
  dock bawah glass (gold · reroll/ready/timer · shop) — landscape full-width,
  portrait kolom 440px. Detail layout: GDD td §1a.
- **Ikon**: pixel icons (`Icons.html()`) untuk overlay; emoji hanya untuk
  ekspresi (🏰 base, ♥, ⚔️, ★) yang memang gaya game.
- **HP bar**: sel = bar tipis bawah; mob TD = 12px (3× pass), base = ring
  conic-gradient + pill `♥ N`.
- **Highlight negatif/positif**: `.ac-dead` grayscale+rim merah, `.flank`
  rim emas tipis (prep only), `.merge-ok` hijau, boss glow merah scale 1.12.
- Semua transisi state = **class toggle + CSS keyframes**, bukan JS tween
  (pop/flash/pulse: `ac-pop`, `ac-hurt`, `ac-banner`, `ac-portal-spin`, …).

## 5. Juice standards

Feedback wajib untuk tiap aksi (jangan pernah "silent"):

| Aksi | Aksi | Preseden (kode) |
|---|---|---|
| Wave mulai / boss / clear | banner tengah + sfx (`boss/confirm/levelup`) | `banner()` ac-ui |
| Base kena leak | flash base + heart pulse + banner warn + `hurt` sfx | `leakFx()` |
| Buy/place/merge/sell | ring+burst+`ac-pop`/`mergeflash` + sfx (`land/levelup/coin`) | `placeFx()` |
| Mob kena hit | anim `Hurt` + `.hurt` flash + `hit` sfx; dmg number **berwarna eff** (super `#ffe14d` besar, weak `#a3abb8`) | `syncEnemies`, `stepFx` |
| Mob mati | `Faint` hold + `.ac-dying` fade 0.9s + burst + `faint/bossDown` | TD & dual sync |
| AoE/radial/aura | **telegraph** ground ring tumbuh sebelum impact | `drawTelegraph`/`acImpacts.tele` |
| Status burn/poison/shield | ellipse lantai / bubble arc di bawah mob | `stepFx` ground FX |
| Boss roar | ring merah + burst + `boss` sfx | `roarPulse` |
| Juara menyerang | stance anim sekali (`UI.spriteHit`) + shot sfx per move kind | `playSwings` |

Aturan: sfx lewat `Audio.sfx` saja (ada throttle), FX lewat `FX.*` saja (ada
cap), posisi = koordinat host/fx canvas yang sama.

## 6. Audio

- Semua sfx sintesis/lokal via `Audio.sfx(name, opts?)` — catalog di
  `core/audio.ts`: hover click back confirm select error shot hit faint
  bossDown xp coin heal levelup hurt boss surge shiny shinyGet break chest
  grass ball shake burst reveal rift legend gameover biome quake toll descend
  land judge pause buy.
- `opts { kind, type, rarity }` membedakan varian (shot musik/element).
- Throttle `MIN_GAP` per nama — **jangan** loop sfx manual per frame.
- Kualitas volume: ikuti tier `Settings` yang ada; jangan hardcode gain baru.

## 7. Checklist review visual

- [ ] Sprite tajam (pixelated), tidak blur, tidak terpotong (cek fitDraw
      budget kalau ubah ukuran sel).
- [ ] Feedback ada untuk aksi baru (tabel §5) — minimal 1 dari {FX, sfx, class}.
- [ ] Kontras teks ≥ di atas panel gelap.
- [ ] Landscape + portrait dicek (dua layout berbeda).
- [ ] Tidak menambah asset berlisensi lain tanpa update `docs/LEGAL.md` §2.
