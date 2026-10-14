# Phase 4 — interactive DM-Rankin

Accepted on 2026-10-13. The browser loads real DM-Rankin packages over HTTP,
plays a local deathmatch through SDL3/OpenGLDrv/GL4ES/WebGL, responds to CDP input,
and exits cleanly through `window.__shutdown()`. No websocket connection is made.

## Run

From the workspace root:

```sh
./link-web.sh
python3 scripts/serve-web.py
```

Open `http://127.0.0.1:8765/build/web/index.html?interactive=1`.
Click the viewport to join the match and focus input. WASD moves; mouse motion
looks around; Tab opens the console. Stop client calls `window.__shutdown()`.
Mouse motion is currently ungrabbed and limited by the browser window; pointer
lock is not implemented. Stop the manual HTTP server with Ctrl-C when finished.

`?interactive=1&splash=1` runs the original splash for the brightness diagnostic.
Default startup / `?bounded=1` keeps the six-tick CI probe. Configuration edits
are in browser memory only; installed packages and configs remain unchanged.

Automated runs own one HTTP server, one Chromium instance and a transient
profile, then clean them up. Run sequentially because they use port 8765:

```sh
node scripts/test-web.cjs --splash
node scripts/test-web.cjs --interactive
node scripts/test-web.cjs --bounded
./link-em.sh
python3 build/phase2c-validate.py
python3 build/phase4/validate-evidence.py
```

## Brightness: fade timing confirmed

All PNGs are direct canvas exports, without CSS filters, postprocessing, or gamma
correction. Readback JSON records actual elapsed wall time, engine frame count,
nonblack pixel count, color count, mean RGB and maximum channel value. Scheduled
capture labels are targets, not exact capture times: initial precaching and PNG
readback can delay them. Splash timing below starts at interactive-loop readiness.

| Splash target | Actual seconds | Nonblack pixels | Mean RGB (0–255) | Maximum channel | Colors |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0 s | 1.535 | 44,856 | 0.379 | 11 | 162 |
| 2 s | 2.791 | 91,778 | 2.268 | 62 | 1,890 |
| 10 s | 10.934 | 111,193 | 4.206 | 255 | 19,624 |
| 20 s | 20.864 | 98,945 | 9.834 | 183 | 2,373 |
| 30 s | 31.293 | 761,204 | 64.418 | 255 | 165,158 |

The splash changes camera/content, so brightness is not monotonic over the whole
sequence. At 10 seconds the character and white lettering are clearly visible;
at 30 seconds the normal menu appears. The six fixed 1/60-second ticks in phase
3c captured the initial fade. Source confirms the mechanism:
`Engine/Src/UnSceneManager.cpp`, `USubActionFade::Update`, changes
`PlayerController::FlashScale.X`; `Engine/Src/UnRender.cpp` draws the resulting
alpha overlay when `FlashScale.X < 1`.

`OpenGLDrv/Src/OpenGLRenderDevice.cpp::UpdateGamma` separately computes a 256-entry
hardware ramp from client Gamma/Brightness/Contrast, but its Emscripten branch
skips the unsupported SDL3/browser upload. Installed SDL config is Gamma 0.8,
Brightness 0.8, Contrast 0.7. Desktop gamma-control parity remains unsupported;
it does not explain the measured early-only darkness. No shim was necessary for
this phase's visible, stable map. Native renderer branches are unchanged.

## Map and input evidence

`build/phase4/frames/time-30.png` shows Rankin's textured corridor and join prompt.
Its raw frame contains 785,488 nonblack pixels, 71,450 colors, mean RGB 44.30,
maximum channel 255. Idle captures stay at mean RGB 44.30–44.31.
`frames/input-mouse-after.png` shows the active match, weapon and HUD.
All captures report zero GL4ES and WebGL errors.

The harness uses `Input.dispatchMouseEvent` to click and spawn, then
`Input.dispatchKeyEvent` to hold W for 20 engine ticks and release it. It then
sends mouse motion of +100,+30 pixels. Existing SDL3 routes these events into the
engine. Read-only telemetry from the actual pawn/controller provides stronger
proof than animated-frame differences alone:

| Capture | Pawn position | Controller rotation (pitch, yaw, roll) | PNG SHA-256 prefix |
| --- | --- | --- | --- |
| Before input | 4240, -1552, 49.85 | 0, 32792, 0 | `773275031882ed08` |
| After W | 3202.281, -1554.389, 49.85 | 0, 32792, 0 | `5b86e818162f32ab` |
| After mouse | 3202.281, -1554.389, 49.85 | 64866, 35027, 0 | `d9c282c92aab43ad` |

Keyboard movement changes position by about 1,038 units without changing view
rotation. Mouse motion changes rotation without changing position. Full digests,
readbacks and engine state are in `build/phase4/input-proof.txt`.

The interactive loop has no tick limit. It awaits RAF on the existing Asyncify
stack, preventing overlapping ticks during HTTP suspension; elapsed time is
clamped to 1–100 ms. Explicit shutdown runs the original NoSave/appPreExit/appExit
sequence. Interactive splash and map runs both exit with code 0 and no page
errors. The bounded probe retains six ticks and exits cleanly.

## Regression and provenance

- `build/phase4/interactive.log`: map boot, active GC, input run, clean exit,
  harness PASS and process/profile cleanup.
- `build/phase4/splash/`: five timing screenshots and raw readbacks plus log.
- `build/phase4/bounded/`: bounded browser regression log and screenshots.
- `build/phase4/regression/`: Node build result, full/mount/usage transcripts,
  validation of 166 wasm objects, historical GC comparison and five unchanged
  game/config hashes. Full and mount exits are 0; invalid argument exits 2.
- `build/phase4/evidence-validation.txt`: saved PNGs independently verified
  against dimensions, histograms, nonblack counts, means, maxima and SHA-256.
- Source commit: `ed8d1aaa9338779df6056832efa97ceb5abf5f44` on nested
  `src/UT2004_CMAKE` branch `wasm-port`; source patch archived in evidence.
- GL4ES remains `ec16bedd8819c475326f4f1a3063772c6d986e06`, unchanged.
- Toolchain remains pinned by `link-web.sh` / `link-em.sh` to Emscripten 6.0.12.

No native build, audio, multiplayer or broader map/material validation claimed.
The relay URL is recorded as `wss://games.rgnv.dev/ut2004/connect2` in the shell;
transport changes remain next phase. No input or map-loading blocker remains.
