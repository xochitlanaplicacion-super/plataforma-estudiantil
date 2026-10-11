/* ============================================================================
 * Squeak & Destroy — menu-daily.js :: the "Napi pörgetés / Daily Spin" screen.
 * A REAL fortune wheel (canvas) that replaces the old always-win daily reward.
 * One spin per local calendar day; you do NOT always win — a 0-coin MISS is
 * possible, which makes it exciting & fair. Registered via
 * CA.Menu.register('daily', build)  (the home nav button still points here).
 *
 * Logic lives in CA.Meta: dailySpinState() (pure read) + dailySpin() (grant).
 * This file is the DOM/canvas presentation + animation only. Never throws.
 * ==========================================================================*/
(function(){
  'use strict';
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Napi pörgetés':'Daily Spin', 'Pörgetés':'Daily spin',
    'Pörgesd meg a szerencsekereket naponta egyszer!':'Spin the fortune wheel once a day!',
    'Nem mindig nyersz — ettől izgalmas! 🍀':'You don’t always win — that’s the fun! 🍀',
    '🎡 Pörgetés!':'🎡 Spin!',
    'Pörgetés…':'Spinning…',
    'Ma már pörgettél':'Already spun today',
    'Következő pörgetés:':'Next spin:',
    'napos sorozat':'day streak',
    'Egyenleg':'Balance',
    'érme':'coins',
    '+': '+',
    'érme!':'coins!',
    '🎁 Új kinézet!':'🎁 New look!',
    'Ma lepörgött — holnap újra! 😿':'No luck today — come back tomorrow! 😿',
    'A pörgetés most nem elérhető.':'Spinning is not available right now.',
    'Lepörgött 😿':'No luck 😿',
    '+15 érme':'+15 coins','+30 érme':'+30 coins','+60 érme':'+60 coins',
    '+120 érme':'+120 coins','+250 érme':'+250 coins','🎁 Új kinézet':'🎁 New look',
    // 7-day streak calendar + loss consolation
    '7 napos sorozat':'7-day streak',
    '7. nap: bónusz láda! 🎁':'Day 7: bonus chest! 🎁',
    'Vigaszdíj: +5 érme 🪙':'Consolation: +5 coins 🪙',
    'Ma lepörgött 😿 — de itt egy vigaszdíj!':'No luck today 😿 — but here is a consolation!',
    // day-7 milestone bonus celebration (granted live by CA.Meta)
    '🎉 7 NAPOS SOROZAT! Bónusz láda + ':'🎉 7-DAY STREAK! Bonus chest + ',
    // rewarded-ad re-spin (only shown when a portal ad SDK is present)
    '📺 Nézz egy reklámot egy újrapörgetésért':'📺 Watch an ad for a re-spin',
    'Reklám betöltése…':'Loading ad…',
    'Ma már használtad az újrapörgetést 📺':'You already used your ad re-spin today 📺',
    // shareable daily result card + "challenge me" deep-link (virality)
    '📤 Oszd meg az eredményed':'📤 Share your result',
    '⚔️ Hívd ki a haverod':'⚔️ Challenge a friend',
    'Mai mag':'Today’s seed',
    'Pörgesd meg te is! ':'Spin it yourself! '
  });

  // Day-7 of the login/spin streak grants a BONUS CHEST. This mirrors
  // CA.Meta's DAILY_REWARDS table (day 7 = { coins:200, chest:true }); keep in
  // sync if that table changes. Used only for the streak-calendar display.
  var STREAK_DAY7_CHEST = true;
  // Tiny UI-side consolation when a spin lands on a 0-coin MISS, to soften the
  // total-zero outcome (kept small to preserve fairness). Granted via
  // CA.Meta.addCoins only if that exists (guarded below).
  var MISS_CONSOLATION = 5;

  // brand palette + per-slice fills (orange / brown / gold family, cute-spooky)
  var SLICE_COLORS = [
    '#3D2800', // miss — dark brown (the "you lose" slice)
    '#E8711A', // orange
    '#C85A12', // deep orange
    '#F2A24B', // light amber
    '#E8711A', // orange
    '#FFD24A', // gold (rare big coin)
    '#7A4FB0'  // purple (rare cosmetic)
  ];
  var GOLD   = '#FFD24A';
  var BROWN  = '#3D2800';
  var ORANGE = '#E8711A';
  var TAU = Math.PI * 2;

  function build(API){
    var el = API.el, t = API.t;
    var s = API.screen('🎡', 'Napi pörgetés');
    var body = s.body;

    var panel = API.panel();
    panel.style.maxWidth = '480px';
    panel.style.margin = '0 auto';
    body.append(panel);

    function meta(){ return CA.Meta; }

    // --- animation / interval state (cleaned up on hide) ---
    var canvas = null, ctx = null, segments = [];
    var curRot = 0;          // current wheel rotation (radians), persists between renders
    var spinning = false;
    var rafId = 0;
    var tickTimer = 0;       // setInterval id for the countdown
    var lastTickSfx = 0;     // throttle the spin "tick" sfx

    var SIZE = 280;          // canvas px (square)

    function clearTimers(){
      if (rafId){ try { cancelAnimationFrame(rafId); } catch(e){} rafId = 0; }
      if (tickTimer){ try { clearInterval(tickTimer); } catch(e){} tickTimer = 0; }
    }

    // pretty short label drawn inside a slice
    function sliceLabel(seg){
      if (!seg) return '';
      if (seg.cosmetic) return '🎁';
      if (seg.miss || !seg.coins) return '😿';
      return '+' + seg.coins;
    }

    // draw the whole wheel at rotation `rot` (radians).
    function drawWheel(rot){
      if (!ctx) return;
      var n = segments.length;
      if (!n) return;
      var cx = SIZE/2, cy = SIZE/2, R = SIZE/2 - 8;
      var seg = TAU / n;
      ctx.clearRect(0,0,SIZE,SIZE);

      // slices
      for (var i=0;i<n;i++){
        var a0 = rot + i*seg, a1 = a0 + seg;
        ctx.beginPath();
        ctx.moveTo(cx,cy);
        ctx.arc(cx,cy,R,a0,a1);
        ctx.closePath();
        ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length];
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.stroke();

        // label
        var mid = a0 + seg/2;
        ctx.save();
        ctx.translate(cx,cy);
        ctx.rotate(mid);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        var sg = segments[i];
        var isLight = (SLICE_COLORS[i % SLICE_COLORS.length] === GOLD
                    || SLICE_COLORS[i % SLICE_COLORS.length] === '#F2A24B');
        ctx.fillStyle = isLight ? BROWN : '#FFF6E8';
        ctx.font = '700 ' + (sg && sg.cosmetic ? 18 : 16) + 'px system-ui, sans-serif';
        try { ctx.fillText(sliceLabel(sg), R - 12, 0); } catch(e){}
        ctx.restore();
      }

      // outer rim
      ctx.beginPath();
      ctx.arc(cx,cy,R,0,TAU);
      ctx.lineWidth = 5;
      ctx.strokeStyle = GOLD;
      ctx.stroke();

      // center hub
      ctx.beginPath();
      ctx.arc(cx,cy,24,0,TAU);
      ctx.fillStyle = BROWN;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = GOLD;
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      try { ctx.fillText('🐭', cx, cy+1); } catch(e){}
    }

    // rotation that places slice `index`'s CENTER under the pointer (top, -90°).
    // Slice i spans [rot + i*seg, rot + (i+1)*seg]; its center is rot+(i+.5)*seg.
    // We want that center at angle -PI/2 (12 o'clock). Add `turns` full spins.
    function rotationForIndex(index, turns){
      var n = segments.length || 1;
      var seg = TAU / n;
      var target = -Math.PI/2 - (index + 0.5) * seg;
      // normalize into [0,TAU) then add whole turns for the spin animation
      var base = ((target % TAU) + TAU) % TAU;
      return base + (turns||0) * TAU;
    }

    function emitSfx(name){ try { if (CA.events) CA.events.emit('sfx', name); } catch(e){} }

    function fmtCountdown(ms){
      ms = Math.max(0, ms|0);
      var s = Math.floor(ms/1000);
      var h = Math.floor(s/3600); s -= h*3600;
      var m = Math.floor(s/60);   s -= m*60;
      function p(x){ return (x<10?'0':'') + x; }
      return p(h)+':'+p(m)+':'+p(s);
    }

    // celebratory suffix when this spin ALSO triggered the live day-7 streak bonus
    // (CA.Meta.dailySpin() attaches result.streakBonus = { streak, coins, chest }).
    function streakBonusText(r){
      if (!r || !r.streakBonus || !r.streakBonus.coins) return '';
      return '  ' + t('🎉 7 NAPOS SOROZAT! Bónusz láda + ') + r.streakBonus.coins + ' 🪙';
    }

    // result text for a finished spin result {coins,cosmetic,miss,streakBonus}
    function resultText(r){
      if (!r) return '';
      var bonus = streakBonusText(r);
      if (r.cosmetic) return t('🎁 Új kinézet!') + bonus;
      if (r.coins > 0) return '+' + r.coins + ' ' + t('érme!') + bonus;
      // a miss — show the consolation if one was granted, else the plain message.
      if (r.consolation > 0) return t('Ma lepörgött 😿 — de itt egy vigaszdíj!') + ' +' + r.consolation + ' 🪙' + bonus;
      return t('Ma lepörgött — holnap újra! 😿') + bonus;
    }

    // portal ad SDK present? (false on plain web/PWA → no ad button at all)
    function portalActive(){
      try { return !!(CA.Portal && typeof CA.Portal.active === 'function' && CA.Portal.active()); }
      catch(e){ return false; }
    }

    // brief toast via CA.events (the codebase's canonical toast channel).
    function toast(text){ try { if (CA.events && CA.events.emit) CA.events.emit('toast', String(text||'')); } catch(e){} }

    // today's daily seed (for the result card + the "challenge me" deep-link).
    function todaySeed(){
      try { if (CA.Challenge && typeof CA.Challenge.dailySeed === 'function') return CA.Challenge.dailySeed(); } catch(e){}
      return null;
    }

    // ONE-TAP shareable spin result. Reuses CA.Share's brag-card/clip when present
    // (a richer image the player can post); otherwise shares a "challenge me"
    // deep-link (the existing ?duel= link, seeded with today's daily). Fully
    // guarded — never throws; if everything is missing it quietly does nothing.
    function shareSpinResult(st){
      var seed = todaySeed();
      var msg = (CA.t ? CA.t('Pörgesd meg te is! ') : 'Pörgesd meg te is! ');
      // Path A: a designed brag card / clip (CA.Share). It already watermarks +
      // embeds the challenge-me deep-link (see share.js), so this is one tap.
      try {
        if (CA.Share){
          if (typeof CA.Share.shareClip === 'function'){ CA.Share.shareClip(); return; }
          if (typeof CA.Share.bragCard === 'function'){ CA.Share.bragCard(); return; }
        }
      } catch(e){}
      // Path B: share the "challenge me" deep-link via CA.Challenge (navigator.share
      // → portal invite → clipboard+toast, all guarded inside challenge.js).
      try {
        if (CA.Challenge && typeof CA.Challenge.shareUrl === 'function'){
          var url = (typeof CA.Challenge.dailyShareUrl === 'function') ? CA.Challenge.dailyShareUrl() : '';
          if (url){ CA.Challenge.shareUrl(url, { text: msg + (seed != null ? ('#' + seed) : '') }); return; }
        }
      } catch(e){}
      toast(t('A pörgetés most nem elérhető.'));
    }

    // Append the share affordance (a brand-orange button + a small "challenge me"
    // deep-link button) under the result. Shown only AFTER today's spin is used.
    function appendShareCard(st){
      try {
        var card = el('div','card');
        card.style.cssText = 'margin-top:var(--s3);padding:var(--s3);text-align:center';
        var seed = todaySeed();
        if (seed != null){
          card.append(el('div','muted','<div style="font-size:12px">'
            + '<span data-t="Mai mag">Mai mag</span>: <strong style="color:' + GOLD + '">#' + seed + '</strong></div>'));
        }
        var shareBtn = API.btn('<span data-t="📤 Oszd meg az eredményed">📤 Oszd meg az eredményed</span>',
          'btn--block', function(){ shareSpinResult(st); });
        shareBtn.style.marginTop = 'var(--s2)';
        // brand-orange to match the app's primary accent.
        shareBtn.style.background = ORANGE; shareBtn.style.color = '#fff';
        card.append(shareBtn);
        // a secondary "challenge me" deep-link share (always a referral link).
        if (CA.Challenge && typeof CA.Challenge.shareUrl === 'function'){
          var chBtn = API.btn('<span data-t="⚔️ Hívd ki a haverod">⚔️ Hívd ki a haverod</span>',
            'btn--ghost btn--block', function(){
              try {
                var url = (typeof CA.Challenge.dailyShareUrl === 'function') ? CA.Challenge.dailyShareUrl() : '';
                if (url) CA.Challenge.shareUrl(url, { text: (CA.t ? CA.t('Pörgesd meg te is! ') : 'Pörgesd meg te is! ') });
              } catch(e){}
            });
          chBtn.style.marginTop = 'var(--s2)';
          card.append(chBtn);
        }
        panel.append(card);
      } catch(e){}
    }

    // --- main render -----------------------------------------------------
    function render(){
      clearTimers();
      spinning = false;
      panel.innerHTML = '';
      var M = meta();

      // graceful fallback if the logic is missing
      if (!M || typeof M.dailySpinState !== 'function' || typeof M.dailySpin !== 'function'){
        panel.append(el('div','muted','<span data-t="A pörgetés most nem elérhető.">A pörgetés most nem elérhető.</span>'));
        API.applyI18n(panel);
        return;
      }

      var st;
      try { st = M.dailySpinState(); } catch(e){ st = null; }
      if (!st || !Array.isArray(st.segments) || !st.segments.length){
        panel.append(el('div','muted','<span data-t="A pörgetés most nem elérhető.">A pörgetés most nem elérhető.</span>'));
        API.applyI18n(panel);
        return;
      }
      segments = st.segments;

      // intro
      panel.append(el('div','muted','<span data-t="Pörgesd meg a szerencsekereket naponta egyszer!">Pörgesd meg a szerencsekereket naponta egyszer!</span>'));

      // streak hero
      var streak = st.streak || 0;
      var hero = el('div','card');
      hero.style.cssText = 'text-align:center;padding:var(--s3)';
      hero.innerHTML = '🔥 <strong style="color:var(--gold);font-size:20px">' + streak
        + '</strong> <span data-t="napos sorozat">napos sorozat</span>';
      panel.append(hero);

      // 7-DAY STREAK CALENDAR — show the current position within the weekly cycle
      // and what the 7th day grants (a bonus chest), to motivate return visits.
      // streak comes from CA.Meta.dailySpinState().streak (the banked login streak).
      var cal = el('div','card');
      cal.style.cssText = 'padding:var(--s2) var(--s3);margin-top:var(--s2)';
      cal.append(el('div', null, '📅 <strong data-t="7 napos sorozat">7 napos sorozat</strong>'));
      // current day within the 1..7 cycle (0 streak shows none filled).
      var dayInCycle = streak > 0 ? (((streak - 1) % 7) + 1) : 0;
      var dots = el('div','');
      dots.style.cssText = 'display:flex;gap:var(--s2);margin-top:var(--s2);justify-content:center;flex-wrap:wrap';
      for (var d=1; d<=7; d++){
        var cell = el('div','');
        var isDay7 = (d === 7);
        var done = (d <= dayInCycle);
        var isToday = (d === dayInCycle);
        cell.style.cssText = 'width:34px;height:34px;border-radius:8px;display:flex;align-items:center;'
          + 'justify-content:center;font-weight:800;font-size:13px;'
          + 'border:2px solid ' + (isToday ? GOLD : 'rgba(255,255,255,.18)') + ';'
          + 'background:' + (done ? (isDay7 ? GOLD : 'rgba(232,113,26,.35)') : 'transparent') + ';'
          + 'color:' + (done && isDay7 ? BROWN : '#FFF6E8');
        cell.textContent = isDay7 ? '🎁' : String(d);
        dots.append(cell);
      }
      cal.append(dots);
      cal.append(el('div','muted',
        '<div style="text-align:center;margin-top:var(--s2);font-size:12px">'
        + '<span data-t="7. nap: bónusz láda! 🎁">7. nap: bónusz láda! 🎁</span></div>'));
      panel.append(cal);

      // canvas wheel + pointer wrapper
      var wrap = el('div', null, '');
      wrap.style.cssText = 'position:relative;width:' + SIZE + 'px;max-width:100%;margin:var(--s3) auto 0;';
      canvas = el('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      canvas.style.cssText = 'display:block;width:100%;height:auto;filter:drop-shadow(0 6px 14px rgba(0,0,0,.4))';
      try { ctx = canvas.getContext('2d'); } catch(e){ ctx = null; }
      wrap.append(canvas);

      // fixed pointer at the top (12 o'clock), pointing DOWN into the wheel
      var ptr = el('div', null, '▼');
      ptr.style.cssText = 'position:absolute;top:-6px;left:50%;transform:translateX(-50%);'
        + 'font-size:30px;line-height:1;color:' + GOLD + ';text-shadow:0 2px 3px rgba(0,0,0,.6);z-index:2;';
      wrap.append(ptr);
      panel.append(wrap);

      // initial rotation: if already spun, snap to last result's slice; else 0.
      if (st.spunToday && st.lastResult && typeof st.lastResult.index === 'number'){
        curRot = rotationForIndex(st.lastResult.index, 0);
      } else {
        curRot = -Math.PI/2; // a neutral starting offset
      }
      drawWheel(curRot);

      // spin button
      var spinBtn = API.btn('<span data-t="🎡 Pörgetés!">🎡 Pörgetés!</span>', 'btn--gold btn--lg btn--block',
        function(){ doSpin(spinBtn); });
      spinBtn.style.marginTop = 'var(--s3)';
      if (!st.canSpin){ spinBtn.disabled = true; spinBtn.classList.add('btn--ghost'); }
      panel.append(spinBtn);

      // fairness note
      panel.append(el('div','muted','<div style="text-align:center;margin-top:var(--s2)"><span data-t="Nem mindig nyersz — ettől izgalmas! 🍀">Nem mindig nyersz — ettől izgalmas! 🍀</span></div>'));

      // REWARDED-AD RE-SPIN: after the daily spin is used, offer ONE extra spin
      // for watching an ad — but ONLY when a portal ad SDK is present (Poki/
      // CrazyGames). On the plain web/PWA build CA.Portal.active() is false, so we
      // render NOTHING. Gated by CA.Meta.canAdRespin() (free spin used + ad not yet
      // used today) so the button is hidden once the one daily ad-respin is spent.
      if (st.spunToday && portalActive() && M && typeof M.canAdRespin === 'function'){
        var canAd = false; try { canAd = M.canAdRespin(); } catch(e){ canAd = false; }
        if (canAd && typeof M.grantAdRespin === 'function'){
          var adBtn = API.btn('<span data-t="📺 Nézz egy reklámot egy újrapörgetésért">📺 Nézz egy reklámot egy újrapörgetésért</span>',
            'btn--ghost btn--block', function(){ doAdRespin(adBtn); });
          adBtn.style.marginTop = 'var(--s2)';
          panel.append(adBtn);
        } else if (!canAd){
          // already used today's ad-respin → a quiet note instead of the button.
          panel.append(el('div','muted','<div style="text-align:center;margin-top:var(--s2);font-size:12px">'
            + '<span data-t="Ma már használtad az újrapörgetést 📺">Ma már használtad az újrapörgetést 📺</span></div>'));
        }
      }

      // result / countdown area
      panel.append(msg);
      var cd = el('div','muted'); cd.id = 'spin-cd';
      cd.style.cssText = 'text-align:center;margin-top:var(--s2);font-weight:700';
      panel.append(cd);

      // coin balance footer
      var bal = el('div','muted');
      bal.style.cssText = 'text-align:center;margin-top:var(--s3)';
      bal.innerHTML = '🪙 <span data-t="Egyenleg">Egyenleg</span>: <strong>' + (M.coins ? M.coins() : 0) + '</strong>';
      panel.append(bal);

      // SHAREABLE RESULT CARD — once today's spin is used, offer a one-tap share
      // (brag card/clip if CA.Share is present, else a "challenge me" deep-link)
      // carrying the result + today's seed. Pure virality; fully guarded.
      if (st.spunToday){ appendShareCard(st); }

      API.applyI18n(panel);

      // if already spun today: show last result + start the countdown ticker
      if (st.spunToday){
        if (st.lastResult) setMsg(resultText(st.lastResult), st.lastResult.coins > 0 || !!st.lastResult.cosmetic);
        startCountdown();
      } else {
        setMsg('', true);
      }
    }

    // live countdown to the next spin (next local midnight)
    function startCountdown(){
      var cd = panel.querySelector('#spin-cd');
      if (!cd) return;
      function tick(){
        // self-stop if this screen is no longer the active one (the menu keeps
        // inactive screens in the DOM, just toggles an `active` class). Also stops
        // any in-flight spin animation that got orphaned by navigating away.
        if (s.screen && s.screen.classList && !s.screen.classList.contains('active')){
          clearTimers(); spinning = false; return;
        }
        var M = meta(); if (!M || typeof M.dailySpinState !== 'function'){ return; }
        var st; try { st = M.dailySpinState(); } catch(e){ st = null; }
        if (!st){ return; }
        if (st.canSpin){            // rolled past midnight while the screen was open
          clearTimers();
          render();
          return;
        }
        cd.innerHTML = '⏳ <span data-t="Következő pörgetés:">Következő pörgetés:</span> '
          + '<strong>' + fmtCountdown(st.nextInMs) + '</strong>';
        API.applyI18n(cd);
      }
      tick();
      tickTimer = setInterval(tick, 1000);
    }

    // perform + animate a spin
    function doSpin(spinBtn){
      if (spinning) return;
      var M = meta();
      if (!M || typeof M.dailySpin !== 'function'){ setMsg(t('A pörgetés most nem elérhető.'), false); return; }

      var res;
      try { res = M.dailySpin(); } catch(e){ res = null; }
      if (!res || !res.ok){
        // already spun (or failed) — just resync to the spun-today state.
        render();
        return;
      }

      var idx = (typeof res.index === 'number' && res.index >= 0 && res.index < segments.length) ? res.index : 0;
      var resultObj = { coins: res.coins||0, cosmetic: res.cosmetic||null,
                        miss: !!(res.segment && res.segment.miss), consolation:0,
                        // live day-7 streak bonus (set by CA.Meta.dailySpin when streak hits a multiple of 7)
                        streakBonus: (res.streakBonus && res.streakBonus.coins) ? res.streakBonus : null };

      // CONSOLATION on a 0-coin MISS: grant a tiny coin amount so a spin never
      // totals truly zero (softens the "Ma lepörgött 😿" sting) while keeping the
      // wheel fair. Guarded: only if CA.Meta.addCoins exists. This is UI-side and
      // independent of the wheel roll, so fairness/odds are unchanged.
      var isMiss = !resultObj.cosmetic && !(resultObj.coins > 0);
      if (isMiss && M && typeof M.addCoins === 'function' && MISS_CONSOLATION > 0){
        try {
          M.addCoins(MISS_CONSOLATION, 'spinConsolation');
          resultObj.consolation = MISS_CONSOLATION;
        } catch(e){}
      }

      spinning = true;
      spinBtn.disabled = true;
      spinBtn.classList.add('btn--ghost');
      spinBtn.innerHTML = '<span data-t="Pörgetés…">Pörgetés…</span>';
      API.applyI18n(spinBtn);
      setMsg('', true);

      var reduced = !!(CA.settings && CA.settings.reducedMotion);
      var finalRot = rotationForIndex(idx, reduced ? 0 : 5);  // 5 full turns then land

      function finish(){
        spinning = false;
        curRot = rotationForIndex(idx, 0);   // normalized resting rotation
        drawWheel(curRot);
        setMsg(resultText(resultObj), resultObj.coins > 0 || !!resultObj.cosmetic);
        emitSfx(resultObj.coins > 0 || resultObj.cosmetic ? 'win' : 'lose');
        // re-render so balance + disabled state + countdown are correct, then
        // restore the just-shown result message (render() clears msg).
        var keep = resultObj;
        render();
        // render() resets msg; restore the result text after the re-render.
        setMsg(resultText(keep), keep.coins > 0 || !!keep.cosmetic);
      }

      if (reduced){
        // respect reduced motion: snap straight to the result
        curRot = finalRot;
        drawWheel(curRot);
        finish();
        return;
      }

      // animate: cubic ease-out from curRot -> finalRot over ~3.4s
      var startRot = curRot;
      var delta = finalRot - startRot;
      // ensure we always spin forward by enough; normalize start below final
      while (delta < TAU*4){ delta += TAU; }
      var dur = 3400;
      var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      lastTickSfx = 0;

      function frame(now){
        // abort if we navigated off this screen mid-spin (the grant already
        // happened in dailySpin(), so state is correct; just stop animating).
        if (s.screen && s.screen.classList && !s.screen.classList.contains('active')){
          spinning = false; rafId = 0; return;
        }
        var nowMs = (typeof now === 'number') ? now
                  : ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
        var p = (nowMs - t0) / dur;
        if (p < 0) p = 0;
        if (p >= 1){
          curRot = startRot + delta;
          drawWheel(curRot);
          finish();
          return;
        }
        var ease = 1 - Math.pow(1 - p, 3);   // cubic ease-out
        curRot = startRot + delta * ease;
        drawWheel(curRot);
        // tick sfx as slices pass (slows down naturally with the easing)
        var slicePos = (curRot / (TAU / (segments.length||1)));
        if (Math.floor(slicePos) !== lastTickSfx){
          lastTickSfx = Math.floor(slicePos);
          emitSfx('tick');
        }
        rafId = requestAnimationFrame(frame);
      }
      rafId = requestAnimationFrame(frame);
    }

    // watch a rewarded ad → unlock ONE extra spin today (then re-render so the
    // wheel + spin button re-enable). Fully guarded: if the SDK or the grant call
    // is missing, or the player declines the ad (rewarded() resolves false), we
    // simply resync the state and never throw.
    function doAdRespin(adBtn){
      var M = meta();
      if (!M || typeof M.grantAdRespin !== 'function' || !portalActive()){ render(); return; }
      if (adBtn){
        adBtn.disabled = true;
        adBtn.innerHTML = '<span data-t="Reklám betöltése…">Reklám betöltése…</span>';
        API.applyI18n(adBtn);
      }
      var p;
      try { p = CA.Portal.rewarded(); } catch(e){ p = null; }
      if (!p || typeof p.then !== 'function'){ render(); return; }
      p.then(function(ok){
        if (ok){
          var granted = false;
          try { granted = M.grantAdRespin(); } catch(e){ granted = false; }
          // granted → lastSpin cleared, so render() re-enables the spin button.
        }
        render();
      }, function(){ render(); });
    }

    var msg = el('div',''); msg.style.cssText = 'text-align:center;margin-top:var(--s3);font-weight:800;font-size:18px';
    function setMsg(text, ok){ msg.textContent = text || ''; msg.style.color = ok ? 'var(--gold)' : 'var(--ink-dim)'; }

    return {
      el: s.screen,
      onShow: render,
      onHide: function(){ clearTimers(); spinning = false; }
    };
  }

  if (CA.Menu && CA.Menu.register) CA.Menu.register('daily', build);
})();
