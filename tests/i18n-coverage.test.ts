/* i18n-coverage — el HTML de index.html es la fuente del español; todo texto
 * descriptivo debe poder traducirse con lang-en.js. Dos regresiones cubiertas:
 *   1. Fuga de indonesio (idioma de los docs) hacia la UI del jugador.
 *   2. Frases del menú sin entrada en el diccionario (se quedan en español
 *      aunque el jugador esté en inglés).
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const html = readFileSync('index.html', 'utf8');
let dict: Record<string, string> = {};

beforeAll(async () => {
  const g: any = { I18n: { add: (d: Record<string, string>) => { dict = d; } } };
  (globalThis as any).G = g;
  await import('../src/data/lang-en.js');
});

/** Marca de indonesio que jamás debe aparecer en strings de jugador. */
const ID_MARKERS = /\b(kamu|musuh|menang|kalah|belilah|tanggal hari|dua arena|penyerang|jadikan|pemain|gunakan|lalu endles|per seed|tiap buka|tersimpan lokal|selesai|buka toko|serangan dasar)\b/i;

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('index.html — idioma de la UI', () => {
  it('sin cadenas en indonesio (fuga de los docs al jugador)', () => {
    const m = html.match(ID_MARKERS);
    expect(m, `indonesio encontrado en index.html: ${m?.[0]}`).toBeNull();
  });

  it('los <small> de .menu-item son frases con entrada en lang-en.js', () => {
    const smalls = [...html.matchAll(/<button class="menu-item[^"]*"[^>]*>[\s\S]*?<small[^>]*>([\s\S]*?)<\/small>/g)]
      .map(m => norm(m[1]));
    expect(smalls.length).toBeGreaterThanOrEqual(9); // 9 items del menú principal
    for (const s of smalls) {
      expect(dict[s], `falta traducción EN de: "${s}"`).toBeTruthy();
    }
  });

  it('las tarjetas de modo autochess tienen traducción EN', () => {
    const cards = [...html.matchAll(/<button class="menu-item ac-mode-card"[^>]*>[\s\S]*?<small>([\s\S]*?)<\/small>/g)]
      .map(m => norm(m[1]));
    expect(cards.length).toBe(3); // td / auto / daily
    for (const s of cards) {
      expect(dict[s], `falta traducción EN de: "${s}"`).toBeTruthy();
    }
  });

  it('«Elige un modo de juego» tiene traducción EN', () => {
    expect(dict['Elige un modo de juego']).toBe('Choose a game mode');
  });
});
