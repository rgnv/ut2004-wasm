const fs=require('node:fs'),assert=require('node:assert/strict'),WebSocket=require('ws');
const port=Number(process.argv[2]||19228),out=process.argv[3]||'build/phase7';
let ws,id=0;const pending=new Map(),log=[],errors=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
(async()=>{
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl.replace(/127\.0\.0\.1:\d+|localhost:\d+/,`127.0.0.1:${port}`));
 await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}
 else if(m.method==='Runtime.executionContextsCleared'){log.length=0;errors.length=0;}
 else if(m.method==='Runtime.consoleAPICalled'){const line=m.params.args.map(a=>a.value??a.description).join(' ');log.push(line);if(/MEMFS|Bringing Level|Join succeeded|Error|WebAssembly/.test(line))console.log(line);}
 else if(m.method==='Runtime.exceptionThrown')errors.push(m.params);});
 await cdp('Runtime.enable');await cdp('Page.enable');
 await cdp('Page.navigate',{url:'https://games.rgnv.dev/ut99/iframe.html?server=1&room=phase7-smoke-private&map=DM-Agony&bots=0&username=Phase7Smoke'});
 const start=Date.now();
 while(!log.some(l=>/Bringing Level (?:DM|CTF|DOM|AS|LMS)-[^.]+\.MyLevel up for play/.test(l)) || !(await cdp('Runtime.evaluate',{expression:'!!window.Module?.calledRun && Module.canvas.width > 300',returnByValue:true})).result.value) {assert(Date.now()-start<600000,'UT99 game-map boot timeout');assert.equal(errors.length,0,JSON.stringify(errors));await delay(500);}
 await delay(3000);
 const state=await cdp('Runtime.evaluate',{expression:'JSON.stringify({url:location.href,canvas:[Module.canvas.width,Module.canvas.height],calledRun:Module.calledRun,aborted:typeof ABORT!=="undefined"&&ABORT})',returnByValue:true});
 assert.equal(JSON.parse(state.result.value).calledRun,true);
 fs.writeFileSync(out+'/ut99-boot.json',JSON.stringify(state,null,2));
 fs.writeFileSync(out+'/ut99-boot.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
 assert(!log.some(l=>/BufferSource argument is empty|CompileError/.test(l)));
 console.log('PASS: live UT99 boots DM-Agony in isolated smoke room, no wasm loader failure');
 await cdp('Page.navigate',{url:'about:blank'});
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{fs.writeFileSync(out+'/ut99-console.log',log.join('\n'));ws?.close();});
