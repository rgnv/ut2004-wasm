# Phase 13 — map and game-mode coverage

## Acceptance boundary

The final headless census has **zero native-bind failures**, but the brief's stricter
**zero bind/load errors for every map** criterion is not met. Supplied add-on maps
contain invalid class references and UnrealScript data/indexing errors. These remain
visible; no game packages, dedicated server, or relay were changed to conceal them.
Evidence is retained under `build/phase13/`. Counts below refer to actual runs, not
inferred compatibility.

## A. Exact map census

| Tree | Enumerated maps | Final runs / exit 0 | Play / 600 ticks | Runs with possessed pawns |
|---|---:|---:|---:|---:|
| `/opt/ut2004` (3374) | 131 | 131 / 131 | 131 / 131 | 128 |
| `data3369/UT2004` (3369) | 242 | 242 / 242 | 242 / 242 | 239 |
| Live 3374 + preserved add-ons | 242 | Inventory only; browser coverage separately | — | — |

There are **242 unique filenames**, not 615 unique maps. All 373 reference-map
runs use their matching data tree. Initial and final map inventories/hashes are
identical. `map-census.json` contains tree membership, hashes, per-run commands,
exit codes, failures, milestones, and raw-log paths. `final-tree-summary.json`
and `final-summary.json` retain the measured aggregates.

The initial census took 901.54 seconds: all 373 reached play; 372 exited zero.
DOM-UCMP-Cerebral crashed during teardown. The previous 27 verified maps passed
in both eras: 54/54 (`baseline-27-crosscheck.json`). Investigation then found that
the inherited headless launcher left `GIsScriptable` disabled. Initial load-only
coverage was therefore insufficient evidence of gameplay execution.

A second complete, script-enabled census took 1228.78 seconds. All 373 maps reached
play and bounded ticks; 372 exited zero. CTF-UCMP2-Enlightenment exposed a second
owned-particle teardown case. The final sweep, after both fixes, took **1427.28
seconds**: **373/373 exit 0, play, and 600 ticks; zero native-bind failures**.

Commands:

```sh
python3 scripts/phase13-map-census.py --stage initial --workers 4 --timeout 90
python3 scripts/phase13-map-census.py --stage scripted --workers 4 --timeout 90
UT2004_HEADLESS_TICKS=600 python3 scripts/phase13-map-census.py --stage final --workers 4 --timeout 180
```

The initial command used the then-current load-only launcher. Scripted runs use
normal match options, two requested bots, and real controller/pawn ownership
counts. Final proof includes map package, full game class, tick count, controller
count, nonvehicle controlled pawns, and possessed bot pawns. Bots mounted in
vehicles count as possessed pawns. Entry, NoIntro, and endgame have no possessed
pawn in either era; they are entry/cinematic maps, not ordinary bot matches.

## B. Native surface and engine corrections

Static package/registry census:

| Era | Native classes / linked | Dynamic natives / linked | Declared hardcoded slots registered |
|---|---:|---:|---:|
| 3374 | 330 / 316 | 427 / 413 | 290 / 290 |
| 3369 | 328 / 314 | 402 / 388 | 287 / 287 |

The remaining 14 classes and 14 dynamic natives are Editor/UnrealEd-only, not
missing runtime dependencies. Every map's direct package imports were parsed;
no map declares a local native class. Evidence: `native-census-3374.txt`,
`native-census-3369.txt`, `map-package-imports.json`, `native-inventory.md`.
**No additional runtime native or no-op was needed.** Phase 12's linked native
surface already covers every observed runtime bind.

Engine commit `c00936d` (`Fix owned particle teardown and enable scripted headless
map coverage`):

- `Launch/Src/LaunchEmscripten.cpp`: `UT2004_MAP` startup selection, bounded
  `UT2004_HEADLESS_TICKS`, `UT2004_HEADLESS_BOTS`, actual UnrealScript execution,
  and direct possession measurements. Default headless boot is DM-Rankin.
- `Engine/Src/UnParticleSystem.cpp`: release particle emitters/materials owned by
  a destroyed static emitter, including children absent from its Emitters array.
  Keep shared/package-owned objects. Retain the existing dynamic deletion path;
  avoid nested per-child registry scans. This fixes dangling Outer references,
  rather than hiding garbage-collection failures.
- Browser local-map launches accept an explicit qualified `?game=Package.Class`;
  the shell validates its syntax and ignores it for server connections.

Both formerly crashing maps subsequently completed 600 ticks with two possessed
bots and exit 0 (`final-focused-results.json`, `teardown/`,
`teardown-enlightenment/`). The final full census confirms both fixes across all
maps. Existing server/relay selection remains unchanged.

### Authored-content limitations

The final sweep retains **13 load/runtime-error lines across three add-on maps**,
plus **451 missing-import warning lines**. All three maps still load, spawn,
tick, and exit zero. These are not missing-native failures:

- **AS-UCMP2-Cruciatus:** export 6577 `MyxPawn15`, offset 25116330, explicitly
  requests `XWeapons.classicsniperrifle`. Neither era's XWeapons contains that
  class; `UTClassic.ClassicSniperRifle` exists. No class alias or package rewrite
  was introduced. Evidence: `authored-load-warning.json`.
- **AS-Confexia:** six WeaponLockers explicitly serialize null WeaponClass
  entries, then shipped WeaponLocker.PostNetBeginPlay dereferences them.
  Evidence: `authored-null-weapon-entries.json`, including offsets and payloads.
- **CTF-UCMP2-Orcus:** embedded VariableTimedMover sizes KeyMoveSpeed from
  KeyMoveTime.length, then indexes it with KeyNum without checking bounds.
  Two movers access indices 5, 6, 7 against length 5 during the 600-tick sweep.
  Evidence: `authored-mover-bounds.json`.

Missing-import warnings include editor transaction buffers and material imports;
script warnings are retained separately in each final census row. Do not equate
zero native-bind failures with zero warnings or universal gameplay correctness.

## C. Headless game modes and prefix defaults

All **22 mode/era combinations** load the expected class, produce possessed
pawns, complete 600 ticks, and exit zero. Evidence: `mode-plan.json`,
`modes-headless/validated-results.json`, and per-run logs. The original evaluator
incorrectly rejected ONS because its bots were mounted in vehicles; the corrected
predicate accepts directly measured bot possession, not an invented spawn marker.
Original results are retained alongside the corrected evaluation of the same logs.

| Mode | Representative map | Game class |
|---|---|---|
| DM | DM-Rankin | XGame.xDeathMatch |
| TDM | DM-Rankin | XGame.xTeamGame |
| CTF | CTF-FaceClassic | XGame.xCTFGame |
| BR | BR-Anubis | XGame.xBombingRun |
| DOM | DOM-Suntemple | XGame.xDoubleDom |
| AS | AS-Convoy | UT2k4Assault.ASGameInfo |
| ONS | ONS-Torlan | Onslaught.ONSOnslaughtGame |
| Invasion | DM-Rankin | SkaarjPack.Invasion |
| Mutant | DM-Rankin | BonusPack.xMutantGame |
| LMS | DM-Rankin | BonusPack.xLastManStandingGame |
| TUT | TUT-DM | XGame.xDeathMatch (map default) |

`prefix-default-games.json` records every observed prefix/default combination.
Map-authored defaults can override the usual prefix convention: some DM maps
select Mutant/LMS, some CTF maps select BombingRun or InstagibCTF, and each tutorial
selects its corresponding game class. The port preserves those authored choices.
AS/ONS verification covers loading, spawning, rendering, and ticking, not objective
completion.

### Browser defects found during mode verification

The first mode batch had no CDP page target after prior harness cleanup. Its
startup failures are retained in `modes-browser/`. After creating one page,
`modes-browser-accepted/` exposed genuine shutdown failures: ten modes spawned
and rendered but aborted when SDL's asynchronous fullscreen-restoration callback
called `dynCall_iiii` after runtime exit. TUT-DM timed out because the generic
harness incorrectly required continued player possession during Matinee.

Engine commit **`afd9d95`** fixes fullscreen lifecycle ordering: await
`document.exitFullscreen()` and the next animation frame while the SDL viewport
and WASM runtime remain alive, then run normal engine teardown. No assertion is
suppressed and EXIT_RUNTIME remains enabled.

Tutorial startup now follows the shipped GUI's options:
`NumBots=0?QuickStart=true?TeamScreen=false`. `tutorial-semantics.json` records the
source locations and TUT-DM's 11 SceneManagers / 42 camera actions. SceneManager
saves OldPawn and unpossesses it during Matinee. Browser evidence now reports
`cinematicPawnSpawned` only after observing that real saved pawn in the scene
whose Viewer is the player; it never manufactures a pawn or changes possession.
The lookup runs once per cinematic entry. The harness still requires a real
possessed pawn or the directly observed Matinee handoff, and waits through
cinematic fade-in for a rendered scene.

Focused pve smoke after both fixes:

| Case | First frame (ms) | Pawn/handoff observed (ms) | GL/page errors | Exit |
|---|---:|---:|---|---:|
| DM-Rankin / DM | 246321.9 | 251103 | 0 / 0 | 0 |
| TUT-DM | 238096.6 | 239027 | 0 / 0 | 0 |

Evidence: `browser-fix-smoke/`, including screenshots, console logs, frame/player
JSON, and result JSON. TUT-DM's captured state is `pawn:false`, `cinematic:true`,
`cinematicPawnSpawned:true`: the distinction is intentional and observable.
Shutdown checks include a one-second window for late page exceptions.

## Regression measurements

Five final shell/transport commands passed; raw stdout/stderr and durations are
in `final-regressions.json` and `final-test-*.log`:

```sh
node scripts/test-shell.cjs
node scripts/test-map-shell.cjs
node scripts/test-mobile-kit.cjs
node scripts/test-http-cache.cjs
node scripts/test-ws-transport.cjs
```

Both default Node era boots exit zero (`node-default-results.json`). Phase-9
input/resolution evidence is in `phase9/`: 40 horizontal events produce delta
400 at normal/scaled/regrab/DPR2/fullscreen configurations; 30 vertical events
produce -240. Verified resolution cases include 1024×600, 640×480, 1600×900,
1800×1440, and 1100×858, plus reload fallback, splash, bounded execution and
clean shutdown. The run took 1167.28 seconds.

Phase-10 desktop audio (`phase10/acceptance.json`): first frame 212870.1 ms versus
198365.2 ms with sound disabled; audio context transitions suspended→running;
processed chunk delta 27; sounds started 81→153; peak RMS
0.017743549341484078. The sustained sample records 725 frames in 62.632 seconds
(11.58 FPS), 154 processed chunks, consumed ratio 0.998, zero page errors, and
clean exit. Desktop run: 516.15 seconds. Touch audio
(`phase10/acceptance-touch.json`) also transitions suspended→running, processed
12→39, RMS 0.00010911857, exit 0; run: 244.93 seconds.

These browser regressions ran on pve Chrome 155.0.8059.39, not mesa. Phase-9 and
desktop phase-10 preceded the final fullscreen/tutorial-only correction; touch
phase-10 used the optimized particle-ownership fix. The later focused fullscreen
smoke exercises the shutdown defect those earlier runs did not expose.

## Build provenance

The Node census uses engine `c00936d`; subsequent `afd9d95` and `70d6e09` changes
are confined to the browser compilation branch. Final web build command:

```sh
UT2004_DATA=/mnt/storage/nfs-share/romm-romm-library-pvc-82341969-5b65-4efe-bf7a-80c4caf6a408/roms/dos-www/ut2004/data bash link-web.sh
```

The final build took 428.38 seconds and generated a 2950-file HTTP manifest
without bundling game data. `web-build-capacity.log` retains compiler/linker output.
An earlier invocation omitted UT2004_DATA and failed only at manifest generation;
that failed invocation is not counted as a successful build.

Final WASM: **23218228 bytes**,
SHA-256 `813033952f322714402a85088e564617ccd663a8f974cc03a114c4cac58280da`.
Both gzip and Brotli sidecars decode to that digest (`compression-proof.json`).
`staged-client.json` records all seven staged client-file sizes and digests.
The HTML uses the `phase13-coverage` WASM cache key.

### Renderer capacity defect found by the full browser batch

The first full browser batch (`browser-final/`) attempted 60 unique maps plus
nine remaining mode representatives in **15077.53 seconds**. The nine modes
passed, completing 11/11 mode coverage with the earlier DM/TUT smoke. Only
28/60 map cases passed: 26 failed before first frame, and six entry/cinematic
maps never produced the harness's required player-pawn marker.

The 26 pre-frame failures shared an exit-time UObject destructor stack. That
stack masked the initiating exception: diagnostic logging before the generated
runtime's `handleException` revealed a **TypeError in GL.getTempVertexBuffer**.
Its size-class ring was undefined because Emscripten's default temporary
client-array buffer ceiling is **2097152 bytes**. ONS-ArcticStronghold requested
**2349576 bytes**, measured directly during the failing rendering path.

`link-web.sh` now sets the supported SDK option
`-sGL_MAX_TEMP_BUFFER_SIZE=67108864`. This extends the available size classes;
the generated runtime initializes rings but creates GPU buffers on demand.
It does not allocate 64 MiB per buffer up front, skip geometry, substitute a
material, suppress an exception, or disable normal runtime exit.

Primary SDK setting:
[`emscripten 6.0.12/src/settings.js`](https://github.com/emscripten-core/emscripten/blob/6.0.12/src/settings.js).
Evidence: `render-capacity-proof.json`, `render-exception-fresh/`,
`render-capacity/`. The corrected diagnostic render has zero GL/page errors,
a real pawn, and exit 0. Two initial diagnostic-only URLs used an inappropriate
development data prefix/cached HTML and failed before engine boot; their logs
are retained but are not counted as engine verification.

The actual rebuilt client then passed **3/3 focused cases**:
ONS-ArcticStronghold, TUT-DM, and CTF-UCMP2-Orcus, in **624.71 seconds**.
`renderer-fix-smoke/` contains the uninstrumented build's raw measurements,
screenshots, frame/player JSON and clean exits. The final cinematic observation
loop also stops at the first actual Matinee pawn handoff (`70d6e09`).

## Phase 13B continuation — final browser acceptance

The interrupted resweep is complete: **72/72 cases measured**. The original
seven successful cases were preserved, not rerun. The remaining 65 took
**15722.82 seconds**; all 72 total **17176.47 seconds**. Raw resweep outcomes:
**65 pass / 7 fail**. Six failures were the possessed-pawn predicate applied to
entry/cinematic worlds; the seventh, TUT-ONS, was a real GL error and was fixed.
`browser-resweep/batch-results.json` preserves those original outcomes.

Final case accounting: **66 playable passes, 6 expected-non-playable boot
observations, zero unresolved playable failures in this acceptance set**.
This is not 72 playable maps, nor a claim that every map is warning-free.
The 11 mode representatives all passed. `browser-final-summary.json` records
the accounting and its build boundary: the complete sweep used the capacity
fix; five focused cases were rechecked after the subsequent texture fix.
The complete 72-case sweep was not repeated after that fix.

### Historical 13B non-playable observations (superseded below for five entries)

| Map | Observed game class | First frame (ms) | Observed player tick | Frame colors |
|---|---|---:|---:|---:|
| Entry | GameInfo | 159361.00 | 6035 | 25 |
| MOV-UT2004-Intro | CinematicGame | 185903.40 | 4830 | 873 |
| Mov-UT2-intro | CinematicGame | 178895.40 | 5210 | 1 |
| NoIntro | CinematicGame | 163147.90 | 3680 | 24513 |
| NvidiaLogo | CinematicGame | 183411.10 | 5273 | 55 |
| endgame | CinematicGame | 205451.60 | 4988 | 65 |

The historical `expected-non-playable.json` classifies all six as boot-only,
backed by console, failure-state JSON, and screenshots in `browser-resweep/`.
All six reached their actual level's play marker, ticked without a pawn, and
reported zero GL/page errors. `endgame` is included because its console
explicitly loads UnrealGame.CinematicGame, CinematicPlayer, and CinematicHud,
not merely because its pawn check failed.

These are boot observations, **not cinematic-completion or clean-exit passes**.
Mov-UT2-intro's measured frame is black and its log retains
`SceneManager : Affected actor is NULL!`; no successful cinematic playback is
claimed. All original pawn-timeout failures remain available.

### TUT-ONS: texture realization correction

TUT-ONS rendered and handed its pawn to Matinee but accumulated one engine GL
error. `tutorial-webgl-diagnostic/` traces rejected `texParameteri` and
`generateMipmap` calls through GL4ES `realize_textures`. Native measurements in
`tutorial-texture-completeness/` identify disabled texture-zero units with no
image and two named textures (449 and 729) with `valid=0`, size `0x0`.
The intermediate texture-unit-only fix still failed; its evidence is retained.

`patches/gl4es-texture-realization.patch`, applied idempotently by `link-web.sh`
against GL4ES `ec16bedd8819c475326f4f1a3063772c6d986e06`, corrects:

- Target selection uses each unit's enable state, not the globally active unit.
- Mipmap generation activates the corresponding unit and uses its target.
- Image-less textures retain their bindings but defer sampler/mipmap realization
  until an image is uploaded. No texture data, geometry, or draw is substituted;
  no GL error is cleared or ignored.

All temporary native diagnostic logging was removed before acceptance.
The initial diagnostic routes that returned HTTP 404 are retained separately;
they are harness-routing failures, not engine test results.

Corrected, uninstrumented client smoke: **5/5 pass in 1212.85 seconds**:

| Case | First frame (ms) | Pawn/handoff (ms) | GL/page errors | Exit |
|---|---:|---:|---|---:|
| TUT-ONS | 223442.50 | 224178 | 0 / 0 | 0 |
| ONS-ArcticStronghold | 225935.10 | 233370 | 0 / 0 | 0 |
| TUT-DM | 220008.10 | 220863 | 0 / 0 | 0 |
| CTF-UCMP2-Orcus | 251048.50 | 256385 | 0 / 0 | 0 |
| DM-Rankin | 244843.40 | 249337 | 0 / 0 | 0 |

Evidence: `texture-fix-smoke/`. The final reproducible rebuild took **459.24
seconds** (`web-build-phase13b-final.log`); its TUT-ONS release smoke also passed,
first frame **255589.40 ms**, handoff **256353 ms**, zero GL/page errors, exit 0
(`release-smoke/`). All five existing shell/transport commands passed again;
see `phase13b-regressions.json` and the corresponding raw logs.

## Client-only live deployment

Deployed at **2026-10-15T05:09:56Z** to the existing NFS `roms/dos-www/ut2004`
directory. Seven client files were copied with per-file atomic replacement,
HTML last; the manifests' contents were unchanged. Existing Brotli/gzip
sidecars were refreshed together. No shared data, relay, or server was changed.

Rollback retained at:

```text
/mnt/storage/nfs-share/romm-romm-library-pvc-82341969-5b65-4efe-bf7a-80c4caf6a408/roms/dos-www/ut2004/client-prev-rollback-phase13b-20261015T050956Z
```

Every rollback file was hashed before deployment. Exact before/after sizes and
SHA-256 values: `client-deployment.json`; final build identity:
`staged-client-final.json`. The earlier build-provenance hashes above identify
the capacity-only build, not this final texture-fixed release.

| WASM | Bytes | SHA-256 |
|---|---:|---|
| Previous live | 23214670 | `0df1a7129591bb6244d4954cc04acb2781a58a29dc240450e8cf716ad9ae3085` |
| Deployed | 23218460 | `62ec4ce3e45446ded19df67affff3d1d635aa2a3b5bc8320fa5cbac4b08d275d` |

Both compressed sidecars decode to the deployed digest
(`compression-proof-final.json`). **7/7 live client-file fetches from pve**
matched final build hashes (`live-fetch-verification.json`).
`unchanged-client-server-after.json` matches the preserved non-client baseline.

Real pve Chrome verification at `https://games.rgnv.dev/ut2004/`: **3/3 pass,
600.99 seconds**. HTTP cache plus origin IndexedDB/cache storage/service workers
were cleared before the cold case (`live-cold-cache-reset.json`).

| Live case | First frame (ms) | Pawn/handoff (ms) | GL/page errors | Exit |
|---|---:|---:|---|---:|
| ONS-ArcticStronghold, cold | 237072.94 | 244682 | 0 / 0 | 0 |
| ONS-ArcticStronghold, warm | 159557.80 | 167840 | 0 / 0 | 0 |
| TUT-ONS | 166266.34 | 167024 | 0 / 0 | 0 |

`live-browser/` contains commands, timings, console logs, frame/player JSON,
canvas/full-page screenshots, and clean-exit results. The cold Arctic and
corrected tutorial screenshots were visually inspected. These checks establish
boot/render/possession or Matinee handoff and shutdown, not objective completion.

The two inherited uncommitted engine edits are cosmetic: one blank-line removal
in `Core/Src/UnObj.cpp`, and removal of an obsolete Destroy TODO plus spacing in
`SDLDrv/Src/SDLViewport.cpp`. They are not credited as additional behavioral fixes.

## Publication and cleanup

- Engine cleanup: `b8ecde3e2332146eec803d4e3a7a9bc3cdb0baff`, local `wasm-port`.
  The configured `emmanuelgoldstein1337/UT2004_CMAKE` upstream rejected the push
  with HTTP 403. The complete engine history was instead successfully published
  to private `rgnv/lab`, branch `ut2004-engine-wasm-port`.
- Wrapper implementation/report: `26d3a8b9102e8130b24dae0fa3f9562a4f7ea623`,
  published to private `rgnv/lab`, branch `ut2004-wrapper-phase13`. This local
  wrapper repository had no configured remote. Compact acceptance records are
  committed; raw logs, diagnostic captures, and screenshots remain locally under
  `build/phase13/`.
- Lab HTML/docs mirror: `988a34a6a34f16d472949b76f79cae097b69d686`, rebased
  onto the fetched `origin/master` and pushed without force.
- `rgnv/ut2004-wasm` was not modified or pushed.

`publication.json`, `published-refs.txt`, and the `*-push*.log` files retain
destinations, successful pushes, and the upstream permission failure.

Final cleanup (`cleanup-final.json`): pve `ut2004-phase13-chrome` is
**inactive/dead, MainPID=0**; no owned Chrome/renderer/crashpad processes remain.
The continuation's QA server and reverse tunnel are stopped; no map harness or
batch process remains. The pre-existing CDP tunnel and unrelated MCP services
are intentionally preserved. The game server remains active with PID 3161159
and its original October 13 start time.

All **2950 live data files** retain their baseline size and modification time,
with **zero differences** (`data-preservation-final.json`). This is a metadata
comparison, not a second full-content hash census.

## Phase 13C — direct Entry and role-specific acceptance

Direct `?map=Entry` bypassed the cinematic menu handoff. Native startup
(`Engine/Src/UnGame.cpp:361-490`) constructs the GUI controller but does not
open `MainMenuClass`. `CinematicPlayer.GotoMenu` explicitly opens that menu
and issues `DISCONNECT`; the native return-to-Entry path also selects it.
The browser launcher now opens the configured menu after initialization for
a direct local Entry launch. It creates no pawn and changes no game package.

Before the fix, four pve samples advanced from ticks **301 to 1234** while
mean RGB stayed **0.015625**, with only **640/307200** nonblack pixels.
After the fix, direct Entry reported `guiActive:true`,
`menuClass:UT2k4MainMenuWS`, `level:Entry`, and `pawn:false`; its captured
menu frame had mean RGB **72.60595** and **306539/307200** nonblack pixels.
The initial corrected-client smoke rejected the real menu because the new
harness initially expected `UT2K4MainMenu`, not the configured widescreen
class. That failed assertion and its rendered screenshots are retained in
`phase13c-smoke/`; they are not counted as passing runs.

The previous pawn loop clicked repeatedly, invoking `CinematicPlayer.Fire`.
Consequently its menu screenshots did **not** establish natural movie
completion. The role-specific harness now observes playback without input,
records timed RGB/histogram/frame/tick measurements, then distinguishes
automatic arrival from a deliberate authored Fire skip. It requires the
configured native main menu and three rendered steady-state samples,
zero GL/WebGL/page errors, and clean bounded shutdown. Other maps retain the
real possessed-pawn or observed Matinee OldPawn predicate.

### Phase 13C measured results

The sequential predeployment pve Chrome run passed **8/8 in 2122.18 seconds**:
the five requested entries and three controls, matching the latest instruction's
2–3 control cases rather than the earlier brief's approximately ten.
Every case has zero GL/WebGL/page errors and exit 0.

| Map | First frame (ms) | Timed samples | Observed transition |
|---|---:|---:|---|
| Entry | 225004.30 | 4 | Direct configured menu, no input |
| MOV-UT2004-Intro | 257286.90 | 15 | Rendered movie → authored Fire skip → Entry/main menu |
| Mov-UT2-intro | 274521.70 | 15 | Black fade-in → rendered movie → authored Fire skip → Entry/main menu |
| NoIntro | 221229.30 | 4 | Automatic Entry/main menu |
| NvidiaLogo | 216907.30 | 12 | Rendered splash → automatic Entry/main menu |
| DM-Rankin | 222991.20 | Pawn gate | Possessed pawn |
| CTF-FaceClassic | 234850.60 | Pawn gate | Possessed pawn |
| TUT-ONS | 233049.30 | Pawn/handoff gate | Real Matinee OldPawn |

Mov-UT2-intro's first sampled frame is genuinely black (one color, mean RGB 0);
its next frame at 3917 ms has 7223 colors and mean RGB 44.13461. That is a
transient fade-in, not an accepted permanent black screen. Both MOV maps have
12 pre-input movie samples plus three menu samples. NvidiaLogo reaches the
menu automatically at the 25163 ms sample. All five retain no-pawn semantics.
`phase13c-contact-sheet.jpg` was visually inspected alongside the JSON.

Evidence: `phase13c-browser/`, `phase13c-summary.json`,
`phase13c-root-cause.json`, and `entry-before*`. The two MOV passes establish
playback and supported skip-to-menu behavior, **not full unassisted playback
completion**. `endgame` remains outside these five and is still boot-only.
The full 72-case sweep was not repeated. Browser pointer-lock permission/
platform fallback messages remain in the logs; zero errors refers to the
measured GL/WebGL counters, uncaught page exceptions and failed HTTP responses,
not a claim of warning-free console output.

Release rebuild: **201.78 seconds**; WASM **23222347 bytes**,
SHA-256 `5480a6b38d0f101689bd25b64f1733a2788321d89b6c4f3d20adfb02f85f6b02`.
The release WASM matches the predeployment acceptance artifact byte-for-byte.
The HTML uses cache key `phase13c-menu`.
All five existing shell/transport regression commands passed
(`phase13c-regressions.json`).

Client-only deployment at **2026-10-15T06:21:07Z** retained rollback directory
`client-prev-rollback-phase13c-20261015T062107Z` under the existing live site.
The seven client files were replaced atomically per file, HTML last.
All seven subsequent live fetches from pve matched release hashes
(`phase13c-live-fetch.json`). Exact rollback/before/after identities are in
`phase13c-deployment.json`; build identities are in `phase13c-release.json`.
No data package, server, relay or mobile asset was changed.

Postdeployment real-browser verification passed **8/8 in 1319.36 seconds**
at `https://games.rgnv.dev/ut2004/`, sequentially through pve CDP 19222:

| Live case | First frame (ms) | Samples | Final mean RGB / pawn evidence |
|---|---:|---:|---|
| Entry | 123225.38 | 4 | 50.53764; automatic main menu |
| MOV-UT2004-Intro | 134373.67 | 15 | 67.45947; playback and Fire skip |
| Mov-UT2-intro | 136628.92 | 15 | 67.29886; playback and Fire skip |
| NoIntro | 119395.17 | 4 | 58.32488; automatic main menu |
| NvidiaLogo | 126449.12 | 12 | 72.60193; splash and automatic main menu |
| DM-Rankin | 135871.22 | Pawn gate | `pawn:true` |
| CTF-FaceClassic | 164410.56 | Pawn gate | `pawn:true` |
| TUT-ONS | 134896.99 | Pawn/handoff gate | `cinematicPawnSpawned:true` |

All five menu/cinematic cases report the configured `UT2k4MainMenuWS`,
advancing engine/render counters and no pawn throughout. Every live case
has zero GL/WebGL/page errors and exit 0. The table's duration sums measured
case times; the batch process wall time was 1319.63 seconds.
Evidence: `phase13c-live/`, `phase13c-live-summary.json`, and visually inspected
`phase13c-live-contact-sheet.jpg`. All 2950 live data files retain baseline
size and modification time (`phase13c-data-preservation.json`).

### Phase 13C publication and cleanup

- Engine `b44cac4` pushed to private `rgnv/lab:ut2004-engine-wasm-port`.
- Wrapper implementation/evidence `1c41e2d` pushed to
  `rgnv/lab:ut2004-wrapper-phase13`.
- Lab deployment HTML/docs mirror `1dabc8dc1` pushed to `rgnv/lab:master`
  after fetching/rebasing without force.
- `rgnv/ut2004-wasm` was untouched. No attempt was made to push the known
  forbidden engine upstream.

Pve `ut2004-phase13c-chrome` is inactive/dead with MainPID 0 and no owned
Chrome matches. The QA server and reverse tunnel are stopped; no local
map harness or batch remains. The diagnostic script was removed, retaining
its measurements/screenshots. The pre-existing CDP tunnel is preserved.
`phase13c-closeout.json` records publication outputs and cleanup observations.

