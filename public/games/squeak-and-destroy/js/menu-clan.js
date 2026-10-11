/* ============================================================================
 * Squeak & Destroy — Clan ("Crypts") submenu screen (DOM).
 * UI for CA.Clans. Registered via CA.Menu.register('clan', build).
 * Self-contained, defensive, never throws.
 * ==========================================================================*/
(function(){
  if(window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Klán':'Clan',
    'Klánhoz be kell jelentkezned':'You must be signed in to join a clan',
    'Csatlakozz egy klánhoz, vagy alapíts sajátot!':'Join a clan or start your own!',
    '🔑 Bejelentkezés':'🔑 Sign in',
    'Betöltés…':'Loading…',
    'Nincs kapcsolat':'No connection',
    'Újra':'Retry',
    '🔄 Frissítés':'🔄 Refresh',
    'Tagok':'Members',
    'Pont':'Points',
    'pont':'pts',
    'tag':'members',
    'Kilépés a klánból':'Leave clan',
    'Klán létrehozása':'Create clan',
    'Klán neve':'Clan name',
    'Tag (rövid jel)':'Tag (short)',
    '2–4 betű/szám':'2–4 letters/digits',
    'Létrehozás':'Create',
    'Csatlakozás':'Join',
    'Csatlakozás klánhoz':'Join a clan',
    'Add meg a klán tagját':'Enter the clan tag',
    'Szint':'Level',
    'Klán XP':'Clan XP',
    'Helyezés':'Rank',
    'Alapítva':'Founded',
    'Szereped':'Your role',
    'Hozzájárulás':'Contribution',
    'Klán-tagok':'Clan members',
    'Nincs adat':'No data',
    '🏆 Top klánok':'🏆 Top clans',
    // info banner (HU literal == i18n key)
    '<strong>🦇 Mi az a klán?</strong> A klán játékosok csapata közös névvel és <strong>[TAG]</strong>-gel. Miért éri meg? Játszhattok együtt, közösen gyűjthettek <strong>klán-pontot/XP-t</strong> a ranglistán, és kivívjátok a saját identitásotokat. Csatlakozz egy meglévőhöz, vagy alapíts sajátot!':
      '<strong>🦇 What is a clan?</strong> A clan is a team of players sharing a name and a <strong>[TAG]</strong>. Why bother? You play together, pool <strong>clan points/XP</strong> on the leaderboard, and build a shared identity worth bragging about. Join an existing one — or found your own!',
    'Még nincs egy klán sem. Légy te az első!':'No clans yet. Be the first!',
    'A klán neve 3–24 karakter legyen':'Clan name must be 3–24 characters',
    'A tag 2–4 nagybetű/szám legyen':'Tag must be 2–4 upper-case letters/digits',
    'Ez a tag foglalt':'This tag is taken',
    'Már van klánod':'You are already in a clan',
    'A klán megtelt':'The clan is full',
    'Nem található ez a klán':'Clan not found',
    'Valami hiba történt':'Something went wrong',
    'Adj meg egy klán-taget':'Enter a clan tag',
    '👑 Vezető':'👑 Leader',
    // weekly clan goal
    '🎯 Heti cél':'🎯 Weekly goal',
    'Jutalom':'Reward',
    'érme':'coins',
    'Teljesítve a héten ✓':'Reached this week ✓',
    'nap maradt':'days left',
    'óra maradt':'hours left',
    'kevesebb mint 1 óra':'less than 1 hour',
  });

  // ---- helpers ----------------------------------------------------------
  var CLAN_INFO_HU = '<strong>🦇 Mi az a klán?</strong> A klán játékosok csapata közös névvel és <strong>[TAG]</strong>-gel. Miért éri meg? Játszhattok együtt, közösen gyűjthettek <strong>klán-pontot/XP-t</strong> a ranglistán, és kivívjátok a saját identitásotokat. Csatlakozz egy meglévőhöz, vagy alapíts sajátot!';
  function rankBadge(i){ return i===0?'🥇':i===1?'🥈':i===2?'🥉':('#'+(i+1)); }
  // best-effort field reader: returns first non-empty among several keys
  function pick(o){ if(!o) return null; for(var i=1;i<arguments.length;i++){ var k=arguments[i]; if(o[k]!=null && o[k]!=='') return o[k]; } return null; }
  function fmtDate(v){
    if(v==null||v==='') return null;
    try{ var n=(typeof v==='number')?v:Date.parse(v); if(isFinite(n)){ var d=new Date(n<1e12?n*1000:n); if(!isNaN(d.getTime())) return d.toISOString().slice(0,10); } }catch(_){}
    return (typeof v==='string') ? v : null;
  }

  // map CA.Clans error codes -> localized HU keys (added to addEN above)
  function errMsg(code){
    switch(code){
      case 'already_in_clan': return 'Már van klánod';
      case 'tag_taken':       return 'Ez a tag foglalt';
      case 'full':            return 'A klán megtelt';
      case 'bad_tag':         return 'A tag 2–4 nagybetű/szám legyen';
      case 'bad_name':        return 'A klán neve 3–24 karakter legyen';
      case 'not_found':       return 'Nem található ez a klán';
      default:                return 'Valami hiba történt';
    }
  }

  function signedIn(){ return !!(window.CA && CA.Account && CA.Account.user); }

  // human-friendly "time left in week" from a seconds count (server-provided)
  function fmtWeekLeft(secs){
    var s = secs|0; if(s < 0) s = 0;
    var days = Math.floor(s / 86400);
    if(days >= 1){ return days + ' ' + CA.t('nap maradt'); }
    var hours = Math.floor(s / 3600);
    if(hours >= 1){ return hours + ' ' + CA.t('óra maradt'); }
    return CA.t('kevesebb mint 1 óra');
  }

  // ---- screen -----------------------------------------------------------
  function build(API){
    const { screen, body } = API.screen('🦇','Klán');

    try {
      const ic = API.infoCard && API.infoCard('clan_explain_v1', API.t(CLAN_INFO_HU));
      if (ic) body.insertBefore(ic, body.firstChild);
    } catch(_){}

    // single mount point we fully re-render on each render()/onShow()
    const mount = API.el('div','section');
    mount.style.gap = 'var(--s4)';
    body.append(mount);

    // small helper: inline error line under an action
    function errLine(){ const e=API.el('div','muted',''); e.style.color='var(--red,#d9534f)'; e.style.minHeight='1.2em'; return e; }
    function showErr(node, code){ node.textContent = CA.t(errMsg(code)); }

    // ---------- not signed in ----------
    function renderSignedOut(){
      mount.innerHTML='';
      const panel = API.panel();
      panel.style.textAlign='center';
      panel.append(API.el('div',null,'<span style="font-size:40px">🦇</span>'));
      panel.append(API.el('h3',null,'<span data-t="Klánhoz be kell jelentkezned">Klánhoz be kell jelentkezned</span>'));
      panel.append(API.el('div','muted','<span data-t="Csatlakozz egy klánhoz, vagy alapíts sajátot!">Csatlakozz egy klánhoz, vagy alapíts sajátot!</span>'));
      const go = API.btn('<span data-t="🔑 Bejelentkezés">🔑 Bejelentkezés</span>','btn--primary', function(){
        try{ if(CA.Menu && CA.Menu.go) CA.Menu.go('login'); else if(CA.UI && CA.UI.setScreen) CA.UI.setScreen('login'); }catch(_){}
      });
      go.style.marginTop='var(--s3)';
      panel.append(go);
      mount.append(panel);
      API.applyI18n(mount);
    }

    // ---------- loading / error of the "mine" fetch ----------
    function renderStatus(node){
      mount.innerHTML='';
      const panel = API.panel();
      panel.append(node);
      mount.append(panel);
      API.applyI18n(mount);
    }

    // ---------- member of a clan ----------
    function renderMine(clan){
      mount.innerHTML='';
      const panel = API.panel();

      // defensive field reads (server shape may vary)
      const emoji      = pick(clan,'emoji','icon','badge') || '🦇';
      const members    = Array.isArray(clan.members) ? clan.members : [];
      const memberCount= members.length || (clan.memberCount|0) || (clan.member_count|0);
      const points     = (pick(clan,'points','score','clanPoints')|0);
      const level      = pick(clan,'level','clanLevel','lvl');
      const xp         = pick(clan,'xp','clanXp','clanXP','exp');
      const ranking    = pick(clan,'rank','ranking','position','place');
      const founded    = fmtDate(pick(clan,'createdAt','created_at','created','founded','since'));
      const leaderId   = pick(clan,'leader','leaderId','leader_id','ownerUid');

      // your role
      let myRole = pick(clan,'role','myRole');
      try{
        const myUid = (CA.Account && CA.Account.user) ? CA.Account.user.uid : null;
        if(!myRole && myUid!=null){ myRole = (myUid===leaderId) ? '👑 '+CA.t('👑 Vezető').replace('👑 ','') : CA.t('Tag'); }
      }catch(_){}

      // header: emoji [TAG] name
      const headRow = API.el('div','row');
      headRow.style.gap='var(--s3)'; headRow.style.alignItems='center'; headRow.style.flexWrap='wrap';
      const em = API.el('div',null, API.esc(String(emoji)));
      em.style.cssText='font-size:32px;line-height:1;flex:none';
      const tag = API.el('div',null,'['+API.esc(clan.tag||'')+']');
      tag.style.cssText='font-weight:800;color:var(--orange,#E8711A);font-size:18px';
      const nm = API.el('div',null, API.esc(clan.name||'—'));
      nm.style.cssText='font-weight:800;font-size:18px';
      headRow.append(em, tag, nm);

      // stat tiles (icons + value + label); only show what we actually have
      const stats = API.el('div','row');
      stats.style.cssText='gap:var(--s3);margin-top:var(--s3);flex-wrap:wrap';
      function stat(icon, labelKey, value){
        const c = API.el('div','card');
        c.style.cssText='flex:1;min-width:96px;text-align:center;padding:var(--s2)';
        const v = API.el('div',null, icon+' '+API.esc(String(value)));
        v.style.cssText='font-weight:800;color:var(--gold);font-size:18px';
        c.append(v);
        c.append(API.el('div','muted','<span data-t="'+API.esc(labelKey)+'">'+API.esc(labelKey)+'</span>'));
        return c;
      }
      stats.append(stat('🏅','Pont', points));
      stats.append(stat('👥','Tagok', memberCount));
      if(level!=null)   stats.append(stat('⭐','Szint', level));
      if(xp!=null)      stats.append(stat('✨','Klán XP', xp));
      if(ranking!=null) stats.append(stat('📊','Helyezés', '#'+ranking));

      panel.append(headRow, stats);

      // weekly goal progress card (guarded: only render when the backend
      // actually returned the new fields; older responses simply hide it)
      try{
        var wTarget = clan.weekTarget;
        if(wTarget!=null && (wTarget|0) > 0){
          var wPts    = clan.weekPoints|0;
          var wTgt    = wTarget|0;
          var wReward = clan.weekReward|0;
          var wLeft   = (clan.weekSecsLeft!=null) ? (clan.weekSecsLeft|0) : null;
          var reached = (clan.weekReached===true) || (wPts >= wTgt);
          var pct = wTgt>0 ? Math.max(0, Math.min(100, Math.round(wPts*100/wTgt))) : 0;

          var goal = API.el('div','card');
          goal.style.cssText='margin-top:var(--s3);padding:var(--s3)';

          var gHead = API.el('div','row row--between');
          gHead.style.alignItems='baseline';
          var gTitle = API.el('div',null,'<span data-t="🎯 Heti cél">🎯 Heti cél</span>');
          gTitle.style.cssText='font-weight:800';
          var gNums = API.el('div',null, wPts + ' / ' + wTgt + ' <span data-t="pont">pont</span>');
          gNums.style.cssText='font-weight:800;color:var(--gold);font-size:14px;white-space:nowrap';
          gHead.append(gTitle, gNums);
          goal.append(gHead);

          // progress bar
          var bar = API.el('div',null,'');
          bar.style.cssText='height:10px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:var(--s2)';
          var fill = API.el('div',null,'');
          fill.style.cssText='height:100%;width:'+pct+'%;border-radius:6px;background:'+(reached?'var(--green,#4caf50)':'var(--orange,#E8711A)')+';transition:width .3s';
          bar.append(fill);
          goal.append(bar);

          // footer: reward + (reached state | time left)
          var footBits = [];
          footBits.push('🎁 <span data-t="Jutalom">Jutalom</span>: <strong>'+wReward+' <span data-t="érme">érme</span></strong>');
          if(reached){
            footBits.push('<strong style="color:var(--green,#4caf50)"><span data-t="Teljesítve a héten ✓">Teljesítve a héten ✓</span></strong>');
          } else if(wLeft!=null){
            footBits.push('⏳ <strong>'+API.esc(fmtWeekLeft(wLeft))+'</strong>');
          }
          var foot = API.el('div','muted', footBits.join(' &nbsp;·&nbsp; '));
          foot.style.cssText='font-size:13px;margin-top:var(--s2)';
          goal.append(foot);

          panel.append(goal);
        }
      }catch(_){}

      // meta line: your role + founded date
      const metaBits = [];
      if(myRole)  metaBits.push('🎖️ <span data-t="Szereped">Szereped</span>: <strong>'+API.esc(String(myRole))+'</strong>');
      if(founded) metaBits.push('📅 <span data-t="Alapítva">Alapítva</span>: <strong>'+API.esc(founded)+'</strong>');
      if(metaBits.length){
        const metaLine = API.el('div','muted', metaBits.join(' &nbsp;·&nbsp; '));
        metaLine.style.cssText='font-size:13px;margin-top:var(--s2)';
        panel.append(metaLine);
      }

      // member list (with contributions when present)
      const listHead = API.el('h3',null,'<span data-t="Klán-tagok">Klán-tagok</span> <span class="muted" style="font-weight:600;font-size:13px">('+memberCount+')</span>');
      listHead.style.marginTop='var(--s3)';
      panel.append(listHead);

      const listSec = API.el('div','section');
      listSec.style.marginTop='var(--s2)';
      if(!members.length){
        listSec.append(API.el('div','muted','<span data-t="Nincs adat">Nincs adat</span>'));
      } else {
        // sort by contribution desc when available (keep original order otherwise)
        const sorted = members.slice().sort(function(a,b){
          return ((pick(b,'points','contribution','contrib','score')|0)) - ((pick(a,'points','contribution','contrib','score')|0));
        });
        sorted.forEach(function(m){
          const card = API.card();
          card.classList.add('row','row--between');
          card.style.gap='var(--s3)';
          const isLeader = (m && (m.uid===leaderId));

          const left = API.el('div','row');
          left.style.cssText='gap:var(--s2);min-width:0;align-items:center';
          left.append(API.el('div',null, isLeader ? '👑' : '🐀'));
          const nameEl = API.el('div',null, API.esc((m&&m.name)||'—'));
          nameEl.style.cssText='font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          if(isLeader) nameEl.title = CA.t('👑 Vezető');
          left.append(nameEl);

          const contrib = pick(m,'points','contribution','contrib','score');
          const right = API.el('div',null, contrib!=null ? ('🏅 '+(contrib|0)) : '');
          right.style.cssText='font-weight:800;color:var(--gold);font-size:14px;flex:none;white-space:nowrap';
          if(contrib!=null) right.title = CA.t('Hozzájárulás');

          card.append(left, right);
          listSec.append(card);
        });
      }
      panel.append(listSec);

      // leave button
      const leaveErr = errLine();
      const leaveBtn = API.btn('<span data-t="Kilépés a klánból">Kilépés a klánból</span>','btn--danger btn--sm', function(){
        leaveBtn.disabled=true; leaveErr.textContent='';
        Promise.resolve()
          .then(function(){ return CA.Clans.leave(); })
          .then(function(r){
            leaveBtn.disabled=false;
            if(r && r.ok){ render(); }
            else { showErr(leaveErr, r && r.err); }
          })
          .catch(function(){ leaveBtn.disabled=false; showErr(leaveErr, null); });
      });
      leaveBtn.style.marginTop='var(--s3)';
      panel.append(leaveBtn, leaveErr);

      mount.append(panel);
      renderTop();            // always show top clans below
      API.applyI18n(mount);
    }

    // ---------- not in a clan: create + join ----------
    function renderNoClan(){
      mount.innerHTML='';

      // (a) create
      const createPanel = API.panel();
      createPanel.append(API.el('h3',null,'<span data-t="Klán létrehozása">Klán létrehozása</span>'));

      const nameField = API.field(CA.t('Klán neve'));
      nameField.input.maxLength = 24;
      nameField.input.placeholder = CA.t('Klán neve');

      const tagField = API.field(CA.t('Tag (rövid jel)'));
      tagField.input.maxLength = 4;
      tagField.input.placeholder = CA.t('Tag (rövid jel)');
      tagField.input.oninput = function(){ this.value = (this.value||'').toUpperCase(); };
      const tagHint = API.el('div','muted','<span data-t="2–4 betű/szám">2–4 betű/szám</span>');
      tagHint.style.fontSize='12px';
      tagField.append(tagHint);

      const createErr = errLine();
      const createBtn = API.btn('<span data-t="Létrehozás">Létrehozás</span>','btn--primary btn--sm', function(){
        const name = (nameField.input.value||'').trim();
        const tg   = (tagField.input.value||'').trim().toUpperCase();
        createErr.textContent='';
        if(name.length < 3 || name.length > 24){ showErr(createErr,'bad_name'); return; }
        if(!/^[A-Z0-9]{2,4}$/.test(tg)){ showErr(createErr,'bad_tag'); return; }
        createBtn.disabled=true;
        Promise.resolve()
          .then(function(){ return CA.Clans.create(name, tg); })
          .then(function(r){
            createBtn.disabled=false;
            if(r && r.ok){ render(); }
            else { showErr(createErr, r && r.err); }
          })
          .catch(function(){ createBtn.disabled=false; showErr(createErr, null); });
      });
      createBtn.style.marginTop='var(--s2)';
      createPanel.append(nameField, tagField, createBtn, createErr);

      // (b) join
      const joinPanel = API.panel();
      joinPanel.append(API.el('h3',null,'<span data-t="Csatlakozás klánhoz">Csatlakozás klánhoz</span>'));
      const joinField = API.field(CA.t('Tag (rövid jel)'));
      joinField.input.maxLength = 4;
      joinField.input.placeholder = CA.t('Add meg a klán tagját');
      joinField.input.oninput = function(){ this.value = (this.value||'').toUpperCase(); };
      const joinErr = errLine();
      const joinBtn = API.btn('<span data-t="Csatlakozás">Csatlakozás</span>','btn--primary btn--sm', function(){
        const tg = (joinField.input.value||'').trim().toUpperCase();
        joinErr.textContent='';
        if(!tg){ showErr(joinErr,'bad_tag'); return; }
        joinBtn.disabled=true;
        Promise.resolve()
          .then(function(){ return CA.Clans.join(tg); })
          .then(function(r){
            joinBtn.disabled=false;
            if(r && r.ok){ render(); }
            else { showErr(joinErr, r && r.err); }
          })
          .catch(function(){ joinBtn.disabled=false; showErr(joinErr, null); });
      });
      joinBtn.style.marginTop='var(--s2)';
      joinPanel.append(joinField, joinBtn, joinErr);

      mount.append(createPanel, joinPanel);
      renderTop();            // always show top clans below
      API.applyI18n(mount);
    }

    // ---------- top clans (always below) ----------
    function renderTop(){
      const panel = API.panel();
      const head = API.el('div','row row--between');
      head.append(API.el('h3',null,'<span data-t="🏆 Top klánok">🏆 Top klánok</span>'));
      const refresh = API.btn('<span data-t="🔄 Frissítés">🔄 Frissítés</span>','btn--ghost btn--sm', function(){ loadTop(listSec); });
      head.append(refresh);
      const listSec = API.el('div','section');
      listSec.style.marginTop='var(--s2)';
      listSec.append(API.el('div','muted','<span data-t="Betöltés…">Betöltés…</span>'));
      panel.append(head, listSec);
      mount.append(panel);
      loadTop(listSec);
    }

    function loadTop(listSec){
      Promise.resolve()
        .then(function(){ return CA.Clans.top(20); })
        .then(function(r){
          listSec.innerHTML='';
          const clans = (r && r.ok && Array.isArray(r.clans)) ? r.clans : null;
          if(!clans){ throw new Error('bad response'); }
          if(!clans.length){
            listSec.append(API.el('div','muted','<span data-t="Még nincs egy klán sem. Légy te az első!">Még nincs egy klán sem. Légy te az első!</span>'));
            API.applyI18n(listSec); return;
          }
          clans.forEach(function(c,i){
            const card = API.card();
            card.classList.add('row','row--between');
            card.style.gap='var(--s3)';

            const left = API.el('div','row');
            left.style.gap='var(--s3)'; left.style.minWidth='0'; left.style.alignItems='center';
            const badge = API.el('div',null, rankBadge(i));
            badge.style.cssText='font-weight:800;min-width:34px;text-align:center;font-size:'+(i<3?'20px':'15px')+';color:'+(i<3?'var(--gold)':'var(--ink-dim)');
            left.append(badge);

            const who = API.el('div',null,'');
            who.style.minWidth='0';
            const nm = API.el('div',null,'<span style="color:var(--orange,#E8711A);font-weight:800">['+API.esc(c.tag||'')+']</span> '+API.esc(c.name||'—'));
            nm.style.cssText='font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
            const meta = API.el('div','muted', String(c.memberCount|0)+' '+CA.t('tag'));
            who.append(nm, meta);
            left.append(who);

            const pts = API.el('div',null, String(c.points|0));
            pts.style.cssText='font-weight:800;color:var(--gold);font-size:18px;white-space:nowrap';

            card.append(left, pts);
            listSec.append(card);
          });
          API.applyI18n(listSec);
        })
        .catch(function(){
          listSec.innerHTML='';
          listSec.append(API.el('div','muted','<span data-t="Nincs kapcsolat">Nincs kapcsolat</span>'));
          const retry = API.btn('<span data-t="Újra">Újra</span>','btn--ghost btn--sm', function(){ loadTop(listSec); });
          retry.style.marginTop='var(--s2)';
          listSec.append(retry);
          API.applyI18n(listSec);
        });
    }

    // ---------- master render ----------
    function render(){
      if(!signedIn()){ renderSignedOut(); return; }

      // show cached clan instantly if we have it, else a loading state
      let cached = null;
      try{ cached = CA.Clans && CA.Clans.myClanCached ? CA.Clans.myClanCached() : null; }catch(_){}
      if(cached){ renderMine(cached); }
      else { renderStatus(API.el('div','muted','<span data-t="Betöltés…">Betöltés…</span>')); }

      Promise.resolve()
        .then(function(){ return CA.Clans.mine(true); })
        .then(function(clan){
          if(!signedIn()){ renderSignedOut(); return; }
          if(clan){ renderMine(clan); }
          else { renderNoClan(); }
        })
        .catch(function(){
          if(cached) return;            // keep the cached view if the refresh failed
          const wrap = API.el('div','section');
          wrap.append(API.el('div','muted','<span data-t="Nincs kapcsolat">Nincs kapcsolat</span>'));
          const retry = API.btn('<span data-t="Újra">Újra</span>','btn--ghost btn--sm', function(){ render(); });
          retry.style.marginTop='var(--s2)';
          wrap.append(retry);
          renderStatus(wrap);
        });
    }

    return { el:screen, onShow(){ try{ render(); }catch(_){} } };
  }

  if(window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('clan', build);
})();
