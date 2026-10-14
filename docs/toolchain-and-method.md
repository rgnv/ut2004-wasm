# Toolchain + methodology (adapted from the WC3 wasm port)

The homelab's established wasm-port pattern (see the wc3-wasm-port skill) ports
an **open-source engine reimplementation** to emscripten:

- Build via the public `emscripten/emsdk:latest` container (uid 10000, HOME=/tmp,
  EM_CACHE mounted at the DEFAULT cache path under
  `/var/lib/hermes/work/wc3-port/emsdk-cache` — the EM_CACHE env alone does not
  persist; mount over the default path).
- Required flag family (WC3): `-sMEMORY64=1` (8-byte pointers; save formats
  assert on 32-bit), `-sSTACK_SIZE`, SDL2 (`-sUSE_SDL=2`), WebGL2/GLES3
  (`-sMIN/MAX_WEBGL_VERSION=2 -sFULL_ES3=1` — FULL_ES3 needed for
  glMapBufferRange), `-sALLOW_MEMORY_GROWTH=1`; NODERAWFS only for the node
  test build (drop for browser).
- Headless verification runs in node against fixture data, then a browser smoke
  driven via CDP (chromium).
- Multiplayer target: websocket transport (same class of transport as the
  verified `/rtcw/connect2`, `/q3/connect2`, `/q2ws` relays in this repo's
  components/relay — 1 ws frame = 1 UDP datagram via SOCKFS "binary").

## What this means for UT2004

Checked 2026-10-14: **no open-source UE2/UT2004 engine reimplementation exists**
(GitHub repo search: none; corepunch-style "open-*" projects: none for Unreal).
So the WC3 route — port an existing OSS engine — has no candidate here. The
reconstruction path therefore is:

1. REA-driven evidence on the shipped v3374 binaries (evidence/ + docs/re-modules.md)
   → swap-point map → reconstruction obligation ledger.
2. Source-availability question stays open (OldUnreal holds engine source under
   the Epic arrangement; they publish binaries only).
3. The parts that do NOT need engine source are already proven: websocket
   transport (validated twice tonight), data streaming + IndexedDB persistence
   (ut99/q3 patterns), GL4ES/WebGL renderer stack (rtcw/q3/Wwasm precedents),
   openal-soft emscripten (established in the WC3 port work).

Wasm64 note: UT2004's binaries are x86_64 (64-bit pointers in the engine's
types); a future emscripten build will very likely need `-sMEMORY64=1` for the
same reasons WC3 did.
