/* ============================================================================
 * Squeak & Destroy — Challenge submenu screen (DOM).
 * UI for the DAILY "Crypt Challenge" + async friend "DUELS".
 * Written AGAINST the CA.Challenge API (js/challenge.js) — calls only that,
 * reimplements no logic. Registered via CA.Menu.register('challenge', build).
 * Self-contained, defensive, never throws.
 * ==========================================================================*/
(function(){
  if(window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Napi kihívás':'Daily challenge',
    '🗓️ Napi Crypt Challenge':'🗓️ Daily Crypt Challenge',
    'Mindenki ugyanazt a pályát kapja ma — szerezz minél több pontot a legkevesebb lövésből!':
      'Everyone gets the same arena today — score as high as you can with the fewest shots!',
    'Mai legjobbad: ':'Your best today: ',
    'Még nem próbáltad':'Not tried yet',
    '▶ Mai kihívás':'▶ Today’s challenge',
    'Egy próbálkozás naponta. Teljesítsd, és érméket kapsz!':
      'One attempt per day. Complete it to earn coins!',
    'Jutalom: ':'Reward: ',
    'érme':'coins',
    ' + bónusz a pontszám alapján (max +':' + bonus by score (up to +',
    ')':')',
    '✅ Teljesítve':'✅ Completed',
    '❌ Nem sikerült — gyere vissza holnap':'❌ Failed — come back tomorrow',
    'Mai pontod: ':'Your score today: ',
    'Szerzett jutalom: ':'Reward earned: ',
    'Következő kihívás: ':'Next challenge in: ',
    'Új kihívás elérhető! Frissítsd az oldalt.':'A new challenge is available! Refresh the page.',
    ' napos sorozat':' day streak',
    'Betöltés…':'Loading…',
    'Nincs kapcsolat':'No connection',
    'Újra':'Retry',
    'Még nincs eredmény. Légy te az első!':'No scores yet. Be the first!',
    '⚔️ Hívj ki egy barátot':'⚔️ Challenge a friend',
    'A párbajban ugyanazt a pályát játszátok — a magasabb pont nyer.':
      'In a duel you both play the same arena — the higher score wins.',
    'Kihívás létrehozása':'Create challenge',
    '📋 Másold':'📋 Copy',
    '📤 Megosztás':'📤 Share',
    'Kimásolva!':'Copied!',
    'Másolás sikertelen':'Copy failed',
    'Kód beillesztése':'Paste code',
    'Csatlakozás':'Join',
    'Érvénytelen kód':'Invalid code',
    'Párbaj-eredmények':'Duel standings',
    'Párbaj létrehozása sikertelen':'Could not create duel',
    'A pontod automatikusan felkerül, ha be vagy jelentkezve.':
      'Your score is submitted automatically when you are signed in.',
    'pont':'pts',
  });

  function CH(){ return (window.CA && CA.Challenge) ? CA.Challenge : null; }

  // ---- helpers ----------------------------------------------------------
  function rankBadge(i){ return i===0?'🥇':i===1?'🥈':i===2?'🥉':('#'+(i+1)); }

  function todayLabel(){
    try{ return new Date().toLocaleDateString(); }catch(_){ return ''; }
  }

  // ---- daily-challenge STREAK -------------------------------------------
  // CA.Challenge exposes NO challenge-specific streak (CA.Meta.profile.streak is
  // the daily-LOGIN/spin streak, a different thing), so we maintain our own.
  // Stored as { last:'YYYYMMDD', n:int } keyed off the UTC day used by the
  // daily id ('daily_YYYYMMDD'). Mirrors the daily-spin streak rule: continue
  // if yesterday was completed, reset to 1 otherwise. Fully guarded.
  var STREAK_KEY = 'ca_daily_challenge_streak';
  // UTC day-number (days since epoch) — matches dailyId()'s UTC basis so a day
  // rolling over at UTC midnight stays in sync with the challenge reset.
  function utcDayNum(){
    try{
      var d = new Date();
      return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
    }catch(_){ return 0; }
  }
  function readStreak(){
    try{
      var o = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null');
      if(o && typeof o === 'object' && typeof o.last === 'number' && typeof o.n === 'number') return o;
    }catch(_){}
    return { last:-1, n:0 };
  }
  // Current streak to DISPLAY: if the last recorded day is today or yesterday the
  // banked count still stands; if a day (or more) was missed it has lapsed -> 0.
  function streakDisplay(){
    var s = readStreak();
    var today = utcDayNum();
    if(s.last === today || s.last === today - 1) return Math.max(0, s.n|0);
    return 0;
  }
  // Record a completion for TODAY exactly once: continue the streak if yesterday
  // was done, else start a fresh streak at 1. Idempotent within the same day.
  function bumpStreakOnComplete(){
    try{
      var s = readStreak();
      var today = utcDayNum();
      if(s.last === today) return;                 // already counted today
      var n = (s.last === today - 1) ? (s.n|0) + 1 : 1;   // continue or reset
      localStorage.setItem(STREAK_KEY, JSON.stringify({ last:today, n:n }));
    }catch(_){}
  }

  // ---- screen -----------------------------------------------------------
  function build(API){
    const { screen, body } = API.screen('🗓️','Napi kihívás');

    // shared list renderer (mirrors menu-leaderboard rows) ---------------
    function renderRows(target, scores){
      target.innerHTML='';
      if(!scores || !scores.length){
        target.append(API.el('div','muted', API.t('Még nincs eredmény. Légy te az első!')));
        return;
      }
      scores.forEach(function(s,i){
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

        if(s && s.avatar){ const av=API.el('img'); av.src=s.avatar;
          av.style.cssText='width:34px;height:34px;border-radius:50%;object-fit:cover;border:1px solid var(--border);flex:none';
          av.onerror=function(){ this.style.display='none'; }; left.append(av); }

        const who = API.el('div',null,'');
        who.style.minWidth='0';
        const nm = API.el('div',null, API.esc((s&&s.name) || '—'));
        nm.style.fontWeight='700';
        nm.style.overflow='hidden'; nm.style.textOverflow='ellipsis'; nm.style.whiteSpace='nowrap';
        who.append(nm);
        left.append(who);

        const score = API.el('div',null, String((s&&s.score)|0));
        score.style.fontWeight='800';
        score.style.color='var(--gold)';
        score.style.fontSize='18px';
        score.style.whiteSpace='nowrap';

        card.append(left, score);
        target.append(card);
      });
    }

    /* === DAILY PANEL === */
    const dailyPanel = API.panel();

    const dCard = API.card();
    const dHead = API.el('h3',null,'<span data-t="🗓️ Napi Crypt Challenge">🗓️ Napi Crypt Challenge</span>');
    dHead.style.color='var(--accent)';
    const dDesc = API.el('div','muted','<span data-t="Mindenki ugyanazt a pályát kapja ma — szerezz minél több pontot a legkevesebb lövésből!">Mindenki ugyanazt a pályát kapja ma — szerezz minél több pontot a legkevesebb lövésből!</span>');
    dDesc.style.lineHeight='1.5';
    const dDate = API.el('div','muted', API.esc(todayLabel()));
    dDate.style.fontSize='13px';

    // 🔥 streak hero — "N napos sorozat" (mirrors the daily-spin streak idea).
    const dStreak = API.el('div',null,'');
    dStreak.style.cssText='margin-top:var(--s1);font-weight:800';
    dStreak.style.display='none';

    // "what do I get?" reward hint — one attempt/day, coins on completion.
    const dReward = API.el('div',null,'');
    dReward.style.fontSize='13px';
    dReward.style.marginTop='var(--s1)';
    dReward.style.lineHeight='1.5';

    const dBest = API.el('div',null,'');   // filled in onShow / refreshDaily
    dBest.style.fontWeight='700';
    dBest.style.marginTop='var(--s1)';

    // done/failed result + countdown (shown once today's one attempt is used).
    const dStatus = API.el('div',null,'');
    dStatus.style.marginTop='var(--s2)';
    dStatus.style.lineHeight='1.6';
    dStatus.style.display='none';

    const dPlay = API.btn('<span data-t="▶ Mai kihívás">▶ Mai kihívás</span>','btn--primary', function(){
      const c = CH(); if(!c) return;
      // one-shot guard: don't even try if already attempted today.
      try{ if(c.dailyAttempted && c.dailyAttempted()){ refreshDaily(); return; } }catch(_){}
      let ok=false;
      try{ ok = c.start('daily'); }catch(_){ ok=false; }
      if(ok===false){ try{ refreshDaily(); }catch(_){} }
    });
    dPlay.style.marginTop='var(--s2)';

    // TODAY'S ARENA PREVIEW — a real screenshot of the map the daily uses today
    // (assets/maps/<theme>.png, generated by tools/map-shots.js). Makes the card
    // graphical instead of all-text; falls back to hidden if the image is missing.
    const dImg = API.el('img');
    try {
      const _c = CH();
      const _th = (_c && _c.dailyConfig) ? (_c.dailyConfig().theme || 'grass') : 'grass';
      // ?v cache-bust: the filename is stable, so without this the browser/SW keeps
      // serving the OLD cached preview after we regenerate it (Jani saw the old one).
      const _du = 'assets/maps/' + _th + '.jpg?v=' + (CA.ASSET_V||'1');
      if (CA._isMissingArt && CA._isMissingArt(_du)) dImg.style.display='none';
      else dImg.src = _du;
    } catch(e){ dImg.style.display='none'; }
    dImg.alt = '';
    dImg.loading = 'lazy';
    // NOTE: the preview PNG is a wide 2.4:1 banner — let it size NATURALLY
    // (width:100% + height:auto). A forced aspect-ratio:16/9 + object-fit:cover
    // was cropping/zooming it (Jani: "még zoomos"). No cover, no forced ratio.
    dImg.style.cssText = 'display:block;width:100%;height:auto;'
      + 'border-radius:var(--r1);margin-bottom:var(--s2);box-shadow:0 4px 14px rgba(0,0,0,.35)';
    dImg.onerror = function(){ this.style.display='none'; };

    dCard.append(dImg, dHead, dDesc, dDate, dStreak, dReward, dBest, dStatus, dPlay);

    // paint the 🔥 streak hero from the local counter (hidden when 0).
    function refreshStreak(){
      var n = streakDisplay();
      if(n > 0){
        dStreak.style.display='';
        dStreak.innerHTML = '🔥 <span style="color:var(--gold);font-size:18px">'+n+'</span>'
          + '<span data-t=" napos sorozat"> napos sorozat</span>';
        try{ API.applyI18n(dStreak); }catch(_){}
      } else {
        dStreak.style.display='none';
        dStreak.innerHTML='';
      }
    }

    // daily standings list (loaded in onShow)
    const dListSec = API.el('div','section');

    dailyPanel.append(dCard, dListSec);
    body.append(dailyPanel);

    // human-readable H:MM:SS countdown.
    function fmtCountdown(ms){
      let s = Math.max(0, Math.floor((ms||0)/1000));
      const h = Math.floor(s/3600); s -= h*3600;
      const m = Math.floor(s/60);   s -= m*60;
      const p = function(n){ return (n<10?'0':'')+n; };
      return h+':'+p(m)+':'+p(s);
    }

    let _cdTimer = null;
    function stopCountdown(){ if(_cdTimer){ try{ clearInterval(_cdTimer); }catch(_){} _cdTimer=null; } }

    // Render the daily card for the current state: either the playable button +
    // reward hint, or the locked done/failed result + countdown to tomorrow.
    function refreshDaily(){
      const c = CH();
      stopCountdown();

      // reward hint is always shown (the "what do I get?" answer).
      let base=50, max=200;
      try{ if(c){ const st=c.dailyState(); if(st){ base=st.rewardBase|0; max=st.maxReward|0; } } }catch(_){}
      dReward.innerHTML=
        '<span data-t="Egy próbálkozás naponta. Teljesítsd, és érméket kapsz!">Egy próbálkozás naponta. Teljesítsd, és érméket kapsz!</span><br>'+
        '<span data-t="Jutalom: ">Jutalom: </span>'+base+' <span data-t="érme">érme</span>'+
        '<span data-t=" + bónusz a pontszám alapján (max +"> + bónusz a pontszám alapján (max +</span>'+
        (max-base)+'<span data-t=")">)</span>';
      try{ API.applyI18n(dReward); }catch(_){}

      let st=null;
      try{ if(c && c.dailyState) st=c.dailyState(); }catch(_){ st=null; }

      // when today's challenge was COMPLETED (won), bank the streak day once.
      if(st && st.attempted && st.won){ bumpStreakOnComplete(); }
      refreshStreak();

      if(st && st.attempted){
        // ONE-SHOT used: hide the play button, show done/failed + countdown.
        dPlay.style.display='none';
        dBest.style.display='none';
        dStatus.style.display='block';
        if(st.won){
          dStatus.innerHTML=
            '<div style="color:var(--good,#3fbf5f);font-weight:800;font-size:18px" data-t="✅ Teljesítve">✅ Teljesítve</div>'+
            '<div style="margin-top:4px"><span data-t="Mai pontod: ">Mai pontod: </span>'+(st.score|0)+' <span data-t="pont">pont</span></div>'+
            '<div><span data-t="Szerzett jutalom: ">Szerzett jutalom: </span>'+(st.reward|0)+' <span data-t="érme">érme</span></div>'+
            '<div class="muted" id="ca-daily-cd" style="margin-top:6px;font-size:13px"></div>';
        } else {
          dStatus.innerHTML=
            '<div style="color:var(--bad,#e05050);font-weight:800;font-size:16px" data-t="❌ Nem sikerült — gyere vissza holnap">❌ Nem sikerült — gyere vissza holnap</div>'+
            '<div style="margin-top:4px"><span data-t="Mai pontod: ">Mai pontod: </span>'+(st.score|0)+' <span data-t="pont">pont</span></div>'+
            '<div class="muted" id="ca-daily-cd" style="margin-top:6px;font-size:13px"></div>';
        }
        try{ API.applyI18n(dStatus); }catch(_){}
        const cd = dStatus.querySelector('#ca-daily-cd');
        function tick(){
          let ms=0; try{ if(c && c.msUntilNextDaily) ms=c.msUntilNextDaily(); }catch(_){ ms=0; }
          if(ms<=0){
            // Day rolled over: a fresh daily is now playable. Instead of telling
            // the user to refresh the page (bad UX), auto re-render to the fresh
            // playable state (mirrors menu-daily.js startCountdown() -> render()).
            stopCountdown();
            try{ refreshDaily(); loadDaily(); }catch(_){}
            return;
          }
          if(cd){ cd.innerHTML='<span data-t="Következő kihívás: ">Következő kihívás: </span>'+fmtCountdown(ms); try{ API.applyI18n(cd); }catch(_){} }
        }
        tick();
        _cdTimer = setInterval(tick, 1000);
      } else {
        // not attempted yet: playable.
        dStatus.style.display='none';
        dPlay.style.display='';
        dBest.style.display='';
        dBest.innerHTML='<span class="muted">'+API.t('Még nem próbáltad')+'</span>';
      }
    }

    function setDailyStatus(node){ dListSec.innerHTML=''; dListSec.append(node); }

    async function loadDaily(){
      const c = CH(); if(!c){ renderRows(dListSec, []); return; }
      setDailyStatus(API.el('div','muted','<span data-t="Betöltés…">'+API.t('Betöltés…')+'</span>'));
      let cid; try{ cid = c.dailyId(); }catch(_){ cid=null; }
      try{
        const data = await c.standings(cid);   // Challenge API Promise already times out
        if(data && data.ok && Array.isArray(data.scores)){
          renderRows(dListSec, data.scores);
        } else {
          throw new Error('bad response');
        }
      } catch(err){
        const wrap = API.el('div','section');
        wrap.append(API.el('div','muted','<span data-t="Nincs kapcsolat">'+API.t('Nincs kapcsolat')+'</span>'));
        wrap.append(API.btn('<span data-t="Újra">'+API.t('Újra')+'</span>','btn--ghost btn--sm', function(){ loadDaily(); }));
        setDailyStatus(wrap);
      }
    }

    /* === DUEL PANEL === */
    const duelPanel = API.panel();
    const uHead = API.el('h3',null,'<span data-t="⚔️ Hívj ki egy barátot">⚔️ Hívj ki egy barátot</span>');
    uHead.style.color='var(--accent)';
    const uDesc = API.el('div','muted','<span data-t="A párbajban ugyanazt a pályát játszátok — a magasabb pont nyer.">A párbajban ugyanazt a pályát játszátok — a magasabb pont nyer.</span>');
    uDesc.style.lineHeight='1.5';

    // create-duel result area (hidden until created)
    const createBtn = API.btn('<span data-t="Kihívás létrehozása">Kihívás létrehozása</span>','btn--primary btn--sm', function(){ doCreate(); });

    const createOut = API.el('div','section');
    createOut.style.display='none';
    createOut.style.gap='var(--s2)';

    const codeField = API.el('input');
    codeField.type='text'; codeField.readOnly=true;
    codeField.style.cssText='width:100%;box-sizing:border-box;padding:9px 11px;border-radius:8px;border:1px solid var(--border);background:var(--panel,#1a1a1a);color:var(--ink);font-family:monospace;font-size:16px';

    const shareRow = API.el('div','row');
    shareRow.style.gap='var(--s3)'; shareRow.style.flexWrap='wrap';
    const copyBtn = API.btn('<span data-t="📋 Másold">📋 Másold</span>','btn--ghost btn--sm', function(){ doCopy(codeField.value); });
    const shareBtn = API.btn('<span data-t="📤 Megosztás">📤 Megosztás</span>','btn--ghost btn--sm', function(){ doShare(codeField.dataset.url||codeField.value); });
    shareRow.append(copyBtn, shareBtn);

    const copyMsg = API.el('div','muted','');
    copyMsg.style.fontSize='13px';

    createOut.append(codeField, shareRow, copyMsg);

    // join-by-code area
    const joinRow = API.el('div','row');
    joinRow.style.gap='var(--s3)'; joinRow.style.flexWrap='wrap'; joinRow.style.marginTop='var(--s2)';
    const joinInput = API.el('input');
    joinInput.type='text';
    joinInput.placeholder = (CA && CA.t) ? CA.t('Kód beillesztése') : 'Kód beillesztése';
    joinInput.style.cssText='flex:1;min-width:140px;box-sizing:border-box;padding:9px 11px;border-radius:8px;border:1px solid var(--border);background:var(--panel,#1a1a1a);color:var(--ink);font-size:16px';
    const joinBtn = API.btn('<span data-t="Csatlakozás">Csatlakozás</span>','btn--primary btn--sm', function(){ doJoin(); });
    joinRow.append(joinInput, joinBtn);

    const joinMsg = API.el('div','muted','');
    joinMsg.style.fontSize='13px';

    // optional standings for a known duel cid
    const duelListSec = API.el('div','section');

    duelPanel.append(uHead, uDesc, createBtn, createOut, joinRow, joinMsg, duelListSec);
    body.append(duelPanel);

    // ---- footer note ----------------------------------------------------
    const foot = API.el('div','muted','<span data-t="A pontod automatikusan felkerül, ha be vagy jelentkezve.">A pontod automatikusan felkerül, ha be vagy jelentkezve.</span>');
    foot.style.fontSize='12px';
    foot.style.marginTop='var(--s3)';
    body.append(foot);

    // ---- duel actions ---------------------------------------------------
    function doCreate(){
      const c = CH(); if(!c) return;
      let res=null;
      try{ res = c.createDuel(); }catch(_){ res=null; }
      if(!res || !res.code){
        copyMsg.innerHTML='<span data-t="Párbaj létrehozása sikertelen">Párbaj létrehozása sikertelen</span>';
        createOut.style.display='flex';
        return;
      }
      codeField.value = res.url || res.code;
      codeField.dataset.url = res.url || '';
      copyMsg.textContent='';
      createOut.style.display='flex';
      if(res.cid) loadDuelStandings(res.cid);
    }

    function doCopy(text){
      if(!text){ return; }
      function ok(){ copyMsg.innerHTML='<span data-t="Kimásolva!">Kimásolva!</span>'; }
      function fail(){ copyMsg.innerHTML='<span data-t="Másolás sikertelen">Másolás sikertelen</span>'; }
      try{
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(text).then(ok, function(){ legacyCopy(text)?ok():fail(); });
          return;
        }
      }catch(_){}
      legacyCopy(text) ? ok() : fail();
    }

    function legacyCopy(text){
      try{
        codeField.focus(); codeField.select();
        codeField.setSelectionRange(0, (text||'').length);
        return document.execCommand('copy');
      }catch(_){ return false; }
    }

    function doShare(text){
      if(!text){ return; }
      try{
        if(navigator.share){
          navigator.share({ title:'Animal Battle Ground', url:text }).catch(function(){});
          return;
        }
      }catch(_){}
      doCopy(text);   // fallback: copy
    }

    function doJoin(){
      const c = CH(); if(!c) return;
      const val = (joinInput.value||'').trim();
      joinMsg.textContent='';
      if(!val){ joinMsg.innerHTML='<span data-t="Érvénytelen kód">Érvénytelen kód</span>'; return; }
      let cfg=null;
      try{ cfg = c.parseDuel(val); }catch(_){ cfg=null; }
      if(!cfg){ joinMsg.innerHTML='<span data-t="Érvénytelen kód">Érvénytelen kód</span>'; return; }
      try{ c.openDuel(val); }catch(_){}
    }

    async function loadDuelStandings(cid){
      const c = CH(); if(!c || !cid) return;
      duelListSec.innerHTML='';
      const head = API.el('div','muted','<span data-t="Párbaj-eredmények">Párbaj-eredmények</span>');
      head.style.marginTop='var(--s2)';
      duelListSec.append(head);
      const rows = API.el('div','section');
      duelListSec.append(rows);
      try{
        const data = await c.standings(cid);
        if(data && data.ok && Array.isArray(data.scores)) renderRows(rows, data.scores);
        else renderRows(rows, []);
      } catch(_){ renderRows(rows, []); }
    }

    return { el:screen, onShow(){ refreshDaily(); loadDaily(); }, onHide(){ stopCountdown(); } };
  }

  if(window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('challenge', build);
})();
