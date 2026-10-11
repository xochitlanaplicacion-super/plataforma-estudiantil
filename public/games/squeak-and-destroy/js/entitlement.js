/* ============================================================================
 * Squeak & Destroy — entitlement.js :: CA.Entitlement
 * Demo (free) vs FULL (paid) unlock — ONE flag, resolved per platform.
 *
 * FINAL monetization model (locked 2026-06-08):
 *   Web (browser)                →  FREE, FULL game — a marketing funnel, NOT a
 *                                   paywall. Strong CTA to wishlist on Steam /
 *                                   download on mobile.
 *   Windows / Mac / Steam        →  FULL game $7.99 (free browser demo available).
 *   Mobile (iOS / Android)       →  FREE with ads + $4.99 IAP to remove ads /
 *                                   unlock everything.
 *
 *   • Web / PWA  → free, full game (funnel). The content gates here resolve to
 *                  the free experience; the actual demo-vs-full scoping lives in
 *                  CA.DEMO elsewhere. A supporter key (ca_full='1') or ?full=1
 *                  flips the local flag for QA/parity, but the web build is meant
 *                  to be fully playable for everyone.
 *   • App Store  → FREE app + Non-Consumable IAP ($4.99) that removes ads and
 *                  unlocks everything. A native launch does NOT mean owned;
 *                  the IAP (RevenueCat-shaped) path resolves ownership. Set
 *                  PAID_NATIVE=true only if a build is ever shipped as a paid
 *                  app (native launch == owned, no IAP).
 *   • Steam      → ownership of the FULL app id (Electron + steamworks.js).
 *                  There is NO in-app unlock on Steam: the demo opens the
 *                  store overlay; buying happens in Steam; the full build
 *                  (or same build under the full app id) then reports owned.
 *
 * NOTE: the WEB build is the free, fully-unlocked marketing funnel — it never
 * locks content. The real demo-vs-full gating lives in CA.demoLocked() and the
 * CA.DEMO_* allowlists (contract.js); can()/GATED only matter on paid platforms
 * and resolve to "always allowed" on web. Nothing else in the game needs to
 * know which store the player is on.
 *
 * This module is SAFE to ship now: with no plugin/Steam present it simply
 * resolves to the free demo. Wire the real plugin calls when the native
 * wrap (Capacitor / Electron+steamworks) is built. PHP 5.6 N/A (pure JS,
 * no ?? / arrow / short-array to keep the bundle ES2018-clean).
 *
 * ── DEMO→FULL CARRYOVER (idea #4) ──────────────────────────────────────────
 * localStorage keys this layer touches / relies on:
 *   'ca_full'  — OWNED HERE. Web supporter-key local unlock flag ('1' = full).
 *   'ca_meta'  — OWNED BY meta.js (CA.Meta). The single shared progress blob
 *                (coins, cosmetics, XP, mastery, skill ranks, season progress).
 * The free/demo and FULL builds read/write the SAME 'ca_meta', so unlocking the
 * full version (?full=1, supporter key, IAP, or Steam ownership) preserves all
 * earned progress automatically — there is no separate "full" profile to import.
 * CA.Meta.init() additionally stamps a one-time carryover marker on first full
 * boot and re-stamps on the 'entitlementChanged' event we emit below, so the
 * order between Entitlement.init() and Meta.init() does not matter.
 * ==========================================================================*/
(function(){
  'use strict';

  // EN translations for IAP / store messages (surfaced to the player).
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'A bolt nem elérhető.':'The store is not available.',
    'Megszakítva.':'Cancelled.',
    'Nincs mit visszaállítani itt.':'Nothing to restore here.',
    'Nem találtunk korábbi vásárlást.':'No previous purchase found.',
    'Sikertelen visszaállítás.':'Restore failed.',
    'A teljes verzió a boltban lesz elérhető.':'The full version will be available in the store.'
  });

  var E = {
    full:    false,       // the single source of truth read by every gate
    ready:   false,       // resolved at least once
    store:   'web',       // 'web' | 'apple' | 'steam'
    price:   '',          // localized price string from the store (when known)
    _product: null,       // platform purchase handle (RevenueCat package, etc.)

    /* ---- CONFIG (fill these at ship time) ---- */
    FULL_APPID: 0,                 // Steam app id of the PAID game
    APPLE_ENT:  'full',            // RevenueCat entitlement id for the mobile
                                   // "Remove ads / Full unlock" Non-Consumable IAP
                                   // ($4.99). Map this entitlement to the product
                                   // in the RevenueCat dashboard (see
                                   // docs/MOBILE_MONETIZATION.md). When active,
                                   // isFull()=true → CA.Ads.adFree()=true (no ads).
    PAID_NATIVE: false,            // FINAL model: mobile = FREE + $4.99 IAP, so a
                                   // native launch is NOT owned → run the IAP path.
                                   // (true = paid app: native launch == owned, no IAP.)

    /* ---- persistence keys (documentation / single reference) ---- */
    LOCAL_KEY:   'ca_full',        // OWNED HERE: web supporter-key full-unlock flag
    PROFILE_KEY: 'ca_meta',        // OWNED BY CA.Meta: shared demo↔full progress blob

    /* ---- which features require the FULL version ----
     * Flip these as the demo scope is decided. `false` = available in the demo. */
    GATED: {
      campaign:   true,   // story campaign
      online:     true,   // online multiplayer (post-launch anyway)
      ranked:     true,   // ranked / leaderboard submit
      allWeapons: true,   // full arsenal (demo = a curated subset)
      allClasses: true,   // all 6 classes (demo = a couple)
      allMaps:    false,  // all biomes (demo can keep these open — cheap goodwill)
      gauntlet:   true    // roguelite run mode (when it exists)
    },

    /* ---- public API ---- */
    isFull: function(){ return !!this.full; },
    // can the player use feature `id`?  Web is the free FULL funnel → always true
    // there; otherwise true if the feature isn't gated, or full is unlocked.
    can: function(id){ return this.store === 'web' || !this.GATED[id] || !!this.full; },
    // true if there IS a purchase path on this platform (web demo + paid native have none)
    canPurchase: function(){
      if (this.store === 'apple' && this.PAID_NATIVE) return false;  // paid app = nothing to buy in-app
      return this.store === 'apple' || this.store === 'steam';
    },

    _emit: function(){
      this.ready = true;
      try { if (CA.events) CA.events.emit('entitlementChanged', this.full); } catch(e){}
    },
    _setFull: function(v){ this.full = !!v; this._emit(); },

    /* ---- boot: detect platform, resolve ownership ---- */
    init: function(){
      // dev / QA override: ?full=1 unlocks everything for testing
      try { if (/[?&]full=1\b/.test(location.search)) { this.store='web'; this._setFull(true); return; } } catch(e){}
      // PAID App Store build: the purchase happens BEFORE download, so a native
      // launch means the player already owns it → resolve full, skip all IAP.
      if (window.Capacitor && this.PAID_NATIVE)      { this.store='apple'; this._setFull(true); return; }
      if (window.Capacitor)                          this._apple();   // (free+IAP path, dormant)
      // Steam: only when the Electron preload bridge is actually present + ready.
      // (window.steamworks kept as a defensive legacy fallback.)
      else if ((window.SteamAPI && window.SteamAPI.available) || window.steamworks) this._steam();
      else                                           this._web();
    },

    /* ---- WEB / PWA: free, full game (marketing funnel) ---- */
    _web: function(){
      this.store = 'web';
      // optional: a redeemed supporter key could persist a local unlock
      var f = false; try { f = localStorage.getItem('ca_full') === '1'; } catch(e){}
      this._setFull(f);
    },

    /* ---- APPLE / mobile: "Remove ads / Full unlock" Non-Consumable IAP ----
     * Mobile is FREE+ads; this resolves whether the $4.99 ad-free IAP is owned.
     * On purchase()→_buyApple() success we _setFull(true), which immediately
     * makes CA.Ads.adFree() true so interstitials/banners stop. RevenueCat-shaped
     * plugin (window.Purchases). With no plugin wired yet → demo/free + ads. */
    _apple: function(){
      this.store = 'apple';
      var self = this;
      if (!window.Purchases) { this._web(); this.store='apple'; return; } // plugin not wired yet → demo
      try {
        Purchases.getCustomerInfo()
          .then(function(ci){ self._setFull(self._appleActive(ci)); })
          .catch(function(){ self._setFull(false); });
        Purchases.getOfferings()
          .then(function(o){
            try {
              self._product = o.current.availablePackages[0];
              if (self._product && self._product.product) self.price = self._product.product.priceString || '';
            } catch(e){}
          })
          .catch(function(){});
      } catch(e){ self._setFull(false); }
    },
    _appleActive: function(ci){
      try { return !!(ci && ci.entitlements && ci.entitlements.active && ci.entitlements.active[this.APPLE_ENT]); }
      catch(e){ return false; }
    },
    _buyApple: function(){
      var self = this;
      if (!window.Purchases || !this._product) return Promise.resolve({ ok:false, err:CA.t('A bolt nem elérhető.') });
      return Purchases.purchasePackage({ aPackage:this._product }).then(function(res){
        var on = self._appleActive(res && res.customerInfo);
        self._setFull(on); return { ok:on };
      }).catch(function(e){
        // user-cancel is not an error worth shouting about
        var cancelled = e && (e.userCancelled || e.code === '1' || /cancel/i.test(e.message||''));
        return { ok:false, cancelled:!!cancelled, err:(e && e.message) || CA.t('Megszakítva.') };
      });
    },
    // Apple REQUIRES a visible "Restore purchases" action.
    restore: function(){
      var self = this;
      if (!window.Purchases) return Promise.resolve({ ok:false, err:CA.t('Nincs mit visszaállítani itt.') });
      return Purchases.restorePurchases().then(function(ci){
        var on = self._appleActive(ci); self._setFull(on);
        return { ok:on, err: on ? '' : CA.t('Nem találtunk korábbi vásárlást.') };
      }).catch(function(){ return { ok:false, err:CA.t('Sikertelen visszaállítás.') }; });
    },

    /* ---- STEAM: ownership check (Electron preload bridge: window.SteamAPI) ----
     * The Electron main process loads steamworks.js and exposes a tiny IPC-backed
     * bridge via contextBridge as window.SteamAPI (see HÍD-SZERZŐDÉS in
     * docs/STEAM_RELEASE.md). Ownership of the FULL app is resolved ASYNC through
     * window.SteamAPI.isOwned(); the client-side FULL_APPID is NOT the gate. */
    _steam: function(){
      this.store = 'steam';
      var self = this;
      var api = window.SteamAPI;
      // Pick up the app id from the bridge when present (informational only).
      try { if (api && typeof api.appId === 'number' && api.appId) self.FULL_APPID = api.appId; } catch(e){}
      if (api && typeof api.isOwned === 'function') {
        try {
          api.isOwned()
            .then(function(owned){ self._setFull(!!owned); })
            .catch(function(){ self._setFull(false); });
        } catch(e){ self._setFull(false); }
        return;
      }
      // No bridge (e.g. legacy window.steamworks only, or Steam not ready) → demo.
      self._setFull(false);
    },
    // Steam buy = open the store overlay; purchase completes inside Steam.
    _buySteam: function(){
      try {
        var api = window.SteamAPI;
        if (api && typeof api.openStore === 'function') { api.openStore(); return true; }
        // fallback: steam:// protocol deep-link to the store page
        if (this.FULL_APPID) { try { window.open('steam://store/' + this.FULL_APPID); return true; } catch(e){} }
      } catch(e){}
      return false;
    },

    /* ---- unified entry the UI calls regardless of platform ---- */
    purchase: function(){
      if (this.store === 'apple') return this._buyApple();
      if (this.store === 'steam') { var ok = this._buySteam(); return Promise.resolve({ ok:ok, external:true }); }
      return Promise.resolve({ ok:false, err:CA.t('A teljes verzió a boltban lesz elérhető.') });
    }
  };

  CA.Entitlement = E;
})();
