# NOTICE — scope, provenance, and what is *not* in this repository

## What this repository contains

Original code and documentation produced for the UT2004 → WebAssembly port:

- build/link harnesses (`build-em.sh`, `link-em.sh`, `link-web.sh`),
- the browser shell (`web/`), the WebSocket⇄UDP relay (`components/relay/`),
- CDP/HTTP test harnesses and servers (`scripts/`), including
  `scripts/install-game-data.sh`, which provisions game data **from
  OldUnreal's Epic-approved URLs only** (their installer's ISO links and their
  own GitHub patch releases). That script downloads into the user's own
  directories; it does not re-host, bundle, or redistribute any game content.
- technical reports and the port changelog (`docs/`),
- a **21-patch source series** (`patches/`) that adapts the pinned community
  engine tree for Emscripten and supports 3374-preview-23 plus legacy 3369.

## What this repository does NOT contain

- **No game data. Ever.** No maps, textures, sounds, music, meshes, animations,
  `.u` packages, or any other Unreal Tournament 2004 content is stored in this
  repository, its git history, or its releases' build output. The engine
  written to wasm loads everything it needs from *your own* data directory at
  runtime over HTTP.
- **No engine source tree.** The engine is fetched (or supplied) locally by
  `scripts/setup-sources.sh` / the user; what this repository stores is the
  patch series that adapts it, not the tree itself.

## Provenance of the engine source the patches apply to

The patch series is written against the community `UT2004_CMAKE` tree
(`github.com/emmanuelgoldstein1337/UT2004_CMAKE`, pinned commit `deda0fb`), a
community-modified build of the Unreal Tournament 2004 source release. That
tree traces back to the 2004 source release and carries its own provenance and
licensing situation; it is **not distributed by this repository**, and nothing
here grants any rights over it. The patches are published for the practical
purpose of reproducible interoperability research on a tree each user obtains
for themselves.

## Game data

Unreal Tournament 2004 and all of its content are © Epic Games, Inc. and its
licensors. No license to any of it is granted here. To run this port you must
supply a **legally obtained copy of the game** — for example a retail
CD/DVD copy you own, a store copy you already own, or the community
redistribution maintained by the OldUnreal project (which distributes game
installers under an agreement with Epic Games).

The v0.1.0 release client is verified with the final official **3369-era data**
(legacy support) and **OldUnreal 3374-preview-23**. Compatibility is limited
to these tested package sets; it does not imply compatibility with every later
community patch.

## Release binaries

The v0.1.0 web and Node release assets (first public release) contain compiled engine code only — no
game content — and are provided for personal use with your own legally obtained
game data. The complete 21-patch public source series includes the Phase 12
3374 native and layout compatibility work while preserving final 3369 support.

## Third-party components

| Component | Used for | License |
| --- | --- | --- |
| GL4ES (ptitSeb/gl4es) | GL→WebGL translation | MIT |
| SDL3 (bundled in the fetched tree) | platform layer | zlib |
| zlib (bundled in the fetched tree) | package decompression | zlib |
| Vorbis/libogg (fetched source tree) | streamed music decoding | BSD-style (Xiph.org Foundation) |
| Emscripten / emsdk | wasm toolchain | UIUC/NCSA |
| Node `ws` | relay + Node harness socket shim | MIT |

## Affiliation

This is a personal engineering project. It is not affiliated with, endorsed by,
or supported by Epic Games, OldUnreal, or the maintainers of the fetched
source tree.
