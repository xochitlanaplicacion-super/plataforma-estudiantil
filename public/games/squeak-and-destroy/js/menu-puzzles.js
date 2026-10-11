/* ============================================================================
 * Squeak & Destroy — Puzzle missions submenu screen (DOM).
 * Single-player "Fejtörők" mission select, built against the CA.Puzzles API.
 * Registered via CA.Menu.register('puzzles', build). Self-contained, never
 * throws — degrades gracefully when CA.Puzzles isn't present.
 * ==========================================================================*/
(function(){
  if(window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Fejtörők':'Puzzles',
    'Fix pályák — old meg minél kevesebb lövésből! Minél kevesebb lövés, annál több csillag.':
      'Fixed levels — solve them in as few shots as possible! Fewer shots, more stars.',
    'Par: {n} lövés':'Par: {n} shots',
    '▶ Játék':'▶ Play',
    'Előbb szerezz csillagot az előzőn':'Earn a star on the previous one first',
    'Hamarosan':'Coming soon',
    'A fejtörők hamarosan elérhetők lesznek!':'Puzzle missions are coming soon!',
    'Nincs elérhető fejtörő.':'No puzzles available.',
    'Kézzel tervezett, egyképernyős taktikai feladványok — teljesítsd a parban 1–3 csillagért.':
      'Hand-crafted one-screen tactical challenges — solve them in par for 1–3 stars.',
  });

  // ---- helpers ----------------------------------------------------------
  // "Par: {n} lövés" with the placeholder filled (after i18n).
  function parLabel(API, n){
    const tmpl = API.t('Par: {n} lövés');
    return API.esc(String(tmpl).replace('{n}', String(n|0)));
  }

  // 3-star display: filled ★ for earned, empty ☆ otherwise (stars 0..3).
  function starStr(stars){
    let s = Math.max(0, Math.min(3, stars|0));
    return '★★★☆☆☆'.slice(3 - s, 6 - s);
  }

  // ---- screen -----------------------------------------------------------
  function build(API){
    const { screen, body } = API.screen('🧩','Fejtörők');

    // dismissible explainer (X-able, persists hidden) — built once at the top
    // of the body; infoCard() returns null once the user has dismissed it.
    try {
      var ic = API.infoCard && API.infoCard('puzzles_v1',
        API.t('Kézzel tervezett, egyképernyős taktikai feladványok — teljesítsd a parban 1–3 csillagért.'));
      if (ic) body.insertBefore(ic, body.firstChild);
    } catch(e){}

    const panel = API.panel();

    // progress header line: "★ total/max"
    const head = API.el('div',null,'');
    head.style.fontWeight = '800';
    head.style.fontSize = '18px';
    head.style.color = 'var(--gold)';

    // muted gameplay hint — how stars work
    const intro2 = API.el('div','muted',
      '<span data-t="Fix pályák — old meg minél kevesebb lövésből! Minél kevesebb lövés, annál több csillag.">'+
      API.t('Fix pályák — old meg minél kevesebb lövésből! Minél kevesebb lövés, annál több csillag.')+'</span>');

    const listSec = API.el('div','section');

    panel.append(head, intro2, listSec);
    body.append(panel);

    // ---- rendering ------------------------------------------------------
    function fallback(){
      listSec.innerHTML='';
      head.textContent='';
      const wrap = API.el('div','section');
      wrap.style.textAlign='center';
      const big = API.el('div',null,'🧩');
      big.style.fontSize='42px';
      const msg = API.el('div','muted','<span data-t="A fejtörők hamarosan elérhetők lesznek!">'+
        API.t('A fejtörők hamarosan elérhetők lesznek!')+'</span>');
      wrap.append(big, msg);
      listSec.append(wrap);
    }

    function render(){
      const P = window.CA && CA.Puzzles;
      if(!P || typeof P.list!=='function'){ fallback(); return; }

      // progress header
      try{
        const prog = (typeof P.progress==='function') ? P.progress() : null;
        if(prog && typeof prog.total!=='undefined'){
          head.textContent = '★ ' + (prog.total|0) + '/' + (prog.max|0);
        } else { head.textContent=''; }
      }catch(e){ head.textContent=''; }

      // mission list
      let list = null;
      try{ list = P.list(); }catch(e){ list=null; }

      listSec.innerHTML='';
      if(!Array.isArray(list) || !list.length){
        listSec.append(API.el('div','muted','<span data-t="Nincs elérhető fejtörő.">'+
          API.t('Nincs elérhető fejtörő.')+'</span>'));
        return;
      }

      list.forEach(function(p){
        if(!p) return;
        const card = API.card();
        card.style.gap = 'var(--s2)';
        // row layout: [animal-head icon] [text column] so the list isn't all-text.
        card.classList.add('row');
        card.style.alignItems = 'flex-start';

        // LEFT: a per-puzzle icon — the puzzle's signature WEAPON image (variety!),
        // falling back to a cute enemy "worm" head, then a 🐛 emoji tile.
        const icon = API.el('div',null,'');
        icon.style.cssText = 'flex:0 0 auto;width:52px;height:52px;border-radius:12px;'
          + 'background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;overflow:hidden;'
          + (p.locked ? 'filter:grayscale(1);opacity:.55;' : '');
        function puzzleWorm(){
          try {
            if (CA.Entities && CA.Entities.renderPortrait){
              const cv = API.el('canvas'); cv.width = 52; cv.height = 52;
              cv.style.cssText = 'width:52px;height:52px';
              CA.Entities.renderPortrait(cv, { species:'worm' });
              icon.innerHTML = ''; icon.append(cv);
            } else { icon.innerHTML = '<span style="font-size:28px">🐛</span>'; }
          } catch(e){ icon.innerHTML = '<span style="font-size:28px">🐛</span>'; }
        }
        if (p.weapon){
          const wmap = { bat:'melee' };
          const wf = wmap[p.weapon] || p.weapon;
          const wsrc = 'assets/weapons/' + wf + '.png';
          // art this build doesn't ship → straight to the fallback, no 404
          if (CA._isMissingArt && CA._isMissingArt(wsrc)) { puzzleWorm(); }
          else {
            const img = API.el('img');
            img.alt = ''; img.src = wsrc;
            img.style.cssText = 'width:40px;height:40px;object-fit:contain';
            img.onerror = function(){ this.remove(); puzzleWorm(); };
            icon.append(img);
          }
        } else { puzzleWorm(); }
        card.append(icon);

        // RIGHT: the text column (name/stars, hint, par, play) stacked.
        const col = API.el('div','section');
        col.style.cssText = 'flex:1;min-width:0;gap:var(--s1);display:flex;flex-direction:column';

        // name + stars row
        const top = API.el('div','row row--between');
        top.style.gap='var(--s2)';
        const nm = API.el('div',null, (p.locked?'🔒 ':'') + API.esc(API.t(p.name || '—')));
        nm.style.fontWeight='700';
        const stars = API.el('div',null, starStr(p.stars));
        stars.style.color='var(--gold)';
        stars.style.whiteSpace='nowrap';
        stars.style.fontSize='16px';
        top.append(nm, stars);
        col.append(top);

        // hint (muted, smaller)
        if(p.hint){
          const hint = API.el('div','muted', API.esc(API.t(p.hint)));
          hint.style.fontSize='13px';
          col.append(hint);
        }

        // par
        const par = API.el('div','muted', parLabel(API, p.par));
        par.style.fontSize='13px';
        col.append(par);

        // play / locked
        if(p.locked){
          const locked = API.el('div','muted','<span data-t="Előbb szerezz csillagot az előzőn">'+
            API.t('Előbb szerezz csillagot az előzőn')+'</span>');
          locked.style.fontSize='13px';
          col.append(locked);
        } else {
          const id = p.id;
          const play = API.btn('<span data-t="▶ Játék">▶ Játék</span>','btn--sm', function(){
            try{ if(CA.Puzzles && typeof CA.Puzzles.start==='function') CA.Puzzles.start(id); }catch(e){}
          });
          play.style.alignSelf='flex-start';
          col.append(play);
        }

        card.append(col);
        listSec.append(card);
      });
    }

    // re-render every time the screen is shown (stars update after playing)
    return { el:screen, onShow(){ try{ render(); }catch(e){ try{ fallback(); }catch(_){} } } };
  }

  if(window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('puzzles', build);
})();
