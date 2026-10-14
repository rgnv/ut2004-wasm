// Exercise the exact EM_JS bodies with a fake WebSocket and wasm heap.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('src/UT2004_CMAKE/IpDrv/Src/TcpNetDriver.cpp', 'utf8');
const Module = {};
const HEAPU8 = new Uint8Array(2048);
class WebSocket {
  constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.frames = []; }
  send(data) { this.frames.push(data); }
  close() { this.readyState = 3; }
}
function body(name, args) {
  const match = source.match(new RegExp('EM_JS\\([^,]+, ' + name + ', \\([^)]*\\), \\{([\\s\\S]*?)\\n\\}\\);'));
  assert(match, name);
  return Function('Module', 'HEAPU8', 'WebSocket', ...args, match[1]).bind(null, Module, HEAPU8, WebSocket);
}
const open = body('WasmNetOpen', []), send = body('WasmNetSend', ['id', 'data', 'count']);
const receive = body('WasmNetReceive', ['id', 'data']), close = body('WasmNetClose', ['id']);
const a = open(), b = open();
assert.notEqual(a, b);
HEAPU8.set([1, 2, 255]);
assert.equal(send(a, 0, 3), 1);
HEAPU8[0] = 99;
const s = Module.netSessions[a];
s.ws.readyState = 1; s.ws.onopen();
assert.deepEqual([...s.ws.frames[0]], [1, 2, 255]);
assert.equal(Module.netSessions[b].ws.frames.length, 0);
s.ws.onmessage({data: new Uint8Array([4, 5]).buffer});
s.ws.onmessage({data: new Uint8Array([6]).buffer});
assert.equal(receive(a, 100), 2);
assert.deepEqual([...HEAPU8.slice(100, 102)], [4, 5]);
assert.equal(receive(a, 100), 1);
assert.equal(HEAPU8[100], 6);
assert.equal(receive(a, 100), 0);
s.ws.onmessage({data: new ArrayBuffer(577)});
assert.equal(receive(a, 100), -1);
close(a); close(b);
for (const data of [new ArrayBuffer(0), 'not binary']) {
  const id = open();
  Module.netSessions[id].ws.onmessage({data});
  assert.equal(receive(id, 100), -1);
  close(id);
}
assert.equal(Object.keys(Module.netSessions).length, 0);
console.log('PASS: framing, copied pending sends, ordered receives, session isolation, size rejection, cleanup');
