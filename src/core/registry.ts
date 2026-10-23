/* registry — module registration helper.
 * Converts files still use the window.G global pattern for inter-module
 * access (legacy). Each converted file calls register() so that the
 * global object stays populated for files not yet converted.
 */
export function register(key: string, value: unknown): void {
  (G as Record<string, unknown>)[key] = value;
}

/* Access a global G member (read-only convenience for converted code).
 * For converted modules prefer direct import instead.
 */
export function gget<T = unknown>(key: string): T {
  return (G as Record<string, unknown>)?.[key] as T;
}
