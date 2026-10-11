/* ============================================================================
 * Squeak & Destroy — ACHIEVEMENTS submenu screen (DOM).  id: 'achievements'
 * Reads CA.Meta fresh on every onShow() and rebuilds the body:
 *   Two tabs (seg control):
 *   - "Eredmények": "X / Y" unlocked header + achievement cards
 *       (done = green ✓ accent, locked = dim 🔒) from CA.Meta.achievementsState()
 *   - "Kihívások": rotating DAILY + WEEKLY challenges with progress bars and
 *       reward labels, grouped by period. Reads the active-challenge list
 *       defensively: CA.Meta.activeChallenges() -> CA.Meta.challenges().
 *       Each item: { id, label, desc, progress, goal, reward, period, done }.
 * Every CA.Meta access is guarded — methods may be absent or return undefined.
 * ==========================================================================*/
(function(){
  if (window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Eredmények':'Achievements',
    'feloldva':'unlocked',
    'Kihívások':'Challenges',
    'Nincs aktív kihívás.':'No active challenges.',
    'Kész':'Done',
    'Nincsenek eredmények.':'No achievements.',
    'Napi':'Daily',
    'Heti':'Weekly',
    'Egyéb':'Other',
    'Jutalom':'Reward',
    'Hamarosan':'Coming soon',
    'Minden eredmény egyszeri érme-jutalmat ad — old fel, és begyűjtöd!':
      'Each achievement grants a one-off coin reward — unlock it to collect!',
    'begyűjtve':'claimed',
    'érme':'coins',
    'Majdnem!':'Almost there!',
    'Ezek vannak a legközelebb a feloldáshoz — hajrá!':
      'These are closest to unlocking — go for it!',
    'kész':'done',
    'még':'still',
    'érme vár begyűjtésre':'coins left to collect',
  });

  let bodyEl = null;     // the .screen-scroll (may host the injected hub tab-strip)
  let contentEl = null;  // dedicated inner panel we render into / clear each pass
  let tab = 'ach';   // 'ach' | 'chal'

  function pct(a, b){
    a = (typeof a === 'number' && isFinite(a)) ? a : 0;
    b = (typeof b === 'number' && isFinite(b) && b > 0) ? b : 0;
    if (b <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((a / b) * 100)));
  }

  // shared progress-bar component (track + accent fill)
  function progressBar(API, percent, color){
    const track = API.el('div');
    track.style.cssText = 'background:rgba(255,255,255,.12);border-radius:var(--r-pill);height:10px;overflow:hidden;margin-top:var(--s2)';
    const fill = API.el('div');
    fill.style.cssText = 'background:'+(color||'var(--accent)')+';height:100%;width:'+pct(percent,100)+'%;transition:width .3s var(--ease)';
    track.appendChild(fill);
    return track;
  }

  // Defensive read of the active daily/weekly challenge list.
  // Contract: prefer CA.Meta.activeChallenges() then fall back to CA.Meta.challenges().
  // Each item: { id, label, desc, progress, goal, reward, period:'daily'|'weekly', done }.
  function readChallenges(Meta){
    if (!Meta) return [];
    let a = null;
    try { if (typeof Meta.activeChallenges === 'function') a = Meta.activeChallenges(); } catch(e){ a = null; }
    if (!Array.isArray(a)){
      try { if (typeof Meta.challenges === 'function') a = Meta.challenges(); } catch(e){ a = null; }
    }
    return Array.isArray(a) ? a : [];
  }

  // Tab switcher (seg control). Re-renders body on tab change.
  function tabBar(API){
    const seg = API.el('div','seg');
    [['Eredmények','ach'],['Kihívások','chal']].forEach(([nm,v])=>{
      const b = API.el('button', null, '<span data-t="'+API.esc(nm)+'">'+API.esc(API.t(nm))+'</span>');
      b.classList.toggle('sel', tab===v);
      b.onclick = ()=>{ if(tab!==v){ tab=v; render(API); } };
      seg.appendChild(b);
    });
    return seg;
  }

  // CA.Meta.achievementsState() exposes only {id,name,desc,reward,done} — no
  // per-achievement progress. But many achievements are STAT-driven against a
  // known threshold, and CA.Meta.stats() exposes those counters. We derive a
  // progress fraction (0..1) for those ids so the "Majdnem!" hook can surface
  // the ones closest to unlocking. Event-only achievements (no derivable
  // threshold) get progress=null and never appear in the "almost" section.
  function achProgress(Meta){
    let st = null;
    try { if (Meta && typeof Meta.stats === 'function') st = Meta.stats(); } catch(e){ st = null; }
    st = st || {};
    const games = (typeof st.matches === 'number') ? st.matches : 0;
    const wins  = (typeof st.wins === 'number') ? st.wins : 0;
    const kills = (typeof st.kills === 'number') ? st.kills : 0;
    const shots = (typeof st.shots === 'number') ? st.shots : 0;
    const hits  = (typeof st.hits === 'number') ? st.hits : 0;
    const lvl   = (typeof st.level === 'number') ? st.level : 1;
    const accFrac = shots > 0 ? (hits / shots) : 0;
    // ratio toward a count goal, clamped 0..1
    const r = (cur, goal)=> (goal > 0) ? Math.max(0, Math.min(1, cur / goal)) : 0;
    // accuracy achievements need BOTH a min-shots gate AND a hit-rate target;
    // progress = the lesser of the two sub-goals (whichever is further behind).
    const accGoal = (minShots, target)=> Math.min(r(shots, minShots), r(accFrac, target));
    // map: achievement id -> derived progress fraction (0..1).
    return {
      collector:  r(wins, 5),
      centurion:  r(kills, 100),
      marksman:   accGoal(20, 0.70),
      veteran:    r(games, 25),
      levelTen:   r(lvl, 10),
      warlord:    r(wins, 10),
      butcher:    r(kills, 250),
      champion:   r(wins, 25),
      eagleEye:   accGoal(50, 0.85),
      marathoner: r(games, 50),
      level20:    r(lvl, 20),
      thousand:   r(kills, 1000)
    };
  }

  function renderAchievements(API, Meta){
    let list = null;
    try { if (Meta && typeof Meta.achievementsState === 'function') list = Meta.achievementsState(); } catch(e){ list = null; }
    list = Array.isArray(list) ? list : [];
    const total = list.length;
    const done = list.reduce((n,a)=> n + (a && a.done ? 1 : 0), 0);

    // attach derived progress (0..1 or null) + a sort key to each entry.
    const progMap = achProgress(Meta);
    list = list.map(function(a){
      const id = a && a.id;
      const p = (id && typeof progMap[id] === 'number') ? progMap[id] : null;
      return { a:a, prog:p };
    });

    // ALMOST: locked achievements with derived progress in the 60–99% band —
    // the strongest conversion hook, surfaced at the top.
    const almost = list
      .filter(function(x){ return x.a && !x.a.done && typeof x.prog === 'number' && x.prog >= 0.60 && x.prog < 1; })
      .sort(function(a,b){ return b.prog - a.prog; });

    // total coins still locked behind un-done achievements (a "reward remaining" hint).
    let rewardLeft = 0;
    list.forEach(function(x){
      if (x.a && !x.a.done && typeof x.a.reward === 'number') rewardLeft += x.a.reward;
    });

    // SORT the main list: in-progress (closest first) → fresh-locked → done last.
    // done sinks to the bottom; among locked, higher derived progress floats up.
    list.sort(function(a,b){
      const ad = a.a && a.a.done ? 1 : 0, bd = b.a && b.a.done ? 1 : 0;
      if (ad !== bd) return ad - bd;            // not-done before done
      if (ad === 1) return 0;                   // both done: keep order
      const ap = (typeof a.prog === 'number') ? a.prog : -1;
      const bp = (typeof b.prog === 'number') ? b.prog : -1;
      return bp - ap;                           // both locked: higher progress first
    });

    const achPanel = API.panel();
    const head = API.el('div','row row--between');
    head.append(API.el('h3', null, '<span data-t="Eredmények">Eredmények</span>'));
    const count = API.el('div', null, done + ' / ' + total + ' ');
    count.style.cssText = 'font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums';
    const countTag = API.el('span','muted','<span data-t="feloldva">feloldva</span>');
    count.appendChild(countTag);
    head.append(count);
    achPanel.append(head);

    // short explainer: what unlocking gives you.
    const intro = API.el('div','muted',
      '<span data-t="Minden eredmény egyszeri érme-jutalmat ad — old fel, és begyűjtöd!">'+
      API.esc(API.t('Minden eredmény egyszeri érme-jutalmat ad — old fel, és begyűjtöd!'))+'</span>');
    intro.style.cssText = 'margin-top:var(--s1);font-size:.9em';
    achPanel.append(intro);

    // reward-remaining hint: how many coins are still locked behind achievements.
    if (rewardLeft > 0){
      const hint = API.el('div', null,
        '🪙 <span data-t="még">'+API.esc(API.t('még'))+'</span> '
        + '<strong>' + rewardLeft + '</strong> '
        + '<span data-t="érme vár begyűjtésre">'+API.esc(API.t('érme vár begyűjtésre'))+'</span>');
      hint.style.cssText = 'margin-top:var(--s1);font-size:.9em;font-weight:700;color:var(--gold)';
      achPanel.append(hint);
    }

    if (!total){
      achPanel.append(API.el('div','muted','<span data-t="Nincsenek eredmények.">Nincsenek eredmények.</span>'));
      contentEl.append(achPanel);
      return;
    }

    // "Majdnem!" — highlighted section of near-complete achievements at the top.
    if (almost.length){
      const box = API.el('div');
      box.style.cssText = 'margin-top:var(--s3);padding:var(--s3);border-radius:var(--r-card,12px);'
        + 'background:rgba(232,113,26,.10);border:1px solid var(--accent)';
      const h = API.el('div', null,
        '🔥 <span data-t="Majdnem!">'+API.esc(API.t('Majdnem!'))+'</span>');
      h.style.cssText = 'font-weight:800;color:var(--accent);font-size:1.05em';
      const sub = API.el('div','muted',
        '<span data-t="Ezek vannak a legközelebb a feloldáshoz — hajrá!">'+
        API.esc(API.t('Ezek vannak a legközelebb a feloldáshoz — hajrá!'))+'</span>');
      sub.style.cssText = 'font-size:.85em;margin-top:var(--s1)';
      box.append(h, sub);
      almost.forEach(function(x){ box.append(achievementCard(API, x.a, x.prog, true)); });
      achPanel.append(box);
    }

    // main (sorted) list: in-progress first, fully-done last.
    list.forEach(function(x){ achPanel.append(achievementCard(API, x.a, x.prog, false)); });
    contentEl.append(achPanel);
  }

  // One achievement card. `prog` = derived 0..1 fraction (or null). `highlight`
  // marks cards inside the "Majdnem!" box (shows the % progress bar prominently).
  function achievementCard(API, a, prog, highlight){
    const ok = !!(a && a.done);
    const c = API.card();
    c.style.cssText = ok ? 'border-color:var(--green)' : (highlight ? 'margin-top:var(--s2)' : 'opacity:.55');
    const top = API.el('div','row');
    top.style.gap = 'var(--s3)';
    const icon = API.el('div', null, ok ? '✓' : '🔒');
    icon.style.cssText = 'font-size:22px;flex:none;color:' + (ok ? 'var(--green)' : 'var(--ink-dim)');
    const txt = API.el('div');
    txt.style.flex = '1';
    const name = API.el('div', null, API.esc(API.t((a && a.name) || '')));
    name.style.cssText = 'font-weight:800;color:' + (ok ? 'var(--green)' : 'var(--ink)');
    const desc = API.el('div','muted', API.esc(API.t((a && a.desc) || '')));
    txt.append(name, desc);
    top.append(icon, txt);
    c.append(top);

    // progress bar + % for locked, stat-driven achievements.
    if (!ok && typeof prog === 'number' && prog > 0){
      const percent = Math.round(prog * 100);
      c.append(progressBar(API, percent, percent >= 60 ? 'var(--accent)' : 'var(--ink-dim)'));
      const pl = API.el('div','muted', percent + '% <span data-t="kész">'+API.esc(API.t('kész'))+'</span>');
      pl.style.cssText = 'margin-top:var(--s1);font-size:.8em;font-variant-numeric:tabular-nums';
      c.append(pl);
    }

    // reward badge: shows the coin payout + claimed/locked state.
    const reward = (a && typeof a.reward === 'number') ? a.reward : 0;
    if (reward > 0){
      const rw = API.el('div', ok ? null : 'muted',
        '🏅 +' + reward + ' <span data-t="érme">'+API.esc(API.t('érme'))+'</span>'
        + (ok ? ' · ✓ <span data-t="begyűjtve">'+API.esc(API.t('begyűjtve'))+'</span>' : ''));
      rw.style.cssText = 'margin-top:var(--s2);font-size:.85em;font-weight:700;color:'
        + (ok ? 'var(--gold)' : 'var(--ink-dim)');
      c.append(rw);
    }
    return c;
  }

  // One challenge card: label/desc + progress + reward label.
  function challengeCard(API, ch){
    const c = API.card();
    const top = API.el('div','row row--between');
    const label = (ch && (ch.label || ch.desc)) || '';
    const head = API.el('div', null, API.esc(API.t(label)));
    head.style.fontWeight = '800';
    top.append(head);

    const goal = (ch && typeof ch.goal === 'number') ? ch.goal : 0;
    const prog = (ch && typeof ch.progress === 'number') ? ch.progress : 0;
    const cdone = !!(ch && ch.done);
    const tag = API.el('div', cdone ? null : 'muted', cdone ? '✓ ' + API.t('Kész') : prog + ' / ' + goal);
    tag.style.cssText = cdone
      ? 'color:var(--green);font-weight:800;flex:none'
      : 'font-variant-numeric:tabular-nums;flex:none';
    top.append(tag);
    c.append(top);

    // optional sub-description when a separate label was used as the title
    if (ch && ch.label && ch.desc && ch.desc !== ch.label){
      const sub = API.el('div','muted', API.esc(API.t(ch.desc)));
      sub.style.marginTop = 'var(--s1)';
      c.append(sub);
    }

    c.append(progressBar(API, pct(prog, goal), cdone ? 'var(--green)' : 'var(--accent)'));

    // reward label (string or number → coins)
    if (ch && (ch.reward || ch.reward === 0)){
      const rw = API.el('div','muted',
        '🎁 <span data-t="Jutalom">'+API.esc(API.t('Jutalom'))+'</span>: '
        + API.esc(typeof ch.reward === 'number' ? (ch.reward + ' 🪙') : String(ch.reward)));
      rw.style.cssText = 'margin-top:var(--s2);font-size:.85em';
      c.append(rw);
    }
    return c;
  }

  function renderChallenges(API, Meta){
    const challenges = readChallenges(Meta);
    const chPanel = API.panel();
    chPanel.append(API.el('h3', null, '<span data-t="Kihívások">Kihívások</span>'));

    if (!challenges.length){
      // Graceful empty state — meta may not have rotated any challenges yet.
      chPanel.append(API.el('div','muted','<span data-t="Hamarosan">Hamarosan</span>'));
      contentEl.append(chPanel);
      return;
    }

    // Group by period: daily, weekly, other.
    const groups = [
      ['daily',  'Napi'],
      ['weekly', 'Heti'],
      ['other',  'Egyéb']
    ];
    const byPeriod = { daily:[], weekly:[], other:[] };
    challenges.forEach(ch=>{
      const p = (ch && ch.period) || 'other';
      (byPeriod[p] || byPeriod.other).push(ch);
    });

    let any = false;
    groups.forEach(([key,label])=>{
      const items = byPeriod[key];
      if (!items || !items.length) return;
      any = true;
      const h = API.el('h3', null, '<span data-t="'+label+'">'+API.esc(API.t(label))+'</span>');
      h.style.marginTop = 'var(--s3)';
      chPanel.append(h);
      items.forEach(ch=> chPanel.append(challengeCard(API, ch)));
    });

    // Fallback: items present but none matched a known period bucket header above.
    if (!any){
      challenges.forEach(ch=> chPanel.append(challengeCard(API, ch)));
    }
    contentEl.append(chPanel);
  }

  function render(API){
    // Render into the dedicated inner container, NOT the whole .screen-scroll —
    // bodyEl's first child may be the shared HUB tab-strip injected by menu.js
    // (~menu.js:863). Wiping bodyEl would remove it; clearing contentEl keeps it.
    if (!bodyEl) return;
    if (!contentEl){ contentEl = API.el('div'); bodyEl.appendChild(contentEl); }
    contentEl.innerHTML = '';

    const Meta = (window.CA && CA.Meta) || null;

    contentEl.append(tabBar(API));

    if (tab === 'chal') renderChallenges(API, Meta);
    else                renderAchievements(API, Meta);

    if (API.applyI18n) API.applyI18n(contentEl);
  }

  function build(API){
    const { screen, body } = API.screen('⭐','Eredmények');
    bodyEl = body;
    return { el:screen, onShow(){ render(API); } };
  }

  if (window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('achievements', build);
})();
