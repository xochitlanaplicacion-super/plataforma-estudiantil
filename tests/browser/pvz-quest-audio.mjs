import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium, webkit } from '@playwright/test';

// Real Web Audio and MP3 decoding, served locally. This bridge is appended only
// to the response; the authenticated teacher template and shipped app are not
// modified or made publicly accessible by these checks.
const root = resolve('public');
const template = (await readFile('src/lib/games/pvz-quest/template.html', 'utf8'))
  .replace('<html lang="es">', '<html lang="es" data-pvz-asset-root="/games/pvz-quest">')
  .replace('<head>', '<head><base href="/games/pvz-quest/classroom/">');
const bridge = `
window.audioTest = {
  state: () => structuredClone(match),
  inspect: () => gameAudio.inspect(),
  ready: () => gameAudio.ready(),
  play: name => gameAudio.play(name),
  visible: value => gameAudio.setVisible(value),
  stop: stopLiveLoop,
  async stress() {
    for (let index = 0; index < 12; index++) {
      for (const name of ['chomp', 'pea_shoot', 'pea_hit', 'freeze', 'zombie_groan', 'zombie_fall']) gameAudio.play(name);
      await new Promise(done => setTimeout(done, 100));
    }
    return gameAudio.inspect();
  },
};`;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(template); return; }
    if (pathname === '/api/classroom/ai-status') { response.setHeader('Content-Type', 'application/json'); response.end('{"configured":false}'); return; }
    const path = resolve(root, '.' + pathname); assert(path.startsWith(root + sep));
    let contents = await readFile(path);
    if (pathname === '/games/pvz-quest/classroom/app.js') contents = contents.toString() + bridge;
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg' })[extname(path)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store'); response.end(contents);
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));

const engine = process.env.PVZ_BROWSER_ENGINE || 'chromium';
assert(['chromium', 'webkit'].includes(engine), 'PVZ_BROWSER_ENGINE must be chromium or webkit');
const cases = [
  { name: 'PC duel', mode: 'duel', viewport: { width: 1366, height: 768 } },
  { name: 'iPad touch duel', mode: 'duel', viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true },
  { name: engine === 'webkit' ? 'iPhone class Plants' : 'Android class Plants', mode: 'coop-plants',
    viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
];

async function registerAudioProbe(context) {
  await context.addInitScript(() => {
    const NativeContext = window.AudioContext || window.webkitAudioContext;
    const probe = { contexts: [], sources: [], mediaPlays: 0 };
    window.audioProbe = probe;
    // Observe actual sources without mocking the audio clock, decoder, buffers,
    // autoplay policy or sound output. Start must still be a trusted UI click.
    function ObservedContext(options) {
      const audioContext = new NativeContext(options);
      audioContext.questCreationOptions = options;
      probe.contexts.push(audioContext);
      const originalCreate = audioContext.createBufferSource.bind(audioContext);
      audioContext.createBufferSource = function() {
        const source = originalCreate();
        const record = { source, context: audioContext, starts: [], stopped: false };
        probe.sources.push(record);
        const originalStart = source.start.bind(source), originalStop = source.stop.bind(source);
        source.start = function(...args) {
          const result = originalStart(...args);
          record.starts.push({ at: args[0] ?? 0, offset: args[1] ?? 0, clock: audioContext.currentTime });
          return result;
        };
        source.stop = function(...args) { const result = originalStop(...args); record.stopped = true; return result; };
        return source;
      };
      return audioContext;
    }
    ObservedContext.prototype = NativeContext.prototype;
    window.AudioContext = ObservedContext;
    if (window.webkitAudioContext) window.webkitAudioContext = ObservedContext;
    const originalMediaPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) { probe.mediaPlays++; return originalMediaPlay.apply(this, args); };
    probe.inspect = () => ({
      contexts: probe.contexts.map(audioContext => ({ state: audioContext.state, sampleRate: audioContext.sampleRate,
        options: audioContext.questCreationOptions })),
      mediaPlays: probe.mediaPlays,
      sources: probe.sources.map(record => ({ loop: record.source.loop, duration: record.source.buffer?.duration || 0,
        sampleRate: record.source.buffer?.sampleRate || 0, rate: record.source.playbackRate.value,
        detune: record.source.detune.value, starts: record.starts, stopped: record.stopped })),
    });
  });
}

function musicSources(probe) { return probe.sources.filter(source => source.loop && source.duration > 10); }

function assertNativeMusic(probe, expectedPlaying = true) {
  assert.equal(probe.contexts.length, 1, 'Music, recordings, and synthesized ice share one AudioContext');
  assert.equal('sampleRate' in probe.contexts[0].options, false, 'No fixed sample rate overrides the device output');
  assert.equal(probe.mediaPlays, 0, 'No competing HTML media players are started');
  const music = musicSources(probe);
  assert(music.length > 0, 'The original decoded soundtrack has been started');
  assert.equal(music.filter(source => !source.stopped).length, expectedPlaying ? 1 : 0, 'At most one soundtrack loop is attached');
  for (const source of probe.sources) {
    assert.equal(source.rate, 1, 'No recording is slowed down by the simulation speed');
    assert.equal(source.detune, 0);
    assert.equal(source.sampleRate, probe.contexts[0].sampleRate, 'All decoded recordings use the context native rate');
    assert.equal(source.starts.length, 1, 'A buffer source is never restarted or rewound');
  }
}

async function waitForMusic(page, playing = true) {
  await page.waitForFunction(expected => window.audioTest.inspect().musicPlaying === expected, playing, { timeout: 10_000 });
}

async function waitForAdvance(page, offset, seconds = .12) {
  await page.waitForFunction(({ offset, seconds }) => window.audioTest.inspect().musicOffset > offset + seconds,
    { offset, seconds }, { timeout: 10_000 });
}

async function openMenu(page) {
  if (!(await page.locator('.menu').evaluate(menu => menu.open))) await page.click('.menu > summary');
}

let browser;
try {
  browser = engine === 'webkit' ? await webkit.launch({ headless: true,
    ...(process.env.PVZ_WEBKIT_EXECUTABLE ? { executablePath: process.env.PVZ_WEBKIT_EXECUTABLE } : {}) })
    : await chromium.launch({ executablePath: process.env.PVZ_BROWSER || '/usr/bin/google-chrome', headless: true,
      // Suppress audible output on the developer workstation, not autoplay
      // restrictions. Web Audio still uses its real audio render thread.
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'] });
  for (const { name, mode, ...options } of cases) {
    const context = await browser.newContext({ ...options, reducedMotion: 'reduce' });
    await registerAudioProbe(context);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.audioTest && !document.querySelector('#start').disabled);
      assert.equal(await page.locator('[name="audio"]').isChecked(), true);
      assert.equal((await page.evaluate(() => window.audioProbe.inspect())).contexts.length, 0);
      await page.selectOption('[name="mode"]', mode);
      await page.selectOption('[name="timer"]', '0');
      await page.selectOption('[name="waveSeconds"]', '600');
      await page.click('#start');
      await page.evaluate(() => window.audioTest.ready());
      await waitForMusic(page);
      let audio = await page.evaluate(() => window.audioTest.inspect());
      assert.equal(audio.enabled, true);
      assert.equal(audio.decodedBuffers, 12);
      assert.equal(audio.musicRate, 1);
      assert.equal((await page.evaluate(() => window.audioTest.state())).paused, mode === 'duel');
      let probe = await page.evaluate(() => window.audioProbe.inspect());
      assertNativeMusic(probe);
      assert.equal(musicSources(probe).length, 1, 'Start automatically starts music even while duel setup is tactically paused');
      await waitForAdvance(page, audio.musicOffset);

      if (mode === 'duel') {
        await page.click('[data-action="initial-coin"]');
        await page.waitForFunction(() => window.audioTest.state().tacticalPhase === 'shopping');
        await page.click('[data-action="tactical-confirm"]');
        await page.click('[data-action="tactical-confirm"]');
        await page.click('[data-action="tactical-resume"]');
      }
      assert.equal((await page.evaluate(() => window.audioTest.state())).paused, false);
      const beforeStress = await page.evaluate(() => window.audioTest.inspect());
      const beforeStressMusicCount = musicSources(await page.evaluate(() => window.audioProbe.inspect())).length;
      const afterStress = await page.evaluate(() => window.audioTest.stress());
      assert(afterStress.musicOffset > beforeStress.musicOffset + .8, 'Music keeps moving while repeated bite/shot/freeze feedback is mixed');
      assert(afterStress.effectVoices <= 4);
      probe = await page.evaluate(() => window.audioProbe.inspect());
      assertNativeMusic(probe);
      assert.equal(musicSources(probe).length, beforeStressMusicCount, 'Combat bursts never restart the music');

      await page.click('#live-pause');
      await waitForMusic(page, false);
      const paused = await page.evaluate(() => window.audioTest.inspect());
      await page.waitForTimeout(100);
      assert.equal((await page.evaluate(() => window.audioTest.inspect())).musicOffset, paused.musicOffset);
      assertNativeMusic(await page.evaluate(() => window.audioProbe.inspect()), false);
      await page.click('#live-pause');
      await waitForMusic(page);
      probe = await page.evaluate(() => window.audioProbe.inspect());
      assertNativeMusic(probe);
      assert.equal(musicSources(probe).at(-1).starts[0].offset, paused.musicOffset, 'Explicit resume continues at the paused sample position');

      await openMenu(page);
      await page.click('#sound-toggle');
      await waitForMusic(page, false);
      const muted = await page.evaluate(() => window.audioTest.inspect());
      assert.equal(muted.enabled, false);
      assert.equal(await page.evaluate(() => window.audioTest.play('freeze')), false);
      await page.waitForTimeout(100);
      assert.equal((await page.evaluate(() => window.audioTest.inspect())).musicOffset, muted.musicOffset);
      await openMenu(page);
      await page.click('#sound-toggle');
      await waitForMusic(page);
      probe = await page.evaluate(() => window.audioProbe.inspect());
      assertNativeMusic(probe);
      assert.equal(musicSources(probe).at(-1).starts[0].offset, muted.musicOffset, 'Turning sound back on resumes without pressing Probar sonido');
      await openMenu(page);
      await page.click('[data-action="speed-preset"][data-speed="1.7"]');
      assert.equal((await page.evaluate(() => window.audioTest.state())).zombieSpeed, 1.7);
      assert.equal((await page.evaluate(() => window.audioTest.inspect())).musicRate, 1);

      await page.evaluate(() => window.audioTest.visible(false));
      await waitForMusic(page, false);
      const hidden = await page.evaluate(() => window.audioTest.inspect());
      await page.waitForTimeout(100);
      await page.evaluate(() => window.audioTest.visible(true));
      await waitForMusic(page);
      probe = await page.evaluate(() => window.audioProbe.inspect());
      assertNativeMusic(probe);
      assert.equal(musicSources(probe).at(-1).starts[0].offset, hidden.musicOffset, 'Background/foreground recovery preserves the soundtrack position');

      // An interrupted iOS context and a suspended Chromium context both need
      // the next real interaction to attempt resume, not a per-frame reset.
      await page.evaluate(() => window.audioProbe.contexts[0].suspend());
      await waitForMusic(page, false);
      await page.click('#round-title');
      await waitForMusic(page);
      assertNativeMusic(await page.evaluate(() => window.audioProbe.inspect()));
      audio = await page.evaluate(() => window.audioTest.inspect());
      await waitForAdvance(page, audio.musicOffset);
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${name}: Start unlocks original music; native-rate mixing; combat stress; pause/mute/background/recovery; no extra contexts or media players`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
}
