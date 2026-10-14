// Exercise the actual lazy filesystem: sparse ranges, cached reads and strict responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const chunk = 1024 * 1024, size = 3 * chunk + 7;
const source = Uint8Array.from({length:size}, (_, i) => i % 251);
let requests = [], mode = 'ok';
function mount() {
  const node = {stream_ops:{}};
  const context = vm.createContext({Uint8Array, Map, Promise, ENV:{},
    Module:{fileSizes:{'Textures/test.utx':size},configFiles:{},print(){}},
    FS:{mkdirTree(){},createDataFile(){},lookupPath(){return {node};}},
    fetch:async (url, options) => {
      assert.equal(url,'/data3369/UT2004/Textures/test.utx');
      const range=options.headers.Range;
      requests.push(range);
      const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(range), start=Number(a), end=Number(b);
      return new Response(source.slice(start,mode==='short'?end:end+1), {
        status:mode==='status'?200:206,
        headers:{'Content-Range':mode==='range'?'wrong':`bytes ${start}-${end}/${size}`}
      });
    }});
  vm.runInContext(fs.readFileSync('web/pre.js','utf8'),context);
  context.Module.preRun[0](); return node;
}
(async()=>{
  const node=mount();
  await node.fetchRange(chunk-2,5);
  assert.deepEqual(requests,[`bytes=0-${chunk-1}`,`bytes=${chunk}-${2*chunk-1}`]);
  const dst=new Uint8Array(5);
  assert.equal(node.stream_ops.read(null,dst,0,5,chunk-2),5);
  assert.deepEqual(dst,source.slice(chunk-2,chunk+3));
  assert.equal(node.fetchRange(chunk-2,5),null);
  await node.fetchRange(size-3,99);
  assert.equal(requests.length,3); // middle chunk stays unfetched
  const tail=new Uint8Array(99);
  assert.equal(node.stream_ops.read(null,tail,0,99,size-3),3);
  assert.deepEqual(tail.slice(0,3),source.slice(size-3));
  assert.equal(node.fetchRange(size,10),null);
  assert.equal(node.stream_ops.read(null,tail,0,10,size),0);
  for (mode of ['status','range','short']) {
    const bad=mount(); await assert.rejects(bad.fetchRange(0,1),/HTTP range|Short HTTP/);
  }
  console.log('PASS: demand-only chunk ranges, boundary copy, cache reuse, sparse reads, EOF, invalid status/range/size');
})().catch(error=>{console.error(error);process.exitCode=1;});
