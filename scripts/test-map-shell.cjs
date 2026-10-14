const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('web/index.html', 'utf8').split('<script>')[1].split('</script>')[0];
async function boot(query = '', saved = 'CTF-FaceClassic', blocked = false) {
  const ids = ['canvas', 'viewport', 'resolution', 'fullscreen', 'display-status', 'apply-resolution', 'name', 'stop', 'status', 'log', 'map', 'play-map'];
  const elements = Object.fromEntries(ids.map(id => [id, {style:{setProperty(){}}, addEventListener(){}, focus(){}, options:[], appendChild(group){this.options.push(...group.options); group.appendChild = option => this.options.push(option);}}]));
  elements.resolution.options = ['640x480','960x540','1280x720'].map(value => ({value}));
  elements.resolution.add = option => elements.resolution.options.push(option);
  const storage = new Map([['ut2004-map', saved]]);
  let assigned, script;
  const context = {
    window:{}, console:{log(){}}, URLSearchParams, URL, TextDecoder, TextEncoder, Uint8Array,
    Option:function(text,value){this.text=text;this.value=value;},
    location:{search:query,pathname:'/ut2004/',href:'https://games.rgnv.dev/ut2004/'+query,assign:url=>assigned=String(url)},
    localStorage:{getItem(k){if(blocked)throw Error('blocked');return storage.get(k);},setItem(k,v){if(blocked)throw Error('blocked');storage.set(k,v);}},
    document:{getElementById:id=>elements[id], addEventListener(){},createElement:()=>({options:[]}),body:{appendChild:s=>script=s}},
    fetch:async()=>({ok:true,json:async()=>({'Maps/DM-Rankin.ut2':1,'Maps/CTF-FaceClassic.ut2':2,'Maps/DOM-SunTemple.ut2':3,'Textures/no.utx':4})})
  };
  vm.runInNewContext(source, context);
  await new Promise(setImmediate);
  return {context,elements,storage,get assigned(){return assigned;},get script(){return script;}};
}
(async()=>{
  let b = await boot();
  assert.equal(b.context.Module.connect,true); assert.equal(b.context.Module.map,'DM-Rankin');
  assert.equal(b.elements.map.value,'CTF-FaceClassic'); assert.equal(b.elements.map.options.length,3);
  b.elements.map.value='DOM-SunTemple'; b.elements['play-map'].onclick();
  assert.equal(new URL(b.assigned).searchParams.get('map'),'DOM-SunTemple');
  assert.equal(b.storage.get('ut2004-map'),'DOM-SunTemple');
  b = await boot('?connect=1&map=DOM-SunTemple');
  assert.equal(b.context.Module.connect,true); assert.equal(b.context.Module.map,'DM-Rankin');
  b.elements['play-map'].onclick(); assert(!new URL(b.assigned).searchParams.has('connect'));
  b = await boot('?map=DOM-SunTemple');
  assert.equal(b.context.Module.connect,false); assert.equal(b.context.Module.interactive,true);
  assert.equal(b.context.Module.map,'DOM-SunTemple'); assert.equal(b.context.Module.localMap,true);
  assert.equal(b.storage.get('ut2004-map'),'DOM-SunTemple'); assert.equal(b.script.src,'ut2004.js');
  b = await boot('?map=DM-Rankin?admin=something');
  assert.equal(b.context.window.bootResult.type,'error'); assert(!b.script);
  b = await boot('?map=DM-Rankin',null,true); assert.equal(b.context.Module.map,'DM-Rankin');
  console.log('PASS: full manifest list, saved selection, query precedence, join isolation, local bots, picker navigation, invalid map rejection, storage denial');
})().catch(error=>{console.error(error);process.exitCode=1;});
