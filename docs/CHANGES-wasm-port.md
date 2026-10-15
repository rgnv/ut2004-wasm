# WebAssembly compile port changes

Baseline: `ec2638b` already contains Emscripten platform types, C rotate/timer fallbacks, guarded size typedef and GNUSTATIC fix. Native platform branches remain unchanged by this phase.

## Core compilation

- `Core/Inc/UnTemplate.h`, array placement new: omit premature explicit `FString` instantiation on Emscripten; instantiate at complete-type use sites.
- `Core/Inc/UnTemplate.h`, `TTransArray`, `TLazyArray`, `TMultiMap`: Emscripten-only base-member using declarations resolve Clang two-phase lookup without changing operations.
- `Core/Inc/UnObjBas.h`, `FlagCast`; `Core/Inc/UnClass.h`, field iterators: defer Emscripten definitions until `UClass`/`UStruct` are complete; retain native definition locations.
- `Core/Inc/UnObjBas.h`, `ConstructObject`: Emscripten-only base pointer cast permits forward-declared `UPackage`; inheritance and pointer value unchanged.
- `Core/Inc/UnMem.h`, `FMemStack` placement new: move Emscripten default arguments from friend declarations to namespace declarations; allocation unchanged.
- `Core/Inc/UnGnuG.h`, platform includes: include stdio on Emscripten for `GET_VARARGS`/`vsnprintf` declarations.
- `Core/Inc/UnName.h`, `AllocateNameEntry`: expose namespace declaration on Emscripten for calls with null arguments that cannot find hidden friend via ADL.
- `Core/Src/UnArc.cpp`, `operator<<(UNICHAR&)`: omit duplicate Emscripten overload when `UNICHAR` aliases `_WORD`; existing overload serializes identical bytes.
- `Core/Src/UnUnix.cpp`, stack trace feature detection: use existing no-execinfo path on Emscripten, whose libc has no `execinfo.h`; native behavior unchanged.
- `Core/Src/UnUnix.cpp`, includes: omit unused Vorbis headers on Emscripten; this translation unit references no Vorbis APIs.
- `Core/Src/UnUnix.cpp`, `appPlatformPreInit`: identify Emscripten with existing `OS_UNKNOWN` enum and descriptive machine string instead of platform `#error`.
- `Core/Inc/UnObjBas.h`, `IMPLEMENT_CLASS`: qualify package global on Emscripten so inherited `Engine` members cannot shadow module package name; native expansion unchanged.
- `Core/Inc/UnGnuG.h`, `unixToANSI`: add Emscripten ANSI-build identity-copy overload (including existing null-to-empty behavior) and string declaration; Unix file manager previously exposed only Unicode conversion.

Core validation: all 20 objects rebuilt successfully. `llvm-nm --undefined-only --demangle` finds no unresolved `operator new` for `TArray<FString>`; full linking remains outside scope. ANSI-copy self-check passed normal, empty, null input and return-pointer cases.

## Engine and drivers

- `Engine/Inc/EngineClasses.h`, `AFileLog::Destroy`; `Engine/Inc/UnSkeletalMesh.h`, `USkeletalMesh::GetCollisionBoundingBox`: omit illegal in-class extra qualification for Emscripten.
- `Engine/Inc/UnPackageCheckInfo.h`, `BF_WordByte`: select existing little-endian layout on Emscripten despite libc defining both endian constants.
- `Engine/Inc/UnCDKey.h`, `ValidateCDKey`: format identical signed decimal seed using `FString::Printf` on Emscripten; unavailable wide conversion replaced without bypassing validation.
- `IpDrv/Src/TcpLink.cpp`, text send: preserve constness of Emscripten ANSI string pointer; bytes only read.
- `IpDrv/Src/UnSocket.cpp`, socket error text: omit colliding resolver-code cases on Emscripten, retaining errno meanings; diagnostic ambiguity remains for resolver codes.
- `OpenGLDrv/Src/OpenGLRenderDevice.cpp`, platform selection/library name; `OpenGLDrv/Inc/OpenGLDrv.h`, includes: select existing SDL GL path and declare SDL APIs on Emscripten; built-in library uses empty name. GL compatibility remains link/runtime work.
- `OpenGLDrv/Inc/OpenGLDrv.h`, Emscripten includes: use bundled SDL3 headers (matching SDLDrv), not SDK SDL1 stub headers.
- `OpenGLDrv/Src/OpenGLRenderDevice.cpp`, `Init`, `Exec`, `Present`: Emscripten SDL3 equivalents use null built-in GL library and bool result, query fullscreen modes with matching dimensions/depth, and swap current GL window.
- `OpenGLDrv/Src/OpenGLRenderDevice.cpp`, `UpdateGamma`, `RestoreGamma`: Emscripten-only omit unsupported hardware gamma API (SDL3/browser); shader gamma deferred to runtime phase, native paths unchanged.
- `Engine/Src/AxWeatherEffect.cpp`, weather vertex stream `GetStreamData`: define scalar fallback when Emscripten has SSE disabled; use existing scalar algorithm unchanged.
- `Engine/Inc/UnNullRenderDevice.h`, includes: resolve private Engine header relative to current header on Emscripten.
- `Engine/Inc/UnPrim.h`, `CompareHits`: expose hidden friend at namespace scope on Emscripten so `MultiLineCheck` can pass existing comparator to qsort.
- `Engine/Src/UnTerrain.cpp`, integer `Compare`: forward-declare before template definition on Emscripten; built-in `int` has no ADL, existing sort and comparator unchanged.

## Launch compilation boundary

- `Launch/Src/LaunchPrivate.h`, includes: guard Windows SDK/resource/UI headers on Emscripten; retain Engine/render declarations.
- `Launch/Src/Launch.cpp`, includes/globals: Emscripten selects existing ANSI allocator/error/feedback and Unix file manager; omits Windows instance, DbgHelp, DirectX headers.
- `Launch/Src/Launch.cpp`, `GuardedMain`: compile existing startup logic as externally callable function accepting command line on Emscripten; guard Windows splash/log windows and route exec output to `GLog`; preserve CD-key and checksum checks, using equivalent `_WORD` for Windows `USHORT`.
- `Launch/Src/Launch.cpp`, platform boundary: guard WinMain/SEH/minidumps; declare `InitEngine`/`MainLoop` for future platform implementations instead of including Windows implementation. Browser entry point, engine initialization and asynchronous loop are explicit unresolved phase-2 work, not fake success stubs. Existing empty hardware configuration function retained.
- `Launch/Src/Helper.cpp`, `GetPrimaryAdapterVideoMemory`: Emscripten returns existing Win64 unknown-memory result (zero), without COM; native paths unchanged.

## Final acceptance — 2026-10-13

- [x] Full clean `./build-em.sh` completed with 148 `ok` lines, zero `FAIL` lines and final completion marker. Previous objects moved to `build/obj-before-clean` before rebuilding because harness does not track header dependencies.
- [x] Objects match every harness file: core 20, engine 111, ipdrv 7, sdldrv 3, gldrv 5, launch 2 (148 total). All files carry WebAssembly version-1 magic.
- [x] Every source change recorded above; build harness unchanged. Source changes confined to this repository and Emscripten branches.
- [x] Changes committed in Core, Engine/drivers, and Launch chunks on `wasm-port`.
- Build evidence: workspace `build/final-clean-build.txt`; symbol evidence: `build/final-symbol-check.txt`. Emscripten 6.0.12, Clang 24.0.0git in cached `emscripten/emsdk:latest` image.
- Full object symbol scan has no undefined `operator new` for `TArray<FString>`. Launch exports real `GuardedMain(char*)` and instantiates its array placement new locally.
- Initial `UnFPoly.cpp` compiler crash occurred during a shared-header write; retry and full clean rebuild passed without source changes to that file. Generated crash dump removed.
- Compile blockers / unfixed files: **none**.

### Phase-2 seed (not compile failures)

- `Launch/Src/Launch.cpp`: `InitEngine()` and `MainLoop(UEngine*)` are intentionally undefined platform hooks, confirmed by symbol inspection. Windows implementations live in `Engine/Inc/UnEngineWin.h`; browser entry point and asynchronous lifecycle remain to be supplied. `GuardedMain` still contains synchronous startup/shutdown sequencing requiring integration in that phase.
- `OpenGLDrv/Src/OpenGLRenderDevice.cpp`: SDL3/browser lacks legacy hardware gamma API; Emscripten omits gamma-ramp calls. Shader gamma and SDL3/GL browser compatibility remain runtime work.
- `Core/Src/UnUnix.cpp`: execinfo stack traces unavailable; existing fallback selected. CPU timing/platform initialization, dynamic loading, filesystem, and networking behavior have not been runtime-validated.
- `Launch/Src/Helper.cpp`: browser VRAM query returns unknown (zero), matching existing Win64 fallback.
- `IpDrv/Src/UnSocket.cpp`: resolver values `TRY_AGAIN`/`NO_RECOVERY` overlap WASI errno values; diagnostic switch retains errno interpretations.

No linking, browser execution or native build attempted; this phase establishes object compilation only.

## Phase 2 — static link and Node boot (2026-10-13)

### Entry and link recipe

- Workspace `link-em.sh` is committed in the **parent workspace repository**, on its own `wasm-port` branch; this source repository is nested and has a separate `wasm-port` history. The recipe builds its own objects in `build/wasm/obj`, tracks source/header/recipe freshness, fails on compile/link errors, retains wasm function names, and produces `build/ut2004.js` plus `.wasm`. It does not depend on phase-1 objects or modify `build-em.sh`.
- SDK pinned to the cached Emscripten 6.0.12 image digest `sha256:77638e6c215a65f25a704c0c831d5c2463a8c0468a58c6cb82489dbe621dfa05`. Uses memory growth, 8 MiB stack, Node raw filesystem, exit runtime, assertions, and the brief's multiple-definition allowance. Undefined symbols remain errors.
- Core, Engine (including built-in NullDrv), and IpDrv linked. SDLDrv, OpenGLDrv, original Launch/Helper, and UCC editor/extra game modules excluded. First unresolved symbols were supplied by **existing** `KConstraint.cpp`, `KScript.cpp`, `KPhysic.cpp`, `KSkeletal.cpp`, `xForceFeedback.cpp`, `TcpNetDriver.cpp`, `MasterServerUplink.cpp`, and `HTTPDownload.cpp`; no fake physics/network exports added. An exploratory build compiled all K*.cpp files. The isolated build caught initially omitted KPhysic/KSkeletal definitions (AKActor vtable/Spawned, execCalcContactRegion, execGraphData, execKScaleJointLimits), now explicitly included. Remaining empty Karma objects are excluded; failure evidence: `build/logs/link-isolated-missing-karma.log`.
- zlib: initial link used SDK `USE_ZLIB`; final recipe compiles the 15 in-tree C sources. `Core/Inc/FFileManagerGeneric.h` explicitly includes `../../zlib/zlib.h` (1.3.1), so final library matches these headers and requires no SDK port download. The zlib compile sets its existing `Z_HAVE_UNISTD_H` configuration macro after the standalone build exposed undeclared `lseek` in gzlib.c; no zlib source changes.
- `Launch/Src/LaunchEmscripten.cpp`: new `__EMSCRIPTEN__`-guarded console probe, modeled on UCC's `appInit` rather than Windows launch/window/CD/UI code. Changes cwd to `/opt/ut2004/System`, uses ANSI allocator/error/feedback, Unix file manager and stdout log. Dedicated-server flags and `-nohomedir -nosound`; no viewport or network session started by the probe.
- Probe default attempts full Core/Engine object loading, configured game engine construction/`Init`, and three synchronous fixed-delta ticks. Those later steps are **not reached** with the installed packages. `--mount-only` instead reads real package summaries, names/imports/exports with `GetPackageLinker(LOAD_NoVerify)` inside BeginLoad/EndLoad, explicitly labels this as tables-only, then runs `appPreExit`/`appExit`. This mode does not claim import verification, object loading, or engine initialization.
- Probe re-enables Init/DevLoad messages suppressed by installed config, checks static registry known/missing exports/modules, marks cached configs `NoSave` before normal shutdown, and rejects unknown CLI arguments with exit 2. Stdout logger uses existing `FName::SafeString` so logging after name subsystem shutdown remains valid.

### Source fixes and iteration evidence

- `IpDrv/Src/MasterServerUplink.cpp`, `SendStatLine`: omit illegal in-class extra qualification only for Emscripten. Exposed when adding the missing implementation to the link.
- `Launch/Src/wasm-registry.py`: derives per-module `autoclass*` and `int*exec*` export tables from **defined symbols in actual objects**, with exact `UClass*`/`Native` declarations. Asserts each module has objects/exports. Generated C++ is guarded and remains under build/. Classes and native functions use existing C++ static constructors; registry returns their export addresses, not invented init functions.
- `Core/Src/UnUnix.cpp`, `appGetDllHandle`/`appGetDllExport`/`appFreeDllHandle`: Emscripten-only path/basename/extension normalization and static Core/Engine/IpDrv lookup; unknown modules/exports return null; static handles are never dlclosed. Native dlopen behavior unchanged. Initial boot logged `dlerror(): dynamic linking not enabled`; registry removes those errors.
- `Core/Src/UnUnix.cpp`, `appCycles`/`appPlatformInit`: Emscripten microsecond counter backed by existing `appSecondsSlow`; `GSecondsPerCycle=0.000001`, CPU calibration/override omitted. Initial boot failed `Please specify CPUSPEED=x on cmdline.` No fabricated CPU frequency supplied.
- `Core/Src/UnUnix.cpp`, file descriptor limits: skip unsupported getrlimit/setrlimit block on Emscripten after Node warned `unsupported syscall: __syscall_prlimit64`; native block untouched.
- `Core/Src/UnObj.cpp`, `InitProperties`: guarded runtime check of default-copy bounds, even with DO_CHECK=0. Replaces unsigned-size overflow/memory trap with exact class/default/object/base sizes. Diagnostic boot: `WASM defaults size mismatch: class=Core.Object defaults=16 object=16 base=44`.
- `Core/Src/UnClass.cpp`, `UStruct::Link`: for wasm root UObject only, reserve its existing seven pointer-sized private slots if the first deserialized property is `Outer` rather than `ObjectInternal`. Installed Core.u's embedded Object script has only Outer/ObjectFlags/Name/Class; repository script includes ObjectInternal[7]. Temporary field tracing showed offsets 0/4/8/12; tracing was removed after identifying this discrepancy. Packages already containing ObjectInternal retain original layout calculation. This narrow compatibility fix advances loading to native API mismatch; it is not general support for all newer package layouts.
- Earlier probe iterations: `build/boot-01.txt` CPU-speed failure; `boot-02.txt`/`boot-03.txt` default-copy trap (symbolized in 03); `boot-04.txt` bounds diagnostic; `boot-05.txt` field offsets; `boot-06.txt` missing RandRange native. `boot-07.txt` exposed stdout logger's post-name-shutdown access, fixed with SafeString. `boot-08.txt` then exposed a post-main allocator lifetime trap (`null function or function signature mismatch` in FArray::Realloc from global UClass destructors). Startup services now have static storage, matching UCC lifetime; success is checked by Node exit code, not only the printed clean-exit marker. Initial unresolved-symbol list retained in `build/logs/link-01.log`.

### Remaining full-boot boundary

The installed `Core.u` declares `native static final function float RandRange(float Min, float Max)`; this source tree's `!_UnrealScript_And_Stuff/Core/Classes/Object.uc` implements it as a script function, and C++ has no `UObject::execRandRange` or corresponding native export. Full load stops with:

```
Critical: Can't find 'intUObjectexecRandRange' in 'Core.dll'
```

`Core.dll` is the engine's localization text; the wasm static module is Core, not an attempted Windows DLL load. Resolution requires packages matching this source/native API, or a deliberate implementation of the newer native API and validation of further class layouts. No dummy export or `nobind` bypass added. Engine class init, level loading, and three-frame path remain unvalidated behind this blocker. Browser/GL/network/native-platform validation remains outside this phase.

### Final acceptance and reproduction

Run from `/var/lib/hermes/work/ut2004-web`:

```
$ ./link-em.sh
LINK OK: build/ut2004.js + build/ut2004.wasm
$ node build/ut2004.js --mount-only
Init: WASM: Core init complete
Init: WASM: static registry self-check passed
Init: WASM: mounted ../System/Core.u version=128 names=522 imports=18 exports=871 (tables only)
Init: WASM: mounted ../System/Engine.u version=128 names=8790 imports=103 exports=15548 (tables only)
Init: WASM: mounted ../System/IpDrv.u version=128 names=596 imports=79 exports=747 (tables only)
Exit: Object subsystem successfully closed.
WASM: clean exit
exit=0
$ node build/ut2004.js
Critical: Can't find 'intUObjectexecRandRange' in 'Core.dll'
exit=1
```

- Exact complete transcripts, including both process exit codes: `build/boot-log.txt`. The code above excerpts selected lines; exit codes were captured by the subprocess harness.
- Standalone rebuild compiled 163 objects without compile/link errors (`build/logs/final-clean-compile.log`); final allocator-lifetime fix rebuilt launcher and generated registry, then linked successfully (`build/logs/link.log`, `build/final-link.txt`). Artifact assertions verified all 163 object headers and final wasm header as WebAssembly v1.
- `node build/ut2004.js --bad-option` prints usage and exits 2. `bash -n link-em.sh` and source `git diff --check` exit 0. Validation output: `build/final-validation.txt`.
- `sha256sum -c build/game-data-before.txt` reports `OK` for Core.u, Engine.u, IpDrv.u, UT2004.ini, and User.ini after final boots; tested game data/config bytes unchanged. Package/source API and package hashes recorded in `build/package-api-evidence.txt`.
- Acceptance achieved at the brief's fallback boundary: **clean link, Core initialization, real package-table mounting, clean Node exit**. Full object loading remains blocked at the precise native API mismatch above; engine initialization/frames are not claimed.
- Source worktree is committed clean on `wasm-port`. Parent workspace contains pre-existing untracked `PHASE-2-BRIEF.md`, `PORT-BRIEF.md`, `build-em.sh`, `build/`, `codex-final-message.txt`, and nested `src/`; they are preserved rather than deleted, ignored, or swept into the recipe commit. Parent tracked changes consist only of the new link script.

## Phase 2c — headless GC and socket investigation

- Adopt the incoming `Launch/Src/LaunchEmscripten.cpp` UT2004_BASE override and `Core/Src/UnObj.cpp` env-gated WASM_SKIP_GC diagnostic bypass; GC remains enabled by default. Matching installed data uses `data3369/UT2004/System`, not the extraction root.
- Refine incoming FArchiveTagUsed depth instrumentation: Emscripten-only high-water reports at 1000 through 9000, then multiples of 25000. Remove the noisy total-visits report and guard all counters; native behavior remains unchanged.
- Baseline command: `env -u WASM_SKIP_GC UT2004_BASE="$PWD/data3369/UT2004/System" node build/ut2004.js`; transcript `build/logs/phase2c-baseline-system.log` reproduces `RangeError: Maximum call stack size exceeded` at the first map GC. Initial extraction-root attempt (`phase2c-baseline.log`) fails MissingIni.
- Parent recipe incoming changes enable C++ exceptions and use a 256 MiB linear-memory stack. These are distinct from Node/V8's native call-stack limit; diagnosis will measure actual GC depth.
- First depth probe (`phase2c-gc-depth.log`) reaches depth 2000, not 50000. Corrected the incoming diagnostic's invalid `*GetFullName()` dereference: GetFullName returns TCHAR*, so ANSI conversion needs the pointer. Empty names were a probe bug, not evidence of corrupted object names.
- Temporary evidence-only probe audits all Next/Children owners and sibling-chain cycles; records pre-purge reachability of every object/name for recursive-versus-worklist comparison, immediate parent at depth milestones, and maximum completed depth. Probe patch and captures retained under build; removed before final commit. Increasing only Node --stack-size=4096 completes GC and hits the socket fatal (`phase2c-gc-node-stack4096.log`).
- Root cause measured: 19,950 fields; no Next/Children ownership errors or sibling cycles; largest sibling chain 562 (Engine.PlayerController), maximum recursive graph depth 2629. This is legitimate depth-first graph traversal across field and class references, not a 50k-node mis-linked list. The same engine algorithm is recursively stack-bound on native too, but no native game failure has been demonstrated; the observed failure is Node/V8 host-stack exhaustion.
- `Core/Src/UnObj.cpp`: Emscripten FArchiveTagUsed uses a TArray worklist drained at the outermost reference. RF_Unreachable is still cleared before scheduling, RF_EliminateObject still nulls references, RF_DebugSerialize is checked after serialization, and each queued object/name is traced before root processing returns. Native recursion remains verbatim. Removes the now-obsolete recursive depth probes after capturing them in commit 491b6c6. Both CollectGarbage and IsReferenced use this archive.
- Differential regression: recursive archive with Node --stack-size=4096 and worklist archive with default Node stack yield byte-identical pre-purge dumps of 50,971 entries: 20,779 reachable objects, 168 unreachable objects, 29,889 reachable names, 135 unreachable names. Both proceed to the same socket fatal. Captures: `phase2c-recursive-reachability.txt`, `phase2c-worklist-reachability.txt`, `phase2c-gc-comparison.txt`, plus boot logs; temporary audit removed.
- Saved 2000-frame path contains 1955 Next edges, 17 Children, 10 SuperField, one Class, and 16 other references. Example valid crossings: Actor.MessageClass → LocalMessage; GameInfo.VehicleList → Vehicle → Pawn; Pawn.LastHitBy → Controller; LevelInfo.ReplicationViewer → PlayerController. Object/class property serializers and script references connect the independently valid sibling lists. Loader ULinkerLoad::operator<< resolves stored package indices via IndexToObject; UField/UStruct deserialize Next/Children directly. No loader correction is justified.
- `IpDrv/Src/TcpNetDriver.cpp`, UTcpNetDriver::InitBase (shared by InitConnect/InitListen): Emscripten-only SO_BROADCAST failure now warns and continues without setting Error; native fatal behavior unchanged. Uses `%s` for SocketError(), which returns TCHAR*: the previous displayed numbers (68850/68888) were string addresses, not errno values. No UDP/broadcast functionality is claimed.
- Next full boot (`phase2c-socket-fixed.log`) passes active GC, purges 168 objects, warns ENOPROTOOPT, then the generated Node SOCKFS bind path fails `Cannot find module 'ws'`. Parent package.json/package-lock.json now pin ws 8.22.0 (same version already installed in the local relay workspace); install with `npm ci --ignore-scripts`. Real Emscripten socket behavior retained.
- With ws installed, boot next fails `Can't bind to native class UWeb.WebRequest` (`phase2c-ws-installed.log`). Stock config names UWeb.WebServer as a ServerActor and UWeb as a ServerPackage even though bEnabled=False. Parent link-em.sh now compiles the three existing UWeb sources; wasm-registry.py includes their real exports in the guarded static registry. No server-actor bypass or fake native functions. Header freshness tracking includes UWeb.
- Parent link recipe restores 8 MiB linear-memory stack after measuring the separate V8 stack failure; retains incoming exception compile/link flags. Final build recompiles all objects because recipe/header settings changed.
- Parent workspace bookkeeping: ignore local game data, independent source checkouts, generated build outputs and node_modules; explicitly retain phase2c evidence with git add -f. Preserve previously untracked briefs, compile harness, and prior phase reports unchanged in parent history so both requested worktrees can be clean. STATUS.md and docs/phase2c-report.md record this phase and reproducible commands; neither game data nor the separate UT2004Patches checkout is modified.

### Phase 2c final acceptance

- Full rebuild compiled 166 objects and linked successfully (`build/logs/phase2c-full-compile.log`, `phase2c-link-uweb.log`). UWeb required no C++ source changes. Link stack is 8 MiB; Node uses its default host stack.
- `npm ci --ignore-scripts --no-audit --no-fund` succeeds from the committed lockfile (`phase2c-npm-ci.log`). `python3 build/phase2c-validate.py` runs the full boot with WASM_SKIP_GC and NODE_OPTIONS unset, mounts package tables, checks usage rejection, compares historical GC marks, checks wasm headers, and checks five package/config hashes. All assertions pass (`build/phase2c-validation.txt`). The validation harness is an evidence artifact in the parent repository.
- Final command: `env -u WASM_SKIP_GC UT2004_BASE="$PWD/data3369/UT2004/System" node build/ut2004.js`. Transcript `build/logs/phase2c-final.log` records GC `21115->20947`, `Bringing Level NvidiaLogo.myLevel up for play`, `WASM: engine initialized`, `WASM: bounded loop complete`, `WASM: clean exit`, exit 0. Initial successful UWeb run is `phase2c-uweb-linked.log`. UWeb registration accounts for the changed object totals compared with the earlier differential test.
- Mount mode exits 0; invalid CLI option exits 2; full boot exits 0. Core.u, Engine.u, Ipdrv.u, UT2004.ini and User.ini hashes unchanged from the pre-fix snapshot. Both git diff --check checks pass. All temporary GC audit instrumentation removed; env-gated skip retained, unused in acceptance.
- Known nonfatal messages: absent Editor.TransBuffer in this headless build; unsupported SO_REUSEADDR. No browser/rendering, actual multiplayer traffic, native build/run, or arbitrary-map validation claimed. The synchronous three-tick Node probe is not a networking acceptance test.

## Phase 3 — browser shell (2026-10-13)

- `Launch/Src/LaunchEmscripten.cpp`: retain the same appInit, dedicated-server
  flags, package/map load, active GC, three fixed-delta ticks and shutdown.
  Inside the existing `__EMSCRIPTEN__` guard, distinguish browser/worker runtime
  and emit `WASM: browser bounded loop complete`; Node keeps its original marker.
- Parent `link-web.sh` links independently into `build/web/`, with its own
  `build/web-obj` objects, `ENVIRONMENT=web,worker`, MEMFS and no NODERAWFS.
  `web/pre.js` creates lazy HTTP files for the complete directory manifest and
  sets UT2004_BASE to `/opt/ut2004/System`. A dedicated worker permits synchronous
  LazyFile XHR while leaving the page responsive. Game bytes are neither bundled
  nor edited; writes are ephemeral browser memory.
- Parent `scripts/serve-web.py` serves loopback HTTP single byte ranges. Stock
  `python -m http.server` also booted successfully, but transferred whole asset
  packages for small reads. Range-enabled acceptance transfers 258,471,277 body
  bytes, including a four-byte range self-check; engine reports ~22.9 MiB read.
  Emscripten's one-MiB fetch chunks account for the extra traffic.
- Parent `scripts/test-web.cjs` drives transient Chromium directly through CDP,
  captures console, HTTP transcript, canvas pixel and screenshot, checks all boot
  markers and exit 0, then closes browser/server and removes its profile.
  Browser.close plus asynchronous removal retries avoid a shutdown/profile-write
  race found during validation. Evidence is in parent `build/phase3a/`.
- Node regression rebuilt with unchanged `link-em.sh`: full boot, package-table
  mount, usage rejection, 166 wasm objects, historical GC differential and data
  checksums all pass (`build/logs/phase3-node-regression.log`).
- Milestone 3a is headless: no viewport, GL context, interactive loop, audio or
  multiplayer acceptance. Canvas readback is `[0,0,0,0]`, explicitly labeled.
  GL4ES stretch work is isolated in the parent probe; no speculative renderer
  source changes enter the accepted boot target. See parent docs/phase3-report.md
  for exact GL requirements, measured stretch result and next blocker.
- Stretch evidence: pinned GL4ES compiles and renders a fixed-function triangle
  with pixel `[63,64,128,255]`, GL error 0, and all 336 mandatory browser-platform
  lookups resolved. Bundled SDL3 also compiles, but its video initialization in
  the 3a-style plain worker throws `ReferenceError: window is not defined` from
  its system-theme Window access. Engine rendering remains deferred pending
  main-thread dispatch/context ownership; no map-rendering claim.


## Phase 3c — real browser renderer first frames (2026-10-13)

- Browser-only `UT2004_WEB_CLIENT` startup selects SDLDrv/OpenGLDrv in ephemeral
  config, enables script execution after `appInit`, enables rendering during six
  fixed-delta ticks, then emits the existing browser bounded-loop marker.
  Node keeps its original headless three-tick path and four registry modules.
- Static registry generator accepts extra browser modules: SDLDrv, OpenGLDrv,
  XGame and XInterface. XInterface's Emscripten name registration runs after core
  initialization, rather than from its pre-runtime global constructor.
- SDLDrv's guarded browser path checks SDL3's boolean init result, creates a
  GLES2 opaque context, avoids software-surface access and automatic relative
  mouse capture, and initializes GL4ES. Desktop GL lookup uses GL4ES's resolver.
- Bundled SDL Emscripten context preserves the drawing buffer because engine
  presents are deferred across browser yields. OpenGLRenderDevice owns browser
  swaps. SDL context/window cleanup waits for shared renderer shutdown, fixing
  texture deletion after context destruction.
- Guarded renderer evidence counts default-framebuffer color clears and GL
  errors and captures each Present before swap. Parent browser harness records
  full readback statistics, unmodified canvas PNG and full-page screenshot.
- Parent web link uses Asyncify and an asynchronous ranged HTTP filesystem on
  the main thread, with suspension at the WASI read boundary. Full data tree
  remains available; config writes stay in MEMFS. No source GL4ES changes.
- Acceptance: NvidiaLogo map load, four presents across six ticks, two color
  clears, 1024x768 final readback with 43,685 nonblack pixels/50 colors, zero GL
  and page errors, bounded marker and clean exit. Screenshot shows dim initial
  Nvidia logo fade. Evidence and exact commands: parent `build/phase3c/` and
  `docs/phase3-report.md`.
- Node regression passes full boot, mount-only, invalid-argument rejection,
  166 wasm objects, saved GC differential and five original data/config hashes.
  No interactive input/audio, arbitrary maps, native platform build or
  multiplayer validation claimed.

## Phase 4 — interactive browser client and DM-Rankin (2026-10-13)

- `Launch/Src/LaunchEmscripten.cpp`, inside the existing `__EMSCRIPTEN__` /
  `UT2004_WEB_CLIENT` guards: interactive startup passes
  `DM-Rankin?game=XGame.xDeathMatch?NumBots=0` to the existing engine Browse path.
  The splash diagnostic and default bounded startup retain NvidiaLogo.
- Interactive ticks await `requestAnimationFrame` through `EM_ASYNC_JS` on the
  same Asyncify stack as HTTP package reads. Ticks cannot overlap; elapsed delta
  is clamped to 1–100 ms so a slow/background tab cannot cause a giant step.
  There is no frame limit. `Module.shutdownRequested` stops at the next RAF and
  runs the existing NoSave/appPreExit/appExit path. Node keeps three fixed ticks;
  bounded browser mode keeps six fixed ticks.
- Ephemeral SDL config enables ungrabbed mouse motion. Existing SDL3 scancode,
  button and motion routing is used unchanged. Read-only `Module.playerState`
  reports pawn/controller position and controller rotation for input evidence.
- Parent `web/index.html` supplies interactive/splash links, focusable canvas,
  Stop button and `window.__shutdown()`. Readback runs on demand in interactive
  mode, not every frame; raw PNGs and nonblack counts, mean RGB, maximum channel,
  color variety and GL errors are captured without image correction.
- Parent CDP harness injects real key and mouse events. DM-Rankin renders stable
  geometry/textures, clicking spawns the pawn, W changes its position, and mouse
  motion changes controller rotation. Before/after PNG SHA-256 values and engine
  state are retained in parent `build/phase4/input-proof.txt`.
- Darkness diagnosis: the first splash capture has peak channel 11, the 2-second
  capture reaches 62, the 10-second capture reaches 255; by 30 seconds the normal
  menu appears. `USubActionFade::Update` changes `FlashScale.X`; `UnRender.cpp`
  draws the corresponding alpha overlay. Six fixed ticks captured the fade-in.
  `UOpenGLRenderDevice::UpdateGamma` still computes the native 256-entry ramp but
  skips its unsupported SDL3/browser hardware upload. No gamma shim added:
  unmodified Rankin frames are stable and visible. Desktop gamma/brightness
  control parity remains unsupported, distinct from the diagnosed early fade.
- Acceptance evidence and commands live in parent `build/phase4/`; report in
  `docs/phase4-report.md`. Node regression passes full boot, mount, usage, active
  GC, historical reachability comparison, 166 wasm objects and original hashes.
  No websocket transport, multiplayer, audio or native-platform changes.

## Phase 5 — browser multiplayer transport

- `IpDrv/Src/TcpNetDriver.cpp`: under `__EMSCRIPTEN__ && UT2004_WEB_CLIENT`, replace the net driver's
  UDP I/O with per-driver browser WebSockets. EM_JS uses the browser's native API
  rather than SOCKFS, whose extra framing does not match the relay. Each binary
  message is exactly one engine datagram. Queue sends while opening, copy queued
  data before wasm memory changes, bound buffering, reject oversized/nonbinary
  input, and close the engine connection on transport failure. Native UDP and the headless Node listen path are unchanged.
- `Module.relayURL` selects the endpoint; default is
  `wss://games.rgnv.dev/ut2004/connect2`. Browser page exposes `ws_url`, `connect`,
  and `name` query parameters. After engine initialization, `connect=1` issues
  `open 127.0.0.1?Name=<sanitized name>` through the normal engine command path.
- `UnPenLev.cpp` logs CHALLENGE, WELCOME, and JOIN stages for wasm. Interactive
  player telemetry includes `netMode`, allowing tests to distinguish a replicated
  client pawn from the local startup level.
- Transport self-check and browser/server evidence live in the wrapper repository's
  `scripts/test-ws-transport.cjs` and `build/phase5/`.
- Validation: Node smoke boot still exits 0 with active GC; the browser's 3369
  session records CHALLENGE/WELCOME/JOIN, `NM_Client`, a replicated pawn, HUD,
  W movement and mouse rotation, zero page/GL errors, and clean exit. The initial
  W assertion failure was the login menu consuming input; focus + Escape and a
  spawn click are required test preconditions, especially when joining an active
  match. Browser tests use isolated systemd services after the worker-cgroup OOM.
- Two separate systemd Chromium profiles completed simultaneous JOIN/spawn and
  input checks. Both scoreboards show WasmOne and WasmTwo, with server-side player
  records and clean browser exits. The isolated 3369 server/relay were removed
  and the prior Caddy configuration restored after evidence capture.

## Phase 7 — browser transport and display shell

- Wrapper `web/http-library.js` now streams a whole package on first access,
  coalesces reads into a 160 MiB LRU, and validates direct-range fallbacks.
  `web/pre.js` keeps the existing filesystem/syscall integration. No engine
  load-plan, command-line, or native behavior changed.
- `SDLViewport.cpp` omits `SDL_WINDOW_RESIZABLE` only under `__EMSCRIPTEN__`,
  preventing browser resize/fullscreen events from changing internal resolution.
- Browser shell sets 1280x720 by default, persists a resolution selector, accepts
  validated `res=WxH`, and updates browser-only INI viewport defaults before init.
  Fullscreen uses a wrapper and CSS scaling, with a gesture fallback for URL requests.
- Lab Caddy configuration scopes wasm MIME/compression and week-long data/wasm
  caching to `/ut2004/`; UT99 retains raw octet-stream wasm. HTML/JS revalidate.
- Reproducible tests and live pve/mesa cold/warm evidence: wrapper `build/phase7/`.
- SDL keyboard targeting is set before runtime initialization so native shell
  controls retain arrow-key behavior outside the focused canvas.
- Performance target failed: final pve cold first frame 106.0 s versus 52.1 s
  baseline; full-file prefetch increased startup traffic to 2.07 GB. See wrapper
  `docs/phase7-report.md` for measurements and current multiplayer map limitations.

## Phase 7b — restore demand reads and link Fire natives

- Browser wrapper restores the phase-6 1 MiB lazy range filesystem and original
  Asyncify `fd_read` override; whole-file prefetch and its 160 MiB cache are removed.
- Browser link includes existing `Fire/Src/UnFractal.cpp` and passes `Fire` to
  `wasm-registry.py`. The generator discovers all seven actual class exports.
  No fake class aliases, no-op textures, or native-platform changes are needed.
- Browser startup checks all seven Fire exports. The former link omitted Fire,
  so `UClass::Bind` could not resolve `autoclassUFractalTexture` when Osiris2's
  imported packages loaded `Fire.u`.
- Wrapper `scripts/test-map-live.cjs` binds F8 in the test client's User.ini to
  open DM-DE-Osiris2, asserts play/spawn/render/clean exit, and separately tests
  joining the persistent server. No server travel or restart is performed.
- Exact results, before/after logs, screenshots and cold/warm 640/1280 live-site
  measurements are in wrapper `build/phase7b/`; see `docs/phase7b-report.md`.

## Phase 8 — selectable maps, 3369 auto-admin, bounded BSP stack

- `Launch/Src/LaunchEmscripten.cpp`: the web launcher takes its local map from
  the shell's manifest-validated selection and starts selected local maps with
  two bots. Engine map metadata selects the game mode; multiplayer still opens
  the existing 3369 relay after boot. Startup uses a fixed character buffer,
  because engine allocation is not initialized before `appInit`.
- After a network player and replication info exist, the web launcher issues
  `adminlogin ut2004` once for that player through the existing viewport console
  dispatcher. This applies only to `Module.connect` on the exact 3369 relay URL.
  Replicated admin status is included in existing browser player evidence;
  grant or timeout is logged once without blocking gameplay. Native platforms,
  the headless Node probe, and the 3374 server are unchanged.
- `Engine/Src/UnRenderVisibility.cpp::ProcessNode`: replace the wasm-only tail
  recursion through BSP coplanar nodes with a loop, preserving node order,
  visibility, lights and projectors. On chi1 ARM Chromium, Rankin precaching
  exceeded the host call stack. A diagnostic caught the original
  `RangeError: Maximum call stack size exceeded` before fatal teardown masked
  it with `memory access out of bounds`. Native recursion stays unchanged.
- Browser shell, automated map/admin/travel checks and source/server evidence
  are maintained in the wrapper repository under `build/phase8/`.

## Phase 9 — raw relative mouse and live resolution

- SDL Emscripten mouse/pen relative paths forward browser movementX/Y unchanged;
  absolute coordinates retain canvas scaling. Both initial lock and click regrab
  use one explicit `requestPointerLock({unadjustedMovement: true})` helper with
  logged adjusted-input fallback. The html5.h request's boolean was a gesture
  deferral flag, not raw input. Web viewport now enables SDL relative mode.
- `SDLViewport.cpp` reports float deltas at the existing IK_MouseX/IK_MouseY
  dispatch only when `Module.debugInput` is enabled (`?debug=1` in the wrapper).
  MouseY retains the existing negative sign; SDL drains all queued events.
- Web launcher exposes validated `ut2004_request_resolution` with an atomic packed
  pending request. Between RAF waits and ticks it dispatches the existing SETRES
  viewport command and acknowledges effective dimensions to the shell. Native,
  Node, bounded and splash loops retain their prior behavior.
- `OpenGLRenderDevice.cpp::SetRes` retains the existing WebGL context and GPU
  resources for windowed dimension-only changes. The ordinary ResizeViewport
  path updates SDL/framebuffer size; the next Lock updates viewport/scissor.
  Full resource flush/scene precache caused a measured 1,938 ms dynamic resize.
- Wrapper shell adds live custom/preset/dynamic resolution, even snapping and
  bounds, persisted selection, debounced viewport/DPR updates, and explicit plus
  automatic reload fallback. Dynamic axes clamp independently to 2560x1440.
- Reproducible pve-only Chrome acceptance harness and evidence: wrapper
  `scripts/test-phase9.cjs`, `build/phase9/`. Final measurements are recorded in
  the wrapper's `docs/phase9-report.md`.
- Final pve Chrome acceptance: X totals 400 at 1.0/0.55 CSS scale, after regrab,
  at DPR 2 and fullscreen; Y total -240. Custom 1024x600 and preset 640x480
  render live; dynamic 1600x900 applies in 665 ms and DPR-2 portrait clamps to
  1800x1440 in 641 ms. Explicit/automatic reload, bounded/splash and clean exits
  pass; no page/GL/WebGL errors. Headless pve rejects unadjustedMovement with
  NotSupportedError, exercising the logged fallback; hardware raw input is not
  claimed. Full evidence and failed iteration history remain in `build/phase9/`.

## Mobile input phase 1

- Emscripten SDL pointer adapter accepts the shared kit's explicit synthetic
  relative flag. Touch/controller look uses movementX/Y without browser pointer
  lock or canvas-edge clipping; synthetic button presses do not request a lock.
  Physical pointer events keep their existing path. The C struct and JS writer
  grow together; the flag is initialized for every pointer event.
- No joystick or audio behavior changes. SDL joystick support remains compiled,
  while the wrapper maps standard Gamepad API input to the shipped keyboard,
  mouse, and wheel bindings. Engine command line still includes `-nosound`.
- Wrapper sources: `web/mobile/mobile-input.{js,css}`, `web/index.html`.
  Verification: wrapper `scripts/test-mobile-kit.cjs`, `scripts/test-mobile1.cjs`,
  and `scripts/test-web.cjs --interactive`; evidence in `build/mobile1/`.

## Phase 10 — full game audio (OpenAL/WebAudio + Vorbis music)

- `ALAudio` is linked into the browser target through Emscripten 6.0.12's own
  WebAudio-backed `libopenal.js`/`libopenal.a`; no openal-soft fallback was
  needed. The vendored Ogg/Vorbis decoder (`Vorbis/ogg/src/{bitwise,framing}.c`
  and the `Vorbis/vorbis/lib` decoder set plus `vorbisfile.c`) compiles alongside
  it. Wrapper `link-web.sh` adds those sources, `-IALAudio/Inc -IOpenAL/Inc
  -IVorbis/{ogg,vorbis}/include`, `-lopenal`, and passes `ALAudio:alaudio` to
  `wasm-registry.py`; header freshness now covers `ALAudio OpenAL Vorbis`.
- `Launch/Src/LaunchEmscripten.cpp` registers the module and self-checks
  `autoclassUALAudioSubsystem` before any package load, matching the Fire check.
  It also forces `ALAudio.ALAudioSubsystem.UsePrecache=0` for the browser, because
  `UALAudioSubsystem::SetViewport` would otherwise decode and upload every
  `USound` during viewport setup, inside boot.
- `Vorbis/ogg/include/ogg/os_types.h` gains an `__EMSCRIPTEN__` branch using
  `<stdint.h>` typedefs, because CMake normally generates `ogg/config_types.h`
  and this recipe compiles the sources directly. Native branches unchanged.
- `ALAudio/Src/ALAudioCapture.cpp`: `FALAudioCaptureDevice::Init()` returns 0 on
  Emscripten and logs it. `alcCaptureOpenDevice` would otherwise open a second
  `AudioContext` and call `getUserMedia`; voice is out of scope (`WITH_SPEEX 0`).
- `ALAudio/Src/ALAudioStream.cpp`: the native build decodes Ogg on a background
  `pthread` and uploads chunks from the main thread. Emscripten has none, so
  `FALAudioStreamManager::Init` does not create one, `Destroy` frees the stream
  list synchronously, and `FALAudioStream::QueryStream` decodes the requested
  chunk inline (it already runs between ticks, where Asyncify file reads are
  legal). `FALSoundSource::Update` drains *every* processed buffer per tick
  instead of one, so a stalled tick can still refill the queue.
- `ALAudio/Inc/ALAudioStream.h`: `STREAM_NUMCHUNKS` 4 → 8 under `__EMSCRIPTEN__`
  (~3 s of buffered audio) for the same reason.
- `ALAudio/Src/ALAudioSubsystem.cpp`: with the library linked statically there is
  no DLL to open, and `alGetProcAddress` refuses to resolve before a context
  exists. `FindProc` therefore resolves the `ALFuncs.h` table directly against
  the linked `libopenal` symbols under `__EMSCRIPTEN__`, using the
  `DLLHandle = (void*)-1` sentinel that `appFreeDllHandle` already ignores for the
  other statically-linked modules. No entry point needed a shim.
- Same file adds the browser observability the shell and tests need: a shared
  counter of started sounds and requeued stream buffers, `alGetError()` sampled
  once per `UALAudioSubsystem::Update` (logging any non-zero result instead of
  swallowing it), `alcProcessContext` replaced by an explicit
  `AL.scheduleContextAudio` call so source state advances within the frame, the
  OpenAL `AudioContext` published as `Module.audioContext` with an `AnalyserNode`
  tapped onto the OpenAL master gain, and `Module.audioDebug` filled with
  `deviceOpen/contextState/musicPlaying/queued/processed/soundsStarted/lastError/rms`.
- Same file extends `UALAudioSubsystem::Serialize` to keep the transient
  `QueuedSources` sounds alive across the `CollectGarbage` in `LoadMap`: a track
  queued by `PlayMusic` during load was otherwise collectable before its first
  tick. Native builds keep the original set.
- Wrapper `web/index.html`: the interactive client no longer passes `-nosound`
  (`?nosound=1` opts out; the bounded/splash probes and the Node build keep it).
  The shell resumes the real `AudioContext` on the first `pointerdown`/`keydown`,
  re-issuing `resume()` inside the activation window because a `resume()` issued
  from the very first `pointerdown` can precede Chrome latching that gesture's
  transient activation and is not retried by the browser; it suspends while
  `document.hidden` and resumes on return, and shows "Click to enable sound" in
  `#status` until the context runs. `Module.audioContext` is the first hook the
  shared mobile kit already tries, so `web/mobile/mobile-input.js` is unchanged.
- Verification: wrapper `scripts/test-phase10.cjs` (`ab`, `desktop`, `touch` modes)
  plus `node scripts/test-phase9.cjs` against the same build; evidence, raw
  numbers and the diagnostic scripts are in wrapper `build/phase10/`.

## Phase 12 — 3374 native surface (2026-10-14)

The live dedicated server runs OldUnreal's 3374 Linux patch; 3369-era data boots
this engine but 3374 data aborted at the first unbound native
(`Can't find 'intUObjectexecRandRange' in 'Core.dll'`). This phase enumerates the
3374 native declarations offline, implements the client-runtime gaps, and
makes binding failures diagnosable instead of fatal-at-first.

### Enumeration (evidence: wrapper `build/phase12/`)

- Offline diff: every 3374 `.u` export table is decoded and compared against the
  generated static registry (`Launch/Src/wasm-registry.py` output). Tool: the
  `scripts/phase12-native-census.py`; results in `missing-natives.txt` preserve the
  original 49 runtime entries (6 Core natives, 1 Engine class + 18 functions,
  3 IpDrv classes + 2 functions, 2 XInterface functions, 16 Onslaught classes +
  1 function), signatures and derivation sources. The exhaustive installer-tree
  census also records 14 editor-only classes and 14 editor-only functions not
  linked into this client; it does not claim editor support.
  `changed-native-signatures.json` compares existing natives across both eras:
  PlayMusic and three debug drawing functions gained optional arguments.
- Runtime cross-check: `WASM_VERIFY_NATIVES=1` makes binding log-and-continue and
  sweeps the whole package set, so the runtime list can be compared against the
  offline list. Log before the fixes: `verify-natives-before.log`.

### Diagnostics

- `Core/Src/UnObj.cpp` (`UPackage::GetDllExport`): under `__EMSCRIPTEN__`, when
  `WASM_VERIFY_NATIVES` is truthy, a missing module/export is logged as a warning
  instead of `appErrorf`. Default behaviour (env unset) is byte-for-byte the
  original fatal path.
- `Core/Src/UnClass.cpp`, `UClass::Bind` / `UFunction::Bind`: same gate for a
  missing `autoclass*` constructor and for a dynamic native whose `GNatives`
  slot is still `execUndefined` (i.e. an `iNative` the engine never registered).
- `Launch/Src/LaunchEmscripten.cpp`: with `WASM_VERIFY_NATIVES` set, loads the
  package set (`IpDrv`, `UWeb`, `Onslaught`, plus `Fire`/`XGame`/`XInterface`)
  after Engine so their natives are exercised before the map load.

### Implemented natives (all regular implementations, no `#if __EMSCRIPTEN__`)

Reconstructed from the 3374 package signatures, shipped `.so` disassembly,
and existing engine helpers. OldUnreal's patch source is not published;
no unofficial source mirrors were used.

- `Core/Object.uc`: `RandRange` (`Min + (Max-Min)*appFrand()`, matching the
  `FRange::GetRand` convention), `FloatToFormattedString` (`%%.%df` with the
  default `Decimals=2` the binary uses), `IsUTracing`/`SetUTracing` (engine-local
  trace flag plus the reset semantics of `UObject::UTrace`),
  `GetModName` (returns `GModName`), `AllPackageFiles` (iNative 198; iterator over
  the engine's package path list, deduplicated, honouring the optional `FileExt`
  and `Prefix` filters).
- `Engine/ObjectPool` (new native class): `AllocateObject` reuses a pooled object
  of the requested class else constructs a transient one, `FreeObject` returns an
  object to the pool, `Shrink` empties it. The pool is a transient `UObject`.
- `Engine/Actor.uc`: `HurtRadius` (radius query through the collision hash, line
  check, distance-scaled `TakeDamage`, `bHurtEntry` re-entrancy guard, vehicle
  `DriverRadiusDamage` passthrough), `TriggerEvent`/`UntriggerEvent`
  (`Tag`-matched `Trigger`/`UnTrigger` broadcast), `AllControllers` (iNative 325;
  walks `Level.ControllerList` with a class filter), `KRagdollExists` (no-Karma
  build answers `false`), `ClearAttachedDecals` (`FProjectorRenderInfo::
  RemoveReference` over `Projectors`), `DrawDebugBox` (`GTempLineBatcher`).
- `Engine/Pawn.uc`: `AllInventory` (iNative 326; walks the inventory chain with a
  class filter and a cycle guard, matching the binary's iterator counter).
- `Engine/Projectile.uc`: `HurtRadius` (same shape as `AActor`'s plus the
  `LastTouched` follow-up pass, `HurtWall` exclusion, delayed-damage instigator
  forwarding and vehicle passthrough).
- `Engine/LevelInfo.uc`: `GetLocalPlayerController` (cached, then local
  viewport, then controller list — no global engine pointer dependency).
- `Engine/GameInfo.uc`: `MakeColorCode`, `StripColor` and `FromINIFormat`
  implemented against the same colour-code convention as the shipped
  `FString::CreateColorCode`/`StripColorCodes`/`FromINIFormat`
  (leading `0x1B`, channels clamped to a minimum of 1, `(#RRGGBB)` → code);
  `GetCurrentTickRate` reads `CurrentTickRate`, maintained by the browser loop.
  `GetConfiguredTickRate` reads `NetServerMaxTickRate` when connected, otherwise
  client menu/offline limits (120/1000 defaults recovered from Engine.so).
- `IpDrv`: `AMasterServerUplink::NetworkConnect` (creates and connects
  `FMasterServerUplinkLink` exactly as the shipped `execReconnect` does),
  `AMasterServerClientLauncher` native class + `SetResultCount`.
- `XInterface`: `UGUIController::NotifyMenuStatus` stores the parsed 32-bit bool
  in analyst-named `UClient::bMenuOpen`; Engine.so uses it to choose menu/offline
  frame limits. `UGUIFont::GetFontB` sets `parm_YRes` before forwarding to GetFont.
- `Onslaught`: the 16 native classes the package declares are compiled from the
  in-tree sources; `AONSWheeledCraft::IMPLEMENT_CLASS` is re-enabled (its
  on-disk registration was commented out).

Module list: the Node link now covers Core, Engine, IpDrv, UWeb, Onslaught, Fire,
XGame and XInterface; `Onslaught/Src/Onslaught.cpp` registers its names from the
launcher under Emscripten instead of a pre-runtime global constructor.

### Layout and existing-native compatibility

- Compiler-owned native layout metadata anchors reflected fields in Engine,
  IpDrv and XInterface and the 32-bit SoundData payload. Both package eras use
  actual C++ offsets, sizes and bool masks; omitted legacy fields retain space.
  Actor's reordered octree/NetInitialCache block is anchored field by field.
  The failing GC reference was `DefaultPhysicsVolume.Deleted` at offset 260,
  reading octree float bits as an object pointer.
- PlayMusic consumes all five 3374 arguments, including zero-default fade-out,
  crossfade and seek. Playback fades/stops existing music, clears queued tracks,
  delays non-crossfaded playback until fade-out completes, and preserves seek.
  The legacy two-argument bytecode still parses correctly through the normal
  end-of-parameters handling. Raw Engine.so assembly is in the wrapper evidence.
- DrawDebugLine/Circle/Sphere consume the new optional `staying` bool; all four
  debug primitives, including DrawDebugBox, support persistent geometry cleared
  by ClearStayingLines. Existing tessellation is reused.
- Temporary layout, GC-reference and bad-opcode probes were removed.

### Result

- Final Node acceptance, GC enabled: 3374 **4.828257 s**, 3369 **5.385955 s**;
  both exit 0 with initialization, NvidiaLogo browse, bounded-loop and clean-exit
  markers. Evidence: `node-{3374,3369}-final-accepted.{log,json}`.
- pve Chrome DM-Rankin: 3374 first frame **73473.100 ms**, 3369
  **81189.800 ms**; both render, accept keyboard/mouse input and shut down with
  exit 0. GL/WebGL errors are zero. Raw frames/readbacks and harness logs:
  `browser-{3374,3369}-accepted/`.
- Two locally served 3374 clients joined the unchanged live relay/server from
  two windows of one pve Chrome. Spawn times **106153/104575 ms**; both transport
  failure flags false, with signon/HUD/scoreboard evidence in
  `local-3374-multiplayer-resolution-fix/`. No mesa browser was used.
- The wrapper startup resize now waits for connected client state rather than
  treating a map-loading screenshot as a ready frame. This prevents its
  five-second resize fallback from reloading during asynchronous map loading.
- Editor.TransBuffer remains an explicit, nonfatal editor-only import warning.

## Phase 13 — exhaustive map execution

- Headless startup accepts `UT2004_MAP` (map URL, including `?game=Package.Class`),
  enables UnrealScript like the browser and native launcher, and starts a real
  match through `NumBots`, `MinPlayers`, and `QuickStart` URL options.
  `UT2004_HEADLESS_BOTS` defaults to 2 (0–32); `UT2004_HEADLESS_TICKS` defaults to
  120 (1–10000). `WASM_HEADLESS_PROOF` records the actual map/game, possessed
  bot pawns and controlled non-vehicle pawns (including scripted tutorial actors).
- `AEmitter::PostScriptDestroyed` now frees actor-owned particle emitters even
  for statically loaded actors with `DeleteParticleEmitters == 0`. Previously,
  stripped actor Emitter311 left SpriteEmitter1 registered with a dangling Outer
  on 3369 DOM-UCMP-Cerebral, crashing garbage collection at exit.
  CTF-UCMP2-Enlightenment also retained owned children absent from its Emitters
  array. Static-actor teardown now visits material and emitter ownership in two
  registry passes, not a nested scan per child. Dynamic emitters retain the
  original list-based cleanup; package-owned shared objects remain untouched.
  Focused verification on both maps: two bot pawns, 600 ticks, exit 0, GC enabled.
- Browser startup accepts the shell's optional local `gameClass` without changing
  the engine's default map-to-game selection.
- Raw census and teardown evidence: wrapper `build/phase13/`; coverage and
  remaining acceptance results are documented in wrapper `docs/phase13-report.md`.
- Final headless sweep: 373/373 maps reach play, finish 600 ticks, and exit zero;
  zero native-bind failures. Authored add-on class/data errors remain visible.
- Browser shutdown awaits fullscreen restoration and its next animation frame
  before appPreExit destroys SDL viewport callback userdata. This fixes the
  observed `dynCall_iiii` after-runtime-exit abort without keeping a dead runtime
  alive or suppressing assertions.
- Local tutorial launches use the shipped menu protocol: NumBots=0,
  QuickStart=true, TeamScreen=false. Player evidence distinguishes a possessed
  pawn from a real SceneManager OldPawn temporarily unpossessed by Matinee.
  The actor scan occurs only on cinematic entry, stops at the first observed
  handoff, and never scans every frame. Final compiled TUT-DM smoke passes with
  the observed OldPawn, rendered scene, zero GL/page errors and exit 0
  (`build/phase13/renderer-fix-smoke/` in the wrapper).
- Pve Chrome focused verification: DM-Rankin and TUT-DM both render with zero
  GL/page errors, observe real pawn possession/handoff, and exit zero including
  a one-second asynchronous teardown observation window.
  Evidence: wrapper `build/phase13/browser-fix-smoke/`.
