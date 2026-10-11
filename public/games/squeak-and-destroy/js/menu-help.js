/* ============================================================================
 * Squeak & Destroy — Help / How-to-play submenu screen (DOM).
 * A friendly in-menu guide: controls, the weapon bar, the goal and tips.
 * Static, no data fetching. Registered via CA.Menu.register('help', build).
 * Self-contained, never throws. Fully localized (HU keys + EN via addEN).
 * ==========================================================================*/
(function(){
  if(window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Súgó':'Help',
    'Hogyan játssz?':'How to play',
    'Körökre osztott tüzérség — minden csapat felváltva lő. A célod, hogy a csapatod túléljen, az ellenfeleké meg ne.':
      'Turn-based artillery — teams take alternating turns. Your goal: keep your team alive and wipe out the enemies.',
    // ---- step-by-step ----
    'Lépésről lépésre':'Step by step',
    '🎯 Cél':'🎯 Goal',
    'Iktasd ki az összes ellenséges egységet. Egyes módoknak külön célja van (zóna, FFA, túlélés) — ezt a meccs elején látod.':
      'Eliminate every enemy unit. Some modes have their own objective (zone, FFA, survival) — shown at the start of the match.',
    '🚶 Mozgás':'🚶 Move',
    'Mozogj balra-jobbra az aktív egységeddel, ugorj át a kisebb akadályokon. A terep számít — keress jó lőállást.':
      'Walk your active unit left and right, hop over small obstacles. Terrain matters — find a good firing position.',
    '🎚️ Célzás':'🎚️ Aim',
    'Állítsd be a lövés szögét. A találatot a szög, az erő és a szél együtt határozza meg.':
      'Set the firing angle. Hits depend on the angle, the power and the wind together.',
    '🔋 Erő töltése':'🔋 Charge power',
    'Tartsd nyomva a tüzelést az erő feltöltéséhez — minél tovább töltöd, annál messzebb száll a lövedék.':
      'Hold fire to charge power — the longer you hold, the farther the projectile flies.',
    '💥 Tüzelés':'💥 Fire',
    'Engedd el a lövést. Nézd, hogyan robban és hogyan vágja krátermélyre a terepet.':
      'Release to fire. Watch it explode and carve craters into the terrain.',
    '⏭️ Kör vége':'⏭️ End turn',
    'Egy lövés vagy egy időkorlát után a kör átszáll a következő csapatra. Beoszthatod a mozgást és a lövést egy körön belül.':
      'After a shot or a time limit, the turn passes to the next team. You can split moving and firing within one turn.',
    // ---- controls ----
    'Irányítás':'Controls',
    '📱 Érintés':'📱 Touch',
    'Csúsztass a mozgáshoz és a célzáshoz, tartsd nyomva az erőhöz, és koppints a fegyversávra a fegyverváltáshoz.':
      'Swipe to move and aim, hold to charge power, and tap the weapon bar to switch weapons.',
    '⌨️ Billentyűzet':'⌨️ Keyboard',
    'Nyilak / A-D: mozgás · Fel-Le: célzás · Szóköz (tartva): erő + tüzelés · 0–9: gyors fegyverválasztás · Enter: kör vége.':
      'Arrows / A-D: move · Up-Down: aim · Space (hold): power + fire · 0–9: quick weapon select · Enter: end turn.',
    // ---- weapon bar ----
    'A fegyver- és képességsáv':'The weapon & ability bar',
    'Az alsó sávban válthatsz a 62 fegyver és az osztályod 3 aktív képessége között. Egyes fegyverek korlátozottak vagy körönként töltődnek. A 0–9 számbillentyűkkel gyorsan válthatsz.':
      'The bottom bar switches between the 62 weapons and your class’s 3 active abilities. Some weapons are limited or recharge each turn. Number keys 0–9 switch quickly.',
    // ---- tips ----
    'Tippek':'Tips',
    '🌬️ Szél':'🌬️ Wind',
    'A szél elfújja a lövedékeket — nézd a szélkijelzőt, és igazítsd hozzá a szöget és az erőt.':
      'Wind pushes projectiles — check the wind gauge and adjust your angle and power for it.',
    '🌋 Pusztítható terep':'🌋 Destructible terrain',
    'Minden robbanás átalakítja a pályát. Áss le egy ellenfél fedezékét, vagy vágj magadnak menekülőutat.':
      'Every blast reshapes the map. Dig out an enemy’s cover, or carve yourself an escape route.',
    '🌊 Hirtelen halál':'🌊 Sudden death',
    'Ha a meccs elhúzódik, a vízszint emelkedni kezd. Aki a vízbe esik, buborékolva elsüllyed — maradj a magaslaton!':
      'If a match drags on, the water level rises. Anyone who falls in bubbles down — stay on high ground!',
    '🦸 Osztályok':'🦸 Classes',
    'Minden hősnek egyedi képességfája van. Próbáld ki a Nekromantát, a Mágust vagy a Gyógyítót — más-más taktikát kínálnak.':
      'Each hero has a unique skill tree. Try the Necromancer, the Mage or the Healer — each rewards a different tactic.',
    'Jó szórakozást a csatában! 💥':'Have fun out there! 💥',
    'Interaktív tutorial indítása':'Start interactive tutorial',
    'Tanuld meg játszva: vezetett gyakorlópálya mozgással, célzással, tüzeléssel.':
      'Learn by doing: a guided practice arena with movement, aiming and firing.',
    // ---- expanded sections (maps / crates / classes / modes) ----
    'Pályák':'Maps',
    '🗺️ 12 biom':'🗺️ 12 biomes',
    'Mező, Dzsungel, Sivatag, Hómező, Barlang, Szigetek, Vulkán, Űrállomás, Temető, Strand, Cukorország és az Ég. Mindegyik más kinézet és taktika.':
      'Meadow, Jungle, Desert, Snow, Cave, Islands, Volcano, Space Station, Graveyard, Beach, Candy Land and the Sky. Each looks and plays differently.',
    '☁️ Ég':'☁️ Sky',
    'Nyílt égbolt fix lebegő platformokkal — nincs talaj! Ha leesel, véged. Felhők és repülők szállnak a háttérben.':
      'Open sky with fixed floating platforms — no ground! Fall off and you’re done. Clouds and planes drift behind.',
    '🌊 Víz = halál':'🌊 Water = death',
    'A legtöbb pályán a víz végzetes: aki belezuhan, elsüllyed. Maradj a szárazon.':
      'On most maps water is lethal: fall in and you sink. Stay on dry ground.',
    'Ládák és ultimate-ok':'Crates & ultimates',
    '📦 Ládák':'📦 Crates',
    'Pár körönként láda pottyan a pályára. Sétálj rá VAGY lődd el — a tartalma (fegyver / HP / segéd) a tiéd. A gép is megy értük!':
      'Every few turns a crate drops in. Walk onto it OR shoot it — its contents (weapon / HP / utility) are yours. The AI grabs them too!',
    '☢️ Ultimate-ok':'☢️ Ultimates',
    'A 6 szuperfegyver (Atombomba, Mágikus gömb, Tűzeső, Fekete lyuk, Meteorok, Földindulás) CSAK ládából jön — vagy a meccs elején, ha be van kapcsolva csapatonként 1 random.':
      'The 6 super-weapons (Nuke, Magic Orb, Fire Rain, Black Hole, Meteors, Quake) come ONLY from crates — or one random one per team at match start, if enabled.',
    '🎯 Célzás':'🎯 Targeting',
    'Az Atombomba és a Földindulás oda csap le, AHOVA célzol (mint a légicsapás). A mágikus gömb végigsöpör a pályán egy sávban.':
      'The Nuke and the Quake strike WHERE you aim (like the airstrike). The Magic Orb sweeps across the map in a lane.',
    'Osztályok és képességfa':'Classes & skill tree',
    '🦸 6 hős-osztály':'🦸 6 hero classes',
    'Nekromanta, Védő, Mágus, Vadász, Mérnök, Gyógyító — mindegyik 3 aktív képességgel és saját passzív fával.':
      'Necromancer, Guardian, Mage, Hunter, Engineer, Healer — each with 3 active abilities and its own passive tree.',
    '🌳 Kasztonkénti fa':'🌳 Per-class tree',
    'A képességfa KASZTONKÉNT közös: játssz egy kaszttal → szintet lép → a pontokból passzív erősítést (sebzés, HP, mozgás…) oldasz fel. Minden ilyen kasztú állatra hat.':
      'The skill tree is shared PER CLASS: play a class → it levels up → spend points on passive boosts (damage, HP, movement…). Every animal of that class benefits.',
    '🌌 Portál':'🌌 Portal',
    'A portál PÁRT nyit: bárki (te is, többször) átléphet az egyiken és a másiknál bukkan elő. Pár körig megmarad.':
      'The portal opens a PAIR: anyone (you too, repeatedly) can step into one and pop out the other. It lasts a few turns.',
    'Módok és multiplayer':'Modes & multiplayer',
    '🎮 Módok':'🎮 Modes',
    'Klasszikus (csapat vs csapat), Free-for-all (3-4 önálló csapat), AI vs AI (nézd a gépet) és Oktató.':
      'Classic (team vs team), Free-for-all (3-4 independent teams), AI vs AI (watch the bots) and Tutorial.',
    '🗓️ Napi + Fejtörők':'🗓️ Daily + Puzzles',
    'Napi kihívás: mindenki ugyanazt a pályát kapja. Fejtörők: fix, kézzel tervezett feladványok minél kevesebb lövésből.':
      'Daily challenge: everyone gets the same arena. Puzzles: fixed, hand-crafted levels solved in as few shots as possible.',
    '🌐 Multiplayer':'🌐 Multiplayer',
    'Hozz létre szobát és oszd meg a kódot, vagy keress ellenfelet. Egy hálózaton (ugyanaz a wifi) vagy két böngészőfülön a legmegbízhatóbb.':
      'Create a room and share the code, or find an opponent. Same network (same wifi) or two browser tabs is most reliable.'
  });

  function build(API){
    var r = API.screen('❓','Súgó');
    var screen = r.screen, body = r.body;

    var panel = API.panel();
    panel.style.maxWidth = '560px';
    panel.style.margin = '0 auto';
    panel.style.gap = 'var(--s4)';

    // ---- intro ----------------------------------------------------------
    var intro = API.el('div','muted',
      '<span data-t="Körökre osztott tüzérség — minden csapat felváltva lő. A célod, hogy a csapatod túléljen, az ellenfeleké meg ne.">'+
      API.esc(API.t('Körökre osztott tüzérség — minden csapat felváltva lő. A célod, hogy a csapatod túléljen, az ellenfeleké meg ne.'))+'</span>');
    intro.style.cssText = 'line-height:1.5;text-align:center';

    // ---- section + card builders ---------------------------------------
    function sectionTitle(headT){
      var h = API.el('h3',null,'<span data-t="'+API.esc(headT)+'">'+API.esc(headT)+'</span>');
      h.style.cssText = 'color:var(--accent);margin:var(--s2) 0 0';
      return h;
    }
    // a single tip/step card: emoji+title heading + body line.
    function infoRow(titleT, bodyT){
      var c = API.card();
      c.style.cssText = 'gap:var(--s1)';
      var t = API.el('div',null,'<span data-t="'+API.esc(titleT)+'">'+API.esc(titleT)+'</span>');
      t.style.cssText = 'font-weight:800;color:var(--orange,#E8711A);font-size:15px';
      var b = API.el('div','muted','<span data-t="'+API.esc(bodyT)+'">'+API.esc(bodyT)+'</span>');
      b.style.cssText = 'line-height:1.45;font-size:13px';
      c.append(t, b);
      return c;
    }

    panel.append(intro);

    // ---- interactive tutorial CTA --------------------------------------
    // Turns passive reading into active onboarding: launches the guided
    // tutorial gameMode the same way New Game does (CA.newGame), whose
    // CA.Modes.tutorial.setup() builds the player unit + dummy itself.
    try {
      var tutBtn = API.btn(
        '🎓 <span data-t="Interaktív tutorial indítása">'+API.esc(API.t('Interaktív tutorial indítása'))+'</span>',
        'btn--primary btn--lg',
        function(){
          try { if (window.CA && typeof CA.newGame === 'function') CA.newGame({ gameMode:'tutorial' }); }
          catch(e){ try { console.warn('tutorial start failed', e); } catch(_){} }
        });
      tutBtn.style.cssText = 'width:100%';
      panel.append(tutBtn);
      var tutNote = API.el('div','muted',
        '<span data-t="Tanuld meg játszva: vezetett gyakorlópálya mozgással, célzással, tüzeléssel.">'+
        API.esc(API.t('Tanuld meg játszva: vezetett gyakorlópálya mozgással, célzással, tüzeléssel.'))+'</span>');
      tutNote.style.cssText = 'text-align:center;font-size:12px;line-height:1.4';
      panel.append(tutNote);
    } catch(e){}

    // ---- how to play (steps) -------------------------------------------
    panel.append(sectionTitle('Lépésről lépésre'));
    panel.append(
      infoRow('🎯 Cél','Iktasd ki az összes ellenséges egységet. Egyes módoknak külön célja van (zóna, FFA, túlélés) — ezt a meccs elején látod.'),
      infoRow('🚶 Mozgás','Mozogj balra-jobbra az aktív egységeddel, ugorj át a kisebb akadályokon. A terep számít — keress jó lőállást.'),
      infoRow('🎚️ Célzás','Állítsd be a lövés szögét. A találatot a szög, az erő és a szél együtt határozza meg.'),
      infoRow('🔋 Erő töltése','Tartsd nyomva a tüzelést az erő feltöltéséhez — minél tovább töltöd, annál messzebb száll a lövedék.'),
      infoRow('💥 Tüzelés','Engedd el a lövést. Nézd, hogyan robban és hogyan vágja krátermélyre a terepet.'),
      infoRow('⏭️ Kör vége','Egy lövés vagy egy időkorlát után a kör átszáll a következő csapatra. Beoszthatod a mozgást és a lövést egy körön belül.')
    );

    // ---- controls -------------------------------------------------------
    panel.append(sectionTitle('Irányítás'));
    panel.append(
      infoRow('📱 Érintés','Csúsztass a mozgáshoz és a célzáshoz, tartsd nyomva az erőhöz, és koppints a fegyversávra a fegyverváltáshoz.'),
      infoRow('⌨️ Billentyűzet','Nyilak / A-D: mozgás · Fel-Le: célzás · Szóköz (tartva): erő + tüzelés · 0–9: gyors fegyverválasztás · Enter: kör vége.')
    );

    // ---- weapon bar -----------------------------------------------------
    // Live weapon count from CA.Weapons.LIST (guarded fallback) so the help text
    // never goes stale. The i18n key keeps the canonical "62" token; we swap the
    // rendered number in both the HU source and the translated string.
    var weaponCount = 62;
    try {
      var _wl = (window.CA && CA.Weapons && CA.Weapons.LIST) || null;
      if (Array.isArray(_wl) && _wl.length) weaponCount = _wl.length;
    } catch(e){}
    panel.append(sectionTitle('A fegyver- és képességsáv'));
    var wbKey = 'Az alsó sávban válthatsz a 62 fegyver és az osztályod 3 aktív képessége között. Egyes fegyverek korlátozottak vagy körönként töltődnek. A 0–9 számbillentyűkkel gyorsan válthatsz.';
    // Translate via the canonical key, then swap the "62" token for the live count.
    // No data-t on this node: applyI18n() would otherwise re-substitute the static
    // "62" key text and clobber the dynamic number. The screen rebuilds on re-entry.
    var wbText = String(API.t(wbKey)).replace('62', String(weaponCount));
    var wbNote = API.el('div','muted', API.esc(wbText));
    wbNote.style.cssText = 'line-height:1.45;font-size:13px';
    panel.append(wbNote);

    // ---- tips -----------------------------------------------------------
    panel.append(sectionTitle('Tippek'));
    panel.append(
      infoRow('🌬️ Szél','A szél elfújja a lövedékeket — nézd a szélkijelzőt, és igazítsd hozzá a szöget és az erőt.'),
      infoRow('🌋 Pusztítható terep','Minden robbanás átalakítja a pályát. Áss le egy ellenfél fedezékét, vagy vágj magadnak menekülőutat.'),
      infoRow('🌊 Hirtelen halál','Ha a meccs elhúzódik, a vízszint emelkedni kezd. Aki a vízbe esik, buborékolva elsüllyed — maradj a magaslaton!'),
      infoRow('🦸 Osztályok','Minden hősnek egyedi képességfája van. Próbáld ki a Nekromantát, a Mágust vagy a Gyógyítót — más-más taktikát kínálnak.')
    );

    // ---- maps / biomes --------------------------------------------------
    panel.append(sectionTitle('Pályák'));
    panel.append(
      infoRow('🗺️ 12 biom','Mező, Dzsungel, Sivatag, Hómező, Barlang, Szigetek, Vulkán, Űrállomás, Temető, Strand, Cukorország és az Ég. Mindegyik más kinézet és taktika.'),
      infoRow('☁️ Ég','Nyílt égbolt fix lebegő platformokkal — nincs talaj! Ha leesel, véged. Felhők és repülők szállnak a háttérben.'),
      infoRow('🌊 Víz = halál','A legtöbb pályán a víz végzetes: aki belezuhan, elsüllyed. Maradj a szárazon.')
    );

    // ---- crates + ultimates --------------------------------------------
    panel.append(sectionTitle('Ládák és ultimate-ok'));
    panel.append(
      infoRow('📦 Ládák','Pár körönként láda pottyan a pályára. Sétálj rá VAGY lődd el — a tartalma (fegyver / HP / segéd) a tiéd. A gép is megy értük!'),
      infoRow('☢️ Ultimate-ok','A 6 szuperfegyver (Atombomba, Mágikus gömb, Tűzeső, Fekete lyuk, Meteorok, Földindulás) CSAK ládából jön — vagy a meccs elején, ha be van kapcsolva csapatonként 1 random.'),
      infoRow('🎯 Célzás','Az Atombomba és a Földindulás oda csap le, AHOVA célzol (mint a légicsapás). A mágikus gömb végigsöpör a pályán egy sávban.')
    );

    // ---- classes + skill tree ------------------------------------------
    panel.append(sectionTitle('Osztályok és képességfa'));
    panel.append(
      infoRow('🦸 6 hős-osztály','Nekromanta, Védő, Mágus, Vadász, Mérnök, Gyógyító — mindegyik 3 aktív képességgel és saját passzív fával.'),
      infoRow('🌳 Kasztonkénti fa','A képességfa KASZTONKÉNT közös: játssz egy kaszttal → szintet lép → a pontokból passzív erősítést (sebzés, HP, mozgás…) oldasz fel. Minden ilyen kasztú állatra hat.'),
      infoRow('🌌 Portál','A portál PÁRT nyit: bárki (te is, többször) átléphet az egyiken és a másiknál bukkan elő. Pár körig megmarad.')
    );

    // ---- modes + multiplayer -------------------------------------------
    panel.append(sectionTitle('Módok és multiplayer'));
    panel.append(
      infoRow('🎮 Módok','Klasszikus (csapat vs csapat), Free-for-all (3-4 önálló csapat), AI vs AI (nézd a gépet) és Oktató.'),
      infoRow('🗓️ Napi + Fejtörők','Napi kihívás: mindenki ugyanazt a pályát kapja. Fejtörők: fix, kézzel tervezett feladványok minél kevesebb lövésből.'),
      infoRow('🌐 Multiplayer','Hozz létre szobát és oszd meg a kódot, vagy keress ellenfelet. Egy hálózaton (ugyanaz a wifi) vagy két böngészőfülön a legmegbízhatóbb.')
    );

    // ---- outro ----------------------------------------------------------
    var outro = API.el('div',null,'<span data-t="Jó szórakozást a csatában! 💥">Jó szórakozást a csatában! 💥</span>');
    outro.style.cssText = 'text-align:center;font-weight:800;color:var(--green);margin-top:var(--s2)';
    panel.append(outro);

    body.append(panel);
    return { el: screen };
  }

  if(window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('help', build);
})();
