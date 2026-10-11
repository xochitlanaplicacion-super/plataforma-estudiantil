/* ============================================================================
 * Squeak & Destroy — PROFILE submenu screen (DOM).  id: 'profile'
 * Reads CA.Meta fresh on every onShow() and rebuilds the body:
 *   - Level + XP progress bar (toward the next level threshold)
 *   - Lifetime stat grid (matches / wins / win-rate / kills / accuracy / …)
 *   - Season / battle-pass track (CA.Meta.seasonTiers())
 *   - Active challenges with per-challenge progress bars (CA.Meta.challenges())
 * Every CA.Meta access is guarded — methods may be absent or return undefined.
 * ==========================================================================*/
(function(){
  if (window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Profil':'Profile',
    'Szint':'Level',
    'XP a következő szintig':'XP to next level',
    'Élet-statisztika':'Lifetime stats',
    'Meccsek':'Matches','Győzelmek':'Wins','Nyerési arány':'Win rate',
    'Kill-ek':'Kills','Pontosság':'Accuracy','Kedvenc fegyver':'Favorite weapon',
    'Legnagyobb kombó':'Biggest combo','Túlélt hullámok':'Waves survived',
    'Szezon jutalmak':'Season rewards','Aktív kihívások':'Active challenges',
    'Nincs aktív kihívás.':'No active challenges.',
    'Kész':'Done','Bejelentkezve':'Signed in','Kijelentkezés':'Log out',
    'Mesterség':'Mastery','Osztály-mesterség':'Class Mastery',
    'Fegyver-mesterség':'Weapon Mastery','rang':'rank','használat':'uses',
    'Még nincs mesterség-haladás. Játssz, hogy XP-t gyűjts!':
      'No mastery progress yet. Play to earn XP!',
    'hamarosan':'coming soon',
    'Itt látod a szinted és XP-d, az élet-statisztikáidat és a fiókodat.':
      'Here you can see your level and XP, your lifetime stats and your account.',
  });

  let bodyEl = null;     // the .screen-scroll (may host the injected hub tab-strip)
  let contentEl = null;  // dedicated inner panel we render into / clear each pass

  function pct(a, b){
    a = (typeof a === 'number' && isFinite(a)) ? a : 0;
    b = (typeof b === 'number' && isFinite(b) && b > 0) ? b : 0;
    if (b <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((a / b) * 100)));
  }

  // progress-bar component: track + accent fill at NN%
  function progressBar(API, percent, color){
    const track = API.el('div');
    track.style.cssText = 'background:rgba(255,255,255,.12);border-radius:var(--r-pill);height:10px;overflow:hidden;margin-top:var(--s2)';
    const fill = API.el('div');
    fill.style.cssText = 'background:'+(color||'var(--accent)')+';height:100%;width:'+pct(percent,100)+'%;transition:width .3s var(--ease)';
    track.appendChild(fill);
    return track;
  }

  // a single .card in the lifetime stat grid (small dim label + big value)
  function statCard(API, label, value){
    const c = API.card();
    const l = API.el('div','muted','<span data-t="'+API.esc(label)+'">'+API.esc(label)+'</span>');
    const v = API.el('div', null, API.esc(value));
    v.style.cssText = 'font-size:24px;font-weight:800;color:var(--ink);margin-top:var(--s1);line-height:1.1';
    c.append(l, v);
    return c;
  }

  function weaponName(API, id){
    if (!id) return '—';
    let nm = id;
    try {
      const list = (CA.Weapons && CA.Weapons.LIST) || [];
      for (let i=0;i<list.length;i++){ if (list[i] && list[i].id === id){ nm = list[i].name || id; break; } }
    } catch(e){}
    return API.t(nm);
  }

  // Favorite-weapon stat card: like statCard but prepends the weapon's icon
  // (assets/weapons/<id>.png), mirroring menu-puzzles.js. Falls back to a 🔫
  // emoji tile if the image fails to load or no favorite weapon is known.
  function favWeaponCard(API, label, id){
    const c = API.card();
    const l = API.el('div','muted','<span data-t="'+API.esc(label)+'">'+API.esc(label)+'</span>');
    c.append(l);
    const row = API.el('div','row');
    row.style.cssText = 'gap:var(--s2);align-items:center;margin-top:var(--s1)';
    // icon tile (only when we actually have a weapon id)
    if (id){
      const icon = API.el('div',null,'');
      icon.style.cssText = 'flex:0 0 auto;width:32px;height:32px;border-radius:8px;'
        + 'background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;overflow:hidden';
      function fallback(){ icon.innerHTML = '<span style="font-size:20px">🔫</span>'; }
      try {
        const wmap = { bat:'melee' };
        const wf = wmap[id] || id;
        const src = 'assets/weapons/' + wf + '.png';
        // art this build doesn't ship → straight to the emoji, no 404 round-trip
        if (CA._isMissingArt && CA._isMissingArt(src)) { fallback(); }
        else {
          const img = API.el('img');
          img.alt = ''; img.src = src;
          img.style.cssText = 'width:26px;height:26px;object-fit:contain';
          img.onerror = function(){ this.remove(); fallback(); };
          icon.append(img);
        }
      } catch(e){ fallback(); }
      row.append(icon);
    }
    const v = API.el('div', null, API.esc(weaponName(API, id)));
    v.style.cssText = 'font-size:20px;font-weight:800;color:var(--ink);line-height:1.1;min-width:0;'
      + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    row.append(v);
    c.append(row);
    return c;
  }

  // class id -> display name (via CA.Classes), defensive.
  function className(API, id){
    if (!id) return '—';
    let nm = id;
    try { const d = (CA.Classes && CA.Classes[id]) || null; if (d && d.name) nm = d.name; } catch(e){}
    return API.t(nm);
  }
  // class id -> animal emoji, defensive (returns '' when unknown).
  function classEmoji(id){
    try {
      const d = (CA.Classes && CA.Classes[id]) || null;
      const a = (d && d.animal) || '';
      return ({ bat:'🦇', capybara:'🐹', owl:'🦉', bird:'🦅', beaver:'🦦', koala:'🐨', worm:'🐛', hedgehog:'🦔', frog:'🐸' })[a] || '';
    } catch(e){ return ''; }
  }
  // safe class id list (CA.Classes.list()).
  function classIds(){
    try { const l = (CA.Classes && CA.Classes.list) ? CA.Classes.list() : []; return Array.isArray(l) ? l : []; }
    catch(e){ return []; }
  }
  // safe weapon list (CA.Weapons.LIST) — [{id,name,...}].
  function weaponList(){
    try { const l = (CA.Weapons && CA.Weapons.LIST) || []; return Array.isArray(l) ? l : []; }
    catch(e){ return []; }
  }

  // Build the "Mesterség / Mastery" panel. Uses CA.Meta.classMastery / classLevel /
  // classXP / classXpForLevel + weaponMastery. Every access guarded; if no real
  // mastery data is reachable, shows a friendly "play to earn" note instead.
  function renderMastery(API, Meta){
    const panel = API.panel();
    panel.append(API.el('h3', null, '<span data-t="Mesterség">Mesterség</span>'));
    if (!Meta){
      panel.append(API.el('div','muted','<span data-t="Még nincs mesterség-haladás. Játssz, hogy XP-t gyűjts!">Még nincs mesterség-haladás. Játssz, hogy XP-t gyűjts!</span>'));
      return panel;
    }

    let any = false;

    /* ---- per-class mastery: class level + mastery rank + progress to next level --- */
    const ids = classIds();
    if (ids.length && typeof Meta.classLevel === 'function'){
      const sub = API.el('div','section');
      sub.append(API.el('div','muted','<span data-t="Osztály-mesterség">Osztály-mesterség</span>'));
      const grid = API.el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:var(--s2);margin-top:var(--s2)';
      ids.forEach(function(cid){
        let lvl = 1, rank = 0, xp = 0, curT = null, nextT = null;
        try { lvl = Meta.classLevel(cid) || 1; } catch(e){}
        try { if (typeof Meta.classMastery === 'function') rank = Meta.classMastery(cid) || 0; } catch(e){}
        try { if (typeof Meta.classXP === 'function') xp = Meta.classXP(cid) || 0; } catch(e){}
        try {
          if (typeof Meta.classXpForLevel === 'function'){
            curT = Meta.classXpForLevel(lvl); nextT = Meta.classXpForLevel(lvl + 1);
          }
        } catch(e){ curT = nextT = null; }

        const c = API.card();
        const top = API.el('div', null,
          (classEmoji(cid) ? classEmoji(cid) + ' ' : '') +
          '<strong>' + API.esc(className(API, cid)) + '</strong>');
        c.append(top);
        const meta = API.el('div','muted',
          API.t('Szint') + ' ' + lvl +
          (rank > 0 ? ' · ⭐' + rank + ' ' + API.t('rang') : ''));
        meta.style.marginTop = 'var(--s1)';
        c.append(meta);
        // progress toward the next class level (when thresholds are available).
        if (typeof curT === 'number' && typeof nextT === 'number' && nextT > curT){
          const into = xp - curT, span = nextT - curT;
          c.append(progressBar(API, pct(into, span), rank > 0 ? 'var(--gold)' : 'var(--accent)'));
        }
        if (lvl > 1 || rank > 0 || xp > 0) any = true;
        grid.append(c);
      });
      sub.append(grid);
      panel.append(sub);
    }

    /* ---- top mastered weapons: highest tier / most uses (weaponMastery) --- */
    if (typeof Meta.weaponMastery === 'function'){
      const wl = weaponList();
      const rows = [];
      wl.forEach(function(w){
        if (!w || !w.id) return;
        let m = null;
        try { m = Meta.weaponMastery(w.id); } catch(e){ m = null; }
        if (m && typeof m.xp === 'number' && m.xp > 0){
          rows.push({ id: w.id, name: w.name || w.id, tier: m.tier || 0, xp: m.xp });
        }
      });
      rows.sort(function(a,b){ return (b.tier - a.tier) || (b.xp - a.xp); });
      const top = rows.slice(0, 6);
      if (top.length){
        any = true;
        const sub = API.el('div','section');
        sub.append(API.el('div','muted','<span data-t="Fegyver-mesterség">Fegyver-mesterség</span>'));
        const grid = API.el('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:var(--s2);margin-top:var(--s2)';
        top.forEach(function(r){
          const c = API.card();
          c.append(API.el('div', null, '<strong>' + API.esc(API.t(r.name)) + '</strong>'));
          const stars = r.tier > 0 ? new Array(r.tier + 1).join('⭐') : '';
          const meta = API.el('div','muted',
            (stars ? stars + ' · ' : '') + r.xp + ' ' + API.t('használat'));
          meta.style.marginTop = 'var(--s1)';
          c.append(meta);
          grid.append(c);
        });
        sub.append(grid);
        panel.append(sub);
      }
    }

    if (!any){
      panel.append(API.el('div','muted','<span data-t="Még nincs mesterség-haladás. Játssz, hogy XP-t gyűjts!">Még nincs mesterség-haladás. Játssz, hogy XP-t gyűjts!</span>'));
    }
    return panel;
  }

  function render(API){
    // Render into the dedicated inner container, NOT the whole .screen-scroll —
    // bodyEl's first child may be the shared HUB tab-strip injected by menu.js
    // (~menu.js:863). Wiping bodyEl would remove it; clearing contentEl keeps it.
    if (!bodyEl) return;
    if (!contentEl){ contentEl = API.el('div'); bodyEl.appendChild(contentEl); }
    const body = contentEl;   // local alias so the existing render body is untouched
    body.innerHTML = '';

    // dismissible explainer (X-able, persists hidden) — inserted at the top
    // of the body on each (re)build; infoCard() returns null once dismissed.
    try {
      var ic = API.infoCard && API.infoCard('profile_v1',
        API.t('Itt látod a szinted és XP-d, az élet-statisztikáidat és a fiókodat.'));
      if (ic) body.appendChild(ic);
    } catch(e){}

    const Meta = (window.CA && CA.Meta) || null;

    /* ---- account header: who you are + LOG OUT (this is the signed-in landing) --- */
    const Acc = (window.CA && CA.Account) || null;
    if (Acc && Acc.user){
      const head = API.panel(); head.classList.add('row','row--between'); head.style.alignItems='center';
      const left = API.el('div','row'); left.style.gap='var(--s3)';
      if (Acc.user.foto){ const im=API.el('img'); im.src=Acc.user.foto;
        im.style.cssText='width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--green);flex:none';
        im.onerror=function(){ this.style.display='none'; }; left.append(im); }
      const who = API.el('div',null,
        '<div style="font-weight:800;font-size:18px">'+API.esc(Acc.user.name||'')+'</div>'+
        '<div class="muted">'+(Acc.user.source==='skynet'?'🟢 SkyNet':('🟢 <span data-t="Bejelentkezve">'+API.t('Bejelentkezve')+'</span>'))+'</div>');
      left.append(who); head.append(left);
      const lo = API.btn('🚪 <span data-t="Kijelentkezés">'+API.t('Kijelentkezés')+'</span>','btn--ghost btn--sm', function(){
        try{ CA.Account.logout(); }catch(e){}
        if (CA.Menu && CA.Menu.go) CA.Menu.go('main');
      });
      head.append(lo);
      body.append(head);
      API.applyI18n(head);
    }

    /* ---------------------------------------------------- level + XP bar --- */
    let level = 1, xp = 0;
    try { if (Meta && typeof Meta.level === 'function') level = Meta.level() || 1; } catch(e){}
    try { if (Meta && typeof Meta.xp === 'function') xp = Meta.xp() || 0; } catch(e){}

    const lvlPanel = API.panel();
    lvlPanel.append(API.el('h3', null, '<span data-t="Szint">Szint</span>'));

    const lvlRow = API.el('div','row row--between');
    const lvlBig = API.el('div', null, API.t('Szint') + ' ' + level);
    lvlBig.style.cssText = 'font-size:28px;font-weight:800;color:var(--gold)';
    lvlRow.append(lvlBig);

    // next-level threshold via xpForLevel() if present; else just show raw xp
    let curThresh = null, nextThresh = null;
    try {
      if (Meta && typeof Meta.xpForLevel === 'function'){
        curThresh = Meta.xpForLevel(level);
        nextThresh = Meta.xpForLevel(level + 1);
      }
    } catch(e){ curThresh = nextThresh = null; }

    if (typeof nextThresh === 'number' && typeof curThresh === 'number' && nextThresh > curThresh){
      const into = xp - curThresh, span = nextThresh - curThresh;
      const xpLbl = API.el('div','muted', (Math.max(0,into)) + ' / ' + span + ' XP');
      lvlRow.append(xpLbl);
      lvlPanel.append(lvlRow);
      lvlPanel.append(progressBar(API, pct(into, span), 'var(--gold)'));
      lvlPanel.append(API.el('div','muted','<span data-t="XP a következő szintig">XP a következő szintig</span>'));
    } else {
      const xpLbl = API.el('div','muted', xp + ' XP');
      lvlRow.append(xpLbl);
      lvlPanel.append(lvlRow);
    }
    body.append(lvlPanel);

    /* ---------------------------------------------------- lifetime stats --- */
    let st = null;
    try { if (Meta && typeof Meta.stats === 'function') st = Meta.stats(); } catch(e){ st = null; }
    st = st || {};
    const dash = '—';
    const num = (v)=> (typeof v === 'number' && isFinite(v)) ? String(v) : dash;
    const matches = (typeof st.matches === 'number') ? st.matches : (typeof st.games === 'number' ? st.games : null);
    const games = matches;
    const wins = (typeof st.wins === 'number') ? st.wins : null;
    const winRatePct = (typeof wins === 'number' && typeof games === 'number' && games > 0)
      ? Math.round((wins / games) * 100) : null;
    const winRate = (winRatePct != null) ? winRatePct + '%' : dash;
    let acc = dash;
    if (typeof st.accuracy === 'number' && isFinite(st.accuracy)){
      acc = Math.round(st.accuracy * 100) + '%';
    } else if (typeof st.hits === 'number' && typeof st.shots === 'number' && st.shots > 0){
      acc = Math.round((st.hits / st.shots) * 100) + '%';
    }
    const combo = (typeof st.biggestCombo === 'number') ? st.biggestCombo
                : (typeof st.bestStreak === 'number') ? st.bestStreak : null;

    const statPanel = API.panel();
    statPanel.append(API.el('h3', null, '<span data-t="Élet-statisztika">Élet-statisztika</span>'));
    const grid = API.el('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:var(--s2)';
    // win-rate card: tint the value green when >50% (a quick "you're winning" cue)
    const winRateCard = statCard(API, 'Nyerési arány', winRate);
    if (winRatePct != null && winRatePct > 50){
      try { winRateCard.lastChild.style.color = 'var(--green)'; } catch(e){}
    }
    grid.append(
      statCard(API, 'Meccsek',        num(matches)),
      statCard(API, 'Győzelmek',      num(wins)),
      winRateCard,
      statCard(API, 'Kill-ek',        num(st.kills)),
      statCard(API, 'Pontosság',      acc),
      favWeaponCard(API, 'Kedvenc fegyver', st.favoriteWeapon),
      statCard(API, 'Legnagyobb kombó', num(combo)),
      statCard(API, 'Túlélt hullámok', num(st.wavesSurvived))
    );
    statPanel.append(grid);
    body.append(statPanel);

    /* ------------------------------------------------------ season track --- */
    let tiers = null;
    try { if (Meta && typeof Meta.seasonTiers === 'function') tiers = Meta.seasonTiers(); } catch(e){ tiers = null; }
    if (Array.isArray(tiers) && tiers.length){
      const seasonPanel = API.panel();
      seasonPanel.append(API.el('h3', null, '<span data-t="Szezon jutalmak">Szezon jutalmak</span>'));
      const row = API.el('div','row');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--s2)';
      tiers.forEach(t=>{
        const on = !!(t && t.unlocked);
        const c = API.card();
        c.style.cssText = 'flex:0 0 auto;min-width:96px;text-align:center;padding:var(--s3)'
          + (on ? ';border-color:var(--gold)' : ';opacity:.5');
        const icon = API.el('div', null, on ? '✓' : '🔒');
        icon.style.cssText = 'font-size:20px;color:' + (on ? 'var(--gold)' : 'var(--ink-dim)');
        const tierNo = API.el('div','muted', 'T' + ((t && t.tier) != null ? t.tier : '?'));
        const label = API.el('div', null, API.esc(API.t((t && t.label) || (t && t.reward) || '')));
        label.style.cssText = 'font-size:13px;font-weight:700;margin-top:var(--s1);color:'
          + (on ? 'var(--gold)' : 'var(--ink-dim)');
        c.append(icon, tierNo, label);
        row.append(c);
      });
      seasonPanel.append(row);
      body.append(seasonPanel);
    }

    /* -------------------------------------------------- active challenges --- */
    let challenges = null;
    try { if (Meta && typeof Meta.challenges === 'function') challenges = Meta.challenges(); } catch(e){ challenges = null; }
    const chPanel = API.panel();
    chPanel.append(API.el('h3', null, '<span data-t="Aktív kihívások">Aktív kihívások</span>'));
    if (Array.isArray(challenges) && challenges.length){
      challenges.forEach(ch=>{
        const c = API.card();
        const top = API.el('div','row row--between');
        const desc = API.el('div', null, API.esc(API.t((ch && ch.desc) || '')));
        desc.style.fontWeight = '700';
        top.append(desc);
        const goal = (ch && typeof ch.goal === 'number') ? ch.goal : 0;
        const prog = (ch && typeof ch.progress === 'number') ? ch.progress : 0;
        const done = !!(ch && ch.done);
        const tag = API.el('div', done ? null : 'muted', done ? '✓ ' + API.t('Kész') : prog + ' / ' + goal);
        if (done) tag.style.cssText = 'color:var(--green);font-weight:800';
        top.append(tag);
        c.append(top);
        c.append(progressBar(API, pct(prog, goal), done ? 'var(--green)' : 'var(--accent)'));
        chPanel.append(c);
      });
    } else {
      chPanel.append(API.el('div','muted','<span data-t="Nincs aktív kihívás.">Nincs aktív kihívás.</span>'));
    }
    body.append(chPanel);

    /* -------------------------------------------------------- mastery panel --- */
    try { body.append(renderMastery(API, Meta)); } catch(e){}

    if (API.applyI18n) API.applyI18n(body);
  }

  function build(API){
    const { screen, body } = API.screen('📊','Profil');
    bodyEl = body;
    return { el:screen, onShow(){ render(API); } };
  }

  if (window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('profile', build);
})();
