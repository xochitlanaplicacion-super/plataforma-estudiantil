/* ============================================================================
 * Squeak & Destroy — Ranked (Rangsor) submenu screen (DOM).
 * Havi ranked szezon képernyő: nagy TIER-jelvény + RP, haladás-sáv a következő
 * tierig, szezon-azonosító, és a szezon-ranglista a CA.Ranked.standings()-ból.
 * Registered via CA.Menu.register('ranked', build). Self-contained, never throws.
 * ==========================================================================*/
(function(){
  if(window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Rangsor':'Ranks',
    'Szezon':'Season',
    'RP':'RP',
    'RP-t a napi kihívásból és a duellből szerzel.':'Earn RP from daily challenges and duels.',
    'Következő szint':'Next tier',
    'Maximális szint elérve!':'Top tier reached!',
    'még':'to go',
    'Szezon ranglista':'Season leaderboard',
    'Betöltés…':'Loading…',
    'Nincs kapcsolat':'No connection',
    'Újra':'Retry',
    '🔄 Frissítés':'🔄 Refresh',
    'Még nincs eredmény. Légy te az első!':'No scores yet. Be the first!',
    'Szintek':'Tiers',
    'A te helyezésed':'Your placement',
    'te':'you',
    'nem vagy a top 25-ben':'not in the top 25',
    // info banner (HU literal == i18n key)
    '<strong>🏅 Mi az a Rangsor?</strong> Ranglista-pontot (<strong>RP</strong>) gyűjtesz, ami 5 szintbe (tier) sorol: 🦴 Sírkerti Újonc (0), 💀 Csont-csavargó (300), ⚔️ Csont-lovag (800), 👻 Fantom (1500), 👑 Krypta-úr (2500&nbsp;RP). RP-t a <strong>duellből</strong> (győzelem +45, vereség +10) és a <strong>napi kihívásból</strong> (a pontszámod alapján +5…+120) szerzel. Az RP soha nem megy 0 alá. Gyűjts többet a feljebb lépéshez!':
      '<strong>🏅 What are Ranks?</strong> You earn Ranked Points (<strong>RP</strong>) that place you in 5 tiers: 🦴 Graveyard Rookie (0), 💀 Bone Drifter (300), ⚔️ Bone Knight (800), 👻 Phantom (1500), 👑 Crypt Lord (2500&nbsp;RP). Earn RP from <strong>duels</strong> (win +45, loss +10) and the <strong>daily challenge</strong> (+5…+120 based on your score). RP never drops below 0. Pile up RP to climb!'
  });
  var RANKED_INFO_HU = '<strong>🏅 Mi az a Rangsor?</strong> Ranglista-pontot (<strong>RP</strong>) gyűjtesz, ami 5 szintbe (tier) sorol: 🦴 Sírkerti Újonc (0), 💀 Csont-csavargó (300), ⚔️ Csont-lovag (800), 👻 Fantom (1500), 👑 Krypta-úr (2500&nbsp;RP). RP-t a <strong>duellből</strong> (győzelem +45, vereség +10) és a <strong>napi kihívásból</strong> (a pontszámod alapján +5…+120) szerzel. Az RP soha nem megy 0 alá. Gyűjts többet a feljebb lépéshez!';

  let cache = null;          // last fetched standings
  let activeRefresh = null;  // live badge refresh hook when screen is open

  function rankBadge(i){ return i===0?'🥇':i===1?'🥈':i===2?'🥉':('#'+(i+1)); }

  // The tier ladder, read from CA.Ranked.TIERS if exposed, else a static list
  // matching the infoCard text. Never throws.
  function tierList(){
    try{
      if(CA.Ranked && Array.isArray(CA.Ranked.TIERS) && CA.Ranked.TIERS.length){
        return CA.Ranked.TIERS.map(function(t){
          return { name:t.name, emoji:t.emoji, min:t.min|0 };
        });
      }
    }catch(e){}
    return [
      { name:'Sírkerti Újonc', emoji:'🦴', min:0    },
      { name:'Csont-csavargó', emoji:'💀', min:300  },
      { name:'Csont-lovag',    emoji:'⚔️', min:800  },
      { name:'Fantom',         emoji:'👻', min:1500 },
      { name:'Krypta-úr',      emoji:'👑', min:2500 },
    ];
  }

  // best-effort logged-in player display name (never throws).
  function playerName(){
    try{
      const A = window.CA && CA.Account;
      if(A){
        if(typeof A.name === 'function'){ const n = A.name(); if(n) return n; }
        if(A.user && A.user.name) return A.user.name;
      }
    }catch(e){}
    return '';
  }

  // Find the player's own placement in the standings. Returns
  // { rank:1-based|null, score, tier } or null if not signed in. The match.php
  // payload has no own-rank, so we match by display name; fall back to local RP.
  function ownPlacement(scores){
    const name = playerName();
    if(!name) return null;
    let idx = -1;
    try{
      const lc = String(name).toLowerCase();
      idx = (scores||[]).findIndex(s => String(s && s.name || '').toLowerCase() === lc);
    }catch(e){ idx = -1; }
    // derive local RP/tier from CA.Ranked.state() as a best-effort fallback
    let rp = null, tier = '';
    try{
      const st = (CA.Ranked && CA.Ranked.state) ? CA.Ranked.state() : null;
      if(st){ rp = (st.best|0) || (st.rp|0); if(st.tier && st.tier.name) tier = st.tier.name; }
    }catch(e){}
    if(idx >= 0){
      const s = scores[idx];
      let t = tier;
      try{ if(s.meta && s.meta.tier) t = s.meta.tier; }catch(e){}
      return { rank: idx+1, score: (s.score|0), tier: t, name: name };
    }
    return { rank: null, score: rp, tier: tier, name: name };
  }

  function build(API){
    const { screen, body } = API.screen('🏅','Rangsor');

    try {
      const ic = API.infoCard && API.infoCard('ranked_explain_v1', API.t(RANKED_INFO_HU));
      if (ic) body.insertBefore(ic, body.firstChild);
    } catch(e){}

    const panel = API.panel();

    // ---- big tier badge + RP -------------------------------------------
    const hero = API.el('div','section');
    hero.style.alignItems = 'center';
    hero.style.textAlign  = 'center';
    hero.style.gap = 'var(--s2)';

    const badgeEmoji = API.el('div',null,'🦴');
    badgeEmoji.style.cssText = 'font-size:56px;line-height:1';
    const tierName = API.el('div',null,'');
    tierName.style.cssText = 'font-weight:800;font-size:20px;color:var(--orange,#E8711A)';
    const rpLine = API.el('div','muted','');
    rpLine.style.cssText = 'font-weight:700;font-size:15px;color:var(--gold)';

    hero.append(badgeEmoji, tierName, rpLine);

    // ---- progress bar to next tier -------------------------------------
    const progWrap = API.el('div','section');
    progWrap.style.gap = 'var(--s1)';
    const progLabel = API.el('div','muted','');
    progLabel.style.fontSize = '13px';
    const bar = API.el('div',null,'');
    bar.style.cssText = 'width:100%;height:12px;border-radius:8px;background:rgba(0,0,0,.25);overflow:hidden;border:1px solid var(--border)';
    const fill = API.el('div',null,'');
    fill.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,var(--orange,#E8711A),var(--gold));transition:width .3s ease';
    bar.append(fill);
    progWrap.append(progLabel, bar);

    // ---- tier ladder (all tiers, current highlighted) ------------------
    const ladderSec = API.el('div','section');
    ladderSec.style.gap = 'var(--s1)';
    const ladderTitle = API.el('div','muted','<span data-t="Szintek">'+API.t('Szintek')+'</span>');
    ladderTitle.style.cssText = 'font-size:13px;font-weight:700';
    const ladderRows = API.el('div',null,'');
    ladderRows.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    ladderSec.append(ladderTitle, ladderRows);

    function renderLadder(curIdx){
      ladderRows.innerHTML = '';
      const tiers = tierList();
      tiers.forEach(function(t, i){
        const active = (i === curIdx);
        const row = API.el('div','row row--between');
        row.style.cssText = 'align-items:center;gap:var(--s2);padding:6px 10px;border-radius:8px;border:1px solid '
          + (active?'var(--orange,#E8711A)':'var(--border)')
          + ';background:' + (active?'rgba(232,113,26,.12)':'transparent');
        const left = API.el('div','row');
        left.style.cssText = 'gap:var(--s2);align-items:center;min-width:0';
        const em = API.el('div',null, t.emoji||'🦴');
        em.style.cssText = 'font-size:18px;min-width:24px;text-align:center';
        const nm = API.el('div',null,
          '<span data-t="'+API.esc(t.name)+'">'+API.esc(API.t(t.name))+'</span>'
          + (active?' ←':''));
        nm.style.cssText = 'font-weight:'+(active?'800':'600')+';color:'
          + (active?'var(--orange,#E8711A)':'var(--ink)')
          + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        left.append(em, nm);
        const rp = API.el('div', active?null:'muted', (t.min|0) + ' ' + API.t('RP'));
        rp.style.cssText = 'font-weight:700;font-size:13px;white-space:nowrap;color:'
          + (active?'var(--gold)':'var(--ink-dim)');
        row.append(left, rp);
        ladderRows.append(row);
      });
    }

    // ---- season id + note ----------------------------------------------
    const seasonLine = API.el('div','muted','');
    seasonLine.style.cssText = 'font-size:13px;text-align:center;margin-top:var(--s1)';
    const note = API.el('div','muted','<span data-t="RP-t a napi kihívásból és a duellből szerzel.">RP-t a napi kihívásból és a duellből szerzel.</span>');
    note.style.cssText = 'font-size:13px;text-align:center;font-style:italic';

    // ---- leaderboard section -------------------------------------------
    const lbHead = API.el('div','row');
    lbHead.style.cssText = 'gap:var(--s3);flex-wrap:wrap;align-items:center;margin-top:var(--s3)';
    const lbTitle = API.el('h3',null,'<span data-t="Szezon ranglista">Szezon ranglista</span>');
    lbTitle.style.cssText = 'color:var(--accent);margin:0;flex:1';
    // no manual refresh button — standings auto-refresh on every screen entry (onShow → load())
    lbHead.append(lbTitle);

    const listSec = API.el('div','section');

    panel.append(hero, progWrap, ladderSec, seasonLine, note, lbHead, listSec);
    body.append(panel);

    // ---- paint the hero/progress from CA.Ranked.state() ----------------
    function paintBadge(){
      let st = null;
      try{ if(CA.Ranked && CA.Ranked.state) st = CA.Ranked.state(); }catch(e){}
      if(!st){
        badgeEmoji.textContent = '🦴';
        tierName.textContent = '—';
        rpLine.textContent = '0 ' + API.t('RP');
        progLabel.textContent = '';
        fill.style.width = '0%';
        seasonLine.textContent = '';
        renderLadder(0);
        return;
      }
      badgeEmoji.textContent = st.tier.emoji || '🦴';
      tierName.textContent   = API.t(st.tier.name);
      rpLine.textContent     = (st.rp|0) + ' ' + API.t('RP');
      if(st.next){
        progLabel.textContent = API.t('Következő szint') + ': ' + API.t(st.next.name) +
                                ' — ' + (st.toNext|0) + ' ' + API.t('RP') + ' ' + API.t('még');
      } else {
        progLabel.textContent = API.t('Maximális szint elérve!');
      }
      fill.style.width = Math.round((st.pct||0)*100) + '%';
      seasonLine.textContent = API.t('Szezon') + ': ' + fmtSeason(st.seasonId);
      try{ renderLadder(st.tier && typeof st.tier.idx === 'number' ? st.tier.idx : 0); }catch(e){}
    }

    function fmtSeason(id){
      id = String(id||'');
      if(/^\d{6}$/.test(id)) return id.slice(0,4) + '-' + id.slice(4,6);
      return id;
    }

    // ---- leaderboard rendering -----------------------------------------
    function setStatus(node){ listSec.innerHTML=''; listSec.append(node); }

    function renderList(scores){
      listSec.innerHTML='';
      if(!scores || !scores.length){
        listSec.append(API.el('div','muted','<span data-t="Még nincs eredmény. Légy te az első!">'+API.t('Még nincs eredmény. Légy te az első!')+'</span>'));
        return;
      }
      scores.forEach((s,i)=>{
        const card = API.card();
        card.classList.add('row','row--between');
        card.style.gap = 'var(--s3)';

        const left = API.el('div','row');
        left.style.gap = 'var(--s3)';
        left.style.minWidth = '0';
        const badge = API.el('div',null, rankBadge(i));
        badge.style.cssText = 'font-weight:800;font-size:'+(i<3?'20px':'15px')+';min-width:34px;text-align:center;color:'+(i<3?'var(--gold)':'var(--ink-dim)');
        left.append(badge);

        if(s.avatar){ const av=API.el('img'); av.src=s.avatar;
          av.style.cssText='width:34px;height:34px;border-radius:50%;object-fit:cover;border:1px solid var(--border);flex:none';
          av.onerror=function(){ this.style.display='none'; }; left.append(av); }

        const who = API.el('div',null,'');
        who.style.minWidth='0';
        const nm = API.el('div',null, API.esc(s.name || '—'));
        nm.style.cssText='font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        // tier name from meta if present
        let tierTxt = '';
        try{ if(s.meta && s.meta.tier) tierTxt = API.t(s.meta.tier); }catch(e){}
        const meta = API.el('div','muted', API.esc(tierTxt));
        who.append(nm, meta);
        left.append(who);

        const score = API.el('div',null, (s.score|0) + ' ' + API.t('RP'));
        score.style.cssText='font-weight:800;color:var(--gold);font-size:16px;white-space:nowrap';

        card.append(left, score);
        listSec.append(card);
      });

      // "A te helyezésed" — only if the signed-in player is NOT already shown.
      try{
        const me = ownPlacement(scores);
        if(me && me.rank == null){
          listSec.append(buildSelfRow(me));
        }
      }catch(e){}
    }

    // Highlighted bottom row showing the player's own placement (when not in top-25).
    function buildSelfRow(me){
      const card = API.card();
      card.classList.add('row','row--between');
      card.style.cssText = 'gap:var(--s3);margin-top:var(--s3);border-color:var(--orange,#E8711A);background:rgba(232,113,26,.08)';

      const left = API.el('div','row');
      left.style.cssText = 'gap:var(--s3);min-width:0';
      const badge = API.el('div',null,'#—');
      badge.style.cssText = 'font-weight:800;font-size:15px;min-width:34px;text-align:center;color:var(--orange,#E8711A)';
      left.append(badge);

      const who = API.el('div',null,'');
      who.style.minWidth='0';
      const nm = API.el('div',null,
        API.esc(me.name) + ' · <span data-t="te">'+API.esc(API.t('te'))+'</span>');
      nm.style.cssText='font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      const tierTxt = me.tier ? API.t(me.tier) + ' · ' : '';
      const meta = API.el('div','muted',
        API.esc(tierTxt) + '<span data-t="nem vagy a top 25-ben">'+API.esc(API.t('nem vagy a top 25-ben'))+'</span>');
      who.append(nm, meta);
      left.append(who);

      const score = API.el('div',null,
        (me.score != null ? (me.score|0) : '—') + ' ' + API.t('RP'));
      score.style.cssText='font-weight:800;color:var(--orange,#E8711A);font-size:16px;white-space:nowrap';

      card.append(left, score);
      return card;
    }

    // ---- load standings -------------------------------------------------
    async function load(){
      if(cache) renderList(cache);
      else setStatus(API.el('div','muted','<span data-t="Betöltés…">'+API.t('Betöltés…')+'</span>'));
      try{
        let res = null;
        if(CA.Ranked && CA.Ranked.standings) res = await CA.Ranked.standings();
        if(res && res.ok && Array.isArray(res.scores)){
          cache = res.scores;
          renderList(cache);
        } else {
          throw new Error('bad response');
        }
      }catch(err){
        if(cache){ renderList(cache); return; }
        const wrap = API.el('div','section');
        wrap.append(API.el('div','muted','<span data-t="Nincs kapcsolat">'+API.t('Nincs kapcsolat')+'</span>'));
        wrap.append(API.btn('<span data-t="Újra">'+API.t('Újra')+'</span>','btn--ghost btn--sm', ()=>load()));
        setStatus(wrap);
      }
    }

    // live badge update while the screen is active
    try{
      if(CA.events && !activeRefresh){
        activeRefresh = function(){ try{ paintBadge(); }catch(e){} };
        CA.events.on('rankedChanged', activeRefresh);
      }
    }catch(e){}

    return {
      el: screen,
      onShow(){ paintBadge(); load(); }
    };
  }

  if(window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('ranked', build);
})();
