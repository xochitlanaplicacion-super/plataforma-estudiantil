/* ============================================================================
 * Squeak & Destroy — Contact / Kapcsolat submenu screen (DOM).
 * Company contact info (web, email, Discord, Facebook) + a message form that
 * POSTs {name,email,message} to contact.php and shows a success/error toast.
 * Registered via CA.Menu.register('contact', build). Self-contained, never
 * throws. Fully localized (HU keys + EN via addEN).
 * ==========================================================================*/
(function(){
  if(window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Kapcsolat':'Contact',
    'Lépj kapcsolatba velünk':'Get in touch',
    'Kérdésed, ötleted vagy hibabejelentésed van? Írj nekünk — minden üzenetet elolvasunk.':
      'Got a question, an idea or a bug report? Drop us a line — we read every message.',
    'Weboldal':'Website',
    'Üzenet küldése':'Send us a message',
    'Neved':'Your name',
    'E-mail címed':'Your email',
    'Üzenet':'Message',
    '📨 Küldés':'📨 Send',
    'Küldés…':'Sending…',
    // -- toasts / validation --
    'Köszönjük! Megkaptuk az üzeneted. ✅':'Thanks! We got your message. ✅',
    'Az üzenetet nem sikerült elküldeni. Próbáld újra később.':'Could not send the message. Please try again later.',
    'Add meg a neved.':'Please enter your name.',
    'Adj meg egy érvényes e-mail címet.':'Please enter a valid email address.',
    'Írj egy üzenetet (legalább 5 karakter).':'Please write a message (at least 5 characters).',
    'Nincs kapcsolat. Próbáld újra később.':'No connection. Please try again later.'
  });

  // native build -> live origin; web -> same-origin (no-op).
  var ENDPOINT = (window.CA && CA.api) ? CA.api('contact.php') : 'contact.php';
  function creds(){ return (window.CA && CA.API_BASE && CA.API_BASE !== '') ? 'include' : 'same-origin'; }
  function toast(msg){ try{ if(window.CA && CA.events) CA.events.emit('toast', msg); }catch(e){} }
  function validEmail(s){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s||'')); }

  function build(API){
    var r = API.screen('✉️','Kapcsolat');
    var screen = r.screen, body = r.body;

    var wrap = API.el('div','section');
    wrap.style.cssText = 'max-width:520px;margin:0 auto;gap:var(--s4)';

    // ---- intro ----------------------------------------------------------
    var intro = API.panel();
    intro.style.textAlign = 'center';
    var iH = API.el('h3',null,'<span data-t="Lépj kapcsolatba velünk">Lépj kapcsolatba velünk</span>');
    iH.style.cssText = 'color:var(--accent);margin:0';
    var iT = API.el('div','muted','<span data-t="Kérdésed, ötleted vagy hibabejelentésed van? Írj nekünk — minden üzenetet elolvasunk.">'+
      API.esc(API.t('Kérdésed, ötleted vagy hibabejelentésed van? Írj nekünk — minden üzenetet elolvasunk.'))+'</span>');
    iT.style.cssText = 'line-height:1.5;margin-top:var(--s2)';
    intro.append(iH, iT);

    // ---- contact-info card ---------------------------------------------
    var info = API.panel();
    info.append(API.el('div',null,'<strong>Los Polos Amigos Games</strong>'));
    function link(emoji, labelT, href, text){
      var row = API.el('div',null,
        emoji+' <span class="muted" data-t="'+API.esc(labelT)+'">'+API.esc(API.t(labelT))+'</span>: '+
        '<a href="'+API.esc(href)+'" target="_blank" rel="noopener noreferrer" style="color:var(--orange,#E8711A);font-weight:700">'+API.esc(text)+'</a>');
      row.style.cssText = 'margin-top:var(--s2);font-size:14px';
      return row;
    }
    info.append(
      link('🌐','Weboldal','https://squeakanddestroy.com','squeakanddestroy.com'),
      link('✉️','Email','mailto:contact@squeakanddestroy.com','contact@squeakanddestroy.com'),
      link('💬','Discord','https://discord.com/channels/1513123296668024922/1513123297716605062','Discord'),
      link('📘','Facebook','https://www.facebook.com/profile.php?id=61590317596111','Facebook')
    );

    // ---- message form ---------------------------------------------------
    var form = API.panel();
    var fH = API.el('h3',null,'<span data-t="Üzenet küldése">Üzenet küldése</span>');
    fH.style.cssText = 'color:var(--accent);margin:0 0 var(--s2)';
    form.append(fH);

    var nameF = API.field(API.t('Neved'));
    nameF.input.type = 'text';
    nameF.input.maxLength = 80;
    nameF.input.placeholder = 'Capybara Joe';
    nameF.input.autocomplete = 'name';

    var mailF = API.field(API.t('E-mail címed'));
    mailF.input.type = 'email';
    mailF.input.maxLength = 160;
    mailF.input.placeholder = 'capybara@example.com';
    mailF.input.autocomplete = 'email';

    // message textarea (API.field is single-line; build the textarea by hand)
    var msgWrap = API.el('div','field');
    msgWrap.append(API.el('label',null,'<span data-t="Üzenet">'+API.esc(API.t('Üzenet'))+'</span>'));
    var msgInput = API.el('textarea','input');
    msgInput.rows = 5;
    msgInput.maxLength = 4000;
    msgInput.style.cssText = 'resize:vertical;min-height:96px;font:inherit';
    msgWrap.append(msgInput);

    var status = API.el('div','muted','');
    status.style.cssText = 'min-height:18px;font-size:13px;margin-top:var(--s1)';
    function setStatus(text, ok){
      status.textContent = text || '';
      status.style.color = ok===false ? 'var(--red)' : (ok===true ? 'var(--green)' : 'var(--ink-dim)');
    }

    var sendBtn = API.btn('<span data-t="📨 Küldés">📨 Küldés</span>','btn--primary', send);
    sendBtn.style.marginTop = 'var(--s2)';

    form.append(nameF, mailF, msgWrap, status, sendBtn);

    function send(){
      var name = (nameF.input.value || '').trim();
      var email = (mailF.input.value || '').trim();
      var message = (msgInput.value || '').trim();

      if(!name){ setStatus(API.t('Add meg a neved.'), false); return; }
      if(!validEmail(email)){ setStatus(API.t('Adj meg egy érvényes e-mail címet.'), false); return; }
      if(message.length < 5){ setStatus(API.t('Írj egy üzenetet (legalább 5 karakter).'), false); return; }

      sendBtn.disabled = true;
      setStatus(API.t('Küldés…'), null);

      fetch(ENDPOINT, {
        method:'POST',
        credentials: creds(),
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ name:name, email:email, message:message })
      }).then(function(res){ return res.json(); })
        .then(function(j){
          if(j && j.ok){
            toast(API.t('Köszönjük! Megkaptuk az üzeneted. ✅'));
            setStatus(API.t('Köszönjük! Megkaptuk az üzeneted. ✅'), true);
            nameF.input.value = ''; mailF.input.value = ''; msgInput.value = '';
          } else {
            var m = API.t('Az üzenetet nem sikerült elküldeni. Próbáld újra később.');
            toast('⚠️ '+m); setStatus(m, false);
          }
        })
        .catch(function(){
          var m = API.t('Nincs kapcsolat. Próbáld újra később.');
          toast('⚠️ '+m); setStatus(m, false);
        })
        .then(function(){ sendBtn.disabled = false; });
    }

    wrap.append(intro, info, form);
    body.append(wrap);
    return { el: screen };
  }

  if(window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('contact', build);
})();
