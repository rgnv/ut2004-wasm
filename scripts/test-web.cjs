// Run after ./link-web.sh; owns and always cleans up server/browser processes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const root = path.resolve(__dirname, '..');
assert(process.argv.length === 2 || (process.argv.length === 3 && ['--gl4es', '--sdl-worker', '--interactive', '--splash', '--bounded'].includes(process.argv[2])));
const interactive = ['--interactive', '--splash'].includes(process.argv[2]);
const splash = process.argv[2] === '--splash';
const glProbe = process.argv[2] === '--gl4es';
const sdlProbe = process.argv[2] === '--sdl-worker';
const out = process.env.UT_TEST_OUT || path.join(root, process.argv[2] === '--bounded' ? 'build/phase4/bounded' : interactive ? (splash ? 'build/phase4/splash' : 'build/phase4') : sdlProbe ? 'build/phase3b/sdl-worker' : glProbe ? 'build/phase3b' : 'build/phase3c');
fs.mkdirSync(out, {recursive: true});
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ut2004-chrome-'));
const transcript = [];
const errors = [];
let server, ws;
const browserUnit = 'ut2004-test-' + process.pid;
const httpBase = 'http://127.0.0.1:' + (process.env.UT_HTTP_PORT || 8765);
const pageRoot = process.env.UT_TEST_PAGE_ROOT || '/build/web/';
const dataRoot = process.env.UT_TEST_DATA_ROOT || '/data3369/UT2004/';
const dataPath = process.env.UT_TEST_DATA_PATH || path.join(root, 'data3369/UT2004');
const debugPort = Number(process.env.UT_CDP_PORT || 9231);
assert(Number.isInteger(debugPort) && debugPort > 1024 && debugPort < 65536);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = line => { transcript.push(line); console.log(line); };
const httpLog = fs.openSync(path.join(out, 'http.log'), 'w');
const chromeLog = fs.openSync(path.join(out, 'chromium.log'), 'w');
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const done = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await done;
  clearTimeout(timer);
}
(async () => {
  record(interactive ? '$ ./link-web.sh && node scripts/test-web.cjs ' + process.argv[2] : sdlProbe ? '$ bash build/phase3b/build-sdl.sh && node scripts/test-web.cjs --sdl-worker' : glProbe ? '$ ./scripts/build-gl4es-probe.sh && node scripts/test-web.cjs --gl4es' : '$ ./link-web.sh && node scripts/test-web.cjs' + (process.argv[2] ? ' ' + process.argv[2] : ''));
  if (!process.env.UT_HTTP_EXTERNAL) server = spawn('python3', ['-u', 'scripts/serve-web.py'], {cwd: root, stdio: ['ignore', httpLog, httpLog]});
  for (let i = 0; ; i++) {
    if (server && server.exitCode !== null) throw Error('HTTP server failed');
    try { if ((await fetch(httpBase + pageRoot + 'files.json')).ok) break; } catch {}
    if (i > 100) throw Error('HTTP server timeout');
    await delay(100);
  }
  const range = await fetch(httpBase + dataRoot + 'System/Core.u', {headers: {Range: 'bytes=0-3'}});
  assert.equal(range.status, 206);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), fs.readFileSync(path.join(dataPath, 'System/Core.u')).subarray(0, 4));
  record('[HTTP] range self-check: 206, four exact package bytes');
  // Browser memory belongs to a system service, outside the worker cgroup.
  if (!process.env.UT_CDP_EXTERNAL) execFileSync('sudo', ['-n', 'systemd-run', '--unit=' + browserUnit, '--collect',
    '--uid=' + process.getuid(), '--gid=' + process.getgid(),
    '/usr/bin/chromium', '--headless=new', '--no-sandbox', '--disable-gpu',
    '--enable-unsafe-swiftshader', '--remote-debugging-port=' + debugPort,
    '--remote-allow-origins=*', '--user-data-dir=' + profile, '--window-size=1100,1000', 'about:blank']);
  const port = debugPort;
  let verified = false;
  for (let i = 0; i < 200; ++i) {
    try {
      const version = execFileSync('curl', ['-fsS', '--max-time', '2', `http://127.0.0.1:${port}/json/version`], {stdio: ['ignore', 'pipe', 'ignore']});
      record('[CDP curl verified] ' + version.toString().trim());
      verified = true; break;
    } catch { await delay(100); }
  }
  assert(verified, 'systemd Chromium CDP startup failed');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl.replace(/localhost:\d+|127\.0\.0\.1:\d+/, `127.0.0.1:${port}`));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0;
  const pending = new Map();
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) { pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    } else if (m.method === 'Runtime.consoleAPICalled') {
      record('[console.' + m.params.type + '] ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    } else if (m.method === 'Runtime.exceptionThrown' || (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')) {
      errors.push(m.params); record('[page error] ' + JSON.stringify(m.params));
    }
  });
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const key = ++id;
      pending.set(key, {resolve, reject});
      ws.send(JSON.stringify({id: key, method, params}));
    });
  }
  await cdp('Runtime.enable');
  await cdp('Log.enable');
  await cdp('Page.enable');
  record('[browser] ' + JSON.stringify(await cdp('Browser.getVersion')));
  const query = process.env.UT_TEST_QUERY || (interactive ? '?interactive=1' + (splash ? '&splash=1' : '') : '?bounded=1');
  await cdp('Page.navigate', {url: httpBase + (sdlProbe ? '/build/phase3b/sdl-worker.html' : glProbe ? '/build/phase3b/gl4es-probe.html' : pageRoot + 'index.html' + query)});
  if (interactive) {
    fs.mkdirSync(path.join(out, 'frames'), {recursive: true});
    const evaluate = async expression => {
      const response = await cdp('Runtime.evaluate', {expression, returnByValue: true});
      assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    async function until(expression, timeout = 180000) {
      const start = Date.now();
      while (!await evaluate(expression)) {
        assert.equal(errors.length, 0, 'page errors');
        if (expression !== '!!window.bootResult') assert(!await evaluate('window.bootResult'), 'engine exited before requested shutdown');
        assert(Date.now() - start < timeout, 'timeout: ' + expression);
        await delay(100);
      }
    }
    await until('!!window.Module?.interactiveReady', 600000);
    if (process.env.UT_TEST_QUERY) {
      await until('Module.playerState?.netMode === 3', 600000);
      await evaluate('Module.canvas.focus()');
      await cdp('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
      await cdp('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
      const spawnAt = await evaluate('({x: Module.canvas.getBoundingClientRect().x + 320, y: Module.canvas.getBoundingClientRect().y + 240})');
      // NM_Client precedes replicated controller readiness; retry the user fire input.
      for (let attempt = 0; !await evaluate('!!Module.playerState?.pawn'); ++attempt) {
        assert(attempt < 60, 'network pawn spawn timeout');
        await cdp('Input.dispatchMouseEvent', {type: 'mousePressed', ...spawnAt, button: 'left', clickCount: 1});
        await delay(300);
        await cdp('Input.dispatchMouseEvent', {type: 'mouseReleased', ...spawnAt, button: 'left', clickCount: 1});
        await delay(700);
      }
      record('[multiplayer] network client spawned; login menu dismissed');
    }
    const started = Date.now();
    async function capture(name) {
      const previous = await evaluate('Module.frameCount');
      await evaluate('Module.captureRequested = true');
      await until(`window.frameEvidence?.frames > ${previous}`);
      const data = await evaluate('({pixels: window.frameEvidence, player: Module.playerState, png: window.lastFramePNG})');
      const png = Buffer.from(data.png.split(',')[1], 'base64');
      delete data.png;
      data.wallMs = Date.now() - started;
      data.sha256 = require('node:crypto').createHash('sha256').update(png).digest('hex');
      assert.equal(data.pixels.glErrors, 0);
      assert.equal(data.pixels.webglErrors, 0);
      assert(data.pixels.rgbNonzero > 0 && data.pixels.uniqueColors > 32);
      fs.writeFileSync(path.join(out, 'frames', name + '.png'), png);
      fs.writeFileSync(path.join(out, 'readback-' + name + '.json'), JSON.stringify(data, null, 2) + '\n');
      record('[capture] ' + name + ' ' + JSON.stringify(data));
      return data;
    }
    for (const seconds of [0, 2, 10, 20, 30]) {
      await delay(Math.max(0, seconds * 1000 - (Date.now() - started)));
      await capture('time-' + String(seconds).padStart(2, '0'));
    }
    if (!splash) {
      await evaluate('Module.canvas.focus()');
      const rect = await evaluate('({x: Module.canvas.getBoundingClientRect().x + 320, y: Module.canvas.getBoundingClientRect().y + 240})');
      await cdp('Input.dispatchMouseEvent', {type: 'mousePressed', ...rect, button: 'left', clickCount: 1});
      await cdp('Input.dispatchMouseEvent', {type: 'mouseReleased', ...rect, button: 'left', clickCount: 1});
      await until('!!Module.playerState?.pawn');
      if (process.env.UT_TEST_QUERY) assert.equal(await evaluate('Module.playerState.netMode'), 3);
      async function ticks(count) {
        const tick = await evaluate('Module.playerState.tick');
        await until(`Module.playerState.tick >= ${tick + count}`);
      }
      await ticks(5);
      const before = await capture('input-before');
      await cdp('Input.dispatchKeyEvent', {type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87});
      await ticks(20);
      await cdp('Input.dispatchKeyEvent', {type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87});
      await ticks(2);
      const moved = await capture('input-key-after');
      await cdp('Input.dispatchMouseEvent', {type: 'mouseMoved', ...rect});
      await ticks(2);
      await cdp('Input.dispatchMouseEvent', {type: 'mouseMoved', x: rect.x + 100, y: rect.y + 30});
      await ticks(3);
      const turned = await capture('input-mouse-after');
      const proof = {method: 'CDP Input.dispatchKeyEvent / Input.dispatchMouseEvent -> SDL3 -> engine',
        events: 'Left click spawn; W down for 20 engine ticks; W up; mouse move +100,+30', before, moved, turned};
      fs.writeFileSync(path.join(out, 'input-proof.txt'), JSON.stringify(proof, null, 2) + '\n');
      assert.notDeepEqual(moved.player.position, before.player.position, 'W must move engine pawn');
      assert.notDeepEqual(turned.player.rotation, moved.player.rotation, 'mouse must rotate engine player');
      assert.notEqual(before.sha256, moved.sha256, 'keyboard changes frame');
      assert.notEqual(moved.sha256, turned.sha256, 'mouse changes frame');
    }
    if (process.env.UT_TEST_QUERY) {
      for (const marker of ['WASM signon: CHALLENGE received', 'WASM signon: WELCOME received', 'WASM signon: sending JOIN'])
        assert(transcript.join('\n').includes(marker), 'missing ' + marker);
      async function pairBarrier(stage) {
        if (!process.env.UT_PAIR_DIR) return;
        fs.mkdirSync(process.env.UT_PAIR_DIR, {recursive: true});
        fs.writeFileSync(path.join(process.env.UT_PAIR_DIR, stage + '-' + process.pid), 'ready');
        const start = Date.now();
        while (fs.readdirSync(process.env.UT_PAIR_DIR).filter(file => file.startsWith(stage + '-')).length < 2) {
          assert(Date.now() - start < 180000, 'second client timeout: ' + stage);
          await delay(200);
        }
        record('[multiplayer] both clients ' + stage);
      }
      await pairBarrier('spawned');
      await cdp('Input.dispatchKeyEvent', {type: 'keyDown', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112});
      await delay(1000);
      const score = await capture('scoreboard');
      assert.equal(score.player.netMode, 3);
      await pairBarrier('captured');
      await cdp('Input.dispatchKeyEvent', {type: 'keyUp', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112});
      record('[multiplayer] transport stats ' + JSON.stringify(await evaluate('Object.values(Module.netSessions).map(s => ({sent:s.sent, received:s.received, failed:s.failed}))')));
    }
    await evaluate('window.__shutdown()');
    await until('!!window.bootResult');
    assert.deepEqual(await evaluate('window.bootResult'), {type: 'exit', code: 0});
    assert.equal(errors.length, 0, 'page errors');
    const requests = fs.readFileSync(process.env.UT_HTTP_LOG || path.join(out, 'http.log'), 'utf8');
    assert(requests.includes('GET ' + dataRoot + 'Maps/' + (splash ? 'NvidiaLogo' : 'DM-Rankin') + '.ut2'), 'real map HTTP request');
    assert(!/" [45]\d\d /.test(requests), 'HTTP failure');
    fs.writeFileSync(path.join(out, 'commands.txt'), '$ ./link-web.sh\n$ node scripts/test-web.cjs ' + process.argv[2] + '\n');
    record('[harness] PASS: interactive RAF, real map, brightness captures, ' + (splash ? 'splash timing' : 'CDP keyboard/mouse engine response') + ', shutdown exit=0');
    return;
  }
  let result;
  for (let i = 0; i < 6000; i++) {
    result = (await cdp('Runtime.evaluate', {expression: 'window.bootResult', returnByValue: true})).result.value;
    if (result || errors.length) break;
    await delay(100);
  }
  const pixels = (await cdp('Runtime.evaluate', {expression: glProbe ? "window.glProbe" : sdlProbe ? "null" : "window.frameEvidence", returnByValue: true})).result.value;
  record('[canvas] ' + JSON.stringify(pixels) + (sdlProbe ? ' (SDL3 worker probe)' : glProbe ? ' (isolated GL4ES probe)' : ' (engine framebuffer readback)'));
  fs.writeFileSync(path.join(out, 'canvas.json'), JSON.stringify({renderer: sdlProbe ? 'SDL3 worker probe' : glProbe ? 'isolated GL4ES triangle' : 'OpenGLDrv through GL4ES', pixel: pixels}, null, 2) + '\n');
  await cdp('Runtime.evaluate', {expression: 'Promise.all(Array.from(document.images, image => image.decode()))', awaitPromise: true});
  const layout = await cdp('Page.getLayoutMetrics');
  const screenshot = await cdp('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true,
    clip: {x: 0, y: 0, width: layout.cssContentSize.width, height: layout.cssContentSize.height, scale: 1}});
  if (!glProbe && !sdlProbe) {
    const png = (await cdp('Runtime.evaluate', {expression: 'window.lastFramePNG', returnByValue: true})).result.value;
    if (png) fs.writeFileSync(path.join(out, 'canvas.png'), Buffer.from(png.split(',')[1], 'base64'));
  }
  fs.writeFileSync(path.join(out, 'browser.png'), Buffer.from(screenshot.data, 'base64'));
  if (sdlProbe) {
    record('[SDL worker] result=' + JSON.stringify(result));
    assert.deepEqual(result, {type: 'exit', code: 0});
    record('[harness] PASS: SDL3 worker viewport probe');
    return;
  }
  if (glProbe) {
    assert(pixels, 'GL4ES probe did not reach readback');
    assert.equal(errors.length, 0, 'page errors');
    record('[GL4ES] exit=' + JSON.stringify(result));
    assert.deepEqual(result, {type: 'exit', code: 0});
    record('[harness] PASS: GL4ES compatibility probe only; UT2004 map rendering not integrated');
    return;
  }
  assert.deepEqual(result, {type: 'exit', code: 0});
  assert(pixels && pixels.frames >= 3, 'three engine frames required');
  assert.equal(pixels.glErrors, 0, 'GL4ES errors');
  assert.equal(pixels.contextAttributes.preserveDrawingBuffer, true);
  assert.equal(pixels.contextAttributes.alpha, false);
  assert.equal(pixels.webglErrors, 0, 'WebGL readback errors');
  assert(pixels.opaque > 0 && pixels.colorClears > 0, 'engine-cleared framebuffer required');
  const text = transcript.join('\n');
  for (const marker of ['WASM: Core init complete', 'WASM: Engine package loaded', 'Collecting garbage', 'Bringing Level NvidiaLogo.myLevel up for play', 'WASM: engine initialized', 'WASM: SDL3 viewport and GL4ES context active', 'GL_VERSION    : 2.1 gl4es', 'WASM: browser ticks=6', 'WASM: browser bounded loop complete', 'WASM: clean exit']) assert(text.includes(marker), 'missing ' + marker);
  assert.equal(errors.length, 0, 'page errors');
  const requests = fs.readFileSync(process.env.UT_HTTP_LOG || path.join(out, 'http.log'), 'utf8');
  for (const file of ['System/Core.u', 'System/Engine.u', 'Maps/NvidiaLogo.ut2']) assert(requests.includes('GET ' + dataRoot + file), 'missing HTTP GET ' + file);
  assert(!/" [45]\d\d /.test(requests), 'HTTP failure');
  const ranged = [...requests.matchAll(/RANGE .* bytes=(\d+)/g)].reduce((n, m) => n + Number(m[1]), 0);
  const full = [...requests.matchAll(/"GET ([^ ]+) HTTP\/1.1" 200 /g)]
    .filter(m => m[1].startsWith(dataRoot))
    .reduce((n, m) => n + fs.statSync(path.join(dataPath, decodeURIComponent(m[1].slice(dataRoot.length)))).size, 0);
  record('[HTTP] game data body bytes=' + (ranged + full) + ' (includes 4-byte range self-check)');
  record('[harness] PASS: HTTP packages, active GC, map load, GL4ES frames, zero GL errors, bounded ticks, exit=0, no page errors');
})().catch(error => { record('[harness] FAIL: ' + error.stack); process.exitCode = 1; }).finally(async () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({id: 999999, method: process.env.UT_CDP_EXTERNAL ? 'Page.navigate' : 'Browser.close', params: process.env.UT_CDP_EXTERNAL ? {url:'about:blank'} : {}}));
    await delay(500);
    ws.close();
  }
  if (!process.env.UT_CDP_EXTERNAL) try { execFileSync('sudo', ['-n', 'systemctl', 'stop', browserUnit], {stdio: 'ignore'}); } catch {}
  if (!process.env.UT_CDP_EXTERNAL) try { fs.writeFileSync(path.join(out, 'chromium.log'), execFileSync('sudo', ['-n', 'journalctl', '-u', browserUnit, '--no-pager'])); } catch {}
  await stop(server);
  await fs.promises.rm(profile, {recursive: true, force: true, maxRetries: 20, retryDelay: 100});
  record('[cleanup] owned HTTP server/profile removed; ' + (process.env.UT_CDP_EXTERNAL ? 'external browser retained for caller cleanup' : 'owned browser stopped'));
  fs.closeSync(httpLog); fs.closeSync(chromeLog);
  fs.writeFileSync(path.join(out, interactive ? 'interactive.log' : 'console.log'), transcript.join('\n') + '\n');
});
