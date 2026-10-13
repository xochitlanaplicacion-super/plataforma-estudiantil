(function(){
  'use strict';
  // Kept outside the game bundle so the same editor runs in the local source
  // build and in the published minified build.
  var CA=window.CA=window.CA||{};
  var keys=[['left','◀','Mover a la izquierda'],['right','▶','Mover a la derecha'],
    ['aimUp','▲','Apuntar arriba'],['aimDown','▼','Apuntar abajo'],
    ['jump','⤴','Saltar'],['fire','🔥','Disparar']];
  var overlay=null;
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function defaults(){
    if(CA.touchControlDefaults) return CA.touchControlDefaults();
    return {left:{x:.07,y:.86},right:{x:.15,y:.86},aimUp:{x:.79,y:.74},
      aimDown:{x:.79,y:.86},jump:{x:.93,y:.86},fire:{x:.93,y:.74}};
  }
  function open(){
    if(overlay){ overlay.focus(); return; }
    var settings=CA.settings;
    if(!settings) return;
    if(!settings.touchPositions) settings.touchPositions={};
    var previousFocus=document.activeElement;
    var root=document.createElement('div'); root.className='abg-touch-editor';
    root.tabIndex=-1; root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label','Ajustar controles táctiles');
    var bar=document.createElement('div'); bar.className='abg-touch-editor-bar';
    var heading=document.createElement('div'); heading.className='abg-touch-editor-title';
    heading.innerHTML='<strong>✋ Ajustar controles</strong><small>Arrastra cada botón al lugar cómodo para tus manos.</small>';
    var sizeLabel=document.createElement('label'); sizeLabel.textContent='Tamaño';
    var size=document.createElement('input'); size.type='range'; size.min='75'; size.max='150';
    size.value=String(Math.round((settings.touchScale||1)*100));
    size.setAttribute('aria-label','Tamaño de los botones');
    var sizeValue=document.createElement('span'); sizeValue.textContent=size.value+'%';
    size.oninput=function(){ settings.touchScale=+size.value/100; sizeValue.textContent=size.value+'%';
      settings.save&&settings.save(); resize(); };
    sizeLabel.append(size,sizeValue);
    var reset=document.createElement('button'); reset.type='button'; reset.textContent='Restablecer';
    var done=document.createElement('button'); done.type='button'; done.textContent='Listo';
    done.className='abg-touch-editor-done';
    bar.append(heading,sizeLabel,reset,done);
    var stage=document.createElement('div'); stage.className='abg-touch-editor-stage';
    var note=document.createElement('div'); note.className='abg-touch-editor-note';
    note.textContent='Los botones se guardan en este dispositivo. Puedes volver a ajustarlos cuando quieras.';
    root.append(stage,bar,note); document.body.append(root); overlay=root;
    var buttons={};
    function stageRect(){ return stage.getBoundingClientRect(); }
    function place(btn,id){
      var p=settings.touchPositions[id]||defaults()[id]||{x:.5,y:.8};
      var rect=stageRect(), px=clamp(p.x,0,1)*rect.width, py=clamp(p.y,0,1)*rect.height;
      btn.style.left=px+'px'; btn.style.top=py+'px';
    }
    function resize(){
      var canvas=document.getElementById('game');
      var rect=canvas&&canvas.getBoundingClientRect();
      if(!rect||!rect.width||!rect.height) rect={left:0,top:0,width:innerWidth,height:innerHeight};
      stage.style.left=rect.left+'px'; stage.style.top=rect.top+'px';
      stage.style.width=rect.width+'px'; stage.style.height=rect.height+'px';
      stage.style.setProperty('--touch-edit-size',Math.round(62*(settings.touchScale||1))+'px');
      keys.forEach(function(item){ place(buttons[item[0]],item[0]); });
    }
    keys.forEach(function(item){
      var id=item[0],btn=document.createElement('button'); btn.type='button';
      btn.className='abg-touch-editor-control'; btn.textContent=item[1];
      btn.setAttribute('aria-label',item[2]+'. Arrastra para cambiar posición.');
      btn.dataset.control=id; stage.append(btn); buttons[id]=btn;
      btn.addEventListener('pointerdown',function(e){
        e.preventDefault(); btn.setPointerCapture(e.pointerId); btn.classList.add('dragging');
      });
      btn.addEventListener('pointermove',function(e){
        if(!btn.hasPointerCapture(e.pointerId)) return;
        e.preventDefault();
        var rect=stageRect(), margin=(btn.getBoundingClientRect().width/2)+4;
        var x=clamp(e.clientX-rect.left,margin,rect.width-margin)/rect.width;
        var y=clamp(e.clientY-rect.top,margin,rect.height-margin)/rect.height;
        settings.touchPositions[id]={x:x,y:y}; place(btn,id);
      });
      btn.addEventListener('pointerup',function(e){
        btn.classList.remove('dragging');
        if(btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
        settings.save&&settings.save();
      });
      btn.addEventListener('pointercancel',function(){ btn.classList.remove('dragging'); });
    });
    reset.onclick=function(){ settings.touchPositions={}; settings.touchScale=1;
      size.value='100'; sizeValue.textContent='100%'; settings.save&&settings.save(); resize(); };
    function close(){
      window.removeEventListener('resize',resize); window.removeEventListener('orientationchange',resize);
      root.remove(); overlay=null; if(previousFocus&&previousFocus.focus) previousFocus.focus();
    }
    done.onclick=close;
    root.addEventListener('keydown',function(e){ if(e.key==='Escape'){ e.preventDefault(); close(); } });
    window.addEventListener('resize',resize); window.addEventListener('orientationchange',resize);
    resize(); root.focus();
  }
  CA.openTouchEditor=open;
})();
