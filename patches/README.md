# Port patch series (26 patches)

These patches adapt a pinned community `UT2004_CMAKE` tree for
Emscripten/WebAssembly. They are the complete public source-side delta: platform
and browser integration, the Node harness, audio/WebAudio, the 3374 native
surface plus 3369 legacy compatibility, and the Phase-13 map/mode coverage work
(owned-particle teardown, fullscreen/tutorial cinematic startup, cinematic
handoff observation, and the direct `Entry` menu opening).

- **Base tree**: `emmanuelgoldstein1337/UT2004_CMAKE`
  @ `deda0fb464371b661b616b4e58ff4d53f6f011f1` (see `NOTICE.md` for provenance —
  the tree itself is *not* distributed here).
- **Apply** (or let `scripts/setup-sources.sh` do it):
  ```bash
  git clone https://github.com/emmanuelgoldstein1337/UT2004_CMAKE src/UT2004_CMAKE
  git -C src/UT2004_CMAKE checkout deda0fb464371b661b616b4e58ff4d53f6f011f1
  git -C src/UT2004_CMAKE switch -c wasm-port
  git -C src/UT2004_CMAKE am --3way patches/*.patch
  git -C src/UT2004_CMAKE log --oneline -26
  ```
- **Result**: 26 commits on branch `wasm-port`, 62 files changed
  (+3,264/−72), including the browser/Node entry points and static native-class
  registry generator.

Every change is also described in prose in `../docs/CHANGES-wasm-port.md`.

## Contents by area

| Patches | Area |
| --- | --- |
| 0001–0003 | Emscripten platform branches, Core/Engine/SDL/OpenGL compile fixes |
| 0004–0005 | Guarded launcher startup, static wasm link, Node package-mount boot |
| 0006–0007 | GC depth diagnosis + worklist marking fix |
| 0008–0009 | Socket broadcast fallback, UWeb exports for the stock server actors |
| 0010–0014 | Browser bring-up: bounded CI, SDL3/GL4ES, interactive input, WebSocket transport |
| 0015–0016 | Fire texture linking, map selection, scoped automatic administration |
| 0017–0018 | Relative mouse precision, live resolution, synthetic input |
| 0019 | ALAudio/WebAudio, OpenAL, streamed Vorbis music |
| 0020–0021 | 3374 native surface and layouts, with 3369 compatibility |
| 0022 | Owned-particle teardown; scripted headless map coverage |
| 0023–0024 | Fullscreen callback drain, tutorial cinematic startup, cinematic handoff observation |
| 0025 | Viewport teardown cleanup |
| 0026 | Direct `Entry` startup opens the configured menu |
