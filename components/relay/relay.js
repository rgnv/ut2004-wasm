// rtcw/q3 websocket<->UDP relay for emscripten SOCKFS websocket clients.
// Each WebSocket binary message = one UDP datagram (1:1), matching the
// emscripten SOCKFS "binary" subprotocol transport (see iowolfmp.v3.js /
// ioquake3.js websocket_sock_ops). One UDP socket per ws connection.
//
// env: RELAY_PORT (default 8080), UDP_TARGET_HOST (default 127.0.0.1),
//      UDP_TARGET_PORT (default 27980)
const http = require('http');
const dgram = require('dgram');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.RELAY_PORT || '8080', 10);
const TH = process.env.UDP_TARGET_HOST || '127.0.0.1';
const TP = parseInt(process.env.UDP_TARGET_PORT || '27980', 10);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('relay ok\n');
});

const wss = new WebSocketServer({ server, perMessageDeflate: false });

wss.on('connection', (ws, req) => {
  const u = dgram.createSocket('udp4');
  console.log('[relay] ws connect', req.socket.remoteAddress, '-> udp', TH + ':' + TP);
  u.on('message', (msg) => {
    if (ws.readyState === 1) {
      try { ws.send(msg, { binary: true }); } catch (e) {}
    }
  });
  u.on('error', (e) => { console.log('[relay] udp error', e.message); try { ws.close(); } catch (e2) {} });
  ws.on('message', (data, isBinary) => {
    if (!isBinary) return;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    u.send(buf, TP, TH, (err) => { if (err) console.log('[relay] udp send err', err.message); });
  });
  ws.on('close', () => { try { u.close(); } catch (e) {} console.log('[relay] ws closed'); });
  ws.on('error', () => { try { u.close(); } catch (e) {} });
});

server.listen(PORT, () => console.log('[relay] listening :' + PORT + ' -> udp ' + TH + ':' + TP));
