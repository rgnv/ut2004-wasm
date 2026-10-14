# ws⇄UDP relay (browser client ↔ native dedicated server)

`relay.js` bridges the browser client's WebSocket transport to the native game
server: one binary WebSocket message == one UDP datagram (1:1), one UDP socket
per WebSocket connection. It is the same relay class used by rgnv's rtcw/q3
browser ports, where it has been in production longest.

Run one relay process per game server port (needs Node ≥ 18 and `ws` — provided
by the repository's `npm ci`, or `npm i ws` alongside):

```bash
RELAY_PORT=8080 UDP_TARGET_HOST=127.0.0.1 UDP_TARGET_PORT=7797 node relay.js
```

Environment:

| Variable | Default | Meaning |
| --- | --- | --- |
| `RELAY_PORT` | `8080` | local HTTP/WS listener (also answers `GET /` with `relay ok`) |
| `UDP_TARGET_HOST` | `127.0.0.1` | host of the native game server |
| `UDP_TARGET_PORT` | `27980` | UDP port of the native game server (UT2004: the game port, e.g. `7797`) |

Put a TLS-terminating web front in front of it — browsers on public origins
need `wss://`:

```
# wss://games.example.com/ut2004/connect2 -> relay http://127.0.0.1:8080
ut2004ws.example.com:443 {
    tls /etc/certs/tls.crt /etc/certs/tls.key
    reverse_proxy localhost:8080
}
```

Notes from the production deployment:

- The relay must be reachable from the browser over TLS with HTTP/2 enabled
  (browsers may use RFC 8441 WebSocket-over-h2); terminate TLS in a small
  Caddy (or equivalent) instance as above.
- The game server should be a real native dedicated server (`ucc-bin server`).
  In rgnv's deployment it runs on the host (not in a pod), so
  `UDP_TARGET_HOST` is the host's routable IP, not `localhost`.
- The browser client's default relay URL is rgnv's deployment; override it per
  page with `?ws_url=wss://your-host/your/path/connect2`.
