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
});
