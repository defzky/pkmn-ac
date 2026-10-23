/* Global G namespace declarations.
 * Modules register themselves via src/core/registry.ts register().
 * Converted code prefers direct imports; this file types window.G
 * members that are already converted (others stay `any` until their
 * phase).
 */

// biome-ignore lint: ambient global during migration
declare const G: Record<string, any>;

interface Window {
  G?: Record<string, any>;
  PS_PAGES?: boolean;
}

declare module '*.png';
declare module '*.jpg';
declare module '*.webp';
declare module '*.ttf';
declare module '*.mp3';
declare module '*.ogg';
declare module '*.wav';
