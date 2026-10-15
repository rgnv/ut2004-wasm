// Shell-only checks against live HTML; intercept engine assets to avoid repeated game boots.
const fs=require('node:fs'),assert=require('node:assert/strict'),WS=require('ws');
const port=Number(process.argv[2]||19227),out=process.argv[3]||'build/phase7b';
let ws,id=0,failAsset='';const pending=new Map(),results=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
async function value(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<200;i++){try{if(await value(expression))return;}catch(e){if(!/context|ReferenceError/.test(String(e)))throw e;}await delay(50);}throw Error('timeout '+expression);}
async function navigate(query){const url='https://games.rgnv.dev/ut2004/'+query;await cdp('Page.navigate',{url});await until('window.shellReady===true && location.href==='+JSON.stringify(url));}
async function click(selector){const p=await value(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});}
async function dimensions(expected){const result=await value('({url:location.href,size:[Module.canvas.width,Module.canvas.height],selected:document.getElementById("resolution").value,saved:localStorage.getItem("ut2004-resolution"),fullscreen:!!document.fullscreenElement})');assert.deepEqual(result.size,expected);results.push(result);}
(async()=>{
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WS(targets.find(t=>t.type==='page').webSocketDebuggerUrl.replace(/127\.0\.0\.1:\d+|localhost:\d+/,`127.0.0.1:${port}`));
 await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}
 else if(m.method==='Fetch.requestPaused'){
   const url=m.params.request.url;
   if (failAsset && url.includes(failAsset)) {
     cdp('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'Failed'}).catch(console.error); return;
   }
   const body=url.includes('file-sizes.json')?'{}':url.includes('ut2004.js')?'window.shellReady=true;':'';
   cdp('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,body:Buffer.from(body).toString('base64')}).catch(console.error);
 }});
 await cdp('Runtime.enable');await cdp('Page.enable');
 await cdp('Fetch.enable',{patterns:[{urlPattern:'*/ut2004/file-sizes.json'},{urlPattern:'*/ut2004/ut2004.js'},{urlPattern:'*/ut2004/ut2004.wasm*'}]});
 await navigate('?interactive=1&res=960x540&fullscreen=1');await dimensions([960,540]);
 await click('#canvas');await until('!!document.fullscreenElement');await dimensions([960,540]);
 await value('document.exitFullscreen().then(()=>true)');await until('!document.fullscreenElement');
 await value('document.getElementById("resolution").value="640x480"');await click('#reload-resolution');
 await until('window.shellReady===true && location.search.includes("res=640x480")');await dimensions([640,480]);
 assert.equal(await value('localStorage.getItem("ut2004-resolution")'),'640x480');
 await navigate('?interactive=1');await dimensions([640,480]);
 await navigate('?interactive=1&res=1920x1080');await dimensions([1920,1080]);
 await navigate('?interactive=1&res=9999x9999');await dimensions([640,480]);
 for (failAsset of ['file-sizes.json','ut2004.js']) {
   await cdp('Page.navigate',{url:'https://games.rgnv.dev/ut2004/?interactive=1&failure='+failAsset});
   await until('window.bootResult?.type === "error"');
   const failure=await value('({result:window.bootResult,status:document.getElementById("status").textContent})');
   assert.equal(JSON.parse(failure.status).type,'error');results.push(failure);
 }
 failAsset='';
 await cdp('Fetch.disable');await cdp('Page.navigate',{url:'about:blank'});
 console.log('PASS: live shell URL override, fullscreen gesture fallback, unchanged internal size, reload, persistence, custom/invalid size, boot errors in status');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{fs.writeFileSync(out+'/display-tests.json',JSON.stringify(results,null,2));ws?.close();});
