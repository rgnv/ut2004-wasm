# Phase 3 — browser shell

Current status: **3c accepted: engine-rendered NvidiaLogo first frames**, documented
[below](#milestone-3c-accepted--engine-first-frames). Sections 3a/3b retain historical evidence.

## Milestone 3a: accepted

From `/var/lib/hermes/work/ut2004-web`, with existing extracted data, cached SDK,
Chromium, Python 3 and the pinned `ws` dependency (`npm ci --ignore-scripts`):

```sh
./link-web.sh && node scripts/test-web.cjs
```

The command builds independently from Node, generates a names-only manifest,
starts loopback HTTP and transient Chromium, drives CDP, asserts acceptance,
and removes both processes and the Chromium profile. HTTP port 8765 must be free.
For manual browsing, run `python3 scripts/serve-web.py`, then open
`http://127.0.0.1:8765/build/web/index.html`.

The browser runs the same dedicated-server entry, real package loading, game
class, GC and three 1/60-second ticks as Node. A Web Worker hosts the single-thread
engine so `FS.createLazyFile` can use synchronous HTTP requests without blocking
the page. The complete 1,955-file tree is mounted at `/opt/ut2004`; cwd is System,
so `../Maps`, `../Textures`, etc. retain their original meaning. No NODERAWFS,
embedded packages, fake package APIs, GC bypass, config changes or networking
substitutes. Local writes remain in MEMFS and disappear on reload.

The worker choice follows Emscripten's [LazyFile documentation](https://emscripten.org/docs/api_reference/Filesystem-API.html#FS.createLazyFile).
Node and browser links have separate object directories and output artifacts.
The only engine-source change is the browser-specific completion marker inside
the existing Emscripten-only launcher.

Selected observed CDP console output (full transcript: `build/phase3a/console.log`):

```text
WASM: HTTP lazy filesystem ready (1955 files)
Init: WASM: Core init complete
Init: WASM: Engine package loaded
Log: Collecting garbage
Log: Purging garbage
Log: Garbage: objects: 21115->20947; refs: 205962
Log: Bringing Level NvidiaLogo.myLevel up for play (50) ...
Init: WASM: engine initialized
Init: WASM: browser bounded loop complete
WASM: clean exit
WASM browser status: {"type":"exit","code":0}
[HTTP] game data body bytes=258471277 (includes 4-byte range self-check)
[harness] PASS: HTTP packages, active GC, map load, bounded ticks, exit=0, no page errors
[cleanup] browser/server stopped; transient profile removed
```

Canvas pixel `(0,0)` is `[0,0,0,0]`. This is the intentionally empty 3a canvas,
not a rendered game frame. Screenshot `build/phase3a/browser.png` shows exit 0
and the explicit headless label; `canvas.json` records readback. `http.log`
records actual GETs for Core.u, Engine.u, NvidiaLogo.ut2 and their dependencies,
including 206 range responses. No HTTP failures or CDP page errors.

Initial stock Python HTTP server run also passed, but sent whole packages:
engine read timing ~39.97 seconds. The range server reduced this to ~7.4 seconds.
The engine consumes 22 MiB + 939 KiB + 10 bytes; 1-MiB LazyFile chunks and asset
headers scattered across files produce ~246.5 MiB of actual HTTP bodies.
This is demand loading across the whole tree, not a claimed 22-MiB network load.

Existing nonfatal Editor.TransBuffer, SO_BROADCAST/ENOPROTOOPT and SO_REUSEADDR
messages remain. Chromium's host D-Bus/GCM diagnostics are in `chromium.log`;
they are distinct from page JavaScript errors. No real network session is tested.

Node regression:

```sh
./link-em.sh
python3 build/phase2c-validate.py
```

Observed: full boot exit 0, mount-only exit 0, invalid argument exit 2,
166 wasm objects, historical identical GC reachability, and all five original
game/config checksums pass. Captures: `build/logs/phase3-node-regression.log`
and `build/logs/phase3-node-boot.log`.

## Milestone 3b: isolated GL4ES evaluation

GL path: OpenGLDrv fixed-function API → GL4ES GLES2 backend → WebGL1.
The pinned upstream checkout is `ptitSeb/gl4es` commit
`ec16bedd8819c475326f4f1a3063772c6d986e06`, unchanged locally. Its
[Emscripten build instructions](https://github.com/ptitSeb/gl4es/blob/ec16bedd8819c475326f4f1a3063772c6d986e06/COMPILE.md#emscripten)
are used with `NOX11=ON`, `NOEGL=ON`, `STATICLIB=ON`, `DEFAULT_ES=2`.
The static wasm library builds successfully with the same pinned SDK.

```sh
git clone https://github.com/ptitSeb/gl4es.git src/gl4es
git -C src/gl4es checkout ec16bedd8819c475326f4f1a3063772c6d986e06
./scripts/build-gl4es-probe.sh && node scripts/test-web.cjs --gl4es
```

The isolated probe creates WebGL1, initializes GL4ES, queries every OpenGLDrv
symbol, attempts a fixed-function triangle, and captures pixel/error state.
It does not boot UT2004 or claim a rendered map.

Requirements established from renderer source:

- `OpenGLFuncs.h` after Emscripten preprocessing declares 467 function lookups, including 336 mandatory `_GL`
  lookups. Any missing mandatory lookup disables SUPPORTS_GL; Init then raises
  `Missing symbols - aborting.` Optional extension groups are gated separately.
- Real draw paths use client vertex/index arrays, matrices, alpha test, fog,
  texture environment/texgen, multitexturing, blending and fixed-function
  lighting. WebGL alone cannot provide this desktop GL interface.
- Extension paths include ARB VBO, ARB vertex/fragment programs, S3TC compression,
  texture combine/crossbar, cubemaps, FBOs, anisotropy and vendor array extensions.
  Optional availability must reflect GL4ES support rather than fabricated flags.
- SDLDrv is already SDL3, not SDL2. Its OpenWindow creates SDL_Window/context,
  calls SDL_GetWindowSurface on an OpenGL window, and enables relative mouse mode.
  This needs browser-context validation; adding `-sUSE_SDL=2` would be an ABI mismatch.
- FindProc currently calls SDL_GL_GetProcAddress. The GL4ES route must instead use
  `gl4es_GetProcAddress` for desktop symbols; the GL4ES backend itself resolves
  GLES through Emscripten. Merely linking the archive does not redirect this call.
- The accepted entry sets GIsClient=0, and its static registry contains only Core,
  Engine, IpDrv and UWeb. A client entry must register/link SDLDrv and OpenGLDrv,
  select SDLClient/OpenGLRenderDevice in ephemeral config, create a viewport and
  schedule drawing. Stock data still selects WinDrv and D3DDrv. The HTTP worker
  also needs an explicit canvas/context ownership strategy.

Full symbol/group analysis: `build/phase3b/requirements.txt` and generated
`gl-requirements.h`. Build transcript: `build/phase3b/build.log`.

Observed isolated GL4ES probe:

```text
GL4ES probe: GL_VERSION=2.1 gl4es wrapper 1.1.7
GL4ES probe: requested=467 base=336 missing_base=0
GL4ES probe: pixel(320,240)=[63,64,128,255] glGetError=0x0
[GL4ES] exit={"type":"exit","code":0}
[harness] PASS: GL4ES compatibility probe only; UT2004 map rendering not integrated
```

`build/phase3b/console.log`, `canvas.json`, and `browser.png` capture this result.
Missing optional ATI/NV/APPLE/WGL lookups are enumerated in that transcript.
A first raw-text symbol inventory incorrectly included Windows-only symbols;
final probe uses the Emscripten preprocessor and excludes those branches.
Resolver success is not proof every entry is implemented: GL4ES supplies stubs
for some legacy functions (e.g. glAccum). Triangle success verifies the tested
fixed-function path, not all UT2004 materials or extension behavior.

### Exact next blocker: SDL3 video initialization in the HTTP worker

The bundled SDL3 static library also builds successfully. A separate probe calls
SDL_Init(SDL_INIT_VIDEO), then the same SDL_CreateWindow/SDL_GL_CreateContext
operations used by USDLViewport, in a plain worker matching 3a:

```sh
bash build/phase3b/build-sdl.sh && node scripts/test-web.cjs --sdl-worker
```

Observed CDP error before SDL_Init returns:

```text
SDL3 worker probe: initializing video
Uncaught (in promise) ReferenceError: window is not defined
```

`SDL/src/video/emscripten/SDL_emscriptenvideo.c`'s
Emscripten_ListenSystemTheme uses `MAIN_THREAD_EM_ASM` to access
`window.matchMedia`. In this non-pthread dedicated worker, that code executes
without a browser Window. A canvas alone does not resolve the video startup
failure. Transcript and screenshot: `build/phase3b/sdl-worker/`; exact probe
sources/build command are retained under `build/phase3b/`.

Next integration step: establish SDL3's browser-main-thread dispatch while
retaining synchronous engine filesystem access, e.g. a supported Emscripten
pthread/proxy-to-main setup with its required isolation headers and canvas
ownership. Alternatively move client startup to the UI thread and replace lazy
synchronous XHR with asynchronous loading before engine execution. This needs a
separate browser-client target; patching out the Window access alone would not
solve SDL event/window/context ownership. After that, register SDLDrv/OpenGLDrv,
route desktop symbol lookup through GL4ES, and validate a real client viewport.

**3b engine map rendering is not complete.** The delivered stretch result is a
working GL4ES/WebGL fixed-function probe and a reproduced SDL3 worker blocker,
with no changes to the accepted engine boot path.

## Repository and evidence

Engine source commit: `39884f9` on nested `src/UT2004_CMAKE` branch `wasm-port`.
Parent branch is also `wasm-port`; its commit contains browser recipes, harness,
report and selected evidence. Incoming phase brief and preceding handoff were
preserved unchanged in `602691a`. Generated binaries/objects and licensed game
data stay ignored; evidence transcripts, probe sources and screenshots are
explicitly tracked. GL4ES checkout and bundled SDL sources remain unchanged.

No native platform build, interactive client, arbitrary maps, audio or actual
multiplayer traffic validated. Milestone 3a is complete; 3b's remaining boundary
is browser SDL3/client integration, not a claim that GL4ES cannot render.


## Milestone 3c: accepted — engine first frames

Engine source commit: `094b2f3` on nested `src/UT2004_CMAKE` branch `wasm-port`.

From the workspace root, using the existing 3369 data, pinned SDK/GL4ES checkout,
Chromium, Python 3 and installed `ws`:

```sh
./link-web.sh && node scripts/test-web.cjs
./link-em.sh
python3 build/phase2c-validate.py
```

Both browser acceptance and Node regression pass. Browser evidence is in
`build/phase3c/`: `console.log`, `http.log`, `chromium.log`, `build.log`,
`browser.png` (full-page screenshot), `canvas.png` (unaltered framebuffer PNG),
and `canvas.json` (GPU readback summary, context attributes and top-32 color
histogram). `histogramTruncated` explicitly records whether additional colors
exist. The page displays the last captured framebuffer after SDL teardown;
readback and PNG are taken inside the engine renderer's `Present`, before swap.

Selected observed output:

```text
WASM: HTTP async filesystem ready (1955 files)
Log: Bringing Level NvidiaLogo.myLevel up for play (0) appSeconds: 9.344000...
Log: WASM: SDL3 viewport and GL4ES context active
Log: GL_VERSION    : 2.1 gl4es wrapper 1.1.7
Init: WASM: engine initialized
Init: WASM: browser ticks=6
Init: WASM: browser bounded loop complete
WASM: clean exit
WASM browser status: {"type":"exit","code":0}
[HTTP] game data body bytes=387322853 (includes 4-byte range self-check)
[harness] PASS: HTTP packages, active GC, map load, GL4ES frames, zero GL errors, bounded ticks, exit=0, no page errors
[cleanup] browser/server stopped; transient profile removed
```

The final 1024×768 framebuffer contains **43,685 nonblack pixels**, 786,432 opaque
pixels, and 50 distinct RGBA colors. Four engine presents are captured during six
1/60-second ticks; two default-framebuffer color clears are counted in
`FOpenGLRenderInterface::Clear`. Cumulative renderer GL error count is **0**;
each direct WebGL readback also reports **0**. Context attributes verify
`alpha=false` and `preserveDrawingBuffer=true`. The screenshot shows the Nvidia
logo in its very dim initial fade, not a probe triangle or a substituted image.
No brightness adjustment is applied. An independent Pillow check compares the
saved PNG with GPU readback dimensions, unique colors, nonblack/opaque counts
and every recorded histogram entry; exact command/output are retained in
`readback-check.py` and `readback-validation.txt`.

### Integration and root causes

- **Window/worker boundary:** retain bundled SDL3 and run the client on the browser
  main thread. SDL2 would mismatch SDLDrv's SDL3 API. No `window` shim or pthread
  dependency is needed. `web/worker.js` is removed from the browser target.
- **HTTP loading:** a names-and-sizes manifest exposes the entire 1,955-file tree.
  Small `.ini`/`.int` files preload asynchronously into writable MEMFS; packages
  use validated 1-MiB HTTP ranges with cached chunks. Asyncify suspends at the
  `wasi_snapshot_preview1.fd_read` boundary before `FS.read` changes offsets.
  Suspending inside stream reads had advanced offsets during unwind; moving the
  boundary fixed that corruption. No package API, GC, or asset-content bypass.
  Package mounts are read-only; new files/config writes remain browser-local.
- **Client startup:** only the web target defines `UT2004_WEB_CLIENT`. It selects
  SDLClient/OpenGLRenderDevice in ephemeral configuration, enables `GIsScriptable`
  after core initialization and `GIsRunning` during bounded ticks. Existing
  XGame/XInterface natives support stock GUI/player setup. XInterface name
  registration moves from its premature global constructor to after `appInit`,
  matching native static-launch ordering. Registry generation accepts additional
  browser modules; its default four-module Node invocation is unchanged.
- **GL context and dispatch:** SDLDrv requests GLES2/WebGL1, depth and an opaque
  canvas, checks context creation, initializes GL4ES and routes desktop symbol
  lookup through `gl4es_GetProcAddress`. It skips software surface creation on the
  GL window and automatic relative mouse capture. A guarded bundled SDL change
  preserves the drawing buffer: this engine presents the previous frame and may
  yield for HTTP reads while rendering. Before that fix, four presents had zero
  GL errors but transparent-zero readback. Duplicate SDLViewport swaps are
  disabled for the browser; OpenGLRenderDevice owns presentation.
- **Shutdown:** SDL window/context destruction is deferred until SDLClient exits
  the shared renderer and quits video. Previously, renderer texture deletion
  after context destruction threw `Cannot read properties of undefined (reading
  'deleteTexture')`. Final shutdown prints the clean-exit marker and has no page
  exceptions. Browser/server processes and transient profiles are removed.

GL4ES remains at `ec16bedd8819c475326f4f1a3063772c6d986e06`, with unchanged upstream
sources and the existing GLES2 build options. Unsupported optional GL lookups
remain visible in the transcript; mandatory lookups succeed. Existing stock
settings disable pixel shaders/render-to-texture. This run does not establish
compatibility for every material, optional extension or arbitrary map.

### Node regression and scope

`node-link.log`, `node-build.log`, `node-regression.log`, `node-boot.log`,
`node-mount.log` and `node-usage.log` retain the baseline commands/results:

```text
PASS final: exit=0
PASS mount: exit=0
PASS usage: exit=2
PASS historical recursive/worklist differential: 50971 identical object/name marks
PASS 166 objects and final module have WebAssembly v1 headers
PASS tested game packages/configs unchanged
```

Core.u, Engine.u, Ipdrv.u, UT2004.ini and User.ini hashes pass. `link-em.sh` is
unchanged, and its existing headless flags, three ticks and completion marker
remain unchanged. Historical reachability comparison checks the saved fixtures;
this phase does not rerun the old recursive GC experiment.

This is first-frame browser acceptance, not an interactive client release.
Audio, pointer lock/input, RAF pacing, arbitrary-map gameplay, native platform
builds and multiplayer remain untested. Range-backed package access currently
covers the engine's `read`/seek path, not package mmap/pread or package writes.
Asyncify, preserved buffers and per-frame full readback prioritize evidence over
performance. No Chromium instance or transient profile from this work remains.
