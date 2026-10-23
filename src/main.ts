/* entry — import order = dev.html scripts order */
import './boot.ts';
import './core/util.ts';
import './core/i18n.ts';
import './data/lang-en.js';
import './core/settings.ts';
import './data/music.ts';
import './data/pokedex.js';
import './data/sprites-meta.js';
import './core/firebase-config.ts';
import './core/db.ts';
import './core/audio.ts';
import './core/input.ts';
import './core/touch.ts';
import './core/gamepad.ts';
import './core/sprites.ts';
import './core/camera.ts';
import './data/moves.ts';
import './data/types.ts';
import './data/starters.ts';
import './data/enemies.ts';
import './data/upgrades.ts';
import './data/items.ts';
import './data/missions.ts';
import './data/achievements.ts';
import './data/funding.ts';
import './data/changelog.js';
import './world/tiles.ts';
import './world/world.ts';
import './entities/vfx.ts';
import './entities/fx.ts';
import './entities/projectile.ts';
import './entities/enemy.ts';
import './entities/pickup.ts';
import './entities/player.ts';
import './systems/stats.ts';
import './systems/combat.ts';
import './systems/spawner.ts';
import './systems/levelup.ts';
import './systems/gacha.ts';
import './systems/interact.ts';
import './systems/rift.ts';
import './systems/judgment.ts';
import './systems/events.ts';
import './systems/weather.ts';
import './systems/pathing.ts';
import './systems/progress.ts';
import './systems/hazards.ts';
import './net/social.ts';
import './net/net.ts';
import './net/coop.ts';
import './net/ranking.ts';
import './ui/icons.ts';
import './ui/ui.ts';
import './ui/hud.ts';
import './ui/login.ts';
import './ui/test.ts';
import './ui/menu.ts';
import './ui/slots.ts';
import './ui/gacha-ui.ts';
import './ui/run-ui.ts';
import './ui/social-ui.ts';
import './ui/ranking-ui.ts';
import './ui/mod-ui.ts';
import './ui/goals-ui.ts';
import './ui/settings-ui.ts';
import './ui/layout-ui.ts';
import './ui/support-ui.ts';
import './ui/news-ui.ts';
import './core/updater.ts';
import './game.ts';
import './autochess/path.ts';
import './autochess/unit-stats.ts';
import './autochess/wave.ts';
import './autochess/synergy.ts';
import './autochess/board.ts';
import './autochess/unit.ts';
import './autochess/base.ts';
import './autochess/unitAI.ts';
import './autochess/wave-runner.ts';
/* ============ main.js — arranque ============ */
(() => {
  // Si un archivo no llega a cargarse (conexión móvil que se corta), mejor
  // avisar que arrancar a medias.
  const NEED = ['U', 'I18n', 'Settings', 'DB', 'Audio', 'Input', 'Touch', 'Sprites', 'Camera', 'Moves', 'Enemies', 'Upgrades', 'Items',
                'World', 'FX', 'Projectiles', 'EnemyMgr', 'Pickups', 'Player', 'Combat', 'Spawner', 'LevelUp', 'Gacha',
                'Rift', 'Weather', 'Progress', 'Hazards', 'Social', 'Net', 'Coop', 'Ranking', 'Icons', 'UI', 'HUD',
                'MenuUI', 'RunUI', 'SettingsUI', 'Funding', 'SupportUI', 'Game', 'Flow'];
  function broken() {
    // (En la versión publicada G no está en window: va encerrado, ver tools/build.js.)
    const miss = NEED.filter(k => typeof G !== 'object' || !G[k]);
    if (!miss.length) return false;
    const el = document.getElementById('boot')!;
    el.innerHTML = 'No se pudo cargar todo el juego (¿se cortó la conexión?).<br><button class="btn gold" style="margin-top:12px" onclick="location.reload()">Recargar</button>';
    console.warn('[Arranque] faltan:', miss.join(', '));
    return true;
  }

  // Mantenimiento (mudanza a servidores nuevos): no se entra ni se inicia
  // sesión, así no se escribe nada mientras se copian las cuentas y partidas.
  // Para probar en local: añade ?dev a la dirección.
  const MAINTENANCE = false;
  function maintenance() {
    if (!MAINTENANCE || /[?&]dev\b/.test(location.search)) return false;
    const en = typeof G === 'object' && G.I18n ? G.I18n.lang === 'en' : !/^es/i.test(navigator.language || '');
    const el = document.getElementById('boot')!;
    el.setAttribute('translate', 'no');
    el.innerHTML = '<div class="boot-in"><h1>PokéSurvivor</h1>' + (en
      ? '<p><b>We are under maintenance.</b></p><p>We are moving the game to new servers so it can stay free for everyone. ' +
        'Your account, your save and your Pokémon are safe. Please come back in a few hours!</p>'
      : '<p><b>Estamos en mantenimiento.</b></p><p>Estamos mudando el juego a servidores nuevos para que siga siendo gratis para todos. ' +
        'Tu cuenta, tu partida y tus Pokémon están a salvo. ¡Vuelve en unas horas!</p>') +
      '<button class="btn gold" style="margin-top:12px" onclick="location.reload()">' + (en ? 'Try again' : 'Volver a intentarlo') + '</button></div>';
    return true;
  }

  function boot() {
    if (maintenance()) return;
    if (broken()) return;
    G.I18n.startDom();
    // Espera a la fuente pixel para que la UI no salte al cargarla.
    const ready = document.fonts && document.fonts.load ? document.fonts.load('16px Pixelify') : Promise.resolve();
    ready.catch(() => {}).then(() => G.Flow.boot());
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();

  // Instalable como app (PWA). Sólo con http(s): abierto con doble clic (file://) no hace falta.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('[PWA]', e.message)));
  }
})();
