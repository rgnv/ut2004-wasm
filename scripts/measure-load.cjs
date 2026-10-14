// Attach to an owned CDP browser. Caller owns browser/profile/tunnel cleanup.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const [port = '19227', label = 'pve', out = 'build/phase7b', resolution = '1280x720'] = process.argv.slice(2);
const dimensions = resolution.split('x').map(Number);
assert(['640x480','1280x720'].includes(resolution));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, id = 0, run, networkLog;
const pending = new Map();
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const key = ++id; pending.set(key, {resolve, reject}); ws.send(JSON.stringify({id:key, method, params}));
});
async function evaluate(expression, extra = {}) {
  const value = await cdp('Runtime.evaluate', {expression, returnByValue:true, ...extra});
  assert(!value.exceptionDetails, JSON.stringify(value.exceptionDetails)); return value.result.value;
}
async function until(expression, timeout = 600000) {
  const start = Date.now();
  while (!await evaluate(expression)) {
    assert(Date.now() - start < timeout, 'timeout ' + expression);
    assert.equal(run.errors.length, 0, JSON.stringify(run.errors));
    if (expression !== '!!window.bootResult') assert(!await evaluate('window.bootResult'), 'unexpected engine exit');
    await delay(150);
  }
}
async function click(selector) {
  const rect = await evaluate(`(() => { const element=document.querySelector(${JSON.stringify(selector)}); element.scrollIntoView({block:'center'}); const r=element.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await cdp('Input.dispatchMouseEvent', {type:'mousePressed', ...rect, button:'left', clickCount:1});
  await cdp('Input.dispatchMouseEvent', {type:'mouseReleased', ...rect, button:'left', clickCount:1});
}
async function key(key, code, windowsVirtualKeyCode) {
  for (const type of ['keyDown','keyUp']) await cdp('Input.dispatchKeyEvent', {type,key,code,windowsVirtualKeyCode});
}
async function capture(name) {
  const previous = await evaluate('Module.frameCount');
  await evaluate('Module.captureRequested=true'); await until(`window.frameEvidence.frames>${previous}`);
  const state = await evaluate(`({frame:window.frameEvidence,player:Module.playerState,png:window.lastFramePNG,
    fullscreen:!!document.fullscreenElement,inner:[Module.canvas.width,Module.canvas.height],
    rect:Module.canvas.getBoundingClientRect().toJSON(),viewport:[innerWidth,innerHeight]})`);
  assert.equal(state.frame.glErrors,0); assert.equal(state.frame.webglErrors,0); assert(state.frame.uniqueColors>32);
  fs.writeFileSync(`${out}/${label}-${name}-canvas.png`,Buffer.from(state.png.split(',')[1],'base64')); delete state.png;
  fs.writeFileSync(`${out}/${label}-${name}.json`,JSON.stringify(state,null,2));
  fs.writeFileSync(`${out}/${label}-${name}.png`,Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  return state;
}
function bytes(cutoff = Infinity) {
  const requests = new Map();
  for (const [id, timestamp, count, finished] of run.byteEvents) {
    if (timestamp > cutoff) continue;
    const entry = requests.get(id) || {partial:0};
    if (finished) entry.finished = count; else entry.partial += count;
    requests.set(id, entry);
  }
  return {
    total:[...requests.values()].reduce((sum,r) => sum + (r.finished ?? r.partial),0),
    finished:[...requests.values()].reduce((sum,r) => sum + (r.finished || 0),0)
  };
}
(async () => {
  fs.mkdirSync(out,{recursive:true});
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl.replace(/localhost:\d+|127\.0\.0\.1:\d+/,`127.0.0.1:${port}`));
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  ws.on('message', raw => {
    const m=JSON.parse(raw);
    if(m.id) {const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}return;}
    if(!run) return;
    if(m.method?.startsWith('Network.')) {
      networkLog.write(JSON.stringify(m)+'\n');
      const p=m.params;
      if(p.requestId) {
        let r=run.requests.get(p.requestId); if(!r){r={partial:0};run.requests.set(p.requestId,r);}
        if(m.method==='Network.requestWillBeSent') {r.url=p.request.url;if(p.type==='Document' && run.wallOffset===undefined)run.wallOffset=p.wallTime-p.timestamp;}
        if(m.method==='Network.responseReceived') {r.response=p.response;if(p.response.status>=400)run.errors.push(p.response);}
        if(m.method==='Network.dataReceived') {r.partial+=p.encodedDataLength;run.byteEvents.push([p.requestId,p.timestamp,p.encodedDataLength,false]);}
        if(m.method==='Network.loadingFinished') {r.finished=p.encodedDataLength;run.byteEvents.push([p.requestId,p.timestamp,p.encodedDataLength,true]);}
        if(m.method==='Network.loadingFailed') r.failed=p;
      }
    }
    if(m.method==='Runtime.exceptionThrown') run.errors.push(m.params);
    if(m.method==='Runtime.consoleAPICalled') {
      const line=m.params.args.map(a=>a.value??a.description).join(' ');run.log.push(line);
      if (/WASM: (Core init complete|engine initialized|interactive RAF loop ready|HTTP async filesystem ready)/.test(line)) run.engineMilestones.push({line,epochMs:m.params.timestamp});
      if(line.startsWith('WASM: engine frame ') && !run.firstFrame) {
        run.firstFrame=JSON.parse(line.slice('WASM: engine frame '.length));run.bytesAtFirstFrame=bytes().total;
        run.finishedBytesAtFirstFrame=[...run.requests.values()].reduce((n,r)=>n+(r.finished||0),0);
        console.log(label,run.kind,'first frame',run.firstFrame.elapsedMs,'bytes',run.bytesAtFirstFrame);
      }
    }
  });
  await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Page.enable');
  await cdp('Network.setCacheDisabled',{cacheDisabled:false});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.milestones = [];
    window.streamingWasm = {calls:0,success:0,errors:[]};
    const instantiate = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function(...args) {
      ++window.streamingWasm.calls; window.streamingWasm.startMs=performance.now();
      try {const value=await instantiate.apply(this,args);++window.streamingWasm.success;window.streamingWasm.endMs=performance.now();return value;}
      catch(error){window.streamingWasm.errors.push(String(error));throw error;}
    };
    new MutationObserver(() => {
      const status=document.getElementById('status')?.textContent;
      if (status && window.milestones.at(-1)?.status !== status) window.milestones.push({status,ms:performance.now()});
      if (!window.playingMs && document.getElementById('status')?.textContent === 'Playing DM-Rankin') window.playingMs=performance.now();
    }).observe(document,{childList:true,subtree:true,characterData:true});
  `});
  const results=[];
  for(const kind of ['cold','warm']) {
    run={kind,requests:new Map(),byteEvents:[],log:[],errors:[],engineMilestones:[]};
    networkLog=fs.createWriteStream(`${out}/${label}-${kind}-network.jsonl`);
    const url=`https://games.rgnv.dev/ut2004/?interactive=1&res=${resolution}&name=Phase7b${label}`;
    await cdp('Page.navigate',{url});
    await until('!!window.playingMs && !!Module.interactiveReady');
    await evaluate('Module.canvas.focus()');
    for(let i=0;!await evaluate('!!Module.playerState?.pawn');i++) {
      assert(i<90,'spawn timeout');await click('#canvas');await delay(800);
    }
    const spawnedMs=await evaluate('performance.now()');
    const page=await evaluate(`({playingMs:window.playingMs,timeOrigin:performance.timeOrigin,streaming:window.streamingWasm,
      resolution:[Module.canvas.width,Module.canvas.height],milestones:window.milestones})`);
    assert.deepEqual(page.resolution,dimensions);assert.equal(page.streaming.success,1);assert.deepEqual(page.streaming.errors,[]);
    for (const milestone of ['Fetching asset manifest…','Loading config files…','Starting engine (first load downloads a ~22 MB engine; can take 1-2 minutes)…','Playing DM-Rankin']) assert(page.milestones.some(m=>m.status===milestone),milestone);
    assert(!run.log.some(line=>/falling back to ArrayBuffer|MIME type|streaming compile failed/.test(line)));
    const wasm=[...run.requests.values()].find(r=>r.url && new URL(r.url).pathname.endsWith('/ut2004.wasm'));
    assert(wasm,'wasm request');assert.equal(wasm.response.mimeType,'application/wasm');
    if(kind==='cold') {assert(['gzip','br'].includes(wasm.response.headers['content-encoding']||wasm.response.headers['Content-Encoding']));assert(wasm.finished<10*1024*1024);}
    await capture(kind+'-ingame');
    if(kind==='cold') {
      await click('#fullscreen'); await until('!!document.fullscreenElement',10000);
      const full=await capture('fullscreen');assert.deepEqual(full.inner,dimensions);
      await evaluate('document.exitFullscreen()', {awaitPromise:true});await until('!document.fullscreenElement',10000);
      await cdp('Emulation.setDeviceMetricsOverride',{width:600,height:900,deviceScaleFactor:1,mobile:false});
      const narrow=await capture('responsive');assert(narrow.rect.width<=600);assert(Math.abs(narrow.rect.width/narrow.rect.height-dimensions[0]/dimensions[1])<0.01);
      await cdp('Emulation.clearDeviceMetricsOverride');
      await cdp('Runtime.evaluate',{expression:"document.getElementById('resolution').focus()",userGesture:true});
      const selected=await evaluate("document.getElementById('resolution').value");
      if (resolution === '640x480') await key('ArrowDown','ArrowDown',40);
      else await key('ArrowUp','ArrowUp',38);
      assert.notEqual(await evaluate("document.getElementById('resolution').value"),selected,'selector keyboard must work while game runs');
      await key(' ','Space',32);await delay(300);
      fs.writeFileSync(`${out}/${label}-resolution-selector.png`,Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await key('Escape','Escape',27);
    }
    const wire=bytes((page.timeOrigin+run.firstFrame.elapsedMs)/1000-run.wallOffset);
    const dataRequests=[...run.requests.values()].filter(r=>r.url?.includes('/ut2004/data/'));
    const row={label,kind,url,dataCacheHits:dataRequests.filter(r=>r.response?.fromDiskCache || r.response?.fromPrefetchCache).length,dataRequests:dataRequests.length,firstFrameMs:run.firstFrame.elapsedMs,playingMs:page.playingMs,spawnedMs,
      bytesAtFirstFrame:wire.total,finishedBytesAtFirstFrame:wire.finished,
      wasm,engineMilestones:run.engineMilestones.map(m=>({line:m.line,ms:m.epochMs-page.timeOrigin})),cacheHits:[...run.requests.values()].filter(r=>r.response?.fromDiskCache || r.response?.fromPrefetchCache).length,
      requests:run.requests.size,...page};
    results.push(row);fs.writeFileSync(`${out}/${label}-timing.json`,JSON.stringify(results,null,2));
    fs.writeFileSync(`${out}/${label}-${kind}-console.log`,run.log.join('\n')+'\n');
    assert.equal(run.errors.length,0,JSON.stringify(run.errors));
    console.log(JSON.stringify(row));
    await evaluate('window.__shutdown()');await until('!!window.bootResult');
    assert.deepEqual(await evaluate('window.bootResult'),{type:'exit',code:0});
    await cdp('Page.navigate',{url:'about:blank'});await delay(500);networkLog.end();run=null;
  }
  console.log('PASS: cold/warm, streaming wasm, requested resolution, live DM-Rankin, fullscreen, responsive, ranged cache, clean shutdown');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  if(run)fs.writeFileSync(`${out}/${label}-${run.kind}-console.log`,run.log.join('\n')+'\n');
  networkLog?.end();ws?.close();
});
