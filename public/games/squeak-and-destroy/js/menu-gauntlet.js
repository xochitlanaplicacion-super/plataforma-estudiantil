/* ============================================================================
 * Squeak & Destroy — menu-gauntlet.js :: the 🗡️ GAUNTLET between-wave DRAFT.
 *
 * A DOM screen (id 'gauntlet') registered into the js/menu.js framework via
 * CA.Menu.register('gauntlet', build). It shows the 3 random upgrade cards
 * offered between Gauntlet waves; clicking one applies it to the run and resumes
 * play. The Gauntlet mode (js/modes.js) drives the pause:
 *
 *   modes.js onTurnEnd (wave cleared) -> S.mode = MENU + CA.UI.setScreen('gauntlet')
 *   this screen renders S.modeData.draftCards
 *   click -> CA.Modes.gauntlet.applyDraft(cardId) -> spawns next wave + resumes
 *
 * Pure HTML/CSS over the existing design system (css/menu.css). Everything is
 * guarded: no run / no cards -> a friendly note + a "continue" button that still
 * resumes the run, so the player can never get stuck on this screen.
 * ==========================================================================*/
(function(){
  'use strict';
  if (!window.CA) return;

  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Válassz fejlesztést':'Choose an upgrade',
    'Erősítsd meg a csapatod a következő hullám előtt.':
      'Strengthen your team before the next wave.',
    'Következő: FŐNÖK!':'Next up: BOSS!',
    'Folytatás':'Continue',
    'Hullám':'Wave',
    // draft card names / descriptions (HU keys used by modes.js DRAFT_POOL)
    '+25 max HP':'+25 max HP',
    'Minden egységed maximális életereje +25.':'Each of your units gains +25 max HP.',
    'Teljes gyógyulás':'Full heal',
    'Az egész csapatod teljesen feltöltődik.':'Your whole team is fully restored.',
    '+15% sebzés':'+15% damage',
    'A csapatod minden sebzése +15%.':'All your damage is increased by 15%.',
    '+20 pajzs':'+20 shield',
    'Minden egységed +20 pajzsot kap.':'Each of your units gains +20 shield.',
    'Extra láda':'Extra crate',
    'Egy fegyverláda pottyan a pályára.':'A weapon crate drops onto the map.',
    'Új harcos':'New fighter',
    'Egy friss egység csatlakozik a csapatodhoz.':'A fresh unit joins your team.',
    'Szerencse':'Lucky',
    'Nagyobb eséllyel viszel be kritikus találatot.':'A higher chance to land a critical hit.'
  });

  CA.Menu && CA.Menu.register && CA.Menu.register('gauntlet', function(API){
    var el = API.el, t = API.t, esc = API.esc;
    var sc = API.screen('🗡️', 'Válassz fejlesztést');
    var body = sc.body;
    var wrap = el('div','panel section');
    body.appendChild(wrap);

    // Repurpose the header BACK button: leaving the draft must RESUME the run
    // (with the first card) so the player can never strand the game in MENU mode.
    try {
      var back = sc.screen.querySelector('.btn-back');
      if (back) back.onclick = function(){ resumeFallback(); };
    } catch(e){}

    function md(){ return (CA.state && CA.state.modeData) || {}; }
    function mode(){ return (CA.Modes && CA.Modes.gauntlet) || null; }

    function resumeFallback(){
      // never let the player get stuck: resume the run even with no card chosen.
      // Guard: only act while we're still parked in MENU mid-run — so when this
      // also fires as the screen's onHide (e.g. ESC routed to Home, or the normal
      // pick→PLAYING transition) it can't double-apply a draft.
      if (!CA.state || CA.state.mode !== (CA.GameState && CA.GameState.MENU)) return;
      var m = mode();
      if (m && typeof m.applyDraft === 'function' && md().draftCards && md().draftCards[0]){
        m.applyDraft(md().draftCards[0].id);
      } else if (m && typeof m._resume === 'function'){
        try { CA.state.modeData.awaitingDraft = false; } catch(e){}
        m._resume();
      }
    }

    function pick(cardId){
      var m = mode();
      if (m && typeof m.applyDraft === 'function') m.applyDraft(cardId);
    }

    function render(){
      wrap.innerHTML = '';
      var data = md();
      var cards = (data && Array.isArray(data.draftCards)) ? data.draftCards : [];

      // header: wave context + (boss telegraph on the last leg)
      var wave = data.wave || 1, maxWave = data.maxWave || 0;
      var nextIsBoss = (wave + 1) >= maxWave && maxWave > 0;
      var head = el('div','section');
      head.append(el('div','muted',
        '🗡️ <span data-t="Erősítsd meg a csapatod a következő hullám előtt.">' +
        t('Erősítsd meg a csapatod a következő hullám előtt.') + '</span>'));
      if (nextIsBoss){
        var warn = el('div','card', '☠️ <strong style="color:var(--gold)" data-t="Következő: FŐNÖK!">' +
          t('Következő: FŐNÖK!') + '</strong>');
        warn.style.marginTop = 'var(--s2)';
        head.append(warn);
      }
      wrap.append(head);

      if (!cards.length){
        // no cards (shouldn't happen) — offer a plain continue so we never stick.
        var note = el('div','muted', t('Válassz fejlesztést') + '…');
        wrap.append(note);
        var cont = API.btn('▶ ' + t('Folytatás'), 'btn--gold btn--block', resumeFallback);
        cont.style.marginTop = 'var(--s3)';
        wrap.append(cont);
        API.applyI18n(wrap);
        return;
      }

      // the 3 draft cards as a responsive row of clickable cards.
      var row = el('div','row');
      row.style.cssText = 'flex-wrap:wrap;gap:var(--s3);align-items:stretch;justify-content:center;margin-top:var(--s3)';
      cards.forEach(function(card){
        if (!card) return;
        var c = el('div','card');
        c.style.cssText = 'cursor:pointer;flex:1 1 200px;min-width:180px;max-width:260px;' +
          'text-align:center;padding:var(--s4);transition:transform .08s;';
        c.onmouseenter = function(){ c.style.transform = 'translateY(-3px)'; };
        c.onmouseleave = function(){ c.style.transform = ''; };
        c.onclick = function(){ pick(card.id); };

        var icon = el('div', null, esc(card.icon || '✨'));
        icon.style.cssText = 'font-size:40px;line-height:1;margin-bottom:var(--s2)';
        c.append(icon);

        c.append(el('div', null, '<strong style="font-size:16px" data-t="' + esc(card.name) + '">' +
          esc(t(card.name)) + '</strong>'));
        if (card.desc){
          c.append(el('div', 'muted', '<span data-t="' + esc(card.desc) + '">' +
            esc(t(card.desc)) + '</span>'));
        }
        row.append(c);
      });
      wrap.append(row);
      API.applyI18n(wrap);
    }

    // onHide: if the player leaves the draft any other way (ESC routed to Home),
    // resume the run instead of stranding it in MENU mode. resumeFallback's mode
    // guard makes this a no-op on the normal pick→PLAYING transition.
    return { el: sc.screen, onShow: render, onHide: resumeFallback };
  });
})();
