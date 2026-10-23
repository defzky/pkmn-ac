/* Vitest setup — runs before test file imports: modules call register() at
 * module scope, so the global G must exist before any import executes. */
(globalThis as any).G = (globalThis as any).G || {};
