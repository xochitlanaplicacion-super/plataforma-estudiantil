import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';

const assets = resolve('public');
const screenshots = await mkdtemp(join(tmpdir(), 'pvz-result-hud-'));
const template = (await readFile('src/lib/games/pvz-quest/template.html', 'utf8'))
  .replace('<html lang="es">', '<html lang="es" data-pvz-asset-root="/games/pvz-quest">')
  .replace('<head>', '<head><base href="/games/pvz-quest/classroom/">');
// Diagnostic hooks exist only in this loopback response, never production.
const bridge = `
window.questUITest = {
  wave(seconds,paused=false) {
    stopLiveLoop();
    match={...match,initialStaging:false,tacticalPhase:null,pendingWave:null,paused,
      waveElapsed:match.config.waveSeconds-seconds}; render();
  },
  question(rounds=false) {
    quiz=null;$('#live-question').hidden=true;$('#quiz-dialog').close();
    if(rounds){settings.tempo='rounds';match=createMatch({mode:'coop-plants',rounds:1});render();}
    settings.timer=30;settings.questionMode='bank';
    pool=createQuestionPool([{id:'demo',type:'multiple',prompt:'Pregunta de prueba',options:['Correcta','Otra'],answerIndex:0,explanation:'Ejemplo'}]);
    openQuiz('plants');clock.end=Date.now()+9000;updateClock();
  },
  result(winner,rounds=false) {
    stopLiveLoop();settings.tempo=rounds?'rounds':'continuous';
    if(!rounds&&match.config.tempo!=='continuous')match=createLiveMatch({mode:'coop-plants',startPaused:true});
    match={...match,phase:'finished',winner,paused:false,tacticalPhase:null,initialStaging:false};render();
  },
  actualPlantWin() {
    stopLiveLoop();quiz=null;$('#live-question').hidden=true;resetClock();settings.tempo='continuous';
    match={...match,config:{...match.config,waves:1,tacticalPauses:false},phase:'live',round:1,maxRounds:1,
      elapsed:45,tickCount:2700,waveElapsed:45,closing:true,closingAt:45,units:[],paused:false,
      initialStaging:false,tacticalPhase:null,pendingWave:null,accumulator:0};startLiveLoop();
  },
  snapshot:()=>snapshot(),
};`;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.setHeader('Content-Type','text/html'); response.end(template); return; }
    if (pathname === '/api/classroom/ai-status') { response.setHeader('Content-Type','application/json'); response.end('{"configured":false}'); return; }
    const path = resolve(assets, '.' + pathname);
    assert(path.startsWith(assets + sep));
    let bytes = await readFile(path);
    if (pathname === '/games/pvz-quest/classroom/app.js') bytes = bytes.toString() + bridge;
    response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg'})[extname(path)] || 'application/octet-stream');
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0,'127.0.0.1',done));
let browser;
try {
  browser = await chromium.launch({executablePath:process.env.PVZ_BROWSER || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const cases = [
    {name:'PC',width:1366,height:768}, {name:'iPad landscape',width:1024,height:768,touch:true},
    {name:'iPad portrait',width:768,height:1024,touch:true}, {name:'phone landscape',width:844,height:390,touch:true},
    {name:'phone portrait',width:390,height:844,touch:true},
  ];
  for (const scenario of cases) {
    const context = await browser.newContext({viewport:{width:scenario.width,height:scenario.height},hasTouch:!!scenario.touch,isMobile:!!scenario.touch});
    const page = await context.newPage();
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(()=>window.questUITest&&!document.querySelector('#start').disabled);
      await page.selectOption('[name="mode"]','coop-plants');await page.selectOption('[name="timer"]','0');
      await page.uncheck('[name="audio"]');await page.click('#start');
      await page.evaluate(()=>window.questUITest.wave(9));
      assert.equal(await page.locator('#timer .quest-countdown-value').textContent(),'00:09');
      assert.match(await page.locator('#timer').getAttribute('class'),/urgent/);
      const timerBox=await page.locator('#timer').boundingBox();
      assert(timerBox.x>=0&&timerBox.y>=0&&timerBox.x+timerBox.width<=scenario.width+1);
      const font=await page.locator('#timer .quest-countdown-value').evaluate(element=>parseFloat(getComputedStyle(element).fontSize));
      assert(font>=24,'Countdown cannot regress to the tiny status-bar text');
      assert(await page.locator('.game-bar').evaluate(element=>element.scrollWidth<=element.clientWidth+1),'Clock must not push the header controls out of view');
      const menuBox=await page.locator('.menu > summary').boundingBox();
      assert(menuBox.x>=0&&menuBox.x+menuBox.width<=scenario.width+1,'Menu must remain reachable on narrow screens');
      await page.screenshot({path:join(screenshots,scenario.name.replaceAll(' ','-')+'-clock.png')});
      await page.evaluate(()=>window.questUITest.wave(9,true));
      assert.match(await page.locator('#timer').getAttribute('class'),/paused/);
      assert(!/urgent/.test(await page.locator('#timer').getAttribute('class')));
      await page.evaluate(()=>window.questUITest.question());
      assert.equal(await page.locator('#timer .quest-countdown-label').textContent(),'Responder');
      if(scenario.name==='PC') {
        await page.click('.menu > summary');
        const popup=context.waitForEvent('page');
        await page.click('[data-action="project"]');
        const publicPage=await popup;
        await publicPage.waitForLoadState('domcontentloaded');
        await publicPage.waitForFunction(()=>document.querySelector('#timer .quest-countdown-label')?.textContent==='Responder');
        assert.equal(await publicPage.locator('#timer').isVisible(),true);
        await page.evaluate(()=>window.questUITest.actualPlantWin());
        await page.waitForSelector('.quest-match-result-title');await publicPage.waitForSelector('.quest-match-result-title');
        assert.match(await publicPage.locator('.quest-match-result-title').textContent(),/Ganan Plantas/);
        assert.equal(await publicPage.locator('.quest-match-result-replay').count(),0);
        await page.click('.quest-match-result-replay');
        await publicPage.waitForFunction(()=>!document.querySelector('.quest-match-result'));
        await publicPage.close();
        await page.selectOption('[name="mode"]','coop-plants');await page.click('#start');
      }
      await page.evaluate(()=>window.questUITest.question(true));
      assert.equal(await page.locator('#quiz-countdown').isVisible(),true);
      assert.equal(await page.locator('#quiz-countdown .quest-countdown-label').textContent(),'Responder');
      await page.evaluate(()=>window.questUITest.result('zombies',true));
      assert.equal(await page.locator('#quiz-dialog').evaluate(element=>element.open),false,'Native quiz cannot hide the winner');
      const result=page.locator('.quest-match-result-card');await result.waitFor();
      await result.evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished)));
      const bounds=await result.boundingBox();
      assert(Math.abs(bounds.x+bounds.width/2-scenario.width/2)<4);
      assert(Math.abs(bounds.y+bounds.height/2-scenario.height/2)<4);
      assert(bounds.y>=0&&bounds.x>=0&&bounds.y+bounds.height<=scenario.height+1);
      assert(await result.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'The winner title cannot overflow sideways');
      assert.match(await page.locator('.quest-match-result-title').textContent(),/Ganan Zombis/);
      assert.equal(await page.locator('#timer').isVisible(),false);
      await page.screenshot({path:join(screenshots,scenario.name.replaceAll(' ','-')+'.png')});
      await page.waitForTimeout(2100);
      assert.equal(await result.isVisible(),true,'Final banner must not disappear like a wave notice');
      await page.evaluate(()=>window.questUITest.result('draw'));
      assert.equal(await page.locator('.quest-match-result-title').textContent(),'¡Empate!');
      await page.evaluate(()=>document.querySelector('#bank-dialog').showModal());
      await page.evaluate(()=>window.questUITest.result('plants'));
      assert.equal(await page.locator('#bank-dialog').evaluate(element=>element.open),false,'Native bank cannot hide the winner');
      assert.match(await page.locator('.quest-match-result-title').textContent(),/Ganan Plantas/);
      await page.click('.quest-match-result-replay');
      assert.equal(await page.locator('.quest-match-result').count(),0);
      assert.equal(await page.locator('#setup').isVisible(),true);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${scenario.name}: large clock, urgency/pause, quiz countdown, centered persistent winner, draw and restart`);
    } finally { await context.close(); }
  }
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));
}
