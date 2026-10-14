// Live-site QA: pve Chrome over SSH tunnel plus a separate mesa browser.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const out = 'build/phase6';
const delay = ms => new Promise(r => setTimeout(r, ms));
const clients = [];
async function attach(port, name) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(t => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl.replace(/localhost:\d+|127\.0\.0\.1:\d+/, `127.0.0.1:${port}`));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0;
  const pending = new Map(), log = [], failures = [];
  const c = {ws, name, log, failures}; clients.push(c);
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } }
    else if (m.method === 'Runtime.consoleAPICalled') {
      const line = m.params.args.map(a => a.value ?? a.description).join(' ');
      log.push(line);
      if (/WASM signon|WebSocket|interactive RAF|engine frame/.test(line)) console.log(name, line);
    } else if (m.method === 'Runtime.exceptionThrown') { failures.push(m.params); log.push(JSON.stringify(m)); }
    else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) failures.push(m.params.response);
  });
  c.cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id; pending.set(key, {resolve, reject}); ws.send(JSON.stringify({id:key, method, params}));
  });
  c.eval = async expression => { const r = await c.cdp('Runtime.evaluate', {expression, returnByValue:true}); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  c.until = async (expression, timeout = 600000) => {
    const start = Date.now();
    while (!await c.eval(expression)) { assert(Date.now()-start < timeout, name+' timeout '+expression); assert.equal(failures.length,0,JSON.stringify(failures)); assert(!await c.eval('window.bootResult'), name+' engine exited'); await delay(300); }
  };
  c.key = async (type, key, code, windowsVirtualKeyCode) => c.cdp('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode});
  c.capture = async name => {
    const previous = await c.eval('Module.frameCount');
    await c.eval('Module.captureRequested=true'); await c.until(`window.frameEvidence?.frames > ${previous}`);
    const state = await c.eval('({url:location.href, player:Module.playerState, frame:window.frameEvidence, png:window.lastFramePNG})');
    assert.equal(state.player.netMode,3); assert(state.player.pawn); assert.equal(state.frame.glErrors,0); assert.equal(state.frame.webglErrors,0); assert(state.frame.uniqueColors>32);
    fs.writeFileSync(`${out}/${c.name}-${name}-canvas.png`, Buffer.from(state.png.split(',')[1],'base64')); delete state.png;
    fs.writeFileSync(`${out}/${c.name}-${name}.json`,JSON.stringify(state,null,2));
    const shot=await c.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(`${out}/${c.name}-${name}.png`,Buffer.from(shot.data,'base64'));
  };
  await c.cdp('Runtime.enable'); await c.cdp('Network.enable'); await c.cdp('Page.enable');
  await c.cdp('Network.setCacheDisabled',{cacheDisabled:true});
  c.started=Date.now(); c.url=`https://games.rgnv.dev/ut2004/?interactive=1&connect=1&name=${name}`;
  log.push('LIVE URL '+c.url);
  await c.cdp('Page.navigate',{url:c.url});
  return c;
}
async function spawn(c) {
  await c.until('!!window.Module?.interactiveReady');
  await c.until('Module.frameCount > 0');
  c.firstFrame=await c.eval('window.frameEvidence.elapsedMs');
  await c.until('Module.playerState?.netMode===3');
  await c.eval('Module.canvas.focus()'); await c.key('keyDown','Escape','Escape',27); await c.key('keyUp','Escape','Escape',27);
  const rect=await c.eval('({x:Module.canvas.getBoundingClientRect().x+320,y:Module.canvas.getBoundingClientRect().y+240})');
  for(let i=0; !await c.eval('!!Module.playerState?.pawn'); i++) {
    assert(i<90,c.name+' spawn timeout');
    await c.cdp('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',clickCount:1}); await delay(300);
    await c.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',clickCount:1}); await delay(700);
  }
  c.spawnMs=Date.now()-c.started;
  await c.capture('ingame'); console.log(c.name,'SPAWNED',c.spawnMs,'ms; first frame',c.firstFrame);
}
(async()=>{
  const a=await attach(19222,'PveQA');
  const b=await attach(19223,'PvpQA');
  await Promise.all([spawn(a),spawn(b)]);
  await delay(2000);
  for(const c of clients) {
    await c.key('keyDown','F1','F1',112); await delay(1200); await c.capture('scoreboard'); await c.key('keyUp','F1','F1',112);
    for(const marker of ['WASM signon: CHALLENGE received','WASM signon: WELCOME received','WASM signon: sending JOIN']) assert(c.log.join('\n').includes(marker),marker);
    assert.equal(c.failures.length,0,JSON.stringify(c.failures));
    c.transport=await c.eval('Object.values(Module.netSessions).map(s=>({sent:s.sent,received:s.received,failed:s.failed}))');
    assert(c.transport.every(s=>s.sent>0&&s.received>0&&!s.failed));
  }
  fs.writeFileSync(out+'/live-timing.json',JSON.stringify(clients.map(c=>({name:c.name,url:c.url,firstFrameMs:c.firstFrame,spawnMs:c.spawnMs,transport:c.transport})),null,2));
  console.log('PASS: two live-site clients joined/spawned; HUD and scoreboard captured; no HTTP or JavaScript errors');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  for(const c of clients) {
    fs.writeFileSync(`${out}/${c.name}-console.log`,c.log.join('\n')+'\n');
    try {await c.cdp('Browser.close');} catch {} c.ws.close();
  }
});
