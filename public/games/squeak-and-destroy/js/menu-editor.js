/* ============================================================================
 * Squeak & Destroy — LEVEL EDITOR toolbar (DOM overlay).
 *
 * HYBRID screen: the CANVAS (js/screens.js _renderEditorPreview) draws the
 * paint surface — terrain schematic, placed props, grid/mirror guides, the
 * live brush cursor and the usage hint. THIS module renders the toolbar as
 * crisp DOM (always sharp, correct CSS sizing) floating over the canvas.
 *
 * Pointer routing: the overlay container + screen are `pointer-events:none`
 * (taps fall through to the canvas → painting). ONLY the toolbar panel is
 * `pointer-events:auto`, so its buttons get the taps. See css/menu.css
 * `.screen--editor` / `.ed-tools`.
 *
 * All actions drive CA.Screens.editorAPI (thin wrappers around the existing
 * canvas-editor backend). This module owns NO paint logic.
 *
 * Registration of this file (index.html / build.js / sw.js) is handled
 * centrally — do not add it here.
 * ==========================================================================*/
(function(){
  if(!(window.CA && CA.Menu && CA.Menu.register)) return;
  const M = CA.Menu, API = M.ui;
  const T = (s)=> (CA.t ? CA.t(s) : s);

  // EN strings unique to this DOM toolbar (the rest already live in screens.js
  // addEN — keys must match EXACTLY so CA.t() resolves them).
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    '✏️ Pályaszerkesztő':'✏️ Level editor',
    'Vissza a menübe':'Back to menu',
    'Nincs mentett pálya.':'No saved maps.',
    'Mentett pályák':'Saved maps',
  });

  // resolve the editor API lazily (screens.js loads independently of order)
  function api(){ return (CA.Screens && CA.Screens.editorAPI) || null; }

  /* ----------------------------------------------------------------- build */
  function build(){
    // We do NOT use API.screen() — that builds an OPAQUE full-screen section.
    // The editor screen must be transparent (canvas shows through) with only
    // the toolbar panel interactive.
    const screen = API.el('section','screen screen--editor');

    // NOTE: the screen title (✏️ Pályaszerkesztő) and the Back button are drawn
    // by the CANVAS (js/screens.js _renderEditor: bg()+backButton()) which shows
    // through this transparent overlay — so we do NOT duplicate them in the DOM.
    // The canvas Back button (top-left) returns to the menu. We add a small DOM
    // back button INSIDE the toolbar panel too, for touch reachability.

    // ---- toolbar panel (the only interactive region) ----------------------
    const tools = API.el('div','panel section ed-tools');
    screen.append(tools);

    // in-panel back button (touch reachability; mirrors the canvas back button)
    const backRow = API.el('div','row ed-backrow');
    const backB = API.btn('', 'btn--sm btn--ghost ed-back', function(){
      if (CA.UI && CA.UI.setScreen) CA.UI.setScreen('main');
    });
    backB.innerHTML='<span data-t="‹ Vissza">‹ '+T('Vissza')+'</span>';
    backRow.append(backB);
    tools.append(backRow);

    // section heading helper (eyebrow style, matches .section > h3)
    function heading(key){ return API.el('h3', null,
      '<span data-t="'+API.esc(key)+'">'+API.esc(key)+'</span>'); }

    // — refs we mutate on state-sync —
    let themeChips=[], toolBtns={}, propChips=[], shapeBtns={},
        brushRange=null, brushVal=null, extraBtns={}, nameInput=null;

    // ---------- ALAP TÉMA --------------------------------------------------
    const themeSec = API.el('div','section');
    themeSec.append(heading('Alap téma'));
    const themeWrap = API.el('div','chips ed-chips');
    themeSec.append(themeWrap);
    tools.append(themeSec);

    // ---------- ESZKÖZ (Rajzol / Radír) -----------------------------------
    const toolSec = API.el('div','section');
    toolSec.append(heading('Eszköz'));
    const toolSeg = API.el('div','seg ed-seg');
    toolBtns.draw  = API.el('button',null,'<span data-t="✏️ Rajzol">✏️ Rajzol</span>');
    toolBtns.erase = API.el('button',null,'<span data-t="🧽 Radír">🧽 Radír</span>');
    toolBtns.draw.onclick  = function(){ const a=api(); if(a){ a.setTool('draw'); }  syncState(); };
    toolBtns.erase.onclick = function(){ const a=api(); if(a){ a.setTool('erase'); } syncState(); };
    toolSeg.append(toolBtns.draw, toolBtns.erase);
    toolSec.append(toolSeg);
    tools.append(toolSec);

    // ---------- TÁRGYAK ----------------------------------------------------
    const propSec = API.el('div','section');
    propSec.append(heading('Tárgyak'));
    const propWrap = API.el('div','chips ed-chips');
    propSec.append(propWrap);
    tools.append(propSec);

    // ---------- ECSETMÉRET (forma + slider) -------------------------------
    const brushSec = API.el('div','section');
    const bHead = API.el('div','row row--between');
    bHead.append(heading('Ecsetméret'));
    brushVal = API.el('span','ed-brushval','24 px');
    bHead.append(brushVal);
    brushSec.append(bHead);
    // shape segmented
    const shapeSeg = API.el('div','seg ed-seg');
    shapeBtns.round  = API.el('button',null,'<span data-t="● Kör">● Kör</span>');
    shapeBtns.square = API.el('button',null,'<span data-t="■ Négyzet">■ Négyzet</span>');
    shapeBtns.round.onclick  = function(){ const a=api(); if(a){ a.setShape('round'); }  syncState(); };
    shapeBtns.square.onclick = function(){ const a=api(); if(a){ a.setShape('square'); } syncState(); };
    shapeSeg.append(shapeBtns.round, shapeBtns.square);
    brushSec.append(shapeSeg);
    // range slider
    brushRange = API.el('input','range ed-range');
    brushRange.type='range'; brushRange.min='6'; brushRange.max='80'; brushRange.step='1'; brushRange.value='24';
    brushRange.oninput = function(){
      const a=api(); if(a){ a.setBrush(parseInt(brushRange.value,10)||24); }
      if(brushVal) brushVal.textContent = (a?a.brush():brushRange.value)+' px';
    };
    brushSec.append(brushRange);
    tools.append(brushSec);

    // ---------- EXTRÁK -----------------------------------------------------
    const exSec = API.el('div','section');
    exSec.append(heading('Extrák'));
    const exWrap = API.el('div','ed-grid3');
    function exBtn(key, handler){
      const b = API.btn('', 'btn--sm btn--ghost ed-ex', handler);
      b.innerHTML = '<span data-t="'+API.esc(key)+'">'+API.esc(key)+'</span>';
      exWrap.append(b); return b;
    }
    extraBtns.undo   = exBtn('↶ Vissza',  function(){ const a=api(); if(a){ a.undo(); }   syncState(); });
    extraBtns.redo   = exBtn('↷ Újra',    function(){ const a=api(); if(a){ a.redo(); }   syncState(); });
    extraBtns.fill   = exBtn('🪣 Kitölt', function(){ const a=api(); if(a){ a.fill(); }   syncState(); });
    extraBtns.flat   = exBtn('⬓ Sík talaj',function(){ const a=api(); if(a){ a.flatGround(); } syncState(); });
    extraBtns.mirror = exBtn('🪞 Tükrözés',function(){ const a=api(); if(a){ a.toggleMirror(); } syncState(); });
    extraBtns.grid   = exBtn('# Rács',    function(){ const a=api(); if(a){ a.toggleGrid(); } syncState(); });
    exSec.append(exWrap);
    tools.append(exSec);

    // ---------- MŰVELETEK (Törlés / Betöltés) -----------------------------
    const actSec = API.el('div','section');
    actSec.append(heading('Műveletek'));
    const actRow = API.el('div','row');
    const clearB = API.btn('', 'btn--sm btn--red ed-act', confirmClear);
    clearB.innerHTML='<span data-t="🗑 Törlés">🗑 Törlés</span>';
    const loadB = API.btn('', 'btn--sm ed-act', openLoad);
    loadB.innerHTML='<span data-t="📂 Betöltés">📂 Betöltés</span>';
    actRow.append(clearB, loadB);
    actSec.append(actRow);
    tools.append(actSec);

    // two-step inline confirm for Clear (no native alert)
    let clearArmed=false, clearTimer=null;
    function confirmClear(){
      const a=api(); if(!a) return;
      if(!clearArmed){
        clearArmed=true;
        clearB.innerHTML='<span data-t="Igen, törlés">Igen, törlés</span>'; clearB.textContent=T('Igen, törlés');
        clearTimer = setTimeout(disarmClear, 4000);
        return;
      }
      disarmClear(); a.clear(); syncState();
    }
    function disarmClear(){
      clearArmed=false; if(clearTimer){ clearTimeout(clearTimer); clearTimer=null; }
      clearB.innerHTML='<span data-t="🗑 Törlés">🗑 Törlés</span>'; clearB.textContent=T('🗑 Törlés');
    }

    // ---------- NÉV + MENTÉS ----------------------------------------------
    const saveSec = API.el('div','section');
    const nf = API.field(T('Név:'));
    nameInput = nf.input; nameInput.maxLength=24;
    nameInput.placeholder = T('pálya neve…');
    nameInput.oninput = function(){ const a=api(); if(a){ a.setName(nameInput.value); } };
    saveSec.append(nf);
    const saveB = API.btn('', 'btn--green btn--block ed-save', function(){
      const a=api(); if(!a) return;
      const res = a.save();
      if(res && res.ok===false && res.reason==='noname'){ nameInput.focus(); }
    });
    saveB.innerHTML='<span data-t="💾 Mentés">💾 Mentés</span>';
    saveSec.append(saveB);
    tools.append(saveSec);

    // ---------------------------------------------------------------- load --
    // The saved-maps dialog as a self-contained modal inside this screen
    // (interactive, so its own pointer-events:auto via .ed-modal).
    let loadModal=null;
    function openLoad(){
      const a=api(); if(!a) return;
      closeLoad();
      loadModal = API.el('div','ed-modal');
      const card = API.el('div','panel section ed-modal-card');
      const h = API.title('📂','Mentett pályák'); h.style.justifyContent='center';
      card.append(h);
      const names = a.savedMaps();
      if(!names.length){
        const empty = API.el('div','muted','<span data-t="Nincs mentett pálya.">'+T('Nincs mentett pálya.')+'</span>');
        empty.style.textAlign='center'; card.append(empty);
      } else {
        const list = API.el('div','section ed-loadlist');
        names.forEach(function(nm){
          const row = API.el('div','row row--between ed-loadrow');
          const lbl = API.el('button','btn btn--ghost btn--sm ed-loadname','🗺️ '+API.esc(nm));
          lbl.style.flex='1'; lbl.style.justifyContent='flex-start';
          lbl.onclick = function(){ a.load(nm); if(nameInput) nameInput.value=a.name(); closeLoad(); syncState(); };
          const del = API.btn('🗑','btn--sm btn--red', function(){ a.removeMap(nm); openLoad(); });
          row.append(lbl, del); list.append(row);
        });
        card.append(list);
      }
      const close = API.btn('', 'btn--block', closeLoad);
      close.innerHTML='<span data-t="Bezár">'+T('Bezár')+'</span>';
      card.append(close);
      loadModal.append(card);
      // tap on the backdrop (outside the card) closes
      loadModal.onclick = function(e){ if(e.target===loadModal) closeLoad(); };
      screen.append(loadModal);
    }
    function closeLoad(){ if(loadModal && loadModal.parentNode){ loadModal.parentNode.removeChild(loadModal); } loadModal=null; }

    /* ----------------------------------------------------- build palettes */
    function buildThemes(){
      const a=api(); themeWrap.innerHTML=''; themeChips=[];
      const themes = a ? a.getThemes() : [{id:'grass',emoji:'',name:'grass'}];
      themes.forEach(function(th){
        const lab = (th.emoji?th.emoji+' ':'')+T(th.name);
        const c = API.chip(lab, false, function(){ const aa=api(); if(aa){ aa.setTheme(th.id); } syncState(); });
        c.classList.add('chip--grid'); c._themeId = th.id;
        themeWrap.append(c); themeChips.push(c);
      });
    }
    function buildProps(){
      const a=api(); propWrap.innerHTML=''; propChips=[];
      const props = a ? a.props() : [];
      props.forEach(function(pr){
        const c = API.chip(pr.emoji+' '+T(pr.name), false, function(){ const aa=api(); if(aa){ aa.setProp(pr.kind); } syncState(); });
        c.classList.add('chip--grid'); c._propKind = pr.kind;
        propWrap.append(c); propChips.push(c);
      });
    }

    /* ------------------------------------------------- reflect editor state */
    function syncState(){
      const a=api(); if(!a) return;
      // themes
      const curTheme = a.theme();
      themeChips.forEach(function(c){ c.classList.toggle('sel', c._themeId===curTheme); });
      // tool
      const tool = a.tool();
      toolBtns.draw.classList.toggle('sel', tool==='draw');
      toolBtns.erase.classList.toggle('sel', tool==='erase');
      // props (selected only when prop tool active)
      const curProp = a.prop();
      propChips.forEach(function(c){ c.classList.toggle('sel', c._propKind===curProp); });
      // brush
      if(brushRange){ brushRange.value = a.brush(); }
      if(brushVal){ brushVal.textContent = a.brush()+' px'; }
      // shape
      const shape = a.shape();
      shapeBtns.round.classList.toggle('sel', shape==='round');
      shapeBtns.square.classList.toggle('sel', shape==='square');
      // extras toggles + disabled state
      extraBtns.mirror.classList.toggle('ed-on', a.mirror());
      extraBtns.grid.classList.toggle('ed-on', a.gridOn());
      extraBtns.undo.disabled = !a.canUndo();
      extraBtns.redo.disabled = !a.canRedo();
      // name field (keep in sync if loaded externally)
      if(nameInput && document.activeElement!==nameInput){ nameInput.value = a.name()||''; }
      disarmClear();
    }

    // Called by the menu framework each time this screen becomes active.
    function onShow(){
      const a=api();
      if(a){ a.ensure(); }
      try{ const fb=document.getElementById('fs-btn'); if(fb){ fb.style.display='none'; } }catch(e){}
      buildThemes(); buildProps();
      if(nameInput && a){ nameInput.value = a.name()||''; }
      syncState();
      // light polling so canvas-side changes (keyboard shortcuts G/M, Ctrl+Z)
      // are reflected in the DOM toolbar without a heavy event bus.
      if(!onShow._poll){
        onShow._poll = setInterval(function(){
          const scr = (CA.UI&&CA.UI.screen)?CA.UI.screen():'';
          if(scr==='editor'){ try{ syncState(); }catch(e){} }
        }, 350);
      }
    }
    function onHide(){
      if(onShow._poll){ clearInterval(onShow._poll); onShow._poll=null; }
      try{ const fb=document.getElementById('fs-btn'); if(fb){ fb.style.display=''; } }catch(e){}
      closeLoad();
    }

    return { el:screen, onShow:onShow, onHide:onHide };
  }

  M.register('editor', build);
})();
