/* ============================================================================
 * Squeak & Destroy — menu-skilltree.js :: the 🌳 Képességfa (Skill Tree) screen.
 *
 * PER-CLASS shared progression (Jani: "kasztonként közös fa"). Instead of every
 * ANIMAL levelling its own tree, each HERO CLASS (Necromancer, Guardian, Mage,
 * Hunter, Engineer, Healer) has ONE shared tree: play with ANY animal of that
 * class → the class gains XP/levels → spend the class's points on its passive
 * tree. Every animal of that class benefits.
 *
 * Backend (CA.Meta, already present): classXP(id) · classLevel(id) ·
 *   classXpForLevel(l) · skillPoints(id) · skillRank(id,node) · upgradeSkill(id,node).
 * profile.classXP{} + profile.skillRanks{classId:{nodeId:rank}}.
 *
 * UI: a CLASS picker (chips) + the selected class's header (animal head, level,
 * XP bar, points) + its tree nodes (compact rows with rank pips + Upgrade/MAX).
 * Everything guarded; degrades gracefully if CA.Classes / CA.Meta are missing.
 * ==========================================================================*/
(function(){
  'use strict';

  if (window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Képességfa': 'Skill Tree',
    'Az osztályok még töltődnek…': 'Classes are still loading…',
    'Szint': 'Level',
    'Elérhető pont:': 'Available points:',
    'Rang:': 'Rank:',
    'Fejleszt ▸': 'Upgrade ▸',
    'MAX': 'MAX',
    'Tapasztalat': 'Experience',
    'pont': 'pts',
    'Válassz kasztot': 'Pick a class',
    'Pontok visszaállítása': 'Reset points',
    '↺ Pontok visszaállítása': '↺ Reset points',
    'Biztos? ↺': 'Sure? ↺',
    'Pontok visszaállítva': 'Points reset',
    'Nincs visszaállítható pont.': 'Nothing to reset.',
    'A visszaállítás hamarosan elérhető.': 'Reset coming soon.',
    'Következő szint:': 'Next rank:',
    'Összes elkölthető pont:': 'Total points to spend:',
    'Nincs elkölthető pont.': 'No points to spend.',
    'Nincs elérhető pont. Játssz ezzel a kaszttal, hogy szintet lépjen!':
      'No points available. Play this class to level it up!',
    'Minden KASZTNAK közös képességfája van: játssz a kaszttal → szintet lép → a pontokból passzív erősítést (sebzés, HP, mozgás…) oldasz fel. Minden ilyen kasztú állatra hat.':
      'Each CLASS shares one skill tree: play the class → it levels up → spend points on passive boosts (damage, HP, movement…). Every animal of that class benefits.'
  });

  var API = null;        // toolkit handed in by the framework
  var bodyEl = null;     // the scroll container we own + rebuild
  var selCls = null;     // currently selected class id

  /* ----------------------------------------------------------- data -------- */
  function classData(id){ return (CA.Classes && CA.Classes[id]) || null; }
  function classTree(cls){ var d = classData(cls); return (d && Array.isArray(d.tree)) ? d.tree : []; }
  function className(cls){ var d = classData(cls); return (d && d.name) || cls || '?'; }
  function classAnimal(cls){ var d = classData(cls); return (d && d.animal) || 'capybara'; }
  function classIds(){
    try { var l = CA.Classes && CA.Classes.list && CA.Classes.list();
      if (Array.isArray(l) && l.length) return l; } catch(e){}
    return ['necro','guardian','mage','hunter','engineer','healer'];
  }

  // safe CA.Meta accessors — any missing method just yields a sane default.
  function M(){ return CA.Meta || null; }
  function num(fn){ try { var v = fn(); return (typeof v === 'number' && isFinite(v)) ? v : 0; } catch(e){ return 0; } }
  function classXPv(id){ var m=M(); return m && m.classXP ? num(function(){ return m.classXP(id); }) : 0; }
  function classLevelv(id){ var m=M(); return m && m.classLevel ? Math.max(1, num(function(){ return m.classLevel(id); })) : 1; }
  function classPointsv(id){ var m=M(); return m && m.skillPoints ? num(function(){ return m.skillPoints(id); }) : 0; }
  function classRankv(id, nid){ var m=M(); return m && m.skillRank ? num(function(){ return m.skillRank(id, nid); }) : 0; }
  function xpForLevel(l){ var m=M(); return (m && m.classXpForLevel) ? num(function(){ return m.classXpForLevel(l); }) : 0; }
  function upgradeClass(id, nid){ var m=M(); if (!m || !m.upgradeSkill) return false; try { return !!m.upgradeSkill(id, nid); } catch(e){ return false; } }

  // total UNSPENT skill points across ALL classes (for the top summary badge).
  function totalUnspent(ids){
    var sum = 0;
    (ids||classIds()).forEach(function(id){ sum += classPointsv(id); });
    return sum;
  }

  // points already SPENT on a class (sum of its node ranks) — used to know if a
  // respec is even meaningful, and how many points come back.
  function classSpentv(id){
    var n = 0;
    classTree(id).forEach(function(node){ if (node && node.id) n += classRankv(id, node.id); });
    return n;
  }

  // RESPEC support probe. CA.Meta has NO respec/refund method (as of this build),
  // so we feature-detect known names and fall back to clearing the class's stored
  // ranks directly — points are derived as (earned − spent), so zeroing the ranks
  // auto-refunds every spent point. If we can't safely do either, the caller shows
  // "hamarosan" instead of breaking. Returns true on success.
  function respecAvailable(){
    var m = M();
    if (!m) return false;
    if (typeof m.respecClass === 'function') return true;
    if (typeof m.resetSkills === 'function') return true;
    if (typeof m.respec === 'function') return true;
    // direct-clear fallback only if the profile shape we rely on is present.
    if (m.profile && typeof m.save === 'function') return true;
    return false;
  }
  function respecClass(id){
    var m = M();
    if (!m) return false;
    try {
      if (typeof m.respecClass === 'function') return !!m.respecClass(id);
      if (typeof m.resetSkills === 'function') return !!m.resetSkills(id);
      if (typeof m.respec === 'function') return !!m.respec(id);
      // fallback: clear this class's stored node ranks → spent drops to 0 →
      // skillPoints() (earned − spent) returns every point. Then persist.
      if (m.profile && typeof m.save === 'function'){
        var sr = m.profile.skillRanks;
        if (sr && sr[id]) delete sr[id];
        m.save();
        try { CA.events.emit('skillRespec', id); } catch(e){}
        return true;
      }
    } catch(e){}
    return false;
  }

  // "+X% → +Y%" preview of what the NEXT rank grants, IF the node exposes machine-
  // readable per-rank values. classes.js nodes only carry an apply(unit,rank) fn
  // today (no value data), so this is best-effort: we look for common value fields
  // (val/perRank/step/values/inc + an optional %/unit) and render cur → next. When
  // nothing usable is present we return '' and the caller falls back to the rank
  // delta (rank/max → rank+1/max). Never throws — purely decorative.
  function nextRankPreview(node, rank, max){
    try {
      if (!node || rank >= max) return '';
      var suffix = (node.unit != null) ? String(node.unit) : (node.pct ? '%' : '');
      // explicit per-rank array: values[0]=rank1 total, values[1]=rank2 total, …
      if (Array.isArray(node.values) && node.values.length){
        var cv = (rank > 0 && rank <= node.values.length) ? node.values[rank-1] : 0;
        var nvIdx = rank; // next rank's index
        if (nvIdx < node.values.length){
          return '+' + cv + suffix + ' → +' + node.values[nvIdx] + suffix;
        }
        return '';
      }
      // linear step: per-rank increment (val/perRank/step/inc). total = step*rank.
      var step = [node.val, node.perRank, node.step, node.inc].filter(function(v){
        return typeof v === 'number' && isFinite(v);
      })[0];
      if (typeof step === 'number'){
        var curTotal = step * rank;
        var nextTotal = step * (rank + 1);
        return '+' + curTotal + suffix + ' → +' + nextTotal + suffix;
      }
    } catch(e){}
    return '';
  }

  // "●●○○" rank pips for a node.
  function pips(rank, max){ var s=''; for (var i=0;i<max;i++) s += (i<rank) ? '●' : '○'; return s; }

  // a 64×64 ANIMATED head for a class (its signature animal), via renderPortrait.
  function classPortrait(cls){
    var cv = API.el('canvas'); cv.width = 64; cv.height = 64;
    cv.style.cssText = 'width:64px;height:64px;flex:0 0 auto;';
    PortraitAnim.register(cv, {
      species: function(){ return classAnimal(cls); },
      cls:     function(){ return cls; },
      cosmetic:function(){ return null; },
      captain: function(){ return false; },
      color:   function(){ return null; }
    });
    return cv;
  }

  // ---- shared portrait ANIMATOR (unchanged): one rAF loop re-renders every
  // mounted portrait canvas with a subtle idle bob/sway; torn down on hide. ----
  function makePortraitAnimator(){
    var entries = [], raf = 0, t0 = nowMs();
    function reducedMotion(){
      if (CA.settings && CA.settings.reducedMotion) return true;
      try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch(e){}
      return false;
    }
    function visible(cv){ return cv && cv.isConnected !== false && cv.offsetParent !== null; }
    function drawOne(e, time, phase, reduced){
      var cv = e.canvas, ctx = cv.getContext && cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height);
      if (!reduced){
        var cx = cv.width/2, cy = cv.height/2, tt = time*2.0 + phase;
        var bob = Math.sin(tt)*(cv.height*0.022), sway = Math.sin(tt*0.5+phase)*0.015, pulse = 1+Math.sin(tt)*0.012;
        ctx.translate(cx, cy+bob); ctx.scale(pulse,pulse); ctx.translate(-cx+sway*cv.width, -cy);
      }
      try {
        var fn = CA.Entities && CA.Entities.renderPortrait;
        if (typeof fn === 'function') fn(cv, { species:e.spec.species(), cls:e.spec.cls(), cosmetic:e.spec.cosmetic(), captain:e.spec.captain(), color:e.spec.color() });
      } catch(err){}
      ctx.setTransform(1,0,0,1,0,0);
    }
    function frame(){
      raf = 0; var reduced = reducedMotion(), time = (nowMs()-t0)/1000, kept = [];
      for (var i=0;i<entries.length;i++){ if (entries[i].canvas.isConnected === false) continue; kept.push(entries[i]); }
      entries = kept;
      for (var j=0;j<entries.length;j++){ if (!visible(entries[j].canvas)) continue; drawOne(entries[j], time, (j%7)*0.9, reduced); }
      if (entries.length && !reduced) raf = requestAnimationFrame(frame);
    }
    return {
      register: function(canvas, spec){
        if (!canvas) return;
        var found = null;
        for (var i=0;i<entries.length;i++){ if (entries[i].canvas===canvas){ found=entries[i]; break; } }
        if (found) found.spec = spec; else entries.push({ canvas:canvas, spec:spec });
        var reduced = reducedMotion(), idx = found ? entries.indexOf(found) : (entries.length-1);
        drawOne(entries[idx], (nowMs()-t0)/1000, (idx%7)*0.9, reduced);
        if (!reduced && !raf) raf = requestAnimationFrame(frame);
      },
      clear: function(){ entries = []; },
      stop: function(){ if (raf){ cancelAnimationFrame(raf); raf=0; } entries = []; }
    };
  }
  function nowMs(){ return (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now(); }
  var PortraitAnim = makePortraitAnimator();

  /* ------------------------------------------------ total spendable badge --- */
  // Summary at the very top: how many UNSPENT skill points the player has ACROSS
  // every class, so they don't have to click each class to hunt for points.
  function renderTotalBadge(ids){
    var el = API.el, esc = API.esc;
    var total = totalUnspent(ids);
    var sec = el('div', 'section');
    var card = el('div', 'card');
    card.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:var(--s2);padding:var(--s2) var(--s3);' +
      (total > 0 ? 'box-shadow:0 0 0 1px var(--green) inset;' : '');
    card.append(el('div', null,
      '🌳 <span data-t="Összes elkölthető pont:">' + API.t('Összes elkölthető pont:') + '</span>'));
    if (total > 0){
      card.append(el('div', null,
        '<strong style="color:var(--green);font-size:20px">' + total + '</strong> ' +
        '<span class="muted" data-t="pont">' + API.t('pont') + '</span>'));
    } else {
      card.append(el('div', 'muted',
        '<span data-t="Nincs elkölthető pont.">' + API.t('Nincs elkölthető pont.') + '</span>'));
    }
    sec.append(card);
    bodyEl.append(sec);
  }

  /* ----------------------------------------------------------- class chips -- */
  function renderClassChips(ids){
    var el = API.el, esc = API.esc, t = API.t;
    var sec = el('div', 'section');
    sec.append(el('div', 'muted', '<span data-t="Válassz kasztot">' + t('Válassz kasztot') + '</span>'));
    var chips = el('div', 'chips');
    ids.forEach(function(id){
      var d = classData(id);
      var emoji = (d && d.emoji) ? d.emoji : '🌳';
      var pts = classPointsv(id);
      var dot = pts > 0 ? ' <span style="color:var(--green);font-weight:800">+'+pts+'</span>' : '';
      var label = esc(emoji) + ' <span>' + esc(API.t(className(id))) + '</span>' + dot;
      var c = API.chip(label, id === selCls, function(){ selCls = id; render(); });
      chips.appendChild(c);
    });
    sec.append(chips);
    bodyEl.append(sec);
  }

  /* ----------------------------------------------------------- tree -------- */
  function renderTree(cls){
    var el = API.el, esc = API.esc;
    var lvl = classLevelv(cls), xp = classXPv(cls), pts = classPointsv(cls);
    var nextXp = xpForLevel(lvl + 1), curXp = xpForLevel(lvl);
    var span = Math.max(1, nextXp - curXp);
    var frac = nextXp > 0 ? Math.max(0, Math.min(1, (xp - curXp) / span)) : 1;

    /* header card: animal head + class name + level + XP bar + points */
    var head = el('div', 'card section');
    var hd = el('div', 'row row--between');
    var idTitle = el('div', 'row', ''); idTitle.style.gap = 'var(--s2)';
    idTitle.append(classPortrait(cls));
    idTitle.append(el('div', null, '<strong style="font-size:18px">' + esc(API.t(className(cls))) + '</strong>'));
    hd.append(idTitle);
    hd.append(el('div', null,
      '<span class="muted" data-t="Szint">' + API.t('Szint') + '</span> ' +
      '<strong style="color:var(--gold);font-size:18px">' + lvl + '</strong>'));
    head.append(hd);

    var xpWrap = el('div', 'section');
    var xpTop = el('div', 'row row--between');
    xpTop.append(el('span', 'muted', '<span data-t="Tapasztalat">' + API.t('Tapasztalat') + '</span>'));
    xpTop.append(el('span', 'muted', nextXp > 0 ? (Math.round(xp) + ' / ' + nextXp + ' XP') : (Math.round(xp) + ' XP')));
    var track = el('div', null, '');
    track.style.cssText = 'width:100%;height:10px;border-radius:var(--r-pill);background:rgba(255,255,255,.12);overflow:hidden;';
    var fill = el('div', null, '');
    fill.style.cssText = 'height:100%;width:' + Math.round(frac*100) + '%;border-radius:var(--r-pill);background:linear-gradient(90deg,var(--accent),var(--gold));transition:width .25s var(--ease);';
    track.append(fill); xpWrap.append(xpTop, track); head.append(xpWrap);

    var ptLine = el('div', 'row');
    ptLine.append(el('span', null,
      '<span data-t="Elérhető pont:">' + API.t('Elérhető pont:') + '</span> ' +
      '<strong style="color:' + (pts > 0 ? 'var(--green)' : 'var(--ink-dim)') + ';font-size:17px">' + pts + '</strong>'));
    head.append(ptLine);

    // ---- RESPEC / reset: refund every spent point on THIS class. Free (no coin
    // cost) — gated only by "has anything been spent". 2-step inline confirm so a
    // mis-tap can't wipe a fully-built tree. If no respec path exists, we DON'T
    // break: the button shows "hamarosan" and does nothing.
    var spent = classSpentv(cls);
    var canRespec = respecAvailable();
    var respecRow = el('div', 'row'); respecRow.style.marginTop = 'var(--s2)';
    (function(){
      var rB = API.btn('<span data-t="↺ Pontok visszaállítása">' + API.t('↺ Pontok visszaállítása') + '</span>',
        'btn--ghost btn--sm', null);
      rB.style.flex = '0 0 auto';
      if (spent <= 0) rB.disabled = true;     // nothing to reset
      var armed = false, timer = null;
      function disarm(){
        armed = false; if (timer){ clearTimeout(timer); timer = null; }
        rB.classList.remove('btn--red');
        rB.innerHTML = '<span data-t="↺ Pontok visszaállítása">' + API.t('↺ Pontok visszaállítása') + '</span>';
      }
      rB.onclick = function(){
        if (spent <= 0){
          try { CA.events.emit('toast', API.t('Nincs visszaállítható pont.')); } catch(e){}
          return;
        }
        if (!canRespec){
          // guard: no API + no safe fallback → tell the player, don't break.
          try { CA.events.emit('toast', API.t('A visszaállítás hamarosan elérhető.')); } catch(e){}
          return;
        }
        if (!armed){
          armed = true;
          rB.classList.add('btn--red');
          rB.innerHTML = '<span data-t="Biztos? ↺">' + API.t('Biztos? ↺') + '</span>';
          timer = setTimeout(disarm, 4000);
          return;
        }
        if (timer){ clearTimeout(timer); timer = null; }
        if (respecClass(cls)){
          try { CA.events.emit('toast', API.t('Pontok visszaállítva')); } catch(e){}
        } else {
          try { CA.events.emit('toast', API.t('A visszaállítás hamarosan elérhető.')); } catch(e){}
        }
        render();
      };
      respecRow.append(rB);
    })();
    head.append(respecRow);

    bodyEl.append(head);

    if (pts <= 0){
      var hint = el('div', 'muted'); hint.style.cssText = 'text-align:center;padding:0 var(--s2)';
      hint.innerHTML = '<span data-t="Nincs elérhető pont. Játssz ezzel a kaszttal, hogy szintet lépjen!">' +
        API.t('Nincs elérhető pont. Játssz ezzel a kaszttal, hogy szintet lépjen!') + '</span>';
      bodyEl.append(hint);
    }

    var tree = classTree(cls);
    if (!tree.length){
      var empty = el('div', 'panel section');
      empty.append(el('div', 'muted', '<span data-t="Az osztályok még töltődnek…">' + API.t('Az osztályok még töltődnek…') + '</span>'));
      bodyEl.append(empty);
      return;
    }

    // compact node rows: name + small desc + rank pips on the left, Upgrade/MAX right.
    tree.forEach(function(node){
      if (!node || !node.id) return;
      var max = (typeof node.max === 'number' && node.max > 0) ? node.max : 1;
      var rank = Math.min(max, classRankv(cls, node.id));
      var maxed = rank >= max;

      // "Következő szint: …" preview — concrete per-rank delta if the node exposes
      // value data, else the rank progression (rank/max → rank+1/max).
      var nextLine = '';
      if (rank < max){
        var prev = nextRankPreview(node, rank, max);
        var detail = prev ? esc(prev) : (rank + '/' + max + ' → ' + (rank + 1) + '/' + max);
        nextLine = '<div class="muted" style="font-size:11px;margin-top:2px">' +
          '<span data-t="Következő szint:">' + API.t('Következő szint:') + '</span> ' +
          '<span style="color:var(--gold)">' + detail + '</span></div>';
      }

      var card = el('div', 'card'); card.style.cssText = 'padding:var(--s2);margin-top:var(--s2)';
      var row = el('div', 'row row--between'); row.style.alignItems = 'center';
      row.append(el('div', null,
        '<strong style="font-size:15px">' + esc(API.t(node.name || node.id)) + '</strong>' +
        (node.desc ? '<div class="muted" style="font-size:12px">' + esc(API.t(node.desc)) + '</div>' : '') +
        '<div style="letter-spacing:2px;color:var(--accent);font-size:13px;margin-top:2px">' +
          pips(rank, max) + ' <span class="muted" style="font-size:11px">' + rank + '/' + max + '</span></div>' +
        nextLine));

      if (maxed){
        var badge = el('span', null, '<span data-t="MAX">' + API.t('MAX') + '</span>');
        badge.style.cssText = 'flex:0 0 auto;font-weight:800;font-size:12px;letter-spacing:1px;color:#3a2a08;background:var(--gold);padding:5px 10px;border-radius:var(--r1);';
        row.append(badge);
      } else {
        var btn = API.btn('<span data-t="Fejleszt ▸">' + API.t('Fejleszt ▸') + '</span>', 'btn--gold btn--sm', function(){
          if (upgradeClass(cls, node.id)) render();
        });
        btn.style.flex = '0 0 auto';
        if (pts <= 0) btn.disabled = true;
        row.append(btn);
      }
      card.append(row);
      bodyEl.append(card);
    });
  }

  /* ------------------------------------------------------------ render ----- */
  function render(){
    if (!bodyEl) return;
    PortraitAnim.clear();
    bodyEl.innerHTML = '';

    try {
      var ic = API.infoCard && API.infoCard('skilltree_v2',
        API.t('Minden KASZTNAK közös képességfája van: játssz a kaszttal → szintet lép → a pontokból passzív erősítést (sebzés, HP, mozgás…) oldasz fel. Minden ilyen kasztú állatra hat.'));
      if (ic) bodyEl.appendChild(ic);
    } catch(e){}

    var ids = classIds();
    if (!ids.length){
      bodyEl.append(API.el('div', 'panel section muted', '<span data-t="Az osztályok még töltődnek…">' + API.t('Az osztályok még töltődnek…') + '</span>'));
      if (API.applyI18n) API.applyI18n(bodyEl);
      return;
    }
    if (!selCls || ids.indexOf(selCls) < 0) selCls = ids[0];

    renderTotalBadge(ids);
    renderClassChips(ids);
    renderTree(selCls);

    if (API.applyI18n) API.applyI18n(bodyEl);
  }

  /* ------------------------------------------------------------ build ------ */
  function build(api){
    API = api;
    var s = API.screen('🌳', 'Képességfa');
    bodyEl = s.body;
    return {
      el: s.screen,
      onShow: function(){ render(); },
      onHide: function(){ PortraitAnim.stop(); }
    };
  }

  if (window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('skilltree', build);
})();
