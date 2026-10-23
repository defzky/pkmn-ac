import { register } from '../core/registry';
import { U } from '../core/util';
import DB from '../core/db';
import { Flow } from '../game';
import Moves from '../data/moves';
import { STARTERS, TRAIT_TEXT, PERSONALITY_TEST, personalityResult } from '../data/starters';

/* ============ test.js — test de personalidad y elección de compañero ============ */
const $ = (G as any).UI.$;
let idx = 0, scores: any = {}, result: any = null, picked: any = null;

function init() {
  $('res-ok').onclick = () => choose(result.dex);
  $('res-other').onclick = openStarters;
  $('starter-back').onclick = () => (G as any).UI.show('scr-result');
  $('starter-ok').onclick = () => { if (picked) choose(picked); };
}

function start() {
  idx = 0; scores = {}; result = null;
  (G as any).UI.chrome(false);
  (G as any).UI.show('scr-test');
  render();
}

function render() {
  const Q = PERSONALITY_TEST;
  const q = Q[idx];
  $('test-bar').style.width = (idx / Q.length * 100) + '%';
  $('test-count').textContent = `Pregunta ${idx + 1} de ${Q.length}`;
  $('test-q').textContent = q.q;
  const box = $('test-a');
  box.innerHTML = '';
  q.a.forEach(a => {
    const b = document.createElement('button');
    b.className = 'answer';
    b.dataset.sfx = 'select';
    b.textContent = a.t;
    b.onclick = () => answer(a);
    box.appendChild(b);
  });
}

function answer(a: any) {
  for (const k in a.p) scores[k] = (scores[k] || 0) + a.p[k];
  idx++;
  if (idx < PERSONALITY_TEST.length) render();
  else showResult();
}

function showResult() {
  result = personalityResult(scores);
  const mon = (G as any).DEX_BY[result.dex];
  $('res-trait').textContent = result.trait.charAt(0).toUpperCase() + result.trait.slice(1);
  $('res-text').textContent = TRAIT_TEXT[result.trait] || '';
  $('res-name').textContent = mon.name;
  (G as any).UI.sprite($('res-stage'), mon.dex, { lively: true, scale: 4, hero: true });
  $('res-stage').style.setProperty('--stage-c', (U.TYPE_COLOR as any)[mon.types[0]]);
  (G as any).UI.show('scr-result');
}

/** Abre la rejilla de starters. `fromMenu` = cambiar compañero inicial más tarde. */
function openStarters() {
  picked = null;
  $('starter-ok').disabled = true;
  $('starter-info').textContent = 'Selecciona un Pokémon';
  const grid = $('starter-grid');
  grid.innerHTML = '';
  for (const s of STARTERS) {
    const mon = (G as any).DEX_BY[s.dex];
    const cell = document.createElement('div');
    cell.className = 'cell' + (result && s.dex === result.dex ? ' on' : '');
    cell.appendChild((G as any).UI.spriteCanvas(s.dex, 92, 80, { scale: 2 }));
    cell.insertAdjacentHTML('beforeend', `<b>${mon.name}</b>`);
    cell.onclick = () => {
      grid.querySelectorAll('.cell').forEach((c: any) => c.classList.remove('on'));
      cell.classList.add('on');
      picked = s.dex;
      const mv = Moves.BY_ID[s.start];
      $('starter-info').innerHTML = `${(G as any).UI.typeChips(mon.types)} ${(G as any).Icons.html('move:' + s.start, 16)} ${mv.name} · ${s.traits.join(', ')}`;
      $('starter-ok').disabled = false;
    };
    if (result && s.dex === result.dex) { picked = s.dex; $('starter-ok').disabled = false; }
    grid.appendChild(cell);
  }
  (G as any).UI.show('scr-starters');
}

function choose(dex: any) {
  const save: any = DB.save;
  save.starter = dex;
  save.partner = dex;
  save.personality = result ? { trait: result.trait, scores } : null;
  DB.grant(dex, 'starter');
  DB.commit();
  (G as any).UI.toast('¡' + (G as any).DEX_BY[dex].name + ' se une a ti!');
  Flow.goMenu();
}

const TestUI = { init, start };
register('TestUI', TestUI);
export { TestUI };
export default TestUI;
