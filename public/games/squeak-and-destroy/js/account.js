/* ============================================================================
 * Squeak & Destroy — account.js :: CA.Account
 * SkyNet SSO + regular register/login + cloud-profile sync (account.php).
 *  - Detects a logged-in SkyNet (vezérlőpult) user automatically.
 *  - Falls back to a stored regular-account token, else anonymous (local only).
 *  - When logged in, the player's whole CA.Meta profile (XP, per-class skill
 *    tree, unlocks, achievements) is saved to the cloud and restored on login.
 * Everything is best-effort: no backend (e.g. localhost/file://) → anonymous.
 * ==========================================================================*/
(function(){
  'use strict';
  // EN translations for account error messages (shown via setMsg textContent).
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Sikertelen regisztráció.':'Registration failed.',
    'Sikertelen belépés.':'Login failed.',
    'Nem vagy belépve.':'You are not logged in.',
    'Nem vagy belépve a SkyNetbe.':'You are not logged in to SkyNet.'
  });
  var TOKEN_KEY = 'ca_acc_token';
  // last successful cloud push time (SERVER time(), seconds) — used for last-write-
  // wins on offline→reconnect so a stale cloud profile can't clobber newer LOCAL
  // progress earned while offline. Stamped ONLY on a confirmed {ok:true} save.
  var SAVED_AT_KEY = 'ca_meta_savedAt';
  var API = 'account.php';

  function _readSavedAt(){
    try { var v = parseInt(localStorage.getItem(SAVED_AT_KEY), 10); return isFinite(v) ? v : 0; }
    catch(e){ return 0; }
  }
  function _writeSavedAt(t){
    try { localStorage.setItem(SAVED_AT_KEY, String(t|0)); } catch(e){}
  }
  // best-effort "does the local profile hold meaningful progress?" — used as a
  // conservative tie-breaker when timestamps are missing. (xp/coins/games/level>1)
  function _hasLocalProgress(){
    try {
      var p = CA.Meta && CA.Meta.exportProfile ? CA.Meta.exportProfile() : null;
      if (!p) return false;
      if ((p.xp|0) > 0 || (p.coins|0) > 0 || ((p.level|0) > 1)) return true;
      if (p.stats && ((p.stats.games|0) > 0 || (p.stats.kills|0) > 0)) return true;
      if (Array.isArray(p.cosmetics) && p.cosmetics.length) return true;
      return false;
    } catch(e){ return false; }
  }

  var A = {
    user: null,          // {uid,name,foto,source} | null
    token: null,         // regular-account token (null for SkyNet/anon)
    ready: false,
    _pushT: null,

    isLoggedIn: function(){ return !!(this.user && this.user.uid); },
    isSkynet:   function(){ return !!(this.user && this.user.source === 'skynet'); },
    name:       function(){ return this.user ? this.user.name : null; },

    // backend URL (same-origin on web; live origin in native builds — see CA.api)
    _url: function(qs){ return (CA.api ? CA.api(API) : API) + '?' + qs; },
    // NATIVE builds (Capacitor/file://) talk to a CROSS-ORIGIN API_BASE; the SkyNet
    // SSO session cookie is only sent with credentials:'include'. The web build is
    // same-origin → keep 'same-origin'. (#native-sso)
    _creds: function(){ return (CA.API_BASE && CA.API_BASE !== '') ? 'include' : 'same-origin'; },

    /* ---- low-level fetch helpers (resolve to null on any failure) ---- */
    _get: function(qs){
      return fetch(this._url(qs), { credentials:this._creds() })
        .then(function(r){ return r.ok ? r.json() : null; })
        .catch(function(){ return null; });
    },
    _post: function(qs, body){
      return fetch(this._url(qs), {
        method:'POST', credentials:this._creds(),
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(body||{})
      }).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
    },

    /* ---- boot: SkyNet SSO → stored token → anonymous ---- */
    init: function(){
      var self = this;
      // if the user explicitly logged out, DON'T auto-login via SkyNet SSO
      var ssoOff=false; try{ ssoOff = localStorage.getItem('ca_sso_off')==='1'; }catch(e){}
      var step1 = ssoOff ? Promise.resolve(null) : this._get('action=skynet');
      // 1) SkyNet SSO probe (unless logged out)
      return step1.then(function(res){
        if (res && res.ok && res.user){
          self._setUser(res.user, null);
          return self._afterLogin();
        }
        // 2) stored regular-account token
        var tok = null; try { tok = localStorage.getItem(TOKEN_KEY); } catch(e){}
        if (tok){
          return self._get('action=session&token=' + encodeURIComponent(tok)).then(function(s){
            if (s && s.ok && s.user){ self._setUser(s.user, tok); return self._afterLogin(); }
            self._clearToken();
            self._finishAnon();
          });
        }
        self._finishAnon();
      });
    },

    _finishAnon: function(){ this.user=null; this.token=null; this.ready=true; this._emit(); },

    _setUser: function(u, token){
      this.user = u; this.token = token || null;
      if (token){ try { localStorage.setItem(TOKEN_KEY, token); } catch(e){} }
    },
    _clearToken: function(){ this.token=null; try { localStorage.removeItem(TOKEN_KEY); } catch(e){} },
    _emit: function(){ try { if (CA.events) CA.events.emit('accountChanged', this.user); } catch(e){} },

    /* ---- public: register / login / logout ---- */
    register: function(user, email, pass){
      var self = this;
      return this._post('action=register', { user:user, email:email, pass:pass }).then(function(res){
        if (!res) return { ok:false, err:'Nincs kapcsolat a szerverrel.' };
        if (res.ok){ self._setUser(res.user, res.token); return self._afterLogin().then(function(){ return { ok:true }; }); }
        return { ok:false, err: res.err || CA.t('Sikertelen regisztráció.') };
      });
    },
    login: function(user, pass){
      var self = this;
      return this._post('action=login', { user:user, pass:pass }).then(function(res){
        if (!res) return { ok:false, err:'Nincs kapcsolat a szerverrel.' };
        if (res.ok){ self._setUser(res.user, res.token); return self._afterLogin().then(function(){ return { ok:true }; }); }
        return { ok:false, err: res.err || CA.t('Sikertelen belépés.') };
      });
    },
    logout: function(){
      // revoke the token SERVER-SIDE too (best-effort) so a leaked token dies on logout
      try {
        if (this.user && this.user.uid && String(this.user.uid).indexOf('acc:')===0){
          this._post('action=logout', { uid:this.user.uid, token:this.token||'' });
        }
      } catch(e){}
      this._clearToken(); this.user=null;
      try { localStorage.setItem('ca_sso_off','1'); } catch(e){}   // stay logged out (no SSO re-login)
      try { if (CA.Meta && CA.Meta.resetProfile) CA.Meta.resetProfile(); } catch(e){} // don't leave account data visible
      this.ready = true; this._emit();
    },
    // delete the account + cloud profile (App Store Guideline 5.1.1(v)).
    // Server wipes accounts.json row + profiles/<uid>.json; client clears local
    // state and resets the profile, then drops to anonymous (no SSO re-login).
    deleteAccount: function(){
      var self = this;
      if (!this.isLoggedIn()) return Promise.resolve({ ok:false, err:CA.t('Nem vagy belépve.') });
      var uid = this.user.uid, token = this.token || '';
      return this._post('action=delete', { uid:uid, token:token }).then(function(res){
        if (!res || !res.ok) return { ok:false, err:(res && res.err) || 'Nincs kapcsolat a szerverrel.' };
        self._clearToken(); self.user = null;
        try { localStorage.setItem('ca_sso_off','1'); } catch(e){}        // don't auto-SSO back in
        try { if (CA.Meta && CA.Meta.resetProfile) CA.Meta.resetProfile(); } catch(e){}
        self.ready = true; self._emit();
        return { ok:true };
      });
    },
    // explicitly (re)enable SkyNet SSO and sign in with it
    loginSkynet: function(){
      var self=this;
      try { localStorage.removeItem('ca_sso_off'); } catch(e){}
      return this._get('action=skynet').then(function(res){
        if (res && res.ok && res.user){ self._setUser(res.user, null); return self._afterLogin().then(function(){ return {ok:true}; }); }
        return { ok:false, err:CA.t('Nem vagy belépve a SkyNetbe.') };
      });
    },

    /* ---- profile sync ---- */
    // after any login: pull the cloud profile (adopt it) OR seed it with the
    // current local profile if the account has none yet.
    _afterLogin: function(){
      var self = this; this.ready = true; this._emit();
      if (!this.isLoggedIn() || !CA.Meta) return Promise.resolve();
      return this._get('action=load&uid=' + encodeURIComponent(this.user.uid) + '&token=' + encodeURIComponent(this.token || '')).then(function(res){
        if (res && res.ok && res.profile && CA.Meta.importCloudProfile){
          // returning account → it HAS a cloud save. Last-write-wins on the server
          // 'updated' timestamp vs the locally-recorded last successful push, so a
          // STALE cloud profile can't overwrite newer LOCAL progress earned offline.
          var cloudT = (res && typeof res.updated === 'number') ? res.updated : 0;
          var localT = _readSavedAt();
          var adopt;
          if (cloudT > 0 && localT > 0){
            // both known → adopt cloud only if it is at least as new as our last push.
            adopt = (cloudT >= localT);
          } else {
            // a timestamp is missing → be conservative: prefer cloud UNLESS we hold
            // meaningful local progress that has never been confirmed-pushed.
            adopt = !(localT === 0 && _hasLocalProgress());
          }
          if (adopt){
            try { CA.Meta.importCloudProfile(res.profile); } catch(e){}
          } else {
            // local is newer (or unconfirmed-but-meaningful) → KEEP local, push it up.
            self.pushNow();
          }
        } else {
          // NEW account (no cloud profile yet): KEEP the player's current local
          // progress and SEED the cloud with it. (Previously this reset the profile
          // → a guest who registered LOST all coins/XP/unlocks. #anon-login-wipe)
          self.pushNow();
        }
        self._emit();
      });
    },

    // debounced push (called by meta.js after each local save when logged in)
    schedulePush: function(){
      if (!this.isLoggedIn()) return;
      var self = this;
      if (this._pushT) clearTimeout(this._pushT);
      this._pushT = setTimeout(function(){ self.pushNow(); }, 2500);
    },
    pushNow: function(){
      if (!this.isLoggedIn() || !CA.Meta || !CA.Meta.exportProfile) return;
      var prof = null; try { prof = CA.Meta.exportProfile(); } catch(e){ return; }
      if (!prof) return;
      var self = this;
      return this._post('action=save', { uid:this.user.uid, token:this.token||'', profile:prof })
        .then(function(res){
          if (res && res.ok){
            // confirmed save → stamp local "last successful push" with the server's
            // 'updated' time if present, else our own clock (seconds), for #1's LWW.
            var t = (res && typeof res.updated === 'number') ? res.updated
                                                            : Math.floor(Date.now()/1000);
            _writeSavedAt(t);
            return res;
          }
          // {ok:false} (size rejection, auth, etc.) or null (network). Don't stamp
          // savedAt so the next reconnect won't think the cloud is in sync. Warn ONCE
          // per "too big" rejection so the silent 96KB cap stops being invisible.
          if (res && res.ok === false){
            var msg = res.err || '';
            var tooBig = /nagy|big|size/i.test(String(msg));
            if (tooBig && !self._sizeWarned){
              self._sizeWarned = true;
              try { console.warn('[Account] cloud save rejected: profile too large (>96KB) — not synced.', msg); } catch(e){}
            }
          }
          return res || null;
        });
    },
    _sizeWarned: false
  };

  CA.Account = A;
})();
