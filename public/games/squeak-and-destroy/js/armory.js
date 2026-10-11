/* Squeak & Destroy — the human turn's large, accessible weapon chooser.
 * The canvas HUD remains the gameplay HUD. Core freezes controls and time while
 * CA.Armory.isOpen(); this module never changes pause, physics, ammo or cooldowns.
 */
(function(){
  'use strict';

  var S = CA.state;
  var root, panel, heading, subtitle, grid, selectedLabel, announcement, launcher;
  var closeButton, hint, initialized = false, opened = false;
  var previousFocus = null, chosen = false, lastAutoTurn = null;
  var cards = [], expanded = Object.create(null);
  var EN = {}, ES = {};

  function words(hu, en, es){ EN[hu] = en; ES[hu] = es; return hu; }
  var TEXT = {
    title: words('Fegyverek és képességek', 'Weapons & powers', 'Tiros y poderes'),
    powers: words('Képességek', 'Powers', 'Poderes'),
    eyebrow: words('Készülj a körödre', 'Prepare your turn', 'Prepara tu turno'),
    hint: words('Válassz, majd zárd be a menüt a játékhoz. A választás nyitva hagyja ezt az ablakot.',
      'Choose, then close this menu to play. Choosing keeps this window open.',
      'Elige y después cierra el menú para jugar. Elegir deja esta ventana abierta.'),
    current: words('Kiválasztva', 'Selected', 'Seleccionado'),
    choose: words('Kiválasztás', 'Choose', 'Elegir'),
    chosen: words('Kiválasztva ✓', 'Selected ✓', 'Elegido ✓'),
    explain: words('Magyarázat', 'Explanation', 'Explicación'),
    hideExplain: words('Magyarázat elrejtése', 'Hide explanation', 'Ocultar explicación'),
    close: words('Bezárás', 'Close', 'Cerrar'),
    ready: words('Elérhető', 'Ready', 'Disponible'),
    ammo: words('Lőszer', 'Ammo', 'Munición'),
    noAmmo: words('Nincs lőszer', 'Out of ammo', 'Sin munición'),
    cooldown: words('Lehűlés', 'Cooldown', 'Recarga'),
    turns: words('kör', 'turns', 'turnos'),
    locked: words('A játékszabály tiltja', 'Blocked by match rules', 'No permitido en esta partida'),
    spent: words('Ebben a körben már lőttél', 'Shot already used this turn', 'Ya disparaste en este turno'),
    damage: words('Alapsebzés', 'Base damage', 'Daño base'),
    radius: words('Robbanás sugara', 'Blast radius', 'Radio de explosión'),
    fuse: words('Robbanás késleltetése', 'Fuse', 'Tiempo para explotar'),
    wind: words('A szél eltéríti a lövedéket.', 'Wind changes the projectile path.', 'El viento desvía el proyectil.'),
    charge: words('Célozz, tartsd lenyomva a lövést az erő töltéséhez, majd engedd el.',
      'Aim, hold fire to charge power, then release.',
      'Apunta, mantén pulsado disparar para cargar la fuerza y suelta.'),
    instant: words('Célozz vagy jelöld ki a helyet, majd nyomd meg a lövést.',
      'Aim or choose a position, then press fire.',
      'Apunta o marca una posición y pulsa disparar.'),
    ends: words('Használata befejezi a támadást ebben a körben.',
      'Using it ends your attack this turn.', 'Usarlo termina tu ataque de este turno.'),
    continues: words('Használata után folytathatod a körödet.',
      'You can continue your turn after using it.', 'Puedes continuar el turno después de usarlo.'),
    closeFirst: words('Előbb zárd be ezt az ablakot, majd használd a játék lövésgombját.',
      'Close this window first, then use the game’s fire control.',
      'Primero cierra esta ventana y después usa el botón de disparar del juego.'),
    default: words('Ha nem választasz, a normál rakétával játszhatsz, ha a szabályok engedik.',
      'Without a choice, you can use the normal rocket when match rules allow it.',
      'Si cierras sin elegir, puedes usar la bazuca normal cuando las reglas lo permitan.'),
    empty: words('Ehhez a karakterhez nincs elérhető fegyver.',
      'No weapons are available for this character.', 'Este personaje no tiene tiros disponibles.'),
    weapon: words('Fegyver', 'Weapon', 'Tiro'),
    ability: words('Képesség', 'Power', 'Poder'),
    utility: words('Segédeszköz', 'Utility', 'Apoyo'),
    unavailable: words('Jelenleg nem választható', 'Currently unavailable', 'Ahora no se puede elegir'),
    unknown: words('A karaktered eszköze; a részleteknél láthatod az erejét és használatát.',
      'An item from your character’s kit; see its details for power and use.',
      'Una opción de tu personaje; consulta la explicación para ver cómo se usa.')
  };

  // Explanations describe the existing implementations, rather than adding
  // weapons or changing their balance. Missing details use the live definition.
  var descriptions = {
    bazooka: ['Szél által eltérített rakéta, amely becsapódáskor robban.', 'A wind-affected rocket that explodes on impact.', 'Una bazuca que explota al impactar; el viento cambia su trayectoria.'],
    grenade: ['Pattogó gránát, amely rövid késleltetés után robban.', 'A bouncing grenade that explodes after a short fuse.', 'Una granada que rebota y explota después de unos segundos.'],
    dynamite: ['Nagy erejű, rövid késleltetésű robbanóanyag.', 'A powerful explosive with a short fuse.', 'Un explosivo potente que detona después de una breve espera.'],
    shotgun: ['Azonnali sörétlövés a célzás irányába.', 'An instant shotgun blast in your aim direction.', 'Un disparo instantáneo de escopeta en la dirección de tu mira.'],
    cluster: ['A gránát kisebb, robbanó töltetekre válik szét.', 'A grenade that splits into smaller explosive bomblets.', 'Una granada que se divide en pequeños explosivos.'],
    airstrike: ['Bombákat hív a kijelölt hely fölé.', 'Calls a line of bombs above the chosen position.', 'Pide un bombardeo sobre la posición que marcas.'],
    capybomb: ['Óriási capybara-robbanás, nagy hatókörrel.', 'A huge capybara explosion with a wide blast.', 'Una bomba de capibara con una explosión de gran alcance.'],
    capyslam: ['A csapat egymásra állásával szerzett, erős bónuszrakéta.', 'A powerful bonus rocket earned by stacking teammates.', 'Una potente bazuca de bonificación obtenida al apilar compañeros.'],
    teleport: ['A karakteredet egy biztonságos, kijelölt pontra helyezi.', 'Moves your character to a safe chosen position.', 'Lleva a tu personaje a una posición segura que marques.'],
    portal: ['Két használattal összekapcsolt portálpárt hoz létre.', 'Use twice to create a linked pair of portals.', 'Úsalo dos veces para crear un par de portales conectados.'],
    melee: ['Közeli ellenfelet lök meg; jól jön szakadék mellett.', 'Shoves a nearby enemy, useful beside a cliff.', 'Empuja a un rival cercano; resulta útil junto a un precipicio.'],
    drill: ['A lövedék átfúrja a földet, majd felrobban.', 'A projectile that drills through terrain before exploding.', 'Un proyectil que perfora el terreno antes de explotar.'],
    spikeball: ['Nehéz tüskegolyó, amely többször pattog.', 'A heavy spiked ball that bounces repeatedly.', 'Una bola de púas pesada que rebota varias veces.'],
    logtoss: ['Egy nehéz rönk sebzést okoz és messzire löki a célt.', 'A heavy log deals damage and knocks targets away.', 'Lanza un tronco pesado que daña y empuja a los rivales.'],
    bellyflop: ['Széles területet érintő békás becsapódás.', 'A frog impact that affects a wide area.', 'Un golpe de rana que afecta una zona amplia.'],
    eggbomb: ['A tojás kisebb robbanó lövedékekre válik szét.', 'An egg that splits into smaller explosive projectiles.', 'Un huevo que se divide en pequeños proyectiles explosivos.'],
    rope: ['Kapaszkodókötéllel húz a kijelölt pont felé.', 'A grappling rope pulls you toward the chosen point.', 'Una cuerda con gancho te acerca al punto que marcas.'],
    parachute: ['Lassítja az esést, hogy biztonságosabban érj földet.', 'Slows your fall for a safer landing.', 'Frena la caída para aterrizar con más seguridad.'],
    girder: ['Kis, szilárd platformot helyez a kijelölt pontra.', 'Places a small solid platform at the chosen point.', 'Coloca una pequeña plataforma sólida donde indiques.'],
    napalm: ['Becsapódáskor égő foltokat hagy maga után.', 'Leaves burning patches on impact.', 'Deja zonas de fuego al impactar.'],
    gasgrenade: ['Mérgező gázfelhőt hoz létre.', 'Creates a poisonous gas cloud.', 'Crea una nube de gas venenoso.'],
    mine: ['Közelségre robbanó aknát helyez el.', 'Places a mine that explodes when someone approaches.', 'Coloca una mina que explota cuando alguien se acerca.'],
    magnetmine: ['Az akna lassan a közeli ellenfél felé mozog.', 'A mine that slowly moves toward a nearby enemy.', 'Una mina que se mueve lentamente hacia un rival cercano.'],
    timergrenade: ['Pattogó gránát állítható robbanási idővel.', 'A bouncing grenade with an adjustable fuse.', 'Una granada que rebota y permite ajustar cuándo explota.'],
    laser: ['Gyors lézersugár, amely visszapattan a terepről.', 'A fast laser beam that bounces off terrain.', 'Un láser rápido que rebota en el terreno.'],
    smokegrenade: ['Füstfelhőt hoz létre; közvetlen sebzést nem okoz.', 'Creates a smoke cloud without direct damage.', 'Crea una nube de humo sin daño directo.'],
    guided: ['A rakéta repülés közben rövid ideig irányítható.', 'A rocket you can steer briefly during flight.', 'Una bazuca que puedes dirigir brevemente durante el vuelo.'],
    summon_skeleton: ['Csontváz segítőt idéz, amely az ellenfélre támad.', 'Summons a skeleton helper that attacks enemies.', 'Invoca un esqueleto aliado que ataca a los enemigos.'],
    summon_zombie: ['Lassan mozgó zombi segítőt idéz.', 'Summons a slow-moving zombie helper.', 'Invoca un zombi aliado que avanza lentamente.'],
    bone_spear: ['Átütő csontlándzsát lő a célzás irányába.', 'Fires a piercing bone spear along your aim.', 'Dispara una lanza de hueso en la dirección de tu mira.'],
    shield_wall: ['Erős, személyes pajzzsal védi a karakteredet.', 'Protects your character with a strong personal shield.', 'Protege a tu personaje con un escudo personal potente.'],
    ground_slam: ['Közeli területre csap le, és ellöki az ellenfeleket.', 'Slams the nearby area and knocks enemies away.', 'Golpea el área cercana y empuja a los rivales.'],
    taunt: ['Magadra vonod a közeli ellenfelek figyelmét.', 'Draws nearby enemies’ attention toward you.', 'Atrae hacia ti la atención de los enemigos cercanos.'],
    fireball: ['Robbanó tűzgolyót lő ki.', 'Fires an exploding fireball.', 'Lanza una bola de fuego explosiva.'],
    frost_nova: ['Fagyos lövedékkel lassítja az érintett ellenfeleket.', 'A frost projectile slows affected enemies.', 'Un proyectil helado que ralentiza a los rivales afectados.'],
    chain_lightning: ['A villám közeli ellenfelek között ugrik tovább.', 'Lightning jumps between nearby enemies.', 'Un rayo que salta entre enemigos cercanos.'],
    charged_shot: ['Erős, tölthető lövedék a pontos célzáshoz.', 'A powerful charged projectile for precise aiming.', 'Un proyectil potente que cargas para apuntar con precisión.'],
    mark_target: ['A karaktered következő lövését kritikus találattá erősíti.', 'Strengthens your character’s next shot into a critical hit.', 'Mejora el siguiente disparo de tu personaje para conseguir un golpe crítico.'],
    multishot: ['Több nyilat lő egyszerre szétterülő irányokba.', 'Fires several arrows in a spread.', 'Lanza varias flechas a la vez en distintas direcciones.'],
    build_wall: ['Védőfalat épít a kijelölt helyre.', 'Builds a protective wall at the chosen position.', 'Construye una pared protectora en la posición que marques.'],
    deploy_turret: ['Automatikusan támadó lövegtornyot helyez el.', 'Deploys a turret that attacks automatically.', 'Coloca una torreta que ataca de forma automática.'],
    place_trap: ['Csapdát helyez el a közeledő ellenfeleknek.', 'Places a trap for approaching enemies.', 'Coloca una trampa para los enemigos que se acerquen.'],
    heal_beam: ['Visszaadja egy sérült csapattárs életerejének egy részét.', 'Restores some health to an injured teammate.', 'Recupera parte de la vida de un compañero herido.'],
    buff_aura: ['Erősítő aurával segíti a közeli csapattársakat.', 'Helps nearby teammates with a strengthening aura.', 'Ayuda a los aliados cercanos con un aura de mejora.'],
    revive: ['Egy kiesett csapattársat hoz vissza a játékba.', 'Brings a fallen teammate back into the match.', 'Devuelve a la partida a un compañero que cayó.'],
    jetpack: ['Rövid ideig szabadon repülhetsz az iránygombokkal.', 'Fly briefly using the direction controls.', 'Vuela durante un breve periodo usando los controles de dirección.'],
    blowtorch: ['Alagutat vág a karaktered előtti földbe.', 'Cuts a tunnel through terrain in front of you.', 'Abre un túnel en el terreno que tienes delante.'],
    homing: ['A rakéta a közeli ellenfél felé fordul repülés közben.', 'A missile turns toward a nearby enemy during flight.', 'Un misil que gira hacia un rival cercano durante el vuelo.'],
    lowgrav: ['Kisebb gravitációval magasabbra ugorhatsz ebben a körben.', 'Lower gravity lets you jump higher this turn.', 'Reduce la gravedad para saltar más alto durante este turno.'],
    chargehog: ['Egy kis sün az ellenfél felé szalad, majd felrobban.', 'A small hedgehog runs toward an enemy and explodes.', 'Un pequeño erizo corre hacia un rival y explota.'],
    sniper: ['Pontos, nagy távolságra ható lövés, tölthető erővel.', 'A precise long-range shot with charged power.', 'Un disparo preciso de largo alcance cuya fuerza puedes cargar.'],
    bat: ['Közeli ellenfelet üt meg és nagyon messzire lök.', 'Hits a nearby enemy and launches them far away.', 'Golpea a un rival cercano y lo manda muy lejos.'],
    mirv: ['A lövedék magasban több robbanó töltetre válik.', 'A shell splits into several explosive warheads overhead.', 'Un proyectil que se divide en varios explosivos en el aire.'],
    roller: ['A bomba a talajon gurul a cél felé.', 'A bomb rolls along the ground toward the target.', 'Una bomba que rueda por el suelo hacia el objetivo.'],
    napalmstrike: ['Égő bombákat hív a kijelölt helyre.', 'Calls burning bombs onto the chosen position.', 'Pide bombas incendiarias sobre la posición que marcas.'],
    minestrike: ['Aknákat szór a kijelölt területre.', 'Drops mines across the chosen area.', 'Lanza minas sobre la zona que indiques.'],
    freeze: ['Ideiglenesen befagyasztja a csapatot, védelmet adva.', 'Temporarily freezes your team to provide protection.', 'Congela temporalmente a tu equipo para darle protección.'],
    magicorb: ['Erős mágikus gömb fúr át a térképen.', 'A powerful magic orb bores through the map.', 'Una esfera mágica potente que atraviesa el mapa.'],
    nuke: ['Hatalmas robbanást idéz a kijelölt helyre.', 'Creates an enormous explosion at the chosen position.', 'Provoca una enorme explosión en la posición que marcas.'],
    firerain: ['Robbanó tűzgolyók hullanak egy széles sávba.', 'Exploding fireballs rain across a wide band.', 'Llueven bolas de fuego explosivas sobre una franja amplia.'],
    blackhole: ['Beszívja a közeli karaktereket, majd felrobban.', 'Pulls nearby characters inward before exploding.', 'Atrae a los personajes cercanos antes de explotar.'],
    meteors: ['Több meteor csapódik a kijelölt területre.', 'Several meteors strike the chosen area.', 'Varios meteoros golpean la zona que marcas.'],
    quake: ['Erős rázkódással omlasztja a térkép egyes részeit.', 'Shakes the map and collapses parts of its terrain.', 'Sacude el mapa y derrumba partes del terreno.']
  };
  Object.keys(descriptions).forEach(function(id){
    var d = descriptions[id]; words(d[0], d[1], d[2]);
  });
  var namesES = {
    bazooka:'Bazuca', grenade:'Granada', dynamite:'Dinamita', shotgun:'Escopeta', cluster:'Granada de racimo',
    airstrike:'Ataque aéreo', capybomb:'Capibomba', capyslam:'Golpe de capibara', teleport:'Teletransporte', portal:'Portal',
    melee:'Empujón', drill:'Taladro', spikeball:'Bola de púas', logtoss:'Lanzar tronco', bellyflop:'Panzazo', eggbomb:'Bomba de huevo',
    rope:'Cuerda', parachute:'Paracaídas', girder:'Plataforma', napalm:'Napalm', gasgrenade:'Granada de gas', mine:'Mina',
    magnetmine:'Mina magnética', timergrenade:'Granada con temporizador', laser:'Láser', smokegrenade:'Granada de humo', guided:'Misil dirigido',
    summon_skeleton:'Invocar esqueleto', summon_zombie:'Invocar zombi', bone_spear:'Lanza de hueso', shield_wall:'Muro de escudos',
    ground_slam:'Golpe al suelo', taunt:'Provocación', fireball:'Bola de fuego', frost_nova:'Nova de hielo', chain_lightning:'Rayo en cadena',
    charged_shot:'Disparo cargado', mark_target:'Marcar objetivo', multishot:'Lluvia de flechas', build_wall:'Construir pared',
    deploy_turret:'Colocar torreta', place_trap:'Poner trampa', heal_beam:'Rayo curativo', buff_aura:'Aura de mejora', revive:'Revivir',
    jetpack:'Mochila propulsora', blowtorch:'Soplete', homing:'Misil perseguidor', lowgrav:'Gravedad baja', chargehog:'Erizo explosivo',
    sniper:'Francotirador', bat:'Bate', mirv:'Misil múltiple', roller:'Bomba rodante', napalmstrike:'Ataque de napalm',
    minestrike:'Lluvia de minas', freeze:'Congelación', magicorb:'Esfera mágica', nuke:'Bomba nuclear', firerain:'Lluvia de fuego',
    blackhole:'Agujero negro', meteors:'Lluvia de meteoros', quake:'Terremoto'
  };
  if(CA.i18n && CA.i18n.addEN) CA.i18n.addEN(EN);

  function language(){ return (CA.i18n && CA.i18n.lang) || (CA.settings && CA.settings.lang) || 'en'; }
  function t(key){
    // Do not create a partial DICTS.es: doing so would prevent lazy-loading the
    // game's full Spanish dictionary. New armory strings have a local fallback.
    if(language()==='es' && Object.prototype.hasOwnProperty.call(ES, key)) return ES[key];
    return CA.t ? CA.t(key) : (EN[key] || key);
  }
  function weaponName(w){ return language()==='es' && namesES[w.id] ? namesES[w.id] : t(w.name || w.id); }
  function unit(){ return CA.activeUnit ? CA.activeUnit() : null; }
  function humanTurn(){
    // This local chooser has no network-ready/confirmation protocol. Do not
    // freeze a shared online simulation while another peer is taking a turn.
    if(CA.Net && CA.Net.isOnline && CA.Net.isOnline()) return false;
    var team = S.teams && S.teams[S.currentTeamIdx], u = unit();
    return S.mode===CA.GameState.PLAYING && !S.paused && team && team.isAI===false && u && u.alive
      && S.phase===CA.TurnPhase.AIM && !S.firedThisTurn;
  }
  function weaponDefs(){
    // UI owns the bar's class, crate, species and demo filtering. There is no
    // independent arsenal here that could accidentally offer another class.
    return CA.UI && typeof CA.UI.weaponDefs==='function' ? CA.UI.weaponDefs(unit()).slice() : [];
  }
  function status(w){
    var u = unit(), cd = w.ability && u && u.cooldowns ? Math.max(0, u.cooldowns[w.id] || 0) : 0;
    var ammo = CA.ammoOf ? CA.ammoOf(w.id) : w.ammo;
    var reason = ammo===0 ? t(TEXT.noAmmo) : cd>0 ? t(TEXT.cooldown)+': '+cd+' '+t(TEXT.turns)
      : CA.weaponAllowed && !CA.weaponAllowed(w.id) ? t(TEXT.locked)
      : S.firedThisTurn && CA.isShotWeapon && CA.isShotWeapon(w.id) ? t(TEXT.spent) : '';
    if(!reason && CA.UI && CA.UI.weaponUnavailable && CA.UI.weaponUnavailable(w.id)) reason=t(TEXT.unavailable);
    return { disabled: !!reason, reason: reason, cooldown: cd, ammo: ammo };
  }
  function element(tag, className, content){
    var e = document.createElement(tag); if(className) e.className=className;
    if(content != null) e.textContent=content; return e;
  }
  function button(className, label){ var e=element('button', className, label); e.type='button'; return e; }
  function focus(e){ try{ e.focus({preventScroll:true}); }catch(_){ try{ e.focus(); }catch(__){} } }
  function stop(e){ e.stopPropagation(); }

  // Only use paths shipped by this build. All other bar icons are large emoji,
  // matching UI's fallback without issuing requests for absent artwork.
  var shippedIcons = ['gasgrenade','smokegrenade','melee','spikeball','logtoss','timergrenade','rope','magnetmine','laser','capybomb'];
  function icon(w){
    var box=element('div', 'armory-icon'); box.setAttribute('aria-hidden','true');
    var fallback=element('span', 'armory-emoji', w.icon || w.emoji || '✨'); box.appendChild(fallback);
    var path='assets/weapons/'+w.id+'.png';
    if(shippedIcons.indexOf(w.id)>=0 && !(CA._isMissingArt && CA._isMissingArt(path))){
      var img=element('img', 'armory-icon-image'); img.alt=''; img.decoding='async';
      img.onload=function(){ fallback.hidden=true; img.classList.add('armory-icon-loaded'); };
      img.onerror=function(){ img.remove(); fallback.hidden=false; };
      img.src=path+(CA.ASSET_V ? '?v='+encodeURIComponent(CA.ASSET_V) : ''); box.appendChild(img);
    }
    return box;
  }

  function explanation(w){
    var details=element('div','armory-explanation'); details.id='armory-explanation-'+w.id;
    details.hidden=!expanded[w.id];
    details.appendChild(element('p','',t(w.power ? TEXT.charge : TEXT.instant)));
    var specs=[];
    if(w.damage>0) specs.push(t(TEXT.damage)+': '+Math.round(w.damage));
    if(w.radius>0) specs.push(t(TEXT.radius)+': '+Math.round(w.radius));
    if(w.fuse>0) specs.push(t(TEXT.fuse)+': '+w.fuse+' s');
    if(w.ability && w.cooldown>0) specs.push(t(TEXT.cooldown)+': '+w.cooldown+' '+t(TEXT.turns));
    if(specs.length) details.appendChild(element('p','armory-specs',specs.join(' · ')));
    if(w.affectedByWind) details.appendChild(element('p','',t(TEXT.wind)));
    details.appendChild(element('p','',t(w.endsTurn ? TEXT.ends : TEXT.continues)));
    details.appendChild(element('p','armory-explanation-hint',t(TEXT.closeFirst)));
    return details;
  }

  function choose(w){
    if(!opened || !humanTurn() || !weaponDefs().some(function(x){return x.id===w.id;}) || status(w).disabled) return;
    if(CA.UI && typeof CA.UI.chooseWeapon==='function'){
      if(CA.UI.chooseWeapon(w.id)===false) return;
    }else{
      S.selectedWeapon=w.id;
      if(CA.events) CA.events.emit('sfx','select');
    }
    chosen=true;
    refreshSelected(); announcement.textContent=t(TEXT.current)+': '+weaponName(w)+'. '+t(TEXT.closeFirst);
  }
  function refreshSelected(){
    cards.forEach(function(c){
      var selected=c.weapon.id===S.selectedWeapon;
      c.card.classList.toggle('armory-card-selected',selected);
      c.choose.setAttribute('aria-pressed',String(selected));
      c.choose.textContent=t(selected ? TEXT.chosen : TEXT.choose);
    });
    var w=weaponDefs().find(function(x){return x.id===S.selectedWeapon;});
    selectedLabel.textContent=t(TEXT.current)+': '+(w ? weaponName(w) : t(TEXT.weapon));
  }
  function render(){
    if(!root) return;
    var focused=document.activeElement;
    var focusKey=focused && root.contains(focused) ? focused.getAttribute('data-armory-focus') : null;
    var scroll=grid.scrollTop;
    heading.textContent=t(TEXT.title); hint.textContent=t(TEXT.hint);
    launcher.textContent='✨ '+t(TEXT.powers); launcher.setAttribute('aria-label',t(TEXT.title));
    grid.setAttribute('aria-label',t(TEXT.title));
    var u=unit(), team=S.teams && S.teams[S.currentTeamIdx];
    subtitle.textContent=t(TEXT.eyebrow)+(u ? ' · '+(u.name || team && team.name || '') : '');
    closeButton.setAttribute('aria-label',t(TEXT.close)); closeButton.title=t(TEXT.close);
    root.querySelector('.armory-default-hint').textContent=t(TEXT.default);
    grid.replaceChildren(); cards=[];
    var defs=weaponDefs();
    defs.forEach(function(w){
      var st=status(w), card=element('article','armory-card'); card.setAttribute('data-weapon',w.id);
      card.classList.toggle('armory-card-unavailable',st.disabled);
      var top=element('div','armory-card-top'), info=element('div','armory-card-info');
      top.appendChild(icon(w));
      info.appendChild(element('span','armory-card-kind',t(w.ability ? TEXT.ability : w.category==='utility' ? TEXT.utility : TEXT.weapon)));
      var name=element('h3','armory-card-name',weaponName(w)); name.id='armory-name-'+w.id;
      info.appendChild(name); top.appendChild(info); card.appendChild(top); card.setAttribute('aria-labelledby',name.id);
      card.appendChild(element('p','armory-card-description',t(descriptions[w.id] ? descriptions[w.id][0] : TEXT.unknown)));
      var label=st.reason || (w.ability ? t(TEXT.ready) : t(TEXT.ammo)+': '+(st.ammo<0 ? '∞' : st.ammo));
      card.appendChild(element('p','armory-card-status'+(st.disabled ? ' armory-card-status-locked' : ''),label));
      var actions=element('div','armory-card-actions');
      var explainButton=button('armory-explain',t(expanded[w.id] ? TEXT.hideExplain : TEXT.explain));
      explainButton.setAttribute('aria-expanded',String(!!expanded[w.id]));
      explainButton.setAttribute('aria-controls','armory-explanation-'+w.id);
      explainButton.setAttribute('aria-label',t(TEXT.explain)+': '+weaponName(w));
      explainButton.setAttribute('data-armory-focus','explain-'+w.id);
      var details=explanation(w);
      explainButton.addEventListener('click',function(){
        expanded[w.id]=!expanded[w.id]; details.hidden=!expanded[w.id];
        explainButton.setAttribute('aria-expanded',String(expanded[w.id]));
        explainButton.textContent=t(expanded[w.id] ? TEXT.hideExplain : TEXT.explain);
      });
      var chooseButton=button('armory-choose',t(TEXT.choose)); chooseButton.disabled=st.disabled;
      chooseButton.setAttribute('aria-label',t(TEXT.choose)+': '+weaponName(w)+(st.reason ? ' · '+st.reason : ''));
      chooseButton.setAttribute('data-armory-focus','choose-'+w.id);
      chooseButton.addEventListener('click',function(){ choose(w); });
      actions.append(explainButton,chooseButton); card.append(actions,details); grid.appendChild(card);
      cards.push({card:card,choose:chooseButton,weapon:w});
    });
    if(!defs.length) grid.appendChild(element('p','armory-empty',t(TEXT.empty)));
    refreshSelected(); grid.scrollTop=scroll;
    if(focusKey){
      var target=Array.prototype.find.call(root.querySelectorAll('[data-armory-focus]'),function(e){return e.getAttribute('data-armory-focus')===focusKey;});
      focus(target || closeButton);
    }
  }

  function create(){
    if(root) return;
    root=element('div','armory-overlay'); root.id='armory-root'; root.hidden=true;
    panel=element('section','armory-panel'); panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-labelledby','armory-title'); panel.setAttribute('aria-describedby','armory-hint'); panel.tabIndex=-1;
    var header=element('header','armory-header'), titleBlock=element('div','armory-title-block');
    subtitle=element('p','armory-eyebrow'); heading=element('h2','armory-title'); heading.id='armory-title';
    titleBlock.append(subtitle,heading);
    closeButton=button('armory-close','×'); closeButton.setAttribute('data-armory-focus','close');
    closeButton.addEventListener('click',function(){ close(); }); header.append(titleBlock,closeButton);
    hint=element('p','armory-hint'); hint.id='armory-hint';
    grid=element('div','armory-grid'); grid.setAttribute('aria-label',t(TEXT.title));
    var footer=element('footer','armory-footer'), summary=element('div','armory-footer-copy');
    selectedLabel=element('p','armory-selected'); summary.append(selectedLabel,element('p','armory-default-hint'));
    footer.appendChild(summary);
    announcement=element('p','armory-sr-only'); announcement.setAttribute('role','status'); announcement.setAttribute('aria-live','polite');
    panel.append(header,hint,grid,footer,announcement); root.appendChild(panel); document.body.appendChild(root);
    launcher=button('armory-launcher','✨ '+t(TEXT.powers)); launcher.id='armory-launcher'; launcher.hidden=true;
    launcher.setAttribute('aria-haspopup','dialog'); launcher.setAttribute('aria-controls','armory-root');
    launcher.setAttribute('aria-label',t(TEXT.title));
    launcher.addEventListener('click',function(e){ e.stopPropagation(); open(); }); document.body.appendChild(launcher);
    ['pointerdown','pointerup','touchstart','touchend'].forEach(function(name){ launcher.addEventListener(name,stop,{passive:name.indexOf('touch')===0}); });
    // Backdrop clicks and Escape intentionally leave the chooser open. Only the
    // explicit X button dismisses it during normal gameplay.
    ['pointerdown','pointerup','click','dblclick','touchstart','touchend','wheel'].forEach(function(name){
      root.addEventListener(name,stop,{passive:name==='wheel' || name.indexOf('touch')===0});
    });
    document.addEventListener('keydown',function(e){
      if(!opened) return;
      e.stopImmediatePropagation();
      if(e.key==='Escape'){ e.preventDefault(); return; }
      if(e.key==='Tab'){
        var targets=Array.prototype.filter.call(panel.querySelectorAll('button:not([disabled]),[tabindex="0"]'),function(e){return !e.hidden && e.getClientRects().length;});
        if(!targets.length){ e.preventDefault(); focus(panel); return; }
        var first=targets[0], last=targets[targets.length-1];
        if(e.shiftKey && (document.activeElement===first || !panel.contains(document.activeElement))){e.preventDefault();focus(last);}
        else if(!e.shiftKey && (document.activeElement===last || !panel.contains(document.activeElement))){e.preventDefault();focus(first);}
      }else if((e.key===' ' || e.key==='Enter') && document.activeElement.tagName!=='BUTTON') e.preventDefault();
    },true);
    document.addEventListener('keyup',function(e){ if(opened) e.stopImmediatePropagation(); },true);
    document.addEventListener('focusin',function(e){ if(opened && !panel.contains(e.target)) focus(closeButton); });
  }

  function hide(restoreFocus, normalChoice){
    if(!opened) return false;
    if(normalChoice && !chosen && humanTurn()){
      var bazooka=weaponDefs().find(function(w){return w.id==='bazooka';});
      if(bazooka && !status(bazooka).disabled) choose(bazooka);
    }
    opened=false; root.hidden=true; announcement.textContent='';
    syncLauncher();
    if(restoreFocus){
      var target=previousFocus && previousFocus.isConnected && previousFocus!==document.body
        && previousFocus.getClientRects().length ? previousFocus : CA.canvas;
      if(target){ if(target===CA.canvas && !target.hasAttribute('tabindex')) target.setAttribute('tabindex','0'); focus(target); }
    }
    previousFocus=null;
    return true;
  }
  function close(){ return hide(true,true); }
  function open(){
    if(!initialized) init();
    if(!humanTurn()) return false;
    if(opened){ render(); return true; }
    create(); previousFocus=document.activeElement; chosen=false; expanded=Object.create(null);
    // A key/touch released while reading must not leave walking or charging
    // latched when the X restores gameplay. Cancel input, never spend ammo.
    if(S.input) S.input.left=S.input.right=S.input.up=S.input.down=false;
    S.charging=false; S.power=0;
    opened=true; root.hidden=false; syncLauncher(); grid.scrollTop=0; render(); focus(closeButton);
    return true;
  }
  function isOpen(){
    // Mode changes made by other game modules may have no event. Let core's
    // existing isOpen() check clear a stale modal when leaving a human turn.
    if(opened && !humanTurn()) hide(false,false);
    syncLauncher();
    return opened;
  }
  function sync(){ isOpen(); }
  function syncLauncher(){
    // Keep the re-open control available after closing the chooser, including
    // while the temporary match-objective card is fading. CSS places it under
    // the movement meter, so it never overlaps that centered banner.
    if(launcher) launcher.hidden=!!opened || !humanTurn() || !!S.paused;
  }
  function autoOpen(){
    if(!humanTurn()){ hide(false,false); syncLauncher(); return; }
    var u=unit(), key=[S.round,S.currentTeamIdx,u.id].join(':');
    if(key===lastAutoTurn) return;
    lastAutoTurn=key; hide(false,false); open();
  }
  function init(){
    if(initialized) return; initialized=true; create();
    if(CA.events && CA.events.on){
      CA.events.on('gameStart',function(){ hide(false,false); lastAutoTurn=null; syncLauncher(); });
      CA.events.on('turnStart',autoOpen);
      CA.events.on('turnEnd',function(){ hide(false,false); if(launcher) launcher.hidden=true; });
      CA.events.on('gameOver',function(){ hide(false,false); lastAutoTurn=null; syncLauncher(); });
      CA.events.on('fired',function(){ syncLauncher(); });
      CA.events.on('langChanged',function(){
        launcher.textContent='✨ '+t(TEXT.powers); launcher.setAttribute('aria-label',t(TEXT.title));
        if(opened) render();
      });
      CA.events.on('unitSwitched',function(){ if(opened) render(); });
      CA.events.on('modeChanged',function(){ isOpen(); });
      CA.events.on('menuOpen',function(){ hide(false,false); });
    }
    autoOpen();
  }
  CA.Armory={init:init,isOpen:isOpen,open:open,close:close,sync:sync};
})();
