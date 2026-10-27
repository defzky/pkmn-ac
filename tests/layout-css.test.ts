/**
 * T7 regression — TD landscape board collapse.
 * The player board element is <div class="ac-grid" id="ac-me-grid">; a
 * .ac-me-grid CLASS selector never matches it, so in landscape the grid fell
 * back to width:100% inside an indefinite flex item and collapsed to
 * min-content (18×18, cells 2×2). Guards the three CSS invariants that keep
 * the board sized: no dead class rules, an ID-based landscape rule, and a
 * stretching .ac-arow (definite height for height:100% to resolve).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('public/css/style.css', 'utf8');
/** Strip /* … *\/ comments so prose about the bug isn't a false positive. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('style.css — TD landscape board layout (T7)', () => {
  it('has no .ac-me-grid class selector (element only carries #ac-me-grid)', () => {
    expect(rules).not.toMatch(/\.ac-me-grid/);
  });

  it('sizes the board via an ID selector in the TD landscape block', () => {
    const block = rules.match(
      /#scr-ac\.td-land \.ac-arenas\.td-mode #ac-me-grid \{[^}]*\}/,
    );
    expect(block, 'landscape #ac-me-grid rule missing').toBeTruthy();
    expect(block![0]).toContain('height: 100%');
    expect(block![0]).toContain('aspect-ratio: 1');
  });

  it('stretches .ac-arow in landscape so the arena gets a definite height', () => {
    const block = rules.match(/#scr-ac\.td-land \.ac-arow \{[^}]*\}/);
    expect(block, 'landscape .ac-arow rule missing').toBeTruthy();
    expect(block![0]).toContain('align-items: stretch');
  });

  it('compacts the dock on narrow landscape phones so shop cards fit', () => {
    const block = rules.match(
      /@media \(orientation: landscape\) and \(max-width: 760px\) \{[\s\S]*?\n\}/,
    );
    expect(block, 'narrow-landscape compact dock block missing').toBeTruthy();
    expect(block![0]).toContain('.ac-card { width: 84px; }');
    expect(block![0]).toContain('.ac-dock');
  });

  it('About VERSION tracks package.json major (no stale 1.x banner)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      version: string;
    };
    const ui = readFileSync('src/ui/settings-ui.ts', 'utf8');
    const m = ui.match(/const VERSION = '(\d+)\.(\d+) · (\d{4}-\d{2}-\d{2})'/);
    expect(m, 'VERSION constant shape changed').toBeTruthy();
    expect(m![1]).toBe(pkg.version.split('.')[0]);
    expect(Date.parse(m![3])).not.toBeNaN();
  });

  it('autochess landscape: row dock outranks the portrait base rule, arenas stretch, arow grows', () => {
    // base portrait rule (later in file, equal specificity) would win without .ac-app >
    expect(rules).toMatch(
      /#scr-ac\.mode-autochess \.ac-app > \.ac-dock \{[^}]*flex-direction: row/,
    );
    // band-constrained arenas → fitAutoTiles measures real space (no circular growth)
    expect(rules).toMatch(
      /#scr-ac\.mode-autochess \.ac-arenas \{[^}]*align-items: stretch/,
    );
    // me+syn wrapper must share the foe arena's flex:1 1 0 → symmetric halves
    expect(rules).toMatch(
      /#scr-ac\.mode-autochess \.ac-arow \{[^}]*flex: 1 1 0/,
    );
    // and stretch so the me-arena is band-constrained (fitAutoTiles min() loop)
    expect(rules).toMatch(
      /#scr-ac\.mode-autochess \.ac-arow \{[^}]*align-items: stretch/,
    );
  });
});
