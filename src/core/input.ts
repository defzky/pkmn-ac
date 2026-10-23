/* ============ input.ts — teclado y ratón (el táctil está en touch.js y el mando en gamepad.js) ============ */
import { register } from './registry';
import { U } from './util';
import { Camera } from './camera';

const down = new Set<string>();
const pressed = new Set<string>();   // se limpia cada frame
let mx = 0, my = 0, mdown = false;

const MOVE_KEYS: Record<string, string[]> = {
  up: ['keyw', 'arrowup'], down: ['keys', 'arrowdown'],
  left: ['keya', 'arrowleft'], right: ['keyd', 'arrowright']
};

function code(e: KeyboardEvent) { return (e.code || e.key).toLowerCase(); }

addEventListener('keydown', e => {
  const c = code(e);
  if (!down.has(c)) pressed.add(c);
  down.add(c);
  // Evita que el navegador haga scroll con flechas/espacio durante el juego.
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space', 'tab'].includes(c)) e.preventDefault();
});
addEventListener('keyup', e => down.delete(code(e)));
addEventListener('blur', () => { down.clear(); });
let movedAt = 0;               // última vez que se movió el ratón (apuntado a mano)
addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; movedAt = performance.now(); });
addEventListener('mousedown', () => mdown = true);
addEventListener('mouseup', () => mdown = false);

const Input = {
  /** Vector de movimiento del jugador (teclado, joystick táctil o mando). */
  axis(): [number, number] {
    const t = (G as any).Touch && (G as any).Touch.vector();
    if (t && (t[0] || t[1])) return t;
    const g = (G as any).Pad && (G as any).Pad.vector();
    if (g && (g[0] || g[1])) return g;
    let x = 0, y = 0;
    if (MOVE_KEYS.left.some(k => down.has(k))) x -= 1;
    if (MOVE_KEYS.right.some(k => down.has(k))) x += 1;
    if (MOVE_KEYS.up.some(k => down.has(k))) y -= 1;
    if (MOVE_KEYS.down.some(k => down.has(k))) y += 1;
    return U.norm(x, y);
  },
  held(c: string) { return down.has(c); },
  /** true sólo en el frame en que se pulsó. */
  tap(c: string) { return pressed.has(c); },
  /** Una pulsación que no viene del teclado (el mando): cuenta como tecla en este fotograma. */
  virtual(c: string) { pressed.add(c); },
  mouse() { return { x: mx, y: my, down: mdown }; },
  /** Cuándo se movió el ratón por última vez (performance.now). */
  get mouseMovedAt() { return movedAt; },
  /** Dónde apunta el ratón en el mundo (el lienzo ocupa toda la ventana). */
  mouseWorld() { return { x: Camera.left() + mx / Camera.scale, y: Camera.top() + my / Camera.scale }; },
  endFrame() { pressed.clear(); }
};
register('Input', Input);
export { Input };
export default Input;
