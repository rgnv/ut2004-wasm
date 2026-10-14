# Phase 7 — transport, resolution and fullscreen

**Features implemented and deployed; the cold-load performance target did not pass.**
The required full-file prefetch increases startup traffic and time relative to the
previous loader. Wasm MIME/compression, cache headers, 1280×720, resolution selection,
responsive layout and CSS-only fullscreen work. Do not describe this release as a
successful time-to-play optimization.

## Measurements

Baseline is the existing phase-6 live diagnostic log, as requested by the brief:
**pve 52.067 s**, **mesa 33.971 s** to first frame. The baseline did not record CDP
wire totals or a separate timestamp for the status text; those values are not invented.
Original baseline spawned-pawn times were 61.792 s / 46.220 s, a different metric.

Final live-site measurements use fresh browser profiles for cold loads and the same
profiles for warm navigations, with the HTTP cache enabled normally throughout.
No artificial cache-size override was used. The status metric is the first observed
`Playing DM-Rankin` update.

| Run | First frame | Playing status | CDP wire bytes through first frame | Completed-response encoded bytes | Disk/prefetch cache hits during run |
|---|---:|---:|---:|---:|---:|
| pve cold | 106.009 s | 106.096 s | 2,065,199,957 | 1,800,290,010 | 259 |
| pve warm | 73.297 s | 73.389 s | 1,559,923,171 | 1,342,188,784 | 604 |
| mesa cold | 52.788 s | 52.961 s | 2,101,673,949 | 2,009,446,392 | 266 |
| mesa warm | 49.259 s | 49.436 s | 1,191,375,331 | 1,087,016,363 | 616 |

Mesa local HTTP reference: **48.170 s** to first engine frame in the interactive
harness. See `regression-interactive/readback-time-00.json`.

pve is Google Chrome on pve, driven over SSH CDP forwarding
`-L 19227:127.0.0.1:9227`. Data forwarding is
`-R 19447:100.103.197.47:443`, with Chrome resolver
`MAP games.rgnv.dev 127.0.0.1:19447`. TLS terminates at the real live Caddy endpoint;
the browser URL remains `https://games.rgnv.dev/ut2004/`. This is the specified tunnel
path, not the pathologically slow direct pve-to-tailnet route.

Final URL is `?interactive=1&name=Phase7pve` (mesa uses Phase7mesa): stable local
DM-Rankin on the live site. Baseline used multiplayer mode but rendered the same
initial DM-Rankin before joining. Final multiplayer comparison is limited by the
server rotating to an unsupported map; no server/map reset was performed.
These are single-run observations, not statistically controlled benchmarks.

`*-network.jsonl` contains raw CDP events. The wire total combines
`Network.loadingFinished.encodedDataLength` for completed responses with cumulative
`Network.dataReceived.encodedDataLength` for in-flight responses, without counting
both for the same request. The cutoff uses the first frame's `performance.now()`
plus `performance.timeOrigin`, aligned to CDP monotonic timestamps using the document
request's `wallTime`. Completed-response-only totals are also provided. These are
CDP encoded HTTP bytes, not packet-level TCP/TLS overhead. Cache-hit counts cover
the run, not only the first-frame interval.

## Transport implementation and measured limitation

- Caddy adds only a `/ut2004/` header/cache block. The global `@wasm` octet-stream
  rule, global encode directive and all existing routes remain byte-identical.
- `/ut2004/*.wasm`: `application/wasm`, `public, max-age=604800`.
  The 22,210,116-byte binary has a **4,837,525-byte Brotli sidecar** (78.2% smaller).
  Browser CDP response totals include HTTP framing/header bytes. Dynamic gzip remains
  the fallback. No gzip sidecar remains, because the shared file server prefers
  gzip over Brotli when both exist.
- `/ut2004/data/*`: `public, max-age=604800`; shell, JS and manifests explicitly
  use `no-cache`. The shell preloads wasm while manifest/INI requests run and uses
  `ut2004.wasm?v=phase7` to avoid a stale binary under the new week-long policy.
- The final browser shim starts a whole-file streaming fetch on first access.
  Reads resume as soon as their requested bytes arrive. A 160 MiB LRU bounds
  reserved file buffers, including in-flight ones; active syscall buffers are
  pinned until all iovecs are consumed. Eviction aborts old transfers. Network,
  status and size failures fall back to validated direct ranges. Oversized files
  use ranges. This bound excludes the wasm heap and the browser's own HTTP cache.

**Why the expected speedup failed:** the original `web/pre.js` already cached
1 MiB chunks; it did not issue an HTTP request for every small engine read.
The engine reads sparse parts of large packages. Whole-file prefetch downloads
substantially more unused data before the first frame and evicts buffers sooner.
Week-long HTTP caching does not guarantee that Chrome retains the entire large
working set between visits.

Strict prefetch, demand-range hybrid, reader pacing and a single-transfer queue were
measured. None beat the baseline. Their evidence remains in
`strict-prefetch-attempt/`, `unthrottled-hybrid-attempt/`, `paced-reader-attempt/`
and `single-queue-attempt/`. Unsuccessful scheduling/hybrid code was removed;
the final code retains the brief's requested full-file behavior. A future demand-first
or adaptive policy requires revising that requirement. No engine load plan or
command line was changed to manufacture a faster result.

## Display and controls

Default internal resolution is 1280×720. The selector offers 640×480, 960×540 and
1280×720; Apply and reload persists it in localStorage and preserves existing URL
options. A valid `?res=WxH` overrides storage. Custom even dimensions are accepted
within 320×240 through 3840×2160; invalid values fall back safely. Storage denial
is tolerated. Browser-only INI viewport defaults are updated before engine init:
inspection disproved the brief's assumption that changing the canvas attribute
alone controlled engine resolution.

Canvas width follows its container and preserves aspect ratio. Fullscreen targets
the wrapper and scales CSS only. `fullscreenchange` restores normal CSS layout and
focus. `?fullscreen=1` attempts entry; if the browser requires activation, the first
viewport click or Fullscreen button completes it. Escape remains browser-controlled.

One guarded engine change omits `SDL_WINDOW_RESIZABLE` under `__EMSCRIPTEN__` so
SDL cannot silently replace the internal resolution with the CSS dimensions during
fullscreen/resize. Native behavior is unchanged. The shell sets the SDL keyboard
hint in `preInit`, preserving native form/selector keyboard behavior outside the
focused canvas.

In-game, fullscreen, responsive and selector PNGs plus pixel/layout JSON are
`pve-*` and `mesa-*`. Browser assertions require internal 1280×720 in fullscreen,
correct aspect ratio at 600 px viewport width, working selector arrow keys,
nonempty rendered frames, zero GL errors and clean shutdown. `display-tests.json`
adds live-shell checks for query override, fullscreen gesture fallback, persisted
reload and custom/invalid sizes (engine requests are intentionally stubbed for
these shell-only tests).

## Regressions and scope limits

- `node.log`: active GC and clean Node exit.
- `bounded-run.log`, `regression-bounded/`: real packages/map, renderer, zero GL
  errors, bounded ticks and clean exit.
- `interactive-run.log`, `regression-interactive/`: real map, keyboard movement,
  mouse rotation and clean shutdown.
- `transport-test.log`: framing, copied sends, ordering, isolation and cleanup.
- `http-cache-test.log`: partial stream reads before EOF, coalescing, seeking/EOF,
  LRU eviction, pinned multi-iovec reads, truncated/failed responses and strict ranges.
- `shell-test.log`: resolution precedence, validation, persistence, storage denial
  and preserving connection options on reload.
- `ut99-wasm-after.txt`: `application/octet-stream`, no Content-Encoding despite
  `Accept-Encoding: gzip`. `ut99-run.log`, `ut99-boot.json`, `ut99-boot.png` verify
  live UT99 boots DM-Agony in an owned temporary room. The original raw-wasm loader
  may log its existing streaming fallback; the no-fallback requirement passes for UT2004.

Early UT2004 multiplayer checks joined/spawned on DM-DE-Ironic. Later the persistent
server rotated to **DM-DE-Osiris2**, whose existing `Fire.FractalTexture` dependency
is absent from the port's linked native registry. The client exits 1 on that map;
see `public-server-map-limitation.txt` and `single-queue-attempt/mesa-cold-console.log`.
This prevents claiming current default multiplayer boot passes. The engine's module
coverage and server rotation were not changed. Earlier live UT99 join rendered a
CTF-Coret scoreboard (`ut99-preview.png`); a later shared-room rejoin stalled after
frontend rollout, so final boot smoke used an isolated room. No UT99 server restart
or scaling was used to hide it.

Caddy configuration was validated, applied and rolled out, then compared with the
live ConfigMap. `caddy.diff` and `caddy-preservation.txt` show the exact scope.
Only UT2004 assets/sidecar and the shell were copied to the NFS share; game data,
portal catalog and other games' assets were not changed. The lab shell mirror matches.
`server-preservation.txt` records unchanged UT2004 service PID and UT99 deployment
UID/spec/replicas. No long soak, manual hardware Escape test, or new map support.
Content updates still require appropriate cache-version changes.

Exact operational commands: `commands.txt`. Final hashes: `deploy-sha256.txt`.
Commit IDs and clean worktree checks: `commits.txt`. Owned browsers, local HTTP
servers, tunnel and temporary profiles are stopped/removed; see `cleanup.txt`.
