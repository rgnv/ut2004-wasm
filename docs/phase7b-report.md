# Phase 7b — demand ranges restored; Fire crash fixed

**Completed and deployed.** Real Fire native code fixes DM-DE-Osiris2; the map
reaches play and spawns. Live multiplayer joins/spawns on the unchanged persistent
server. Full-file prefetch is gone; compressed wasm, cache headers, 1280×720,
resolution selection, fullscreen and boot status milestones are preserved.

## Live measurements

Seconds from navigation; bytes are CDP encoded HTTP bytes through first frame.
Cache counts below cover data responses before that same cutoff. No cache sizes
were overridden. Cold profiles are fresh; warm uses the same profile after the
cold run's spawn/display checks and clean shutdown.

| Host | Resolution | Cache | First frame (s) | Playing (s) | Wire bytes | Data cache hits / requests |
|---|---|---|---:|---:|---:|---:|
| mesa | 640x480 | cold | 31.283 | 31.354 | 449,166,277 | 0 / 722 |
| mesa | 640x480 | warm | 27.561 | 27.639 | 1,049,487 | 721 / 722 |
| mesa | 1280x720 | cold | 30.597 | 30.760 | 451,264,640 | 0 / 724 |
| mesa | 1280x720 | warm | 27.934 | 28.107 | 1,144,084 | 723 / 725 |
| pve | 640x480 | cold | 51.231 | 51.271 | 450,310,417 | 0 / 724 |
| pve | 640x480 | warm | 14.231 | 14.272 | 1,049,495 | 721 / 722 |
| pve | 1280x720 | cold | 60.278 | 60.371 | 451,360,056 | 0 / 725 |
| pve | 1280x720 | warm | 14.327 | 14.419 | 203 | 722 / 722 |

At 640×480, cold startup is near the phase-6 baseline: **mesa 33.971 → 31.283 s**,
**pve 52.067 → 51.231 s**. These small gains are not robust speedup claims: retained
retry observations were 32.673 s mesa and 60.307 s pve. Compared with phase-7
prefetch at the same 1280 default, cold first frame falls **52.788 → 30.597 s mesa**
and **106.009 → 60.278 s pve**; first-frame traffic falls from ~2.1 GB to ~451 MB.
Warm first frames fall from 49.259/73.297 s (mesa/pve phase 7) to 27.934/14.327 s.

**Keep 1280×720 default.** It has exactly three times the pixels of 640×480.
Observed warm startup cost is +0.373 s mesa and +0.096 s pve. Cold delta is
−0.686 s mesa and +9.047 s pve, but pve's data-active interval increases by
8.406 s while its post-engine first-frame interval increases by only 0.388 s.
The retained 640 retry is also ~60 s. This does not establish a large startup
penalty from resolution. Steady-state FPS is not inferred from these load tests;
960×540 and 640×480 remain available for software-rendering performance.

All eight runs successfully use `WebAssembly.instantiateStreaming`, with zero
MIME fallback warnings. Cold wasm is **4,860,484 encoded CDP bytes**, including
HTTP overhead; the actual Brotli body is **4,857,721 bytes**. Warm wasm transfers
zero bytes. Cache hits are reported as `fromDiskCache`, not 304 responses (zero
304s in these data-response records). Remaining warm data misses are one or two
ranges of `TeamSymbols_UT2003.utx` / `TeamSymbols_UT2004.utx`; pve 1280 has none.
Warm total wire drops by >99.7%, but CPU-heavy engine work still takes seconds.

## Where the time goes

Wasm end and engine initialized are times since navigation. Data-active is the
**union** of data request intervals before first frame, including cache service;
it overlaps engine work and must not be added to the other columns. Last column
is engine initialization complete → first rendered frame, including precaching
and instrumentation. These are browser/event timings, not a CPU profile.

| Host / resolution | Cache | Wasm download end (s) | Streaming instantiate end (s) | Engine initialized (s) | Data-active union (s) | Engine ready → frame (s) |
|---|---|---:|---:|---:|---:|---:|
| mesa-640x480 | cold | 0.353 | 0.376 | 19.152 | 5.255 | 12.131 |
| mesa-640x480 | warm | 0.284 | 0.307 | 16.361 | 2.180 | 11.201 |
| mesa-1280x720 | cold | 0.395 | 0.420 | 18.366 | 4.875 | 12.231 |
| mesa-1280x720 | warm | 0.274 | 0.296 | 15.796 | 2.210 | 12.138 |
| pve-640x480 | cold | 0.551 | 0.730 | 45.289 | 38.864 | 5.942 |
| pve-640x480 | warm | 0.301 | 0.362 | 8.136 | 1.609 | 6.095 |
| pve-1280x720 | cold | 0.633 | 0.987 | 53.948 | 47.270 | 6.330 |
| pve-1280x720 | warm | 0.244 | 0.312 | 7.781 | 1.189 | 6.546 |

Wasm delivery finishes in under 0.64 s in every cold run and streaming
instantiation finishes in under 0.99 s. It is no longer the bottleneck.
Pve cold spends 39–47 s with data requests active, versus 1.2–1.6 s warm;
transport latency/throughput explains most of that cold penalty. Mesa data-active
time is ~5 s cold and ~2.2 s warm; its engine initialization and first-frame
preparation dominate. Warm pve initializes around 8 s and first-frames around
14 s; warm mesa initializes around 16 s and first-frames around 28 s. Hardware
and shared-host load differ, so compare resolutions within each host.

## Changes and evidence

The full-file prefetch and its 160 MiB LRU are removed. `web/pre.js` and
`web/http-library.js` are byte-identical to commit `1213354` (phase 6): demand-only
1 MiB chunk caching, validated 206 ranges, and the original Asyncify `fd_read`
`fetchRange(position,length)` override. The range regression test checks sparse
reads, cache reuse, cross-chunk copying, EOF and malformed responses.

No Caddy change was needed. UT2004 retains `application/wasm`, week-long cache
headers and streaming compilation. The actual delivery is **Brotli**, not gzip:
22,364,026 decoded bytes → **4,857,721 body bytes**; gzip remains Caddy's fallback.
The shell uses `?v=phase7b` so week-long caches cannot reuse the previous binary.
UT99 still returns uncompressed `application/octet-stream` and booted DM-Agony
in a temporary browser-hosted room. No shared native server or relay was restarted.

All three requested status strings are present verbatim, plus existing error
status handling and a new script-load failure handler. `live-index-before.html`
shows that at task start the deployed page already matched the old workspace:
the manual milestone patch described in the brief was absent from both. The
brief's exact strings were restored to source, build output, NFS deployment and
lab mirror. Measurement JSONs record all milestones; live shell tests inject
manifest and engine-script failures and verify visible error status.

## Fire crash: real native module, no stub

The before test navigates the live shell, binds test-client F8 to
`open DM-DE-Osiris2` in the fetched User.ini, and dispatches that key through SDL.
It reproduces `Critical: Can't bind to native class Fire.FractalTexture` and exit 1.
The test modifies only its own fetched configuration; neither game data nor
server configuration changes. Initial console-text input attempts did not issue
travel; the reproducible F8 test replaced them.

`Core/Src/UnClass.cpp::UClass::Bind` asks the package module for
`autoclassUFractalTexture`. `Core/Src/UnUnix.cpp` routes wasm DLL lookup to
`appWasmModule`; `Launch/Src/wasm-registry.py` generates module/export tables from
actual linked objects using llvm-nm. The browser link omitted Fire entirely.
The real implementation already existed at `Fire/Src/UnFractal.cpp`, with
`IMPLEMENT_CLASS` exports for FractalTexture, FireTexture, WaterTexture,
WaveTexture, FluidTexture, WetTexture and IceTexture. No native exec functions
are required by Fire's native table.

The minimal fix adds Fire's include directory, object compilation and generator
module argument in `link-web.sh`, including header invalidation. The existing
C++ code compiles unchanged with ASM=0. Browser startup now self-checks all seven
exports; native-platform behavior and Node linking are unchanged.

**After verification passes:** `Bringing Level DM-DE-Osiris2.myLevel up for play`,
spawned local pawn, 78,613 framebuffer colors, zero GL/WebGL errors, clean exit 0.
`osiris-after.png` shows the running match, weapon/HUD and flame effect.
See `osiris-before-console.log`, `osiris-after-console.log`,
`OsirisAfter-ingame.json`, `fire-registry.txt`, and `native-binding.txt`.
The fallback affected-map list is not needed because the crash is fixed.
This proves Osiris2, not universal compatibility with every shipped map.

## Live multiplayer and regressions

The unmodified live URL with `interactive=1&connect=1&name=Phase7bJoin` joined the
persistent Rankin server through `/ut2004b/connect2`. Client evidence records
CHALLENGE, WELCOME and JOIN, `netMode=3`, a replicated pawn, a rendered screenshot,
and clean shutdown. Transport sent 118 and received 218 datagrams without failure.
`live-join-server-console.log` records `New Player Phase7bJoin`, match start and
connection close. Server PID preservation is checked separately.

`regression-summary.txt` indexes passing Node, bounded browser, interactive
keyboard/mouse, range-cache, transport, shell, live display/error-status, Osiris,
multiplayer and UT99 smoke checks. The real-game measurements also assert
fullscreen, responsive layout, selector keyboard input, requested internal
resolution, streaming wasm, all boot milestones, zero GL errors and clean exit.
`display-tests.json` covers persisted reload, query precedence, custom/invalid
sizes and browser gesture fallback. Hardware Escape and a long gameplay soak
were not tested.

## Reproduction and limits

Run the exact commands in `commands.txt`; `run-measurements.sh` owns the four
browser-profile pairs. The matrix runs sequentially after build and regression
browsers finish. Each resolution starts with a new user-data-dir and default
browser cache settings, then navigates again in the same browser/profile for warm.
No clear-cache command, cache-size override or extra asset prefetch is used.

Pve uses Google Chrome through SSH CDP `-L 19227:127.0.0.1:9227` and data
`-R 19447:100.103.197.47:443`, resolver
`MAP games.rgnv.dev 127.0.0.1:19447`. Browser origin stays the real live HTTPS site.
Mesa uses local Chromium against that same site. Browser versions, hardware/load
snapshots and exact URLs are saved. These are shared hosts, single observations
per cell, no CPU pinning or controlled thermal/load state.

The discarded display-harness attempt is preserved in
`offscreen-control-attempt/`: its pve 640 cold first frame was 60.307 s and
448,117,520 CDP bytes. Timing succeeded, but the fullscreen click targeted an
offscreen button after canvas focus scrolled the taller 4:3 page. The helper now
scrolls the target into view. The complete pair was rerun from a fresh profile;
the earlier number is retained to expose variance rather than conceal it.

First-frame time retains the phase-6/7 framebuffer-evidence timestamp, including
its pixel readback/histogram work. Playing is the MutationObserver timestamp for
`Playing DM-Rankin`; it follows the frame callback. Neither equals multiplayer
spawn time. Phase-6 baseline was 33.971 s mesa / 52.067 s pve and did not record
wire bytes or a separate Playing timestamp. It joined multiplayer after initial
Rankin startup; this matrix uses local Rankin on the live site to hold the map
constant. Live multiplayer is independently verified above.

Raw `*-network.jsonl` events back every wire total. For each request, use completed
`Network.loadingFinished.encodedDataLength` or cumulative
`Network.dataReceived.encodedDataLength` for a request still in flight at first
frame, never both. Align CDP monotonic timestamps using the document request's
wallTime and page timeOrigin. These are encoded HTTP bytes, not TCP/TLS packet
cost. `analyze-network.py` reconstructs wasm intervals and the union of data
request intervals before first frame; it asserts the complete eight-run matrix.
Data-active intervals overlap engine work, so they are not additive CPU time.

A second harness-only issue is preserved in `shutdown-poll-attempt/`: mesa 640
cold completed in 32.673 s with 450,215,487 CDP bytes, then exited normally with
code 0. The old polling helper checked for unexpected exit even while waiting
for requested shutdown, racing against the exit event. That guard now excludes
the shutdown wait. The complete mesa pair was restarted from a fresh profile;
no engine code changed between these measurements. Pve's completed pairs remain
unchanged. `measurement-commands-pve.log` and `measurement-commands-mesa.log`
record both parts; `run-measurements.sh` reproduces the whole matrix after the
harness fixes.


## Delivery and cleanup

`build-sha256.txt`, `deploy-sha256.txt` and `shell-sha256.txt` verify deployed assets
against build/source and lab mirror. `server-preservation.txt` confirms active
UT2004 PID **2758604**, unchanged UT99 deployment UID/spec and byte-identical Caddy
ConfigMap data. `cleanup.txt` verifies no owned browser units/processes, profiles,
SSH tunnel/master/socket, build or test server remain. Transient units were never
enabled; collection removes them after stop. Existing /opt servers and relays
were untouched.

Engine source commit: `b0a3d10` on `wasm-port`; lab commit: `6c2cc297c` on `master`.
Wrapper commit and final clean worktree checks are recorded in `commits.txt`.
Existing phase-7 handoff and phase-7b/8 brief files are preserved unchanged in the
wrapper commit; phase-8 implementation is outside this task.

No full-map sweep, long gameplay soak, hardware Escape test or steady-state FPS
benchmark. The fallback affected-map operational list was intentionally omitted
because the actual Fire crash was fixed and Osiris2 play was verified.
