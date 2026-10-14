// End-to-end check of the *packaged* quick-start path:
//   scripts/serve-dist.py (release layout) + built browser client + a real browser.
//
// Mesa never runs browsers itself (standing directive); point UT_CDP_PORT at a
// tunnel to a browser host's CDP port, and UT_DIST_URL at the dist server as
// *the browser host* sees it (e.g. via `ssh -R 19001:127.0.0.1:8901 pve`).
//
//   UT_CDP_PORT=19222 UT_DIST_URL=http://127.0.0.1:19001/ut2004/ node scripts/test-dist.cjs
//
// Requires: the dist server running, CDP browser reachable, `ws` installed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const WebSocket = require('ws');

const port = Number(process.env.UT_CDP_PORT || 19222);
const base = process.env.UT_DIST_URL || 'http://127.0.0.1:19001/ut2004/';
const url = base.replace(/\/?$/, '/') + '?interactive=1&map=DM-Rankin';
const out = process.env.UT_TEST_OUT || path.join(__dirname, '..', 'build', 'dist-qa');
fs.mkdirSync(out, { recursive: true });

const delay = ms => new Promise(r => setTimeout(r, ms));
const log = [];
const failures = [];
const started = Date.now();

(async () => {
  // Attach to a blank page; never hijack an existing QA tab (pve chrome is shared).
  const listTargets = async () => await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let target = (await listTargets()).find(t => t.type === 'page' && t.url === 'about:blank');
  if (!target) {
    target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  }
  const closeTarget = async () => { try { await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`); } catch {} };
  assert(target && target.webSocketDebuggerUrl, 'no CDP page target');
  process.on('exit', closeTarget);
  const ws = new WebSocket(target.webSocketDebuggerUrl.replace(/localhost:\d+|127\.0\.0\.1:\d+/, `127.0.0.1:${port}`));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });

  let id = 0;
  const pending = new Map();
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) { pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const line = m.params.args.map(a => a.value ?? a.description).join(' ');
      log.push(line);
      if (/WASM browser status|engine frame|error|fail/i.test(line)) console.log('[console]', line.slice(0, 240));
    } else if (m.method === 'Runtime.exceptionThrown') {
      failures.push({ type: 'exception', detail: m.params });
      log.push(JSON.stringify(m.params));
    } else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      failures.push({ type: 'http', status: m.params.response.status, url: m.params.response.url });
    }
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id; pending.set(key, { resolve, reject });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true });
    assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const until = async (expression, timeout = 300000) => {
    const start = Date.now();
    while (!await evaluate(expression)) {
      assert(Date.now() - start < timeout, 'timeout: ' + expression);
      assert.equal(failures.length, 0, 'page failures: ' + JSON.stringify(failures).slice(0, 800));
      assert(!await evaluate('window.bootResult'), 'engine exited early: ' + JSON.stringify(await evaluate('window.bootResult')));
      await delay(500);
    }
  };

  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Page.enable');
  console.log('[qa] navigating', url);
  await cdp('Page.navigate', { url });

  // Engine boot: module present, first real frame painted, frames advancing.
  // Cold first loads over a slow link can take several minutes; be patient.
  await until('!!window.Module && !!window.frameEvidence', 900000);
  const firstFrame = await evaluate('window.frameEvidence.elapsedMs');
  await until('Module.frameCount > 60', 600000);
  await until('window.frameEvidence.rgbNonzero > 50000', 300000);

  // Request a fresh capture and verify a clean, colorful in-game frame.
  const prevFrames = await evaluate('window.frameEvidence.frames');
  await evaluate('Module.captureRequested = true');
  await until(`window.frameEvidence.frames > ${prevFrames} && window.lastFramePNG`);
  const state = await evaluate('({url: location.href, status: document.getElementById("status").textContent, frame: window.frameEvidence, frames: Module.frameCount, png: window.lastFramePNG})');
  assert.equal(state.frame.glErrors, 0, 'GL errors: ' + state.frame.glErrors);
  assert.equal(state.frame.webglErrors, 0, 'WebGL errors: ' + state.frame.webglErrors);
  assert(state.frame.uniqueColors > 100, 'too few colors: ' + state.frame.uniqueColors);
  const png = state.png; delete state.png;
  fs.writeFileSync(path.join(out, 'frame.png'), Buffer.from(png.split(',')[1], 'base64'));
  const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(out, 'page.png'), Buffer.from(shot.data, 'base64'));
  fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify({ ...state, firstFrameMs: firstFrame, bootMs: Date.now() - started, console: log.slice(-200) }, null, 2));

  // Clean shutdown through the shell's own stop path.
  await evaluate('window.__shutdown()');
  await until('window.bootResult && window.bootResult.type === "exit"', 60000);
  const exit = await evaluate('window.bootResult');
  assert.equal(exit.code, 0, 'exit code ' + JSON.stringify(exit));
  assert.equal(failures.length, 0, 'page failures: ' + JSON.stringify(failures).slice(0, 800));

  console.log(`PASS: dist client booted (${url})`);
  console.log(`  first frame: ${firstFrame} ms; boot+qa: ${Date.now() - started} ms`);
  console.log(`  frame: ${state.frame.width}x${state.frame.height}, ${state.frame.rgbNonzero} nonblack px, ${state.frame.uniqueColors} colors, 0 GL errors`);
  console.log(`  evidence: ${out}`);
  ws.close();
})().catch(error => { console.error('FAIL:', error.message); process.exit(1); });
