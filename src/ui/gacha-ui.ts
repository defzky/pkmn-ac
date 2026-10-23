import { register } from '../core/registry';
import { Gacha } from '../systems/gacha';
import { Audio } from '../core/audio';
import { Progress } from '../systems/progress';
import DB from '../core/db';

/* ============ gacha-ui.js — banners por generación y animación de tirada ============
 * La lógica (probabilidades, pity, shiny, repetidos) está en systems/gacha.js.
 */
const $ = (G as any).UI.$;
let busy = false;
let gen = 1;

function init() {
  $('pull-1').onclick = () => pull(1);
  $('pull-10').onclick = () => pull(10, 't1');
  $('pull-10b').onclick = () => pull(10, 't10');
  $('pull-close').onclick = close;

  const tabs = $('gacha-gens');
  Gacha.BANNERS.forEach(b => {
    const t = document.createElement('button');
    t.className = 'gen-tab';
    t.dataset.gen = b.gen as any;
    t.innerHTML = `<b>${b.name}</b><small>Gen ${b.gen}</small>`;
    t.onclick = () => { gen = b.gen; refresh(); };
    tabs.appendChild(t);
  });
}

function open() {
  (G as any).UI.show('scr-gacha', true);
  refresh();
}

function refresh() {
  const s: any = DB.save;
  const banner = Gacha.BANNERS[gen - 1];
  document.querySelectorAll<HTMLElement>('#gacha-gens .gen-tab').forEach(t => t.classList.toggle('on', +t.dataset.gen! === gen));

  const all = (G as any).DEX.filter((p: any) => p.gen === gen);
  const owned = all.filter((p: any) => s.owned[p.dex]).length;
  const shinies = all.filter((p: any) => s.shiny && s.shiny[p.dex]).length;
  const [c1, c2, c3] = banner.color;
  $('banner').style.background =
    `radial-gradient(circle at 80% 30%, rgba(255,210,63,.3), transparent 45%),
     radial-gradient(circle at 15% 80%, rgba(196,123,255,.3), transparent 50%),
     linear-gradient(135deg, ${c1}, ${c2} 55%, ${c3})`;
  $('banner-title').textContent = banner.name + ' Misterioso';
  $('banner-desc').textContent = `Los ${all.length} Pokémon de la generación ${gen}. ¡Los legendarios esperan!`;
  $('gacha-owned').innerHTML = `Tienes ${owned} de ${all.length}` +
    (shinies ? ` · ${(G as any).Icons.html('shiny', 12)} ${shinies} shiny` : '');

  const feat = $('gacha-feat');
  feat.innerHTML = '';
  for (const dex of Gacha.featured(gen)) {
    feat.appendChild((G as any).UI.spriteCanvas(dex, 170, 190, { lively: true, scale: 2, dir: 1 }));
  }

  const pity = (s.pity && s.pity[gen]) || 0;
  $('gacha-pity').textContent = `Tiradas sin legendaria en ${banner.name}: ${pity} / ${Gacha.PITY_5}`;

  $('gacha-rates').innerHTML = '<h3>Probabilidades</h3>' + Gacha.RATES.slice().reverse().map(([r, w]) => `
    <div><span style="color:${(Gacha.RARITY_COLOR as any)[r]}">${(G as any).UI.stars(r, 10)} ${(Gacha.RARITY_NAME as any)[r]}</span>
    <span>${w}% · ${Gacha.pool(r, gen).length}</span></div>`).join('') +
    `<div><span>${(G as any).Icons.html('shiny', 12)} Shiny</span><span>1%</span></div>
     <p class="note">· La tirada ×10 garantiza al menos una Épica.<br>
     · A las ${Gacha.PITY_5} tiradas sin Legendaria en un banner, la siguiente lo es.<br>
     · Los repetidos dan Pokémonedas. Los shiny no se repiten.<br>
     · Los tickets se consiguen jugando: algunos Pokémon los sueltan al caer, y
       los jefes y los legendarios de las grietas, a veces, tickets ×10.</p>`;

  const t = s.tickets;
  $('cost-1').innerHTML = `${(G as any).Icons.html('ticket', 18)} 1`;
  $('cost-10').innerHTML = `${(G as any).Icons.html('ticket', 18)} 10`;
  $('cost-10b').innerHTML = `${(G as any).Icons.html('ticket10', 18)} 1`;
  $('gacha-tickets').innerHTML = `Tienes ${(G as any).Icons.html('ticket', 18)} <b>${t.t1}</b> tickets y ${(G as any).Icons.html('ticket10', 18)} <b>${t.t10}</b> tickets ×10`;
  $('pull-1').disabled = !Gacha.costOf(s, 1);
  $('pull-10').disabled = !Gacha.costOf(s, 10, 't1');
  $('pull-10b').disabled = !Gacha.costOf(s, 10, 't10');
  (G as any).UI.refreshCoins();
}

const wait = (ms: any) => new Promise(r => setTimeout(r, ms));

async function pull(n: any, use = 't1') {
  if (busy) return;
  const res = Gacha.pull(DB.save, n, gen, use);
  if (!res) { Audio.sfx('error', undefined); (G as any).UI.toast('No tienes tickets suficientes: consíguelos jugando'); return; }
  Progress.checkAch();
  DB.commit(true);
  busy = true;

  const best = Math.max(...res.map((r: any) => r.rarity));
  const fx = $('pull-fx'), slot = $('slot'), out = $('pull-results');
  out.innerHTML = '';
  $('pull-close').classList.add('hidden');
  slot.style.display = '';
  fx.classList.remove('hidden');

  // La tragaperras (ui/slots.js) y luego las cartas.
  await (G as any).Slots.play(slot, res);
  Audio.sfx('burst', { rarity: best });
  slot.style.display = 'none';

  for (const r of res) {
    const mon = (G as any).DEX_BY[r.dex];
    const c = document.createElement('div');
    c.className = 'pcard r' + r.rarity + (r.shiny ? ' shiny' : '');
    c.style.setProperty('--rc', r.shiny ? '#9ae6ff' : (Gacha.RARITY_COLOR as any)[r.rarity]);
    c.innerHTML = `<div class="stars">${(G as any).UI.stars(r.rarity, 24)}</div>`;
    c.appendChild((G as any).UI.spriteCanvas(r.dex, 132, 120, { lively: r.rarity >= 4 || r.shiny, scale: 2, shiny: r.shiny }));
    const tag = r.isNew
      ? `<span class="new">${r.shiny ? '¡SHINY NUEVO!' : '¡NUEVO!'}</span>`
      : `Repetido · <span class="coin"></span> +${r.refund}`;
    c.insertAdjacentHTML('beforeend', `<b>${r.shiny ? (G as any).Icons.html('shiny', 12) + ' ' : ''}${mon.name}</b><div class="tag">${tag}</div>`);
    out.appendChild(c);
    Audio.sfx('reveal', { rarity: r.rarity });
    await wait(n === 10 ? 150 : 0);
  }
  $('pull-close').classList.remove('hidden');
  busy = false;
}

function close() {
  $('pull-fx').classList.add('hidden');
  refresh();
}

const GachaUI = { init, open, get open_() { return !$('pull-fx').classList.contains('hidden'); } };
register('GachaUI', GachaUI);
export { GachaUI };
export default GachaUI;
