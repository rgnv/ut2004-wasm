// Live-site map regression or persistent-server join; caller owns browser cleanup.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const [port = '19228', mode = 'osiris', name = 'Phase7bOsiris', out = 'build/phase7b'] = process.argv.slice(2);
const joining = ['join', 'admin', 'default'].includes(mode);
const map = mode === 'osiris' ? 'DM-DE-Osiris2' : mode.replace(/^picker:/, '');
const screenshots = joining || mode === 'osiris' || mode.startsWith('picker:') || ['DM-Corrugation', 'DOM-Suntemple'].includes(map);
fs.mkdirSync(out, {recursive:true});
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
    while (!await c.eval(expression)) { assert(Date.now()-start < timeout, name+' timeout '+expression); assert.equal(failures.length,0,JSON.stringify(failures)); if (expression !== '!!window.bootResult') assert(!await c.eval('window.bootResult'), name+' engine exited'); await delay(300); }
  };
  c.key = async (type, key, code, windowsVirtualKeyCode) => c.cdp('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode});
  c.capture = async name => {
    const previous = await c.eval('Module.frameCount');
    await c.eval('Module.captureRequested=true'); await c.until(`window.frameEvidence?.frames > ${previous}`);
    const state = await c.eval(`({url:location.href, player:Module.playerState, frame:window.frameEvidence, png:${screenshots ? 'window.lastFramePNG' : 'null'}})`);
    assert.equal(state.player.netMode,joining ? 3 : 0); assert(state.player.pawn); assert.equal(state.frame.glErrors,0); assert.equal(state.frame.webglErrors,0); assert(state.frame.uniqueColors>32);
    if (screenshots) fs.writeFileSync(`${out}/${c.name}-${name}-canvas.png`, Buffer.from(state.png.split(',')[1],'base64'));
    delete state.png;
    fs.writeFileSync(`${out}/${c.name}-${name}.json`,JSON.stringify(state,null,2));
    if (!screenshots) return;
    const shot=await c.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(`${out}/${c.name}-${name}.png`,Buffer.from(shot.data,'base64'));
  };
  await c.cdp('Runtime.enable'); await c.cdp('Network.enable'); await c.cdp('Page.enable');
  await c.cdp('Network.setCacheDisabled',{cacheDisabled:false});
  if (mode === 'default') await c.cdp('Page.addScriptToEvaluateOnNewDocument', {source: "localStorage.setItem('ut2004-map', 'DOM-Suntemple');"});
  if (mode === 'osiris' || mode === 'admin') await c.cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
    const originalFetch=window.fetch;
    window.fetch=async function(...args) {
      const response=await originalFetch.apply(this,args);
      if (!String(args[0]).endsWith('/System/User.ini')) return response;
      const text=await response.text();
      return new Response(text.replace(/^F8=.*$/m,${JSON.stringify(mode === 'admin' ? 'F8=admin unsuppress MapVote | admin say ADMINCHECK' : 'F8=open DM-DE-Osiris2')}).replace(/^F9=.*$/m,'F9=admin servertravel DM-Corrugation').replace(/^K=.*$/m,'K=admin servertravel CTF-FaceClassic?game=XGame.xCTFGame'),{status:response.status,headers:response.headers});
    };
  `});
  await c.cdp('Page.navigate',{url:'about:blank'}); await delay(500);
  log.length=0; failures.length=0;
  c.started=Date.now(); c.url=`https://games.rgnv.dev/ut2004/?interactive=1&res=640x480&${joining ? 'connect=1&' : mode === 'osiris' || mode.startsWith('picker:') ? '' : 'map='+encodeURIComponent(map)+'&'}name=${name}`;
  if (mode === 'default') c.url=`https://games.rgnv.dev/ut2004/?res=640x480&name=${name}`;
  log.push('LIVE URL '+c.url);
  await c.cdp('Page.navigate',{url:c.url});
  return c;
}
async function spawn(c, afterTravel = false) {
  await c.until('!!window.Module?.interactiveReady');
  await c.until('Module.frameCount > 0');
  c.firstFrame=await c.eval('window.frameEvidence.elapsedMs');
  if (joining) await c.until('Module.playerState?.netMode===3');
  await c.eval('Module.canvas.focus()');
  if (joining && !afterTravel) { await c.key('keyDown','Escape','Escape',27); await c.key('keyUp','Escape','Escape',27); }
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
  const c=await attach(Number(port),name);
  await c.until('!!window.Module?.interactiveReady && Module.frameCount > 0');
  if (mode.startsWith('picker:')) {
    await c.eval(`document.getElementById('map').value=${JSON.stringify(map)};document.getElementById('play-map').click()`);
    await delay(1000);
    await c.until('!!window.Module?.interactiveReady && Module.frameCount > 0');
    assert.equal(await c.eval('Module.map'), map);
  }
  if (mode === 'osiris') {
    await c.eval('Module.canvas.focus()');
    await c.key('keyDown','F8','F8',119); await delay(200); await c.key('keyUp','F8','F8',119);
    const started=Date.now();
    while (!c.log.some(line=>/Bringing Level DM-DE-OSIRIS2.myLevel up for play/i.test(line))) {
      assert(!await c.eval('window.bootResult'), 'Osiris2 exited before play');
      assert(Date.now()-started<180000, 'Osiris2 play timeout'); await delay(300);
    }
    await delay(3000);
  }
  await spawn(c);
  if (!joining) {
    assert(c.log.some(line => line.toLowerCase().includes(('Bringing Level '+map+'.myLevel up for play').toLowerCase())), 'map reached play');
    const picker = await c.eval('({maps:[...document.getElementById("map").options].map(o=>o.value),manifest:Object.keys(Module.fileSizes).filter(p=>/^Maps\\/[^/]+\\.ut2$/i.test(p)).map(p=>p.slice(5,-4)),saved:localStorage.getItem("ut2004-map")})');
    assert.deepEqual([...picker.maps].sort(), [...picker.manifest].sort());
    fs.writeFileSync(`${out}/${name}-picker.json`,JSON.stringify(picker,null,2));
  }
  if (mode === 'default') {
    assert.equal(await c.eval('Module.connect'), true);
    assert.equal(await c.eval('Module.localMap'), false);
    await c.until('Module.playerState?.admin===true');
  }
  if (mode === 'admin') {
    await c.until('Module.playerState?.admin===true');
    assert(c.log.some(line=>line.includes('WASM: auto-admin granted')), 'automatic admin grant logged');
    await c.eval('Module.canvas.focus()');
    await c.key('keyDown','F8','F8',119); await c.key('keyUp','F8','F8',119);
    await delay(2000); await c.capture('admin');
    for (const [key,code,target] of [['F9',120,'DM-Corrugation'],['k',75,'CTF-FaceClassic']]) {
      const start=c.log.length;
      await c.key('keyDown',key,key === 'k' ? 'KeyK' : key,code); await delay(200); await c.key('keyUp',key,key === 'k' ? 'KeyK' : key,code);
      const deadline=Date.now()+300000;
      while (!c.log.slice(start).some(line=>line.toLowerCase().includes(('Bringing Level '+target+'.myLevel up for play').toLowerCase()))) {
        assert(!await c.eval('window.bootResult'),'engine exited during travel');
        assert(Date.now()<deadline,'travel timeout '+target); await delay(500);
      }
      await delay(2000);
      await spawn(c, true); await c.until('Module.playerState?.admin===true');
      await c.capture('travel-'+target);
    }
  }
  if (joining) {
    for(const marker of ['WASM signon: CHALLENGE received','WASM signon: WELCOME received','WASM signon: sending JOIN']) assert(c.log.join('\n').includes(marker),marker);
    const transport=await c.eval('Object.values(Module.netSessions).map(s=>({sent:s.sent,received:s.received,failed:s.failed}))');
    assert(transport.length && transport.every(s=>s.sent>0&&s.received>0&&!s.failed));
    fs.writeFileSync(`${out}/${name}-transport.json`,JSON.stringify(transport,null,2));
  }
  assert.equal(c.failures.length,0,JSON.stringify(c.failures));
  await c.eval('window.__shutdown()'); await c.until('!!window.bootResult');
  assert.deepEqual(await c.eval('window.bootResult'),{type:'exit',code:0});
  console.log('PASS: '+mode+' reached play, spawned, rendered, clean exit');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  for(const c of clients) {
    fs.writeFileSync(`${out}/${c.name}-console.log`,c.log.join('\n')+'\n');
    try {await c.cdp('Page.navigate',{url:'about:blank'});} catch {} c.ws.close();
  }
});
