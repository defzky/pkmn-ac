# PokéAutochess

Fan game auto-battler Pokémon — fork dari PokéSurvivor (TS rewrite). Dua mode: **Tower Defence** (path lewat board) dan **Full Autochess** (dual-board auto-battler).

## Stack

- **Vite 7** + **TypeScript** strict
- **Vitest** (unit + sim tests)
- **PWA** offline-first (`sw.js`, `manifest.webmanifest`)
- **Firebase** auth + Firestore (`firestore.rules`)
- Entry: `index.html` → `src/main.ts` → `src/game.ts` → `src/autochess/*`

## Commands

```bash
npm run dev        # dev server :5173
npm run build      # tsc + vite build
npm run build:prod # terser + obfuscator via tools/make-prod.mjs
npm test           # vitest run
npm run typecheck  # tsc --noEmit
npm run preview    # preview build
```

## Structure

```
src/
  autochess/       # auto-battler core (16 modules)
    ac-ui.ts       # UI shell, arenas, shop, keyboard
    base.ts        # base HP + leak penalty (TD)
    board.ts       # 3×3 grid, placement, star merge
    buffs.ts       # per-run buff multipliers
    champions.ts   # 12 GDD champions + shop odds
    move-fx.ts     # move animation FX pipeline
    path.ts        # path waypoints (TD) + placement bounds
    shop.ts        # 3-card shop, reroll, buy/sell
    skills.ts      # champion skill definitions
    synergy.ts     # elemental synergy mods
    team.ts        # board → battle unit glue
    unit-stats.ts  # star multipliers, board stats
    unit.ts        # battle unit type + factory
    unitAI.ts      # combat tick (path walk + targeting)
    wave-runner.ts # dual-board phase machine
    wave.ts        # wave composition + scaling
    wave-runner-td.ts # TD phase machine (path + leak)
  core/            # registry, util, db, audio, sprites, i18n
  data/            # pokedex, moves, upgrades, starters
  game.ts          # legacy dungeon mode + Flow
  systems/         # legacy survivor systems (stats, gacha, progress)
  ui/              # menu, screens, UI helpers
tests/             # vitest suites (13 files)
docs/
  game-design-common.md    # shared: units, shop, merge, synergy, buffs
  game-design-autochess.md # full autochess: dual-board, foe heart
  game-design-td.md        # TD: path board, base HP, leak
  PLAN-autochess-td.md     # historical P11–P18 plan
  PLAN-move-animation.md   # historical move FX plan
```

## Modes

- **Tower Defence** — single 3×3 board, path serpentine lewat grid, musuh jalan dari spawn ke base. Leak = base HP damage. Survive 20 waves.
- **Full Autochess** — dual-board 3×3 (enemy atas, player bawah). Beli/merge unit, eliminate musuh → damage enemy heart. Win = enemy heart 0 atau wave 20 clear.

## Docs

- Design source of truth: `docs/game-design-*.md` (split per mode + shared).
- Historical plans: `docs/PLAN-*.md` (executed, kept for reference).

## License

Fan project. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc.
