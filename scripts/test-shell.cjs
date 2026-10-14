const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('web/index.html','utf8').split('<script>')[1].split("const defaultJoin =")[0];
function shell(query,saved,blocked=false){
  const elements={};let assigned,listener;
  for(const id of ['canvas','viewport','resolution','fullscreen','display-status','apply-resolution'])elements[id]={style:{setProperty(){}},addEventListener(){},focus(){}};
  const selector=elements.resolution;selector.options=['640x480','960x540','1280x720'].map(value=>({value}));selector.add=o=>selector.options.push(o);
  const storage={getItem(){if(blocked)throw Error('blocked');return saved;},setItem(k,v){if(blocked)throw Error('blocked');saved=v;}};
  const document={getElementById:id=>elements[id],addEventListener:(type,fn)=>{listener=fn;},fullscreenElement:null};
  const context={window:{},URLSearchParams,URL,Option:function(text,value){this.value=value;},localStorage:storage,document,location:{search:query,href:'https://games.rgnv.dev/ut2004/'+query,assign:url=>{assigned=String(url);}}};
  vm.runInNewContext(source,context);
  return {elements,dimensions:[elements.canvas.width,elements.canvas.height],apply(value){selector.value=value;elements['apply-resolution'].onclick();return {saved,assigned};},document,listener};
}
assert.deepEqual(shell('').dimensions,[1280,720]);
assert.deepEqual(shell('', '640x480').dimensions,[640,480]);
assert.deepEqual(shell('?res=960x540', '640x480').dimensions,[960,540]);
assert.deepEqual(shell('?res=1920x1080').dimensions,[1920,1080]);
assert.deepEqual(shell('?res=9999x9999').dimensions,[1280,720]);
assert.deepEqual(shell('?res=0x0').dimensions,[1280,720]);
assert.deepEqual(shell('?res=641x480').dimensions,[1280,720]);
assert.deepEqual(shell('',null,true).dimensions,[1280,720]);
const result=shell('?interactive=1&name=Test&ws_url=wss%3A%2F%2Fexample.com').apply('640x480');
assert.equal(result.saved,'640x480');assert(new URL(result.assigned).searchParams.get('ws_url')==='wss://example.com');assert(new URL(result.assigned).searchParams.get('res')==='640x480');
const noStorage=shell('',null,true).apply('960x540');assert(new URL(noStorage.assigned).searchParams.get('res')==='960x540');
console.log('PASS: default, persisted, query precedence, custom and invalid dimensions, storage denial, reload preserves connection options');
