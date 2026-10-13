/* Cute Animals — service worker
 * Cache-first app shell for offline play + faster repeat loads.
 * Lives under /animals/ (or local root) — all paths are RELATIVE so the
 * registered scope is respected regardless of subpath.
 */
'use strict';

/* Bump this string on EVERY deploy so clients pick up new code (the activate
 * handler purges old caches). Keep in sync with the app version. */
var CACHE = 'cute-animals-v5.1.2';

/* App shell — keep js list in index.html load order. Only files that exist. */
var PRECACHE = [
  './',
  './index.html',
  './bundle.min.js',
  './touch-editor.js',
  './manifest.webmanifest',
  './css/style.css',
  './css/menu.css',      // DOM menu design system (was missing → unstyled menu offline)
  './css/armory.css',
  './assets/fonts/baloo2-latin.woff2',      // self-hosted brand font (Poki blocks CDN)
  './assets/fonts/baloo2-latin-ext.woff2',  // HU ő/ű subset

  // JS (index.html load order)
  './js/contract.js',
  './js/i18n.js',
  './js/share.js',
  './js/challenge.js',
  './js/clans.js',
  './js/ranked.js',
  './js/puzzles.js',
  './js/maps.js',
  './js/weather.js',
  './js/species.js',
  './js/classes.js',
  './js/terrain.js',
  './js/entities.js',
  './js/weapons.js',
  './js/hazards.js',
  './js/fx.js',
  './js/voices.js',
  './js/ai.js',
  './js/modes.js',
  './js/meta.js',
  './js/account.js',
  './js/entitlement.js',
  './js/ads.js',
  './js/net.js',
  './js/screens.js',
  './js/ui.js',
  './js/armory.js',
  './js/portal.js',
  './js/perf-tier.js',
  './js/postfx.js',
  './js/core.js',
  './js/intro.js',
  './js/menu.js',
  './js/menu-editor.js',
  './js/menu-lobby.js','./js/menu-profile.js','./js/menu-achievements.js','./js/menu-leaderboard.js','./js/menu-challenge.js','./js/menu-clan.js','./js/menu-ranked.js','./js/menu-puzzles.js','./js/menu-credits.js','./js/menu-teamedit.js','./js/menu-skilltree.js','./js/menu-account.js','./js/menu-daily.js','./js/menu-shop.js','./js/menu-battlepass.js','./js/menu-gauntlet.js','./js/menu-help.js','./js/menu-contact.js',

  // assets/species

  // assets/ui
  './assets/ui/pause.svg',
  './assets/ui/play.svg',
  './assets/ui/snd-on.svg',
  './assets/ui/snd-off.svg',

  // assets/weapons (synced with full assets/weapons/ dir — 31 files)
  './assets/weapons/airstrike.png',
  './assets/weapons/capybomb.png',
  './assets/weapons/gasgrenade.png',
  './assets/weapons/laser.png',
  './assets/weapons/logtoss.png',
  './assets/weapons/magnetmine.png',
  './assets/weapons/melee.png',
  './assets/weapons/rope.png',
  './assets/weapons/smokegrenade.png',
  './assets/weapons/spikeball.png',
  './assets/weapons/timergrenade.png',
  // v5.0.1 — új fegyver-ikonok (Jani art): a HUD assets/weapons/<id>.png-t tölt

  // assets/textures — tileable ground-surface detail (Worms-style dirt texture).
  // MUST be precached: it loads via CA.img() and only textures the terrain once
  // the image resolves; a stale/failed runtime fetch left desktop untextured.
  './assets/textures/ground.jpg',

  // assets/boxes

  // assets/fx (sprite-sheets)

  // assets/maps (theme preview thumbnails — New Game + Daily Challenge card).
  // JPEG (q82, ~10× kisebb mint a régi PNG) — gyors preview, kis precache-budget.

  // assets/audio
  './assets/audio/attack.wav',
  './assets/audio/climb.wav',
  './assets/audio/dive.wav',
  './assets/audio/hit.wav',
  './assets/audio/impact_heavy.ogg',
  './assets/audio/impact_metal.ogg',
  './assets/audio/impact_punch.ogg',
  './assets/audio/impact_soft.ogg',
  './assets/audio/impact_wood.ogg',
  './assets/audio/jump.wav',
  './assets/audio/landing.wav',
  './assets/audio/step_grass.wav',
  './assets/audio/step_rock.wav',
  './assets/audio/step_water.wav',
  './assets/audio/step_wood.wav',
  './assets/audio/swim.wav',
  './assets/audio/teleport.wav',
  './assets/audio/ui_click.ogg',
  './assets/audio/ui_hover.ogg',
  './assets/audio/ui_select.ogg',
  // result jingles — they fire at emotional peaks (match end / levelup), where
  // offline silence is the most noticeable; small oggs, worth the shell space.
  './assets/audio/win.ogg',
  './assets/audio/lose.ogg',
  './assets/audio/levelup.ogg',
  './assets/audio/achievement.ogg',
  './assets/audio/coin.ogg',

  // music (streamed background loops)
  './assets/music/menu.mp3',
  './assets/music/play.ogg',
  './assets/music/play.mp3',

  // misc
  './assets/logo.png',
  './assets/logo-intro.png',
  './assets/appicon.png',
  './assets/icon-192.png',
  // painterly photo backgrounds + animated fire (the headline visuals — without
  // these an offline session silently fell back to the procedural look)
  // lazy locale dictionaries (loaded on first language switch)
  './js/i18n-es.js',
  './js/i18n-pt.js',
  './js/i18n-zh.js',
  './js/i18n-de.js'
];

/* Install: precache the shell. Resilient — one bad fetch must not abort install. */
/* cache.put that NEVER throws — only http(s), wrapped (chrome-extension and
 * other schemes are unsupported by Cache and were rejecting uncaught). */
function safePut(cache, req, resp){
  try{
    var u = (typeof req === 'string') ? req : (req && req.url);
    if (u && /^https?:/i.test(u)) { return cache.put(req, resp); }
  }catch(e){}
  return Promise.resolve();
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Promise.all is enough (every item has its own .catch) — allSettled is
      // ES2020 and threw on older Safari SWs, skipping the entire precache.
      return Promise.all(
        PRECACHE.map(function (url) {
          return fetch(new Request(url, { cache: 'reload' }))
            .then(function (resp) {
              if (resp && (resp.ok || resp.type === 'opaque')) {
                return safePut(cache, url, resp);
              }
            })
            .catch(function () { /* skip files that fail to fetch */ });
        })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

/* Activate: drop old versioned caches. */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE) return caches.delete(k);
        })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

/* Fetch strategy (GET + same-origin only):
 *  - CODE (navigations, .html, .js, .css): NETWORK-FIRST so a fresh deploy is
 *    always picked up immediately; fall back to cache only when offline. This
 *    avoids the classic "I deployed but users see the old build" trap.
 *  - STATIC ASSETS (png/jpg/svg/wav/ogg/mp3/webmanifest): CACHE-FIRST for speed
 *    + offline; runtime-cache misses.                                          */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // Dynamic PHP endpoints (e.g. signal.php for online MP) must ALWAYS hit the
  // network — never cache them, or signaling polls would return stale data.
  if (/\.php(?:$|\?)/i.test(url.pathname) || /\.php(?:$|\?)/i.test(url.href)) {
    event.respondWith(fetch(req).catch(function () { return Response.error(); }));
    return;
  }

  var isCode = req.mode === 'navigate' ||
               /\.(?:html|js|css)(?:$|\?)/i.test(url.pathname);

  if (isCode) {
    // network-first
    event.respondWith(
      fetch(req).then(function (resp) {
        if (resp && resp.ok && resp.type === 'basic') {
          var copy = resp.clone();
          caches.open(CACHE).then(function (cache) { safePut(cache, req, copy); });
        }
        return resp;
      }).catch(function () {
        // ignoreSearch: the precache stores './bundle.min.js' but prod requests
        // 'bundle.min.js?v=...' — without this the first OFFLINE load (before any
        // online nav cached the ?v= URL) would miss the precache and blank.
        return caches.match(req, { ignoreSearch: true }).then(function (cached) {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
    );
    return;
  }

  // cache-first for static assets. ignoreSearch: code requests versioned URLs
  // (?v=NNNN cache-busters) while PRECACHE stores them bare — without this the
  // ~2MB precached map previews never served and the photo-bg/fire art was
  // re-fetched + double-stored. Safe: the CACHE name is version-bumped every
  // release, so a stale-art window only lasts until the next SW activate.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (resp) {
        if (resp && resp.ok && resp.type === 'basic') {
          var copy = resp.clone();
          caches.open(CACHE).then(function (cache) { safePut(cache, req, copy); });
        }
        return resp;
      }).catch(function () { return Response.error(); });
    })
  );
});
// redeploy: a 681a8fa games-deploy futását a közös ftp-lock csoportban egy újabb push kiütötte (cancelled)
