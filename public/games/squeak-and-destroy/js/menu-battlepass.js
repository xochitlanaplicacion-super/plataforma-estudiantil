/* ============================================================================
 * Squeak & Destroy — menu-battlepass.js :: the "Csatakártya / Battle Pass" screen.
 * Season XP fills tiers; FREE lane is claimable by all, PREMIUM lane is unlocked
 * with coins (cosmetic-only, no pay-to-win). Resets each season (handled in meta).
 * Registers a DOM screen via CA.Menu.register('battlepass').
 * ==========================================================================*/
(function(){
  'use strict';
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    // NOTE: 'Szint' is a GLOBAL i18n key meaning "Level" (profile/skill-tree/HUD).
    // addEN merges last-wins, so we must NOT re-map it to 'Tier' here or it would
    // mistranslate "Level" everywhere. Battle-pass "Level" reads fine in English.
    'Csatakártya':'Battle Pass', 'Szezon':'Season', 'Szint':'Level',
    'Ingyenes sáv':'Free track', 'Prémium sáv':'Premium track',
    'Begyűjt':'Claim', 'Begyűjtve':'Claimed', 'Zárolva':'Locked',
    'Szezon vége: ':'Season ends: ', 'Prémium feloldása':'Unlock Premium',
    'Prémium feloldva':'Premium unlocked', 'Prémium szükséges':'Premium required',
    'érme':'coins', 'Szezon XP':'Season XP', 'nap':'days', 'Egyenleg':'Balance',
    'Cosmetic jutalmak — nincs pay-to-win.':'Cosmetic rewards only — no pay-to-win.',
    'Láda':'Chest', 'Még nem érted el':'Not reached yet',
    'Mit tartalmaz a prémium?':'What does premium include?',
    'A prémium sáv jutalmai (csak dísz):':'Premium track rewards (cosmetic-only):',
    'Következő jutalom':'Next reward',
    // info banner (HU literal == i18n key)
    '<strong>📅 Mi az a szezon?</strong> A csatakártya egy kb. havonta megújuló pálya. Játékkal <strong>Szezon XP</strong>-t gyűjtesz, amivel szinteket (tier) lépsz — minden tier kinézet- vagy érme-jutalmat ad. A <strong>prémium sáv csak dísz</strong> (nincs pay-to-win). A szezon végén minden nullázódik és új pálya indul.':
      '<strong>📅 What is a season?</strong> The battle pass is a track that refreshes about monthly. Play to earn <strong>Season XP</strong> and climb tiers — each tier grants a cosmetic or coin reward. The <strong>premium track is cosmetic-only</strong> (no pay-to-win). Everything resets at season end and a new track begins.'
  });
  var BP_INFO_HU = '<strong>📅 Mi az a szezon?</strong> A csatakártya egy kb. havonta megújuló pálya. Játékkal <strong>Szezon XP</strong>-t gyűjtesz, amivel szinteket (tier) lépsz — minden tier kinézet- vagy érme-jutalmat ad. A <strong>prémium sáv csak dísz</strong> (nincs pay-to-win). A szezon végén minden nullázódik és új pálya indul.';

  function build(API){
    var el = API.el, t = API.t, esc = API.esc;
    var s = API.screen('🎫', 'Csatakártya');
    var body = s.body;

    try {
      var ic = API.infoCard && API.infoCard('battlepass_season_v1', t(BP_INFO_HU));
      if (ic) body.insertBefore(ic, body.firstChild);
    } catch(e){}

    var headPanel = API.panel();
    var msg = el('div',''); msg.style.cssText = 'text-align:center;font-weight:700;min-height:18px';
    var tierPanel = API.panel();
    body.append(headPanel, msg, tierPanel);

    function setMsg(text, ok){ msg.textContent = text || ''; msg.style.color = ok===false ? 'var(--red)' : 'var(--green)'; }
    function meta(){ return CA.Meta; }

    function daysLeft(ms){
      var d = Math.ceil((ms - Date.now()) / 86400000);
      return d > 0 ? d : 0;
    }

    function rewardChip(API, label, claimed, claimable, locked, onClaim){
      var c = el('div','card');
      c.style.cssText = 'flex:1;min-width:120px;text-align:center;padding:var(--s2)';
      var name = el('div', null, esc(label || '—'));
      name.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:var(--s1)';
      c.append(name);
      if (claimed){
        c.style.opacity = '.6';
        var done = el('div', null, '✓ <span data-t="Begyűjtve">Begyűjtve</span>');
        done.style.cssText = 'color:var(--green);font-weight:800;font-size:12px';
        c.append(done);
      } else if (claimable){
        var b = API.btn('🎁 <span data-t="Begyűjt">Begyűjt</span>','btn--gold btn--sm btn--block', onClaim);
        c.append(b);
      } else if (locked){
        c.style.opacity = '.5';
        c.append(el('div','muted','🔒 <span data-t="Prémium szükséges">Prémium szükséges</span>'));
      } else {
        c.style.opacity = '.5';
        c.append(el('div','muted','<span data-t="Még nem érted el">Még nem érted el</span>'));
      }
      return c;
    }

    function render(){
      var M = meta();
      headPanel.innerHTML = '';
      tierPanel.innerHTML = '';
      if (!M || typeof M.seasonPass !== 'function'){
        headPanel.append(el('div','muted','—'));
        return;
      }

      var info = M.seasonInfo();
      headPanel.append(el('div', null, '<div style="font-weight:900;font-size:18px;color:var(--gold)">' + esc(info.name || ('Season ' + info.id)) + '</div>'));
      headPanel.append(el('div','muted','🗓️ <span data-t="Szezon vége: ">Szezon vége: </span>' + daysLeft(info.endsAt) + ' <span data-t="nap">nap</span>'));
      headPanel.append(el('div','muted','⭐ <span data-t="Szezon XP">Szezon XP</span>: <strong>' + (info.xp||0) + '</strong>'));
      headPanel.append(el('div','muted','🪙 <span data-t="Egyenleg">Egyenleg</span>: <strong>' + (M.coins?M.coins():0) + '</strong>'));
      headPanel.append(el('div','muted','<div style="margin-top:var(--s1)"><span data-t="Cosmetic jutalmak — nincs pay-to-win.">Cosmetic jutalmak — nincs pay-to-win.</span></div>'));

      // premium unlock
      if (!info.premium){
        var price = info.premiumPrice || 2000;
        var afford = (M.coins ? M.coins() : 0) >= price;
        var pb = API.btn('⭐ <span data-t="Prémium feloldása">Prémium feloldása</span> (🪙 ' + price + ')',
          afford ? 'btn--purple btn--block' : 'btn--ghost btn--block', function(){
            if (M.buySeasonPremium()){ setMsg(t('Prémium feloldva'), true); render(); }
            else setMsg(t('Prémium szükséges'), false);
          });
        if (!afford) pb.disabled = true;
        pb.style.marginTop = 'var(--s2)';
        headPanel.append(pb);

        // PREMIUM PREVIEW — show the locked premium rewards as a small gallery
        // BEFORE unlocking, so the player can see the value they'd get. Built from
        // the live seasonPass() data (premium lane labels), no extra meta call.
        try {
          var prevPass = M.seasonPass();
          var prevItems = [];
          prevPass.forEach(function(prow){
            if (prow.premium && prow.premium.label){
              prevItems.push({ tier: prow.tier, label: prow.premium.label });
            }
          });
          if (prevItems.length){
            var prevWrap = el('div','card');
            prevWrap.style.cssText = 'margin-top:var(--s2);padding:var(--s2) var(--s3);border-color:var(--purple,#AF52DE)';
            prevWrap.append(el('div', null,
              '🎁 <strong data-t="Mit tartalmaz a prémium?">Mit tartalmaz a prémium?</strong>'));
            prevWrap.append(el('div','muted',
              '<span data-t="A prémium sáv jutalmai (csak dísz):">A prémium sáv jutalmai (csak dísz):</span>'));
            var gal = el('div','');
            gal.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--s2);margin-top:var(--s2)';
            prevItems.forEach(function(it){
              var pchip = el('span','');
              pchip.style.cssText = 'font-size:12px;font-weight:700;padding:2px 8px;border-radius:10px;'
                + 'background:rgba(175,82,222,.15);color:var(--purple,#AF52DE)';
              pchip.textContent = '🔒 T' + it.tier + ' · ' + esc(t(it.label));
              gal.append(pchip);
            });
            prevWrap.append(gal);
            headPanel.append(prevWrap);
          }
        } catch(e){}
      } else {
        var on = el('div','card');
        on.style.cssText = 'text-align:center;color:var(--purple,#AF52DE);font-weight:800;margin-top:var(--s2)';
        on.innerHTML = '⭐ <span data-t="Prémium feloldva">Prémium feloldva</span>';
        headPanel.append(on);
      }
      API.applyI18n(headPanel);

      // tier list
      var pass = M.seasonPass();
      // find the "next claimable" tier (first row with a claimable lane) so we can
      // highlight it and auto-scroll it into view; fall back to the first
      // not-yet-reached tier (the one the player is progressing toward).
      var focusTier = null, firstUnreached = null;
      pass.forEach(function(row){
        var anyClaimable = (row.free && row.free.claimable) || (row.premium && row.premium.claimable);
        if (anyClaimable && focusTier === null) focusTier = row.tier;
        if (!row.reached && firstUnreached === null) firstUnreached = row.tier;
      });
      if (focusTier === null) focusTier = (firstUnreached !== null ? firstUnreached
                                          : (pass.length ? pass[pass.length-1].tier : null));
      var focusEl = null;

      pass.forEach(function(row){
        var r = el('div','card');
        var isFocus = (row.tier === focusTier);
        r.style.cssText = 'margin-bottom:var(--s2)' + (row.reached ? ';border-color:var(--gold)' : ';opacity:.92');
        if (isFocus){
          // highlight the next-claimable (or next-up) tier
          r.style.borderColor = 'var(--gold)';
          r.style.boxShadow = '0 0 0 2px var(--gold)';
          r.style.opacity = '1';
          focusEl = r;
        }
        var head = el('div','row row--between');
        var tno = el('div', null, '<strong>T' + row.tier + '</strong> <span class="muted">· ' + row.xp + ' XP</span>'
          + (isFocus ? ' <span style="color:var(--gold);font-size:11px;font-weight:800" data-t="Következő jutalom">Következő jutalom</span>' : ''));
        var status = el('div', row.reached ? null : 'muted', row.reached ? '✓' : '🔒');
        if (row.reached) status.style.color = 'var(--gold)';
        head.append(tno, status);
        r.append(head);

        var lanes = el('div','row');
        lanes.style.cssText = 'display:flex;gap:var(--s2);margin-top:var(--s2)';

        var free = row.free;
        lanes.append(rewardChip(API, free.label, free.claimed, free.claimable, false, (function(tier){
          return function(){ if (M.claimSeasonReward(tier, 'free')) render(); };
        })(row.tier)));

        var prem = row.premium;
        lanes.append(rewardChip(API, prem.label, prem.claimed, prem.claimable, prem.locked && !prem.claimed, (function(tier){
          return function(){ if (M.claimSeasonReward(tier, 'prem')) render(); };
        })(row.tier)));

        r.append(lanes);
        tierPanel.append(r);
      });
      API.applyI18n(tierPanel);

      // AUTO-SCROLL the focused (next-claimable / next-up) tier into view so the
      // player lands on the relevant part of the track when the screen opens.
      // Deferred so layout is settled; guarded (scrollIntoView may be missing).
      if (focusEl && typeof focusEl.scrollIntoView === 'function'){
        try {
          setTimeout(function(){
            try { focusEl.scrollIntoView({ behavior:'smooth', block:'center' }); }
            catch(e){ try { focusEl.scrollIntoView(); } catch(e2){} }
          }, 60);
        } catch(e){}
      }
    }

    try { if (CA.events) CA.events.on('coinsChanged', render); } catch(e){}

    return { el: s.screen, onShow: render };
  }

  if (CA.Menu && CA.Menu.register) CA.Menu.register('battlepass', build);
})();
