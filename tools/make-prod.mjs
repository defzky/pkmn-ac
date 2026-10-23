/* Empaqueta la versión publicada a partir del build de Vite (dist/):
 *   node tools/make-prod.mjs [--forzar] [--sin-obfuscator]
 *
 * Paridad con el tools/build.js original:
 *  1. Cierra G dentro de un IIFE: `window.G = window.G || {}` → `var G = {};`
 *     (G deja de existir en la consola de la versión publicada).
 *  2. terser (--compress passes=1 --mangle) sobre el bundle.
 *  3. javascript-obfuscator (semilla 7, self-defending, strings base64 10%).
 *  4. version.json con la huella (v = sha1[:10] del JS final) — lo mira
 *     core/updater.ts cada 5 min para auto-actualizar a los jugadores.
 *  5. ?v=<hash> en el <script> del index.html (anti-caché).
 *
 * Uso: npm run build:prod  (tsc + vite build --minify false + esto)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const FORZAR = process.argv.includes('--forzar');
const NO_OBF = process.argv.includes('--sin-obfuscator');

// --- localiza el bundle de entrada en dist/index.html -----------------------
const htmlPath = path.join(DIST, 'index.html');
if (!fs.existsSync(htmlPath)) throw new Error('falta dist/index.html — corre antes: vite build --minify false');
let html = fs.readFileSync(htmlPath, 'utf8');
const entryRel = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
if (!entryRel) throw new Error('no encuentro <script src="/assets/*.js"> en dist/index.html');
const entryPath = path.join(DIST, entryRel);

let js = fs.readFileSync(entryPath, 'utf8');
if (js.includes('import.meta')) throw new Error('import.meta en el bundle: cerrar el IIFE lo rompería (revisa vite config)');
if (/^\s*export[\s{]/m.test(js)) throw new Error('export en el bundle de entrada: el wrap IIFE lo rompería');

// --- 1. cierra G ------------------------------------------------------------
const WIN_G = 'window.G = window.G || {}';
if (!js.includes(WIN_G)) throw new Error('util.ts ya no crea G como se esperaba: revisa make-prod.mjs');
js = '(() => {\n' + js.split(WIN_G).join('var G = {};') + '\n})();\n';

const tmp = path.join(ROOT, 'tools', 'cache', 'app.js');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, js);

// --- 2. terser --------------------------------------------------------------
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const shell = process.platform === 'win32';
execFileSync(npx, ['--yes', 'terser@5', tmp, '--compress', 'passes=1', '--mangle', '--comments', 'false', '--ecma', '2020', '-o', entryPath],
  { stdio: 'inherit', shell });

// --- 3. javascript-obfuscator (semilla fija = archivo determinista) ---------
if (!NO_OBF) {
  execFileSync(npx, ['--yes', 'javascript-obfuscator@4.1.1', entryPath, '--output', entryPath,
    '--compact', 'true', '--self-defending', 'true', '--seed', '7',
    '--string-array', 'true', '--string-array-encoding', 'base64', '--string-array-threshold', '0.1',
    '--identifier-names-generator', 'hexadecimal', '--rename-globals', 'false', '--transform-object-keys', 'false',
    '--split-strings', 'false', '--control-flow-flattening', 'false', '--dead-code-injection', 'false',
    '--unicode-escape-sequence', 'false', '--target', 'browser'], { stdio: 'inherit', shell });
}

// --- 4. huella de la versión (lo mira updater.ts cada 5 min) ---------------
const finalJs = fs.readFileSync(entryPath);
const hash = crypto.createHash('sha1').update(finalJs).digest('hex').slice(0, 10);
const version = JSON.stringify(Object.assign({ v: hash, at: new Date().toISOString() }, FORZAR ? { force: true } : {})) + '\n';
fs.writeFileSync(path.join(DIST, 'version.json'), version);
fs.writeFileSync(path.join(ROOT, 'version.json'), version);

// --- 5. ?v= en el <script> (anti-caché) + limpia mapas ---------------------
html = html.replace(`src="${entryRel}"`, `src="${entryRel}?v=${hash}"`);
fs.writeFileSync(htmlPath, html);
for (const f of fs.readdirSync(path.join(DIST, 'assets'))) {
  if (f.endsWith('.map')) fs.unlinkSync(path.join(DIST, 'assets', f));
}
fs.rmSync(path.join(ROOT, 'tools', 'cache'), { recursive: true, force: true });

console.log(`${FORZAR ? '[OBLIGATORIA] ' : ''}${NO_OBF ? '[sin ofuscar] ' : ''}ok: ${path.basename(entryRel)} ${(finalJs.length / 1024).toFixed(0)} KB · version.json v=${hash}`);
