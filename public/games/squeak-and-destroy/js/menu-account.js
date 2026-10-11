/* ============================================================================
 * Squeak & Destroy — menu-account.js :: the "Fiók / Account" login screen.
 * SkyNet SSO status + regular register/login, so progress (skill tree, XP)
 * saves to the cloud. Registers a DOM screen via CA.Menu.register('login').
 * ==========================================================================*/
(function(){
  'use strict';
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Fiók':'Account', 'Bejelentkezés':'Sign in', 'Regisztráció':'Register',
    'Felhasználónév':'Username', 'Jelszó':'Password', 'Jelszó újra':'Password again',
    'Email':'Email', 'Belépés':'Log in',
    'Kilépés':'Log out', 'Vendég':'Guest', 'Belépés SkyNet-tel':'Sign in with SkyNet',
    'Bejelentkezve':'Signed in', 'A haladásod a felhőbe mentődik.':'Your progress is saved to the cloud.',
    'SkyNet-fiók (automatikus)':'SkyNet account (automatic)',
    'Lépj be, hogy a képességfád és XP-d bárhol elérhető legyen.':'Log in so your skill tree and XP follow you anywhere.',
    'Még nincs fiókod? Regisztrálj egy névvel és jelszóval.':'No account yet? Register with a name and password.',
    'Vendégként játszol — a haladás csak ezen az eszközön marad.':'Playing as guest — progress stays on this device only.',
    'Kapcsolódás…':'Connecting…',
    'Fiók törlése':'Delete account',
    'Biztosan törlöd a fiókodat? Ez végleges — minden felhő-adat törlődik.':'Delete your account? This is permanent — all cloud data is erased.',
    'Igen, töröld':'Yes, delete', 'Mégse':'Cancel', 'Fiók törölve.':'Account deleted.',
    // -- form validation / error messages (shown via setMsg) --
    'Sikertelen.':'Failed.',
    'Add meg a neved és jelszavad.':'Enter your name and password.',
    'A név legalább 3 karakter.':'Name must be at least 3 characters.',
    'Érvényes email cím kell.':'A valid email address is required.',
    'A jelszó legalább 4 karakter.':'Password must be at least 4 characters.',
    'A két jelszó nem egyezik.':'The two passwords do not match.',
    // -- server-side errors (account.php returns these as res.err; shown via t()) --
    'Túl sok próbálkozás. Várj pár percet.':'Too many attempts. Wait a few minutes.',
    'Ez a név már foglalt.':'That name is already taken.',
    'Hibás név vagy jelszó.':'Wrong name or password.',
    'túl nagy profil':'Profile too large.',
    'nem jogosult':'Not authorized.',
    'Nincs kapcsolat a szerverrel.':'No connection to the server.',
    // -- registration consent (App Store / GDPR) --
    'Elfogadom az':'I accept the',
    'Adatvédelmi tájékoztatót':'Privacy Policy',
    'és a Felhasználási feltételeket.':'and the Terms of Use.',
    'Fogadd el az Adatvédelmi tájékoztatót a regisztrációhoz.':'Please accept the Privacy Policy to register.'
  });

  CA.Menu && CA.Menu.register && CA.Menu.register('login', function(API){
    var el = API.el, t = API.t, esc = API.esc;
    var sc = API.screen('🔑', 'Fiók');
    var body = sc.body;
    var wrap = el('div','panel section');
    body.appendChild(wrap);

    var msg = el('div','muted',''); // status / error line

    function setMsg(text, ok){ msg.textContent = text||''; msg.style.color = ok===false ? 'var(--red)' : (ok===true ? 'var(--green)' : 'var(--ink-dim)'); }

    function render(){
      wrap.innerHTML = '';
      var A = CA.Account || {};
      var u = A.user;

      if (!A.ready){
        wrap.append(el('div','muted','<span data-t="Kapcsolódás…">Kapcsolódás…</span>'));
        API.applyI18n(wrap); return;
      }

      if (u){
        // signed in
        var head = el('div','row','');
        if (u.foto){ var img=el('img'); img.src=u.foto; img.style.cssText='width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--green)'; head.appendChild(img); }
        var who = el('div','', '<div style="font-weight:800;font-size:18px">'+esc(u.name||'')+'</div>'+
          '<div class="muted">'+(u.source==='skynet'
              ? '🟢 <span data-t="SkyNet-fiók (automatikus)">SkyNet-fiók (automatikus)</span>'
              : '🟢 <span data-t="Bejelentkezve">Bejelentkezve</span>')+'</div>');
        head.appendChild(who);
        wrap.appendChild(head);
        wrap.appendChild(el('div','card','💾 <span data-t="A haladásod a felhőbe mentődik.">A haladásod a felhőbe mentődik.</span>'));
        if (u.source !== 'skynet'){
          var lo = API.btn('🚪 '+t('Kilépés'), 'btn--ghost', function(){ CA.Account.logout(); setMsg(''); });
          wrap.appendChild(lo);
        }
        // Account deletion (App Store Guideline 5.1.1(v)) — inline 2-step confirm,
        // no native alert() (keeps the DOM design). Available for every account.
        var delWrap = el('div','section'); delWrap.style.marginTop='var(--s3)';
        var delBtn = API.btn('🗑️ <span data-t="Fiók törlése">Fiók törlése</span>','btn--ghost btn--block',
          function(){ showConfirm(); });
        delBtn.style.opacity='0.8';
        delWrap.appendChild(delBtn);
        wrap.appendChild(delWrap);
        function showConfirm(){
          delWrap.innerHTML='';
          delWrap.appendChild(el('div','card','⚠️ <span data-t="Biztosan törlöd a fiókodat? Ez végleges — minden felhő-adat törlődik.">Biztosan törlöd a fiókodat? Ez végleges — minden felhő-adat törlődik.</span>'));
          var row=el('div','row'); row.style.gap='var(--s3)';
          var yes=API.btn('🗑️ '+t('Igen, töröld'),'btn--red', function(){
            yes.disabled=true; setMsg(t('Kapcsolódás…'));
            CA.Account.deleteAccount().then(function(res){
              if(res&&res.ok){ setMsg(t('Fiók törölve.'), true); render(); }
              else { yes.disabled=false; setMsg((res&&res.err&&t(res.err))||t('Sikertelen.'), false); }
            });
          });
          var no=API.btn(t('Mégse'),'btn--ghost', function(){ render(); });
          row.append(yes,no); delWrap.appendChild(row);
          API.applyI18n(delWrap);
        }
        wrap.appendChild(msg);
        API.applyI18n(wrap); return;
      }

      // anonymous → two columns: LEFT = login, RIGHT = register
      wrap.appendChild(el('div','muted','<span data-t="Lépj be, hogy a képességfád és XP-d bárhol elérhető legyen.">Lépj be, hogy a képességfád és XP-d bárhol elérhető legyen.</span>'));

      var busy=false;
      function run(promise){ if(busy) return; busy=true; setMsg(t('Kapcsolódás…'));
        var done=function(res){ busy=false;
          if(res && res.ok){ setMsg('', true); render(); }
          else setMsg((res && res.err && t(res.err)) || t('Sikertelen.'), false); };
        // .catch so a rejected promise never leaves the form stuck on "Kapcsolódás…"
        Promise.resolve(promise).then(done, function(){ busy=false; setMsg(t('Nincs kapcsolat a szerverrel.'), false); }); }

      // SkyNet SSO sign-in (for colleagues logged into the vezérlőpult)
      var skBtn = API.btn('🟢 <span data-t="Belépés SkyNet-tel">Belépés SkyNet-tel</span>','btn--green btn--block',
        function(){ if(CA.Account&&CA.Account.loginSkynet) run(CA.Account.loginSkynet()); });
      wrap.appendChild(skBtn);

      var cols=el('div','row'); cols.style.alignItems='flex-start'; cols.style.gap='var(--s4)';

      // LEFT — login
      var loginC=el('div','section card'); loginC.style.flex='1'; loginC.style.minWidth='240px';
      loginC.append(el('h3',null,'<span data-t="Bejelentkezés">Bejelentkezés</span>'));
      var lUser=API.field(t('Felhasználónév')); lUser.input.autocapitalize='off'; lUser.input.maxLength=32;
      var lPass=API.field(t('Jelszó')); lPass.input.type='password'; lPass.input.maxLength=64;
      function doLogin(){ var u=(lUser.input.value||'').trim(), p=lPass.input.value||'';
        if(u.length<3||p.length<4){ setMsg(t('Add meg a neved és jelszavad.'), false); return; }
        run(CA.Account.login(u,p)); }
      var bLogin=API.btn(t('Belépés'),'btn--green btn--block', doLogin);
      lPass.input.addEventListener('keydown',function(e){ if(e.key==='Enter') doLogin(); });
      loginC.append(lUser,lPass,bLogin);

      // RIGHT — register (név + email + jelszó 2x)
      var regC=el('div','section card'); regC.style.flex='1'; regC.style.minWidth='240px';
      regC.append(el('h3',null,'<span data-t="Regisztráció">Regisztráció</span>'));
      var rUser=API.field(t('Felhasználónév')); rUser.input.autocapitalize='off'; rUser.input.maxLength=32;
      var rEmail=API.field(t('Email')); rEmail.input.type='email';
      var rPass=API.field(t('Jelszó')); rPass.input.type='password'; rPass.input.maxLength=64;
      var rPass2=API.field(t('Jelszó újra')); rPass2.input.type='password'; rPass2.input.maxLength=64;
      // required privacy/terms consent (App Store + GDPR) — must be ticked before register
      var consentWrap = el('label','consent-row');
      consentWrap.style.cssText='display:flex;align-items:flex-start;gap:8px;font-size:13px;margin:6px 0;cursor:pointer;';
      var consent = document.createElement('input'); consent.type='checkbox';
      consentWrap.appendChild(consent);
      var consentTxt = el('span','muted',
        '<span data-t="Elfogadom az">Elfogadom az</span> '+
        '<a href="./privacy.html" target="_blank" rel="noopener" data-t="Adatvédelmi tájékoztatót">Adatvédelmi tájékoztatót</a> '+
        '<span data-t="és a Felhasználási feltételeket.">és a Felhasználási feltételeket.</span>');
      // link opens in a new tab and must not toggle the checkbox
      var consentLink = consentTxt.querySelector('a');
      if (consentLink) consentLink.addEventListener('click', function(e){ e.stopPropagation(); });
      consentWrap.appendChild(consentTxt);

      function doReg(){ var u=(rUser.input.value||'').trim(), em=(rEmail.input.value||'').trim(),
            p=rPass.input.value||'', p2=rPass2.input.value||'';
        if(u.length<3){ setMsg(t('A név legalább 3 karakter.'), false); return; }
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ setMsg(t('Érvényes email cím kell.'), false); return; }
        if(p.length<4){ setMsg(t('A jelszó legalább 4 karakter.'), false); return; }
        if(p!==p2){ setMsg(t('A két jelszó nem egyezik.'), false); return; }
        if(!consent.checked){ setMsg(t('Fogadd el az Adatvédelmi tájékoztatót a regisztrációhoz.'), false); return; }
        run(CA.Account.register(u,em,p)); }
      var bReg=API.btn(t('Regisztráció'),'btn--purple btn--block', doReg);
      regC.append(rUser,rEmail,rPass,rPass2,consentWrap,bReg);

      cols.append(loginC,regC);
      wrap.appendChild(cols);
      wrap.appendChild(msg);
      API.applyI18n(wrap);
    }

    // re-render whenever the account state changes
    try { if (CA.events) CA.events.on('accountChanged', render); } catch(e){}

    return { el: sc.screen, onShow: render };
  });
})();
