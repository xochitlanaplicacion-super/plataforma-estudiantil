/* ============================================================================
 * CUTE ANIMALS — i18n.js  ::  bilingual (HU default + EN) localization.
 * Loaded RIGHT AFTER contract.js, BEFORE every other module, so CA.t() and
 * CA.i18n.addEN() are available when modules register their strings at eval.
 *
 * MODEL (low-risk): the Hungarian string IS the key. CA.t('Új játék') returns
 *   - the Hungarian literal itself when lang==='hu' (nothing breaks), or
 *   - EN[ 'Új játék' ] when lang==='en' (falls back to the Hungarian if no
 *     translation was registered yet).
 * Each module registers its translations with CA.i18n.addEN({ 'magyar':'english', ... }).
 * ==========================================================================*/
(function(){
  // DEFAULT language for a FIRST-TIME visitor (no saved preference) = ENGLISH,
  // for EVERYONE (Jani: the public site should greet new users in English; the
  // global Poki/CrazyGames audience is English-first). A returning visitor keeps
  // whatever they saved, and anyone can switch to Magyar from Settings.
  var DEF = 'en';

  // supported languages. HU is the key-language; EN ships in the bundle (every
  // module registers via addEN); ES/PT/RU are LAZY dictionary files
  // (js/i18n-<lang>.js, ~100KB each) loaded on first switch so the bundle and
  // first paint stay lean. Their keys are the same Hungarian strings.
  var LANGS = ['hu','en','es','pt','zh','de'];
  CA.i18n = {
    LANGS: LANGS,
    EN: {},                       // { 'magyar': 'english', ... }  (merged from all modules)
    DICTS: {},                    // { es:{...}, pt:{...}, ru:{...} } (lazy-loaded)
    addEN: function(map){ if(map) for (var k in map){ if(map.hasOwnProperty(k)) this.EN[k] = map[k]; } return this; },
    addLang: function(lang, map){
      if (!lang || !map) return this;
      var d = this.DICTS[lang] || (this.DICTS[lang] = {});
      for (var k in map){ if(map.hasOwnProperty(k)) d[k] = map[k]; }
      return this;
    },
    get lang(){ return (CA.settings && CA.settings.lang) || DEF; },
    set lang(v){ if (CA.settings){ CA.settings.lang = (LANGS.indexOf(v)>=0 ? v : 'en'); if(CA.settings.save) CA.settings.save(); } },
    /* lazy-load a dictionary file once; resolves when CA.t can serve the lang */
    loadLang: function(lang){
      var self = this;
      if (lang==='hu' || lang==='en' || this.DICTS[lang]) return Promise.resolve(lang);
      if (this._loading && this._loading[lang]) return this._loading[lang];
      this._loading = this._loading || {};
      this._loading[lang] = new Promise(function(resolve){
        try{
          var sc = document.createElement('script');
          sc.src = 'js/i18n-'+lang+'.js?v='+(CA.ASSET_V||'1');
          sc.async = true;
          sc.onload = function(){ resolve(lang); };
          // QA P2: hibánál NE cache-eld a bukott promise-t örökre — töröld,
          // hogy a következő setLang ÚJRA próbálkozhasson (egy átmeneti
          // network-hiba eddig a teljes sessionre angolra ragasztotta a nyelvet).
          sc.onerror = function(){ try{ delete self._loading[lang]; }catch(e){} resolve(lang); };   // fallback: EN via CA.t
          (document.head||document.documentElement).appendChild(sc);
        }catch(e){ try{ delete self._loading[lang]; }catch(_e){} resolve(lang); }
      });
      return this._loading[lang];
    },
    setLang: function(v){
      this.lang = v;
      var self = this;
      var done = function(){ if (CA.events) CA.events.emit('langChanged', self.lang); };
      // emit immediately for hu/en (instant), and again after a lazy dict lands
      done();
      if (v!=='hu' && v!=='en') this.loadLang(this.lang).then(done);
      return this.lang;
    },
    toggle: function(){ return this.setLang(this.lang==='hu'?'en':'hu'); },
  };
  // ensure the setting exists + persists (contract.settings was already created)
  if (CA.settings && CA.settings.lang == null){ CA.settings.lang = DEF; }

  /* Translate a Hungarian source string. Dynamic strings: translate the static
   * parts and concatenate (callers do e.g. CA.t('Kör')+' '+n). */
  CA.t = function(s){
    if (s == null) return s;
    var L = CA.i18n.lang;
    if (L === 'hu') return s;
    if (L !== 'en'){
      var d = CA.i18n.DICTS[L];
      if (d){ var w = d[s]; if (w != null) return w; }
      // dict not loaded yet (or missing key) -> English fallback below
    }
    var v = CA.i18n.EN[s];
    return (v == null) ? s : v;
  };

  /* ---- Language-dependent ROSTER (idea: public EN = generic names) ----
   * HU keeps the Los Polos colleagues (CA.ROSTER, from contract.js).
   * EN uses neutral, cute, Steam-friendly names. core.js picks via CA.rosterOf(). */
  CA.ROSTER_EN = {
    capybara: { team: 'Capybaras', names: ['Biscuit','Waffles','Nugget','Pumpkin','Marsh'] },
    worm:     { team: 'Wrigglers', names: ['Squiggles','Noodle','Wiggly','Slinky','Twist'] },
    fox:      { team: 'Foxes',     names: ['Rusty','Ember','Pip','Sly','Maple','Cinder'] },
    cat:      { team: 'Cats',      names: ['Mochi','Whiskers','Pumpkin','Biscuit','Shadow','Mittens'] },
    penguin:  { team: 'Penguins',  names: ['Waddles','Pebbles','Tux','Skipper','Frosty','Pingu'] },
  };
  // generic cute name pool for any other species (FFA / custom teams) in EN
  CA.NAME_POOL_EN = ['Pip','Bramble','Clover','Tato','Mochi','Boomer','Sprout','Sir Nibbles',
                     'Captain Munch','Biscuit','Waffles','Pebbles','Tuck','Fuzz'];

  /* ---- Magyar: vicces magyar nevek + faj-csapatnevek (NE angol nevek HU-ban) ---- */
  CA.NAME_POOL_HU = ['Bigyó','Pötyi','Mütyür','Dödi','Bumfordi','Csámpás','Pufók','Szöszi',
                     'Murci','Gombóc','Tütü','Bunyó','Cingár','Pacek','Zümi','Tappancs'];
  CA.ROSTER_HU = {
    capybara: { team:'Capybarák', names:['Bobó','Cuki','Maxi','Dö','Pufi','Mütyür','Brokeszi','Zsömi'] },
    worm:     { team:'Kukacok',   names:['Giliszta Géza','Kukac Pál','Féregh','Nyúzi','Tekergő','Csősz','Pondró','Gilu'] },
    hedgehog: { team:'Sünök',     names:['Tüsi','Szúrós','Bökő','Gombóc','Tappancs','Szúr Béla'] },
    frog:     { team:'Békák',     names:['Breki','Ugri','Nyálka','Tavi','Pötty','Kuruttyó'] },
    owl:      { team:'Baglyok',   names:['Huhu','Bölcs','Éber','Pislogi','Tudor','Hangos Ödön'] },
    bird:     { team:'Madarak',   names:['Csőr','Pipi','Tollas','Surranó','Vijjogó','Reptő'] },
    koala:    { team:'Koalák',    names:['Euki','Bóbiskó','Maci','Álmos','Karmos','Lajhár Lajos'] },
    bat:      { team:'Denevérek', names:['Vámpi','Süvöltő','Éjjeli','Szárnyas','Viszi','Drakula Dezső'] },
    beaver:   { team:'Hódok',     names:['Fogas','Rágcsa','Gátas','Fakó','Uszony','Ácsi Ákos'] },
    fox:      { team:'Rókák',     names:['Vörös','Ravaszdi','Süvi','Bundás','Cselszövő','Róka Rudi'] },
    cat:      { team:'Macskák',   names:['Cirmi','Bundás','Mici','Dorombi','Pamacs','Macsek Marci'] },
    penguin:  { team:'Pingvinek', names:['Pingu','Frakk','Csúszi','Jeges','Tappancs','Pingvin Pali'] }
  };

  /* Return the roster ({team, names}) for a species kind in the CURRENT language.
   * QA P1: minden NEM-magyar nyelv (en/es/pt/zh) az EN rostert kapja — eddig a
   * feltétel 'en'-re szűrt, így a spanyol/portugál/kínai játékos "Giliszta Géza"
   * és "Kukacok" neveket látott. */
  CA.rosterOf = function(kind){
    if (CA.i18n.lang !== 'hu'){
      return CA.ROSTER_EN[kind] || { team: (kind ? (kind.charAt(0).toUpperCase()+kind.slice(1)+'s') : 'Team'),
                                     names: CA.NAME_POOL_EN.slice() };
    }
    // HU: funny Hungarian names + Hungarian team names for every species
    return CA.ROSTER_HU[kind] || (CA.ROSTER && CA.ROSTER[kind]) || { team:'Csapat', names:CA.NAME_POOL_HU.slice() };
  };

  /* ---- EN for canvas-drawn game-over / share strings (ui.js v4.9) ---- */
  CA.i18n.addEN({
    'Győzelem!':'Victory!', '🎉 Bajnok! 🎉':'🎉 Champion! 🎉',
    ' csapata győzött!':' team wins!', '💀 Vereség':'💀 Defeat', '🤝 Döntetlen':'🤝 Draw',
    '📸 Megosztás':'📸 Share',
    // static HTML chrome (index.html)
    'Fordítsd el a telefont fekvőbe!':'Rotate your phone to landscape!',
    'Teljes képernyő (F)':'Fullscreen (F)',
    // a few leftover leaks (not in the i18n-fix agent's spec list)
    'Nincs kapcsolat a szerverrel.':'No connection to the server.',
    'Szerezz 5 killt':'Get 5 kills', 'Nyerj 1 meccset':'Win 1 match',
    ' — szint ':' — level ', '(skill pont!)':'(skill point!)',
    // intro cinematic speech bubbles + tap hints (intro.js — QA P1: az első
    // benyomás külföldi játékosnak magyarul jelent meg)
    'Csodás reggel a réten! 🌼':'A lovely morning in the meadow! 🌼',
    'Ribbit! Kapjuk el! 😈':'Ribbit! Get them! 😈',
    'Ezt megkeserülitek! 😤':"You'll regret this! 😤",
    'TŰZ! 🚀💥':'FIRE! 🚀💥',
    'Koppints az átugráshoz ›':'Tap to skip ›',
    'Koppints a játékhoz ▶':'Tap to play ▶',
    // settings toggle label (colon-less variant was unregistered)
    'Kill-cam':'Kill-cam'
  });

  /* ---- QA: missing-EN sweep -------------------------------------------------
   * A full audit (every CA.t()/API.t()/data-t key + all data-module name/desc
   * fields, diffed against every addEN across all modules) found the bilingual
   * coverage essentially complete. The one genuinely uncovered, player-visible
   * static word is the round counter "Kör" — documented above as the canonical
   * dynamic-concat pattern (CA.t('Kör')+' '+n) but never registered until now.
   * Registered here so any current/future "Kör <n>" HUD/label renders in EN.
   * (Loaded-order note: i18n.js loads 2nd, so we only add keys NOT owned by any
   *  later module; this key is unique to i18n.js, so it is not clobbered.) */
  CA.i18n.addEN({
    'Kör':'Round'
  });
})();
