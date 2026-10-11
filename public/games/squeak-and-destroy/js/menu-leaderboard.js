/* ============================================================================
 * Squeak & Destroy — Leaderboard submenu screen (DOM).
 * Global ranglista a PHP backendből (leaderboard.php). Registered via
 * CA.Menu.register('leaderboard', build). Self-contained, never throws.
 * ==========================================================================*/
(function(){
  if(window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Ranglista':'Leaderboard',
    'Globális ranglista':'Global leaderboard',
    'Betöltés…':'Loading…',
    'Nincs kapcsolat':'No connection',
    'Újra':'Retry',
    '🔄 Frissítés':'🔄 Refresh',
    'Még nincs eredmény. Légy te az első!':'No scores yet. Be the first!',
    'Beküldve!':'Submitted!',
    'Beküldés sikertelen':'Submit failed',
    'A pontjaid automatikusan bekerülnek, ha be vagy jelentkezve.':'Your scores are submitted automatically when you are signed in.',
    'pont':'pts',
    'Beküldés…':'Submitting…',
    'Helyezési jutalmak':'Placement rewards',
    'Jó helyezésért egyszeri érme-bónusz jár (helyenként egyszer):':
      'Good placements earn a one-off coin bonus (once per tier):',
    'Top 10':'Top 10','Top 3':'Top 3','#1 helyezés':'#1 place',
    'érme':'coins','begyűjtve':'claimed',
    'A te helyezésed':'Your placement',
    'te':'you',
    'nem vagy a top 20-ban':'not in the top 20',
  });

  const ENDPOINT = (CA.api ? CA.api('leaderboard.php') : 'leaderboard.php');  // native build -> live origin
  // NATIVE builds (Capacitor/file://) hit a CROSS-ORIGIN API_BASE; the SkyNet SSO
  // cookie only rides with credentials:'include'. Web is same-origin (no-op).
  // Mirrors account.js _creds(). (#native-sso)
  const CREDS = ()=> (CA.API_BASE && CA.API_BASE !== '') ? 'include' : 'same-origin';
  let cache = null;   // last fetched scores list (instant render on re-visit)

  // ---- helpers ----------------------------------------------------------
  function rankBadge(i){ return i===0?'🥇':i===1?'🥈':i===2?'🥉':('#'+(i+1)); }

  // rank threshold -> HU label for the placement-reward explainer.
  function rankLabel(rank){
    if(rank<=1) return '#1 helyezés';
    if(rank<=3) return 'Top 3';
    return 'Top 10';
  }

  // Placement-reward explainer panel: what good placements give + claimed state.
  // Reads CA.Meta.leaderboardRewards() defensively; renders nothing if absent.
  function buildRewardsPanel(API){
    let rewards = null;
    try{ const M=window.CA&&CA.Meta; if(M&&typeof M.leaderboardRewards==='function') rewards=M.leaderboardRewards(); }catch(e){ rewards=null; }
    if(!Array.isArray(rewards) || !rewards.length) return null;
    const panel = API.panel();
    panel.append(API.el('h3', null, '<span data-t="Helyezési jutalmak">'+API.t('Helyezési jutalmak')+'</span>'));
    panel.append(API.el('div','muted',
      '<span data-t="Jó helyezésért egyszeri érme-bónusz jár (helyenként egyszer):">'+
      API.esc(API.t('Jó helyezésért egyszeri érme-bónusz jár (helyenként egyszer):'))+'</span>'));
    // best (lowest rank) first
    rewards.slice().sort((a,b)=>(a.rank|0)-(b.rank|0)).forEach(r=>{
      const ok = !!(r && r.claimed);
      const row = API.el('div','row row--between');
      row.style.cssText='margin-top:var(--s2);align-items:center';
      const lbl = rankLabel(r.rank|0);
      const left = API.el('div', ok?null:'muted',
        (ok?'✓ ':'🏆 ') + '<span data-t="'+API.esc(lbl)+'">'+API.esc(API.t(lbl))+'</span>');
      left.style.fontWeight='700';
      const right = API.el('div', null,
        '+'+(r.coins|0)+' 🪙 <span data-t="érme">'+API.esc(API.t('érme'))+'</span>'
        + (ok?' · <span data-t="begyűjtve">'+API.esc(API.t('begyűjtve'))+'</span>':''));
      right.style.cssText='font-weight:800;color:'+(ok?'var(--gold)':'var(--ink-dim)');
      row.append(left, right);
      panel.append(row);
    });
    return panel;
  }

  function fmtDate(ts){
    if(ts==null||ts==='') return '';
    let n = (typeof ts==='number') ? ts : Number(ts);
    if(!isFinite(n)){ const d=new Date(ts); return isNaN(d)?'':d.toLocaleDateString(); }
    if(n < 1e12) n *= 1000;               // epoch seconds -> ms
    const d = new Date(n);
    return isNaN(d) ? '' : d.toLocaleDateString();
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

  // Find the player's own placement in the fetched list. Returns
  // { rank:1-based|null, score:number|null, name } or null if not signed in.
  // The public payload strips uid, so we match by display name (case-insensitive).
  function ownPlacement(scores){
    const name = playerName();
    if(!name) return null;
    let idx = -1;
    try{
      const lc = String(name).toLowerCase();
      idx = (scores||[]).findIndex(s => String(s && s.name || '').toLowerCase() === lc);
    }catch(e){ idx = -1; }
    if(idx >= 0) return { rank: idx+1, score: (scores[idx].score|0), name: name };
    return { rank: null, score: null, name: name };
  }

  async function fetchJSON(url, opts){
    const ctl = new AbortController();
    const timer = setTimeout(()=>{ try{ ctl.abort(); }catch(_){} }, 8000);
    try{
      const res = await fetch(url, Object.assign({ signal:ctl.signal, credentials:CREDS() }, opts||{}));
      const data = await res.json();
      return data;
    } finally { clearTimeout(timer); }
  }

  // ---- screen -----------------------------------------------------------
  function build(API){
    const { screen, body } = API.screen('🏆','Ranglista');

    const panel = API.panel();
    const sub = API.el('div','muted','<span data-t="Globális ranglista">Globális ranglista</span>');

    // action buttons
    const actions = API.el('div','row');
    actions.style.gap = 'var(--s3)';
    actions.style.flexWrap = 'wrap';
    // no manual refresh button — the list auto-refreshes on every screen entry
    // (onShow → load()); scores also auto-submit on game-over when signed in.
    // note: scores auto-submit on game-over for signed-in players (no manual button)
    const hint = API.el('div','muted','<span data-t="A pontjaid automatikusan bekerülnek, ha be vagy jelentkezve.">A pontjaid automatikusan bekerülnek, ha be vagy jelentkezve.</span>');

    const listSec = API.el('div','section');

    panel.append(sub, actions, hint, listSec);
    body.append(panel);

    // placement-reward explainer (what top finishes give + claimed state).
    // Rebuilt on each onShow so the claimed flags stay fresh after a match.
    let rewardsPanel = null;
    function refreshRewards(){
      const next = buildRewardsPanel(API);
      if (rewardsPanel){ if (next) rewardsPanel.replaceWith(next); else rewardsPanel.remove(); }
      else if (next){ body.append(next); }
      rewardsPanel = next;
      if (next && API.applyI18n) API.applyI18n(next);
    }
    refreshRewards();

    // ---- rendering ------------------------------------------------------
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
        badge.style.fontWeight = '800';
        badge.style.fontSize = i<3 ? '20px' : '15px';
        badge.style.minWidth = '34px';
        badge.style.textAlign = 'center';
        badge.style.color = i<3 ? 'var(--gold)' : 'var(--ink-dim)';
        left.append(badge);

        // profile picture (if the entry has one)
        if(s.avatar){ const av=API.el('img'); av.src=s.avatar;
          av.style.cssText='width:34px;height:34px;border-radius:50%;object-fit:cover;border:1px solid var(--border);flex:none';
          av.onerror=function(){ this.style.display='none'; }; left.append(av); }

        const who = API.el('div',null,'');
        who.style.minWidth='0';
        const nm = API.el('div',null, API.esc(s.name || '—'));
        nm.style.fontWeight='700';
        nm.style.overflow='hidden'; nm.style.textOverflow='ellipsis'; nm.style.whiteSpace='nowrap';
        const meta = API.el('div','muted', [API.esc(s.team||''), API.esc(s.mode||''), fmtDate(s.ts)].filter(Boolean).join(' · '));
        who.append(nm, meta);
        left.append(who);

        const score = API.el('div',null, String(s.score|0));
        score.style.fontWeight='800';
        score.style.color='var(--gold)';
        score.style.fontSize='18px';
        score.style.whiteSpace='nowrap';

        card.append(left, score);
        listSec.append(card);
      });

      // "A te helyezésed" — only if the signed-in player is NOT already shown above.
      try{
        const me = ownPlacement(scores);
        if(me && me.rank == null){   // signed in, but not in the visible top-20
          listSec.append(buildSelfRow(me));
        }
      }catch(e){}
    }

    // Highlighted bottom row showing the player's own placement (when not in top-20).
    function buildSelfRow(me){
      const card = API.card();
      card.classList.add('row','row--between');
      card.style.gap = 'var(--s3)';
      card.style.marginTop = 'var(--s3)';
      card.style.borderColor = 'var(--orange,#E8711A)';
      card.style.background = 'rgba(232,113,26,.08)';

      const left = API.el('div','row');
      left.style.gap = 'var(--s3)';
      left.style.minWidth = '0';
      const badge = API.el('div',null, '#—');
      badge.style.cssText = 'font-weight:800;font-size:15px;min-width:34px;text-align:center;color:var(--orange,#E8711A)';
      left.append(badge);

      const who = API.el('div',null,'');
      who.style.minWidth='0';
      const nm = API.el('div',null,
        API.esc(me.name) + ' · <span data-t="te">'+API.esc(API.t('te'))+'</span>');
      nm.style.cssText='font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      const meta = API.el('div','muted',
        '<span data-t="nem vagy a top 20-ban">'+API.esc(API.t('nem vagy a top 20-ban'))+'</span>');
      who.append(nm, meta);
      left.append(who);

      const score = API.el('div',null,
        me.score != null ? String(me.score|0) : '—');
      score.style.cssText='font-weight:800;color:var(--orange,#E8711A);font-size:18px;white-space:nowrap';

      card.append(left, score);
      return card;
    }

    // ---- load -----------------------------------------------------------
    async function load(){
      if(cache) renderList(cache);   // show cached instantly while refreshing
      else setStatus(API.el('div','muted','<span data-t="Betöltés…">'+API.t('Betöltés…')+'</span>'));
      try{
        const data = await fetchJSON(ENDPOINT + '?mode=all&limit=20');
        if(data && data.ok && Array.isArray(data.scores)){
          cache = data.scores;
          renderList(cache);
        } else {
          throw new Error('bad response');
        }
      } catch(err){
        if(cache){ renderList(cache); return; }  // keep stale data if we have it
        const wrap = API.el('div','section');
        wrap.append(API.el('div','muted','<span data-t="Nincs kapcsolat">'+API.t('Nincs kapcsolat')+'</span>'));
        const retry = API.btn('<span data-t="Újra">'+API.t('Újra')+'</span>','btn--ghost btn--sm', ()=>load());
        wrap.append(retry);
        setStatus(wrap);
      }
    }

    // discreet manual refresh (re-fetch on demand; list also auto-refreshes onShow)
    const refreshBtn = API.btn('<span data-t="🔄 Frissítés">'+API.t('🔄 Frissítés')+'</span>','btn--ghost btn--sm', ()=>load());
    actions.append(refreshBtn);

    return { el:screen, onShow(){ refreshRewards(); load(); } };
  }

  /* AUTO-SUBMIT: on game-over, a SIGNED-IN player's score is sent automatically
   * (name + avatar + team + date). No manual button. Registered once. */
  let _autoWired=false;
  function wireAutoSubmit(){
    if(_autoWired || !window.CA || !CA.events) return; _autoWired=true;
    CA.events.on('gameOver', function(){
      try{
        const A=CA.Account; if(!A || !A.user) return;     // only signed-in players
        const S=CA.state;
        // challenge runs (daily / duel) submit to match.php via CA.Challenge — do
        // NOT also push them to the global classic/ffa leaderboard.
        if(S && S._challenge) return;
        // the human player's team (first non-AI), for the team label
        let team='';
        try{ const t=(S.teams||[]).find(x=>!x.isAI); if(t) team=CA.t? CA.t(t.name):t.name; }catch(_){}
        // score = kills this match (fallback 0)
        let score=0; try{ const st=CA.Meta&&CA.Meta.stats?CA.Meta.stats():null; if(st&&typeof st.kills==='number') score=st.kills; }catch(_){}
        // leaderboard now REQUIRES the account token (server derives name/avatar
        // from the verified identity; SkyNet-SSO authes via cookie + empty token).
        fetch((CA.api?CA.api('leaderboard.php'):'leaderboard.php'), { method:'POST', credentials:CREDS(),
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ uid:A.user.uid, token:A.token||'', team:team, score:score|0, mode:(S&&S.gameMode)||'classic' })
        }).catch(function(){});
      }catch(e){}
    });
  }
  wireAutoSubmit();

  if(window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('leaderboard', build);
})();
