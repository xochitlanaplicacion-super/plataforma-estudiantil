/* ============================================================================
 * Squeak & Destroy — INTRO cinematic (CA.Intro)
 * A short (~26s) scripted story told with the game's OWN art (no video): a happy
 * capybara strolls a meadow, frogs ambush from the tree + pond and blow it up,
 * the squad (pirate / mage / helmet capys) storms in and fires back → battle →
 * logo. Self-contained: its own fullscreen <canvas> overlay + rAF loop, so it
 * never touches the game loop. Skippable (tap/click/key). Plays ONCE (first new
 * game) via localStorage 'ca_intro_seen'.
 *   CA.Intro.play(onDone)            — run it now, calls onDone() when finished/skipped
 *   CA.Intro.maybePlayOnce(onDone)   — play only if never seen; returns true if it took over
 * Characters are pre-stamped with CA.Entities.renderPortrait into offscreen
 * canvases (robust standalone draw); everything else is plain Canvas2D.
 * ==========================================================================*/
(function(){
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var CA = window.CA = window.CA || {};

  var SEEN_KEY = 'ca_intro_seen';
  var END_T = 26.5;            // seconds of story before auto-finish

  // ---- small helpers --------------------------------------------------------
  function clamp01(x){ return x<0?0:(x>1?1:x); }
  function lerp(a,b,t){ return a + (b-a)*clamp01(t); }
  function smooth(t){ t=clamp01(t); return t*t*(3-2*t); }
  // 0 outside [a,b], smoothstep ramp inside — handy for per-phase fades.
  function span(t,a,b){ return smooth((t-a)/(b-a)); }
  function pulse(t,a,b){ var p=(t-a)/(b-a); if(p<0||p>1) return 0; return Math.sin(p*Math.PI); }

  function makeCanvas(w,h){ var c=document.createElement('canvas'); c.width=w; c.height=h; return c; }

  // Stamp a character (species + optional cosmetic / class) into an offscreen
  // canvas using the game's renderPortrait. Falls back to a colored blob.
  function portrait(spec){
    var S=240, c=makeCanvas(S,S);
    try{
      if (CA.Entities && CA.Entities.renderPortrait){ CA.Entities.renderPortrait(c, spec||{}); return c; }
    }catch(e){}
    var g=c.getContext('2d'); if(g){ g.fillStyle=(spec&&spec.color)||'#8a6a45';
      g.beginPath(); g.arc(S/2,S*0.55,S*0.3,0,7); g.fill(); }
    return c;
  }

  CA.Intro = {
    _running:false,

    maybePlayOnce: function(onDone){
      try{ if (localStorage.getItem(SEEN_KEY)) return false; localStorage.setItem(SEEN_KEY,'1'); }
      catch(e){ return false; }            // storage blocked → just skip the intro
      try{ this.play(onDone); return true; }catch(e){ return false; }
    },

    // allow replaying from a menu/help button later
    replay: function(onDone){ try{ this.play(onDone); }catch(e){ if(onDone) onDone(); } },

    play: function(onDone){
      if (this._running){ if(onDone) onDone(); return; }
      this._running = true;
      var self = this;
      var done = function(){
        if(!self._running) return; self._running=false;
        try{ window.removeEventListener('keydown', onKey, true); }catch(e){}
        // QA P3: a resize-listener is leszedendő — minden ?intro-újranézés egy
        // closure-t (canvas + 5 portré) tartott életben örökre.
        try{ window.removeEventListener('resize', resize); }catch(e){}
        try{ if(cv && cv.parentNode) cv.parentNode.removeChild(cv); }catch(e){}
        try{ if(onDone) onDone(); }catch(e){}
      };

      // ---- overlay canvas ----
      var cv = makeCanvas(1,1);
      cv.id='ca-intro';
      cv.style.cssText='position:fixed;inset:0;z-index:10001;width:100%;height:100%;background:#0e1217;'+
        'touch-action:none;cursor:pointer;';
      document.body.appendChild(cv);
      var ctx = cv.getContext('2d');
      if(!ctx){ done(); return; }

      var dpr = Math.min(window.devicePixelRatio||1, 2);
      var W=0,H=0;
      function resize(){
        W = window.innerWidth||1280; H = window.innerHeight||720;
        cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
        ctx.setTransform(dpr,0,0,dpr,0,0);
      }
      resize();
      window.addEventListener('resize', resize);

      // ---- assets ----
      var heroP   = portrait({species:'capybara', cosmetic:'bow'});
      var frogP   = portrait({species:'frog'});
      var sqPirate= portrait({species:'capybara', cosmetic:'pirate'});
      var sqMage  = portrait({species:'capybara', cls:'mage'});
      var sqHelm  = portrait({species:'capybara', cosmetic:'helmet'});

      var logo = new Image(); var logoOK=false;
      logo.onload=function(){ logoOK=true; }; try{ logo.src='assets/logo.png'; }catch(e){}
      var expl = new Image(); var explOK=false;
      expl.onload=function(){ explOK=true; };
      // explOK stays false when the sheet isn't shipped → drawn burst fallback
      if(!(CA._isMissingArt && CA._isMissingArt('assets/fx/explosion3.png')))
        try{ expl.src='assets/fx/explosion3.png'; }catch(e){}
      var EXPL_COLS=6, EXPL_CELL=128, EXPL_FRAMES=33;

      // stable decor layout (fractions of W/H)
      var flowers=[]; for(var i=0;i<11;i++) flowers.push({ x:0.05+0.9*Math.random(), y:0.80+0.16*Math.random(), h:Math.floor(Math.random()*360) });
      var bflies=[]; for(var b=0;b<3;b++) bflies.push({ x:0.2+0.6*Math.random(), y:0.4+0.2*Math.random(), ph:Math.random()*6, hue:[300,50,190][b] });

      // ---- skip handling ----
      var t0=null, skipFade=0, finishing=false;
      function skip(){ if(finishing) return; finishing=true; }
      cv.addEventListener('pointerdown', skip);
      function onKey(e){ if(e.key==='Escape'||e.key===' '||e.key==='Enter') skip(); }
      window.addEventListener('keydown', onKey, true);

      var shake=0;

      // ---- per-frame scene draw (t in seconds) ----
      function groundY(){ return H*0.80; }

      function drawActor(img, x, y, s, faceLeft, bob){
        if(!img) return;
        var w=240*s, h=240*s;
        ctx.save();
        ctx.translate(x, y + (bob||0));
        if(faceLeft) ctx.scale(-1,1);
        // portrait feet sit ~60% down the 240 box → align feet to (x,y)
        ctx.drawImage(img, -w/2, -h*0.78, w, h);
        ctx.restore();
      }
      function bubble(x,y,text,a){
        if(a<=0.01) return;
        ctx.save(); ctx.globalAlpha=clamp01(a);
        ctx.font='bold '+Math.round(H*0.034)+'px "Baloo 2", system-ui, sans-serif';
        var pad=H*0.018, tw=ctx.measureText(text).width, bw=tw+pad*2, bh=H*0.066;
        var bx=x-bw/2, by=y-bh;
        bx=Math.max(8,Math.min(bx,W-bw-8));
        ctx.fillStyle='rgba(255,255,255,0.96)'; ctx.strokeStyle='rgba(40,30,10,0.25)'; ctx.lineWidth=2;
        rr(bx,by,bw,bh,bh*0.4); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x-9,by+bh-2); ctx.lineTo(x+9,by+bh-2); ctx.lineTo(x,by+bh+13); ctx.closePath(); ctx.fillStyle='rgba(255,255,255,0.96)'; ctx.fill();
        ctx.fillStyle='#2a2010'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(text, bx+bw/2, by+bh/2);
        ctx.restore();
      }
      function rr(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
      function drawExpl(x,y,size,localT,dur){
        var fr=Math.floor(localT/dur*EXPL_FRAMES);
        if(fr<0||fr>=EXPL_FRAMES) return;
        if(explOK){ var sx=(fr%EXPL_COLS)*EXPL_CELL, sy=((fr/EXPL_COLS)|0)*EXPL_CELL;
          ctx.drawImage(expl, sx,sy,EXPL_CELL,EXPL_CELL, x-size/2, y-size/2, size, size);
        } else { // fallback radial flash
          var p=localT/dur; ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=(1-p);
          var g=ctx.createRadialGradient(x,y,0,x,y,size*0.5*(0.4+p)); g.addColorStop(0,'#fff'); g.addColorStop(0.4,'#ffb04a'); g.addColorStop(1,'rgba(255,80,0,0)');
          ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,size*0.5,0,7); ctx.fill(); ctx.restore();
        }
      }

      // SFX beats — emit once each via the game's audio bus (plays when audio is
      // unlocked; a tap/Start gesture unlocks it). Guarded; silence never breaks.
      var sfxDone={};
      function sfxAt(t){
        function S(key,when,name){ if(t>=when && !sfxDone[key]){ sfxDone[key]=true; try{ if(CA.events&&CA.events.emit) CA.events.emit('sfx',name); }catch(e){} } }
        S('jump',8.0,'jump');     // frogs leap in
        S('boom',10.2,'boom');    // the ambush blast
        S('rally',13.2,'select'); // squad arrives, angry
        S('fire',18.5,'boom');    // counterattack volley
        S('frog',19.2,'boom');    // frogs blown up
        S('win',23.4,'win');      // logo jingle
      }

      function scene(t){
        sfxAt(t);
        var gY=groundY();
        // ---------- background ----------
        var sky=ctx.createLinearGradient(0,0,0,H);
        sky.addColorStop(0,'#7fc7e8'); sky.addColorStop(0.55,'#bfe6ff'); sky.addColorStop(1,'#eaf7ff');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
        // sun
        ctx.save(); ctx.globalCompositeOperation='lighter';
        var sg=ctx.createRadialGradient(W*0.82,H*0.2,0,W*0.82,H*0.2,H*0.28);
        sg.addColorStop(0,'rgba(255,250,210,0.9)'); sg.addColorStop(1,'rgba(255,250,210,0)');
        ctx.fillStyle=sg; ctx.fillRect(0,0,W,H); ctx.restore();
        // far hills
        ctx.fillStyle='#9fd28a'; ctx.beginPath(); ctx.moveTo(0,gY);
        for(var hx=0;hx<=W;hx+=40) ctx.lineTo(hx, gY-40-30*Math.sin(hx*0.004+1));
        ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath(); ctx.fill();
        // ground
        var gg=ctx.createLinearGradient(0,gY,0,H); gg.addColorStop(0,'#6abf52'); gg.addColorStop(1,'#4f9a3e');
        ctx.fillStyle=gg; ctx.fillRect(0,gY,W,H-gY);
        // pond (left-ish)
        ctx.save(); ctx.fillStyle='rgba(64,150,200,0.7)'; ctx.beginPath();
        ctx.ellipse(W*0.20, gY+H*0.07, W*0.13, H*0.045, 0,0,7); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(W*0.17,gY+H*0.055,W*0.05,H*0.012,0,0,7); ctx.fill(); ctx.restore();
        // tree (right-ish)
        var tx=W*0.70, ty=gY+6;
        ctx.fillStyle='#7a5a32'; ctx.fillRect(tx-10, ty-H*0.22, 20, H*0.22);
        ctx.fillStyle='#3f9d46'; ctx.beginPath(); ctx.arc(tx, ty-H*0.26, H*0.11,0,7); ctx.arc(tx-H*0.07, ty-H*0.20, H*0.075,0,7); ctx.arc(tx+H*0.07, ty-H*0.20, H*0.075,0,7); ctx.fill();
        // flowers
        for(var f=0; f<flowers.length; f++){ var fl=flowers[f]; var fx=fl.x*W, fy=fl.y*H;
          ctx.strokeStyle='#3e8b3a'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx,fy+14); ctx.stroke();
          ctx.fillStyle='hsl('+fl.h+',75%,65%)'; for(var pe=0;pe<5;pe++){ var an=pe/5*6.28; ctx.beginPath(); ctx.arc(fx+Math.cos(an)*5, fy+Math.sin(an)*5, 4,0,7); ctx.fill(); }
          ctx.fillStyle='#ffd24a'; ctx.beginPath(); ctx.arc(fx,fy,3,0,7); ctx.fill();
        }

        // ---------- actors / story ----------
        // hero walk (P1 0..7), pushed off by the blast (P3)
        var heroAlive = t < 10.4;
        if(heroAlive){
          var hx = lerp(-0.12, 0.46, smooth(t/7)) * W;
          var hb = Math.sin(t*5)*6 * (t<7?1:0.2);
          drawActor(heroP, hx, gY, 0.95, false, hb);
          // happy hearts + butterflies
          ctx.save(); ctx.globalAlpha=0.9;
          for(var bb=0; bb<bflies.length; bb++){ var bf=bflies[bb];
            var bx2=(bf.x*W)+Math.sin(t*1.3+bf.ph)*40, by2=(bf.y*H)+Math.cos(t*1.7+bf.ph)*24;
            ctx.fillStyle='hsl('+bf.hue+',80%,70%)';
            var fw=6+Math.sin(t*12+bf.ph)*3;
            ctx.beginPath(); ctx.ellipse(bx2-5,by2,fw,7,0,0,7); ctx.fill();
            ctx.beginPath(); ctx.ellipse(bx2+5,by2,fw,7,0,0,7); ctx.fill();
          }
          ctx.restore();
          if(t>3.4 && t<6.5){ var ha=pulse(t,3.4,6.5); ctx.save(); ctx.globalAlpha=ha; ctx.font=Math.round(H*0.04)+'px serif';
            ctx.fillText('❤', hx+Math.sin(t*3)*10, gY-H*0.22 - (t-3.4)*30); ctx.restore(); }
          bubble(hx, gY-H*0.20, CA.t('Csodás reggel a réten! 🌼'), span(t,1.0,1.6)*(1-span(t,5.0,5.8)));
          // surprise just before the boom
          bubble(hx, gY-H*0.20, '?!', span(t,9.4,9.7));
        }

        // frogs ambush (leap in ~7-8.6), then HOLD on the blast site (at the spots
        // the squad will fire on: 0.42W / 0.30W) so they're STILL THERE when the
        // capybaras arrive & counterattack — only then do they get blown up & fade
        // out (Jani: "mire megjönnek a capyk, a frogok már nincsenek ott").
        if(t>7 && t<19.9){
          var fa=span(t,7.0,8.2);
          var fAx=lerp(tx, W*0.42, fa), fAy=lerp(ty-H*0.30, gY, fa) - Math.sin(fa*Math.PI)*H*0.12;
          var fb=span(t,7.4,8.6);
          var fBx=lerp(W*0.20, W*0.30, fb), fBy=lerp(gY+H*0.05, gY, fb) - Math.sin(fb*Math.PI)*H*0.14;
          if(t>8.6){ fAy=gY - Math.abs(Math.sin(t*4))*6; fBy=gY - Math.abs(Math.sin(t*4+1))*6; }   // idle hop
          var ffade = 1 - span(t,19.1,19.7);          // blown up by the counterattack
          ctx.save(); ctx.globalAlpha=ffade;
          drawActor(frogP, fAx, fAy, 0.7, true, 0);
          drawActor(frogP, fBx, fBy, 0.7, false, 0);
          ctx.restore();
          bubble(W*0.36, gY-H*0.18, CA.t('Ribbit! Kapjuk el! 😈'), span(t,7.8,8.4)*(1-span(t,10.0,10.4)));
        }

        // BOOM (P3 ~10.2)
        if(t>10.2 && t<11.6){ var bt=t-10.2; if(bt<0.05) shake=Math.max(shake,1);
          drawExpl(0.46*W, gY-H*0.05, H*0.5, bt, 1.0);
          // feathers/dust poof
        }
        // white flash on impact
        if(t>10.2 && t<10.8){ ctx.save(); ctx.globalAlpha=(1-(t-10.2)/0.6)*0.85; ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H); ctx.restore(); }

        // squad storms in (P4 12..18) facing LEFT
        var squad=[ {img:sqPirate,baseX:0.62}, {img:sqMage,baseX:0.74}, {img:sqHelm,baseX:0.86} ];
        if(t>11.8 && t<24){
          for(var s=0;s<squad.length;s++){ var q=squad[s];
            var inn=smooth((t-11.8-s*0.18)/1.4);
            var qx=lerp(1.15, q.baseX, inn)*W;
            var angry=(t>13&&t<18)?Math.sin(t*26+s)*2:0;
            var recoil=(t>18.4&&t<19.2)? -Math.sin((t-18.4)/0.8*Math.PI)*10 : 0;
            drawActor(q.img, qx+angry+recoil, gY, 0.95, true, Math.sin(t*4+s)*3);
            // weapon glint while angry
            if(t>13.2&&t<17.8){ ctx.save(); ctx.globalAlpha=0.5+0.5*Math.sin(t*8+s); ctx.font=Math.round(H*0.05)+'px serif'; ctx.fillText('🚀', qx-H*0.05, gY-H*0.20); ctx.restore(); }
          }
          bubble(W*0.74, gY-H*0.24, CA.t('Ezt megkeserülitek! 😤'), span(t,13.2,13.9)*(1-span(t,17.6,18.2)));
        }

        // counterattack (P5 18.4..23): tracers + frog explosions
        if(t>18.4 && t<22.5){
          // tracers
          if(t<19.2){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle='rgba(255,220,120,0.9)'; ctx.lineWidth=3;
            for(var s2=0;s2<squad.length;s2++){ var sxp=squad[s2].baseX*W; ctx.beginPath(); ctx.moveTo(sxp, gY-H*0.12); ctx.lineTo(lerp(sxp,W*0.42,(t-18.4)/0.8), gY-H*0.10); ctx.stroke(); }
            ctx.restore(); }
          // frog explosions
          drawExpl(W*0.42, gY-H*0.04, H*0.34, t-19.1, 0.9);
          drawExpl(W*0.30, gY-H*0.02, H*0.30, t-19.4, 0.9);
          if(t>19.0&&t<19.1) shake=Math.max(shake,0.8);
          bubble(W*0.74, gY-H*0.24, CA.t('TŰZ! 🚀💥'), span(t,18.5,18.9)*(1-span(t,20.5,21.0)));
        }

        // cinematic letterbox + vignette + skip hint
        var lb=H*0.075*span(t,0,0.6);
        ctx.fillStyle='#000'; ctx.fillRect(0,0,W,lb); ctx.fillRect(0,H-lb,W,lb);
        var vg=ctx.createRadialGradient(W/2,H*0.5,H*0.3, W/2,H*0.5,H*0.8);
        vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.35)');
        ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
        ctx.save(); ctx.globalAlpha=0.6; ctx.fillStyle='#fff'; ctx.font='600 '+Math.round(H*0.022)+'px system-ui,sans-serif';
        ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.fillText(CA.t('Koppints az átugráshoz ›'), W-14, H-lb-8); ctx.restore();

        // ---------- logo finale (P6 23..) ----------
        if(t>22.8){
          var da=span(t,22.8,23.8); ctx.fillStyle='rgba(8,10,16,'+(0.92*da)+')'; ctx.fillRect(0,0,W,H);
          if(logoOK){ var la=span(t,23.2,24.2), ls=lerp(0.86,1.0,smooth((t-23.2)/1.6));
            var lw=Math.min(W*0.6, logo.width*ls), lh=lw*(logo.height/logo.width);
            ctx.save(); ctx.globalAlpha=la; ctx.drawImage(logo, W/2-lw/2, H*0.42-lh/2, lw, lh); ctx.restore();
          } else {
            ctx.save(); ctx.globalAlpha=span(t,23.2,24.2); ctx.fillStyle='#E8711A'; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.font='800 '+Math.round(H*0.09)+'px "Baloo 2",system-ui,sans-serif'; ctx.fillText('Animal Battle Ground', W/2, H*0.42); ctx.restore();
          }
          var sa=0.5+0.5*Math.sin(t*3);
          ctx.save(); ctx.globalAlpha=span(t,24.0,24.8)*(0.6+0.4*sa); ctx.fillStyle='#ffd9a8'; ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.font='700 '+Math.round(H*0.03)+'px "Baloo 2",system-ui,sans-serif'; ctx.fillText(CA.t('Koppints a játékhoz ▶'), W/2, H*0.62); ctx.restore();
        }
      }

      // ---- main loop ----
      function frame(now){
        if(!self._running) return;
        if(t0==null) t0=now;
        var t=(now-t0)/1000;

        // skip → fast-forward to the logo finale, then finish
        if(finishing){ skipFade+=0.06; if(t<22.9) t=22.9 + skipFade*3; if(skipFade>=1.2){ done(); return; } }
        if(t>=END_T){ done(); return; }

        // trauma shake decays
        shake=Math.max(0, shake-0.04);
        var sh = shake*shake * (H*0.02);
        ctx.save();
        ctx.translate((Math.random()*2-1)*sh, (Math.random()*2-1)*sh);
        try{ scene(t); }catch(e){ /* never hang the intro */ done(); }
        ctx.restore();

        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
  };
})();
