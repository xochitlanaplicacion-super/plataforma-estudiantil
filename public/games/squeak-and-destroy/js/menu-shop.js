/* ============================================================================
 * Squeak & Destroy — menu-shop.js :: the "Bolt / Shop" screen.
 * Spend Squeak Coins on cosmetics (direct buy) and chests (free timed + paid).
 * Cosmetic-only, no pay-to-win. Registers a DOM screen via CA.Menu.register('shop').
 * ==========================================================================*/
(function(){
  'use strict';
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Bolt':'Shop', 'Kinézetek':'Cosmetics', 'Ládák':'Chests',
    'Vásárlás':'Buy', 'Megvéve':'Owned', 'Birtokolt':'Owned',
    'Nincs elég érme':'Not enough coins', 'Megvásárolva!':'Purchased!',
    'Ingyen láda':'Free Chest', 'Érme-láda':'Coin Chest', 'Nyitás':'Open',
    'Készen áll!':'Ready!', 'Holnap újra':'Available tomorrow',
    'Egyenleg':'Balance', 'érme':'coins', 'Ritkaság':'Rarity',
    'Közönséges':'Common', 'Ritka':'Rare', 'Epikus':'Epic', 'Legendás':'Legendary',
    'Véletlen kinézet a ritkaság-esélyek szerint.':'A random cosmetic by rarity odds.',
    'Naponta egy ingyenes láda.':'One free chest per day.',
    'Mesterség':'Mastery',
    // #odds — published chest drop rates (store-compliance: iOS/Steam require it)
    'Esélyek':'Odds', 'Duplikátum visszatérítés:':'Duplicate refund:',
    'Szűrés:':'Filter:', 'Mind':'All',
    'Nincs ilyen ritkaságú kinézet.':'No cosmetics of this rarity.',
    // The HU literal below is also the i18n key (HU == key convention).
    '<strong>💯 Minden kinézet játékkal szerezhető meg.</strong> Nincs valódi pénzes vásárlás (IAP): a Squeak érméket meccsekből, ládákból és a csatakártyából kapod. Minden tétel <strong>csak dísz</strong> — nincs pay-to-win.':
      '<strong>💯 Every cosmetic is earned by playing.</strong> There is NO real-money purchase (IAP): you earn Squeak Coins from matches, chests and the battle pass. Everything here is <strong>cosmetic-only</strong> — no pay-to-win.',
    // rewarded-ad coin source (only shown when a portal ad SDK is present)
    'Ingyen érme':'Free Coins',
    'Nézz egy rövid reklámot egy kis érméért.':'Watch a short ad for a few coins.',
    'Reklám betöltése…':'Loading ad…',
    'Mára elfogyott — gyere vissza holnap!':'Out for today — come back tomorrow!',
    'Ma még':'Today',
    'alkalom':'left',
    '+': '+', 'érme!':'coins!'
  });
  var SHOP_INFO_HU = '<strong>💯 Minden kinézet játékkal szerezhető meg.</strong> Nincs valódi pénzes vásárlás (IAP): a Squeak érméket meccsekből, ládákból és a csatakártyából kapod. Minden tétel <strong>csak dísz</strong> — nincs pay-to-win.';

  var RARITY_COLOR = { common:'#8E8E93', rare:'#36A2EB', epic:'#AF52DE', legendary:'#FFD60A' };

  function build(API){
    var el = API.el, t = API.t, esc = API.esc;
    var s = API.screen('🛒', 'Bolt');
    var body = s.body;

    // dismissible "earn-only, no IAP, cosmetic-only" banner at the very top
    try {
      var ic = API.infoCard && API.infoCard('shop_earn_only_v1', t(SHOP_INFO_HU));
      if (ic) body.insertBefore(ic, body.firstChild);
    } catch(e){}

    var coinBar = el('div','card');
    coinBar.style.cssText = 'text-align:center;font-weight:900;font-size:18px;color:var(--gold)';
    body.append(coinBar);

    var msg = el('div',''); msg.style.cssText = 'text-align:center;font-weight:700;min-height:18px;margin:var(--s1) 0';
    body.append(msg);
    function setMsg(text, ok){ msg.textContent = text || ''; msg.style.color = ok===false ? 'var(--red)' : 'var(--green)'; }

    var adPanel = API.panel();
    var chestPanel = API.panel();
    var shopPanel = API.panel();
    body.append(adPanel, chestPanel, shopPanel);

    function meta(){ return CA.Meta; }

    // portal ad SDK present? (false on plain web/PWA → no ad button rendered)
    function portalActive(){
      try { return !!(CA.Portal && typeof CA.Portal.active === 'function' && CA.Portal.active()); }
      catch(e){ return false; }
    }

    function paintCoins(){
      var M = meta();
      coinBar.innerHTML = '🪙 ' + (M && M.coins ? M.coins() : 0) + ' <span class="muted" style="font-weight:600;font-size:13px" data-t="érme">érme</span>';
      API.applyI18n(coinBar);
    }

    function fmtTimeLeft(ms){
      if (ms <= 0) return '';
      var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
      return (h > 0 ? h + 'h ' : '') + m + 'm';
    }

    // REWARDED-AD COIN SOURCE: a "watch an ad for +N coins" card, shown ONLY when
    // a portal ad SDK is present (Poki/CrazyGames). On the plain web/PWA build
    // CA.Portal.active() is false → the panel renders empty (no ad button at all).
    // Rate-limited by CA.Meta: at most M.adCoinsLeft() grants per local day, so it
    // can't be farmed. Cosmetic-currency only — never real money, never P2W.
    function renderAdCoins(){
      var M = meta();
      adPanel.innerHTML = '';
      adPanel.style.display = 'none';
      // hide entirely without an SDK or without the meta plumbing.
      if (!portalActive() || !M || typeof M.grantAdCoins !== 'function'){ return; }
      adPanel.style.display = '';

      var amount = (typeof M.adCoinAmount === 'function') ? (M.adCoinAmount() || 0) : 25;
      var left = (typeof M.adCoinsLeft === 'function') ? (M.adCoinsLeft() || 0) : 0;

      adPanel.append(el('h3', null, '📺 <span data-t="Ingyen érme">Ingyen érme</span>'));
      adPanel.append(el('div','muted','<span data-t="Nézz egy rövid reklámot egy kis érméért.">Nézz egy rövid reklámot egy kis érméért.</span>'));

      if (left > 0){
        var adBtn = API.btn('📺 ' + t('+') + amount + ' ' + t('érme!'), 'btn--gold btn--block', function(){
          doAdCoins(adBtn);
        });
        adBtn.style.marginTop = 'var(--s2)';
        adPanel.append(adBtn);
        var leftNote = el('div','muted','<span data-t="Ma még">Ma még</span> ' + left + ' <span data-t="alkalom">alkalom</span>');
        leftNote.style.cssText = 'text-align:center;margin-top:var(--s1);font-size:12px';
        adPanel.append(leftNote);
      } else {
        var doneNote = el('div','muted','<span data-t="Mára elfogyott — gyere vissza holnap!">Mára elfogyott — gyere vissza holnap!</span>');
        doneNote.style.cssText = 'text-align:center;margin-top:var(--s2)';
        adPanel.append(doneNote);
      }
      API.applyI18n(adPanel);
    }

    // watch a rewarded ad → grant coins (rate-limited in CA.Meta.grantAdCoins).
    // Fully guarded: missing SDK / declined ad / missing grant fn all just resync.
    function doAdCoins(adBtn){
      var M = meta();
      if (!M || typeof M.grantAdCoins !== 'function' || !portalActive()){ refresh(); return; }
      if (adBtn){
        adBtn.disabled = true;
        adBtn.innerHTML = '<span data-t="Reklám betöltése…">Reklám betöltése…</span>';
        API.applyI18n(adBtn);
      }
      var p;
      try { p = CA.Portal.rewarded(); } catch(e){ p = null; }
      if (!p || typeof p.then !== 'function'){ refresh(); return; }
      p.then(function(ok){
        if (ok){
          var got = 0;
          try { got = M.grantAdCoins(); } catch(e){ got = 0; }
          if (got > 0) setMsg('🪙 ' + t('+') + got + ' ' + t('érme!'), true);
        }
        refresh();
      }, function(){ refresh(); });
    }

    function renderChests(){
      var M = meta();
      chestPanel.innerHTML = '';
      chestPanel.append(el('h3', null, '<span data-t="Ládák">Ládák</span>'));
      chestPanel.append(el('div','muted','<span data-t="Véletlen kinézet a ritkaság-esélyek szerint.">Véletlen kinézet a ritkaság-esélyek szerint.</span>'));

      var row = el('div','row');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--s3)';

      // free timed chest
      var freeReady = M && M.freeChestReady && M.freeChestReady();
      var freeCard = el('div','card'); freeCard.style.cssText = 'flex:1;min-width:200px;text-align:center';
      freeCard.append(el('div', null, '<div style="font-size:32px">🎁</div>'));
      freeCard.append(el('div', null, '<strong data-t="Ingyen láda">Ingyen láda</strong>'));
      freeCard.append(el('div','muted','<span data-t="Naponta egy ingyenes láda.">Naponta egy ingyenes láda.</span>'));
      if (freeReady){
        var fb = API.btn('🔓 <span data-t="Nyitás">Nyitás</span>','btn--gold btn--block', function(){
          var res = M.openFreeChest();
          if (res) setMsg(chestResultText(res), true);
          refresh();
        });
        freeCard.append(fb);
      } else {
        var left = (M && M.freeChestReadyAt) ? (M.freeChestReadyAt() - Date.now()) : 0;
        var waitN = el('div','muted','⏳ <span data-t="Holnap újra">Holnap újra</span>' + (left>0 ? ' (' + fmtTimeLeft(left) + ')' : ''));
        waitN.style.marginTop = 'var(--s2)';
        freeCard.append(waitN);
      }
      row.append(freeCard);

      // paid coin chest
      var price = (M && M.COIN_CHEST_PRICE) || 400;
      var coinCard = el('div','card'); coinCard.style.cssText = 'flex:1;min-width:200px;text-align:center';
      coinCard.append(el('div', null, '<div style="font-size:32px">📦</div>'));
      coinCard.append(el('div', null, '<strong data-t="Érme-láda">Érme-láda</strong>'));
      var afford = M && M.coins && M.coins() >= price;
      var cb = API.btn('🪙 ' + price, afford ? 'btn--green btn--block' : 'btn--ghost btn--block', function(){
        var res = M.openCoinChest();
        if (!res){ setMsg(t('Nincs elég érme'), false); return; }
        setMsg(chestResultText(res), true);
        refresh();
      });
      if (!afford) cb.disabled = true;
      coinCard.append(cb);
      row.append(coinCard);

      chestPanel.append(row);

      // PUBLISHED DROP ODDS (store-compliance: iOS App Store & Steam require
      // loot-box odds to be visible). These come from CA.Meta.chestOdds(), which
      // DERIVES them live from the catalog + RARITY_WEIGHT, so they always match
      // the real roll in _rollCosmeticId(). If chestOdds() is unavailable, fall
      // back to a documented split that MUST mirror RARITY_WEIGHT in meta.js
      // (common:60, rare:28, epic:10, legendary:4 → 70% / 22% / 6% / 2% over the
      // current catalog). Keep this fallback in sync if the catalog changes.
      var odds = null;
      try { if (M && typeof M.chestOdds === 'function') odds = M.chestOdds(); } catch(e){ odds = null; }
      var oddsRows;
      if (odds && odds.rarities && odds.rarities.length){
        oddsRows = odds.rarities.map(function(r){
          return { label: rarityName(r.rarity), pct: Math.round((r.chance||0)*100), rarity:r.rarity };
        });
      } else {
        // documented fallback — must match RARITY_WEIGHT over the live catalog
        oddsRows = [
          { label: rarityName('common'),    pct:70, rarity:'common' },
          { label: rarityName('rare'),      pct:22, rarity:'rare' },
          { label: rarityName('epic'),      pct:6,  rarity:'epic' },
          { label: rarityName('legendary'), pct:2,  rarity:'legendary' }
        ];
      }
      var oddsCard = el('div','card');
      oddsCard.style.cssText = 'margin-top:var(--s3);padding:var(--s2) var(--s3)';
      oddsCard.append(el('div', null, '🎲 <strong data-t="Esélyek">Esélyek</strong>'));
      var oddsLine = el('div','');
      oddsLine.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--s2);margin-top:var(--s1);font-size:13px;font-weight:700';
      oddsRows.forEach(function(o, i){
        var chip = el('span','');
        var col = RARITY_COLOR[o.rarity] || RARITY_COLOR.common;
        chip.style.cssText = 'color:' + col;
        chip.textContent = (i ? '· ' : '') + esc(o.label) + ' ' + o.pct + '%';
        oddsLine.append(chip);
      });
      oddsCard.append(oddsLine);
      var refund = (odds && typeof odds.dupRefund === 'number') ? odds.dupRefund
                 : ((M && M.DUP_REFUND) || 100);
      oddsCard.append(el('div','muted',
        '<span data-t="Duplikátum visszatérítés:">Duplikátum visszatérítés:</span> 🪙 ' + refund));
      chestPanel.append(oddsCard);

      API.applyI18n(chestPanel);
    }

    function chestResultText(res){
      if (!res) return '';
      if (res.dup) return '🪙 ' + esc(rarityName(res.rarity)) + ' — +' + (res.refund||0) + ' ' + t('érme');
      return '🎉 ' + esc(res.name || res.id) + ' (' + esc(rarityName(res.rarity)) + ')';
    }
    function rarityName(r){
      var M = meta();
      var lbl = (M && M.RARITY_LABEL && M.RARITY_LABEL[r]) || r;
      return t(lbl);
    }

    // rarity filter for the cosmetic grid (Mind / Gyakori / Ritka / Epikus / Legendás).
    // 'all' shows everything; otherwise only cosmetics whose data.rarity matches.
    var rarityFilter = 'all';

    function renderShop(){
      var M = meta();
      shopPanel.innerHTML = '';
      shopPanel.append(el('h3', null, '<span data-t="Kinézetek">Kinézetek</span>'));
      var cat = (M && M.COSMETIC_CATALOG) || {};
      var owned = (M && M.cosmetics) ? M.cosmetics() : [];

      // rarity filter chips
      var chips = el('div','');
      chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--s2);margin-bottom:var(--s3)';
      var FILTERS = [
        { key:'all',       label:t('Mind'),                color:null },
        { key:'common',    label:rarityName('common'),     color:RARITY_COLOR.common },
        { key:'rare',      label:rarityName('rare'),       color:RARITY_COLOR.rare },
        { key:'epic',      label:rarityName('epic'),       color:RARITY_COLOR.epic },
        { key:'legendary', label:rarityName('legendary'),  color:RARITY_COLOR.legendary }
      ];
      FILTERS.forEach(function(f){
        var active = (rarityFilter === f.key);
        var chip = API.btn(esc(f.label), (active ? 'btn--gold' : 'btn--ghost') + ' btn--sm', function(){
          rarityFilter = f.key;
          renderShop();
        });
        if (f.color && !active) chip.style.borderColor = f.color;
        chips.append(chip);
      });
      shopPanel.append(chips);

      var grid = el('div','opt-grid');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:var(--s3)';

      var shown = 0;
      Object.keys(cat).forEach(function(id){
        var c = cat[id];
        if (!c) return;
        if (c.price === 0) return; // starter freebies aren't shop items
        var rarity = c.rarity || 'common';
        if (rarityFilter !== 'all' && rarity !== rarityFilter) return; // rarity filter
        shown++;
        var isOwned = owned.indexOf(id) >= 0;
        var card = el('div','card'); card.style.cssText = 'text-align:center;padding:var(--s3)';
        var rc = RARITY_COLOR[c.rarity] || RARITY_COLOR.common;
        card.style.borderColor = rc;

        // GRAPHIC: render the cosmetic on a default species so buyers see it
        // before purchase (#36). renderPortrait(canvas,{species,cosmetic,color}).
        var pv = el('canvas');
        pv.width = 96; pv.height = 96;
        pv.style.cssText = 'width:96px;height:96px;display:block;margin:0 auto var(--s1)';
        try {
          var rp = CA.Entities && CA.Entities.renderPortrait;
          if (typeof rp === 'function') rp(pv, { species:'capybara', cosmetic:id });
        } catch(e){}
        card.append(pv);

        var name = el('div', null, esc(t(c.name || id)));
        name.style.cssText = 'font-weight:800;margin-bottom:var(--s1)';
        var rar = el('div', null, esc(rarityName(c.rarity)));
        rar.style.cssText = 'font-size:12px;font-weight:700;color:' + rc + ';margin-bottom:var(--s2)';
        card.append(name, rar);

        if (isOwned){
          var ow = el('div', null, '✓ <span data-t="Birtokolt">Birtokolt</span>');
          ow.style.cssText = 'color:var(--green);font-weight:800';
          card.append(ow);
        } else {
          var afford = M && M.coins && M.coins() >= (c.price||0);
          var bb = API.btn('🪙 ' + (c.price||0), afford ? 'btn--green btn--sm btn--block' : 'btn--ghost btn--sm btn--block', function(){
            if (M.buyCosmetic(id)){ setMsg(t('Megvásárolva!'), true); refresh(); }
            else setMsg(t('Nincs elég érme'), false);
          });
          if (!afford) bb.disabled = true;
          card.append(bb);
        }
        grid.append(card);
      });

      shopPanel.append(grid);
      if (!shown){
        shopPanel.append(el('div','muted',
          '<div style="text-align:center;padding:var(--s3)"><span data-t="Nincs ilyen ritkaságú kinézet.">Nincs ilyen ritkaságú kinézet.</span></div>'));
      }
      API.applyI18n(shopPanel);
    }

    // QA P1: a refresh() NEM törli az üzenetet — a siker-útvonalak setMsg(...)
    // UTÁN hívnak refresh()-t, így a láda-jutalom szövege azonnal eltűnt volna.
    // A stale üzenetet csak a képernyőre LÉPÉSKOR töröljük (onShow).
    function refresh(){ paintCoins(); renderAdCoins(); renderChests(); renderShop(); }
    function onShowShop(){ setMsg(''); refresh(); }

    try { if (CA.events) CA.events.on('coinsChanged', paintCoins); } catch(e){}

    return { el: s.screen, onShow: onShowShop };
  }

  if (CA.Menu && CA.Menu.register) CA.Menu.register('shop', build);
})();
