# Phase 2c: headless Node boot

## GC root cause

The failure was Node/V8 host-call-stack exhaustion while traversing a valid
object graph. It was not a demonstrated loader bug or a chain of 50,000 distinct
objects. With the incoming 256 MiB Emscripten linear-memory stack, default Node
still failed shortly after GC depth 2000. Changing only Node's `--stack-size`
from its default 984 KiB to 4096 KiB completed the same recursive GC, peaking at
**2629 simultaneous object visits**, and reached the SO_BROADCAST fatal.
The linear-memory stack and host call stack are separate limits.

The original diagnostic also incorrectly used `*Obj->GetFullName()` in a `%s`
argument. GetFullName returns `const TCHAR*`, not FString. The corrected probe
reported:

```text
[gc] depth=1000 visits=2552 obj=Function Engine.Pawn.EncroachedBy
[gc] depth=2000 visits=3650 obj=Function Engine.PlayerController.GetPlayerIDHash
[gc-audit] fields=19950 bad_next_outer=0 bad_child_outer=0 cycles=0 max_siblings=562 owner=Class Engine.PlayerController
```

All loaded UField Next links and UStruct Children chains passed ownership and
cycle checks. The captured first 2000 frames contain 1955 Next edges, 17 Children
edges, 10 SuperField edges, one Class edge, 16 other references, and the root.
They cross valid class references, for example:

- `Actor.MessageClass → LocalMessage`
- `GameInfo.VehicleList → Vehicle → Pawn`
- `Pawn.LastHitBy → Controller`
- `LevelInfo.ReplicationViewer → PlayerController`

`UObject::Serialize` traces outer/class/linker and property references;
`UField::Serialize` traces SuperField and Next before derived serializers
continue; `UStruct::Serialize` traces Children and script references;
`UObjectProperty::Serialize` traces PropertyClass and `UClassProperty::Serialize`
traces MetaClass. These references join valid sibling lists into a deep DFS
path. The field lists do not need to be corrupt for their combined traversal
to exceed the host stack.

Loader review: UField/UStruct deserialize Next/Children directly through
`ULinkerLoad::operator<<`, which resolves serialized indices with IndexToObject.
`UStruct::AddCppProperty` prepends native fields to Children. No defective
loader/link step was found; rewriting those lists would be unjustified.

This engine algorithm is recursively stack-limited on native platforms too,
but **no native engine failure or data-corrupting engine bug was established**.
The reproduced failure is the wasm execution environment's smaller host stack.
No native binary comparison was required or performed.

## Fix and equivalence evidence

The Emscripten branch of FArchiveTagUsed now marks each newly found object and
pushes it onto a TArray worklist. The outermost reference drains that worklist
before returning. Already-marked references cannot enqueue duplicates.
RF_EliminateObject still clears the serialized reference, RF_DebugSerialize is
checked after each object's Serialize, and object/name marking and purge remain
active. Both CollectGarbage and IsReferenced use the archive. Native recursion
is unchanged. WASM_SKIP_GC remains an explicit environment-only diagnostic opt-out.

A temporary audit dumped every object's and name's reachability immediately
before purge. Original recursive GC with `node --stack-size=4096` and patched
worklist GC with ordinary `node` produced **byte-identical 50,971-entry dumps**:

| Entry | Count |
| --- | ---: |
| Reachable objects | 20,779 |
| Unreachable objects | 168 |
| Reachable names | 29,889 |
| Unreachable names | 135 |

Both runs then reached the identical socket fatal. This differential check
exercises the actual map-loading graph rather than a simulated field list.
The temporary audit was removed after capture; its patch and data remain under
build/. Refined depth probes are preserved in source commit `491b6c6`; worklist
fix is `b1c50b9`.

Two alternatives considered: increasing Node's host stack is a useful diagnostic
but consumes bounded native stack and does not solve browser depth limits;
editing loader chains without evidence risks corrupting valid class metadata.
The worklist avoids both. Its tradeoff is heap storage proportional to the
pending traversal frontier and a different visitation order. The observed
retention/name sets match exactly on this boot; arbitrary maps are not covered.

## Socket and subsequent boot dependencies

`UTcpNetDriver::InitBase` in IpDrv/Src/TcpNetDriver.cpp contains the fatal
SO_BROADCAST call. On Emscripten its failure now logs a warning and continues;
native behavior is unchanged. SocketError() returns a string, so the warning
uses `%s`. The old numbers 68850/68888 were string addresses printed with `%i`,
not error codes. The actual shim error is **ENOPROTOOPT**.

The next boot exposed missing `ws`, required by the generated Emscripten
SOCKFS Node bind implementation. Parent package.json/package-lock.json pin
ws 8.22.0, matching the existing local relay dependency. No generated-JS edits
or fake sockets were added.

After installing ws, the stock configured UWeb.WebServer actor caused
`Can't bind to native class UWeb.WebRequest`. The parent recipe now compiles
the existing three UWeb sources, and the generated static registry includes
that module's real class/native exports. The installed config has web admin
disabled, but still loads the package and actor. No config or game-data edits
were used to bypass loading.

The final recipe restores the original 8 MiB wasm linear-memory stack and
retains the incoming C++ exception support. All source changes and investigation
steps are recorded in src/UT2004_CMAKE/CHANGES-wasm-port.md.

## Commands and evidence

Run from `/var/lib/hermes/work/ut2004-web`. UT2004_BASE is the actual System
directory, not the data3369 extraction root:

```sh
npm ci --ignore-scripts --no-audit --no-fund
./link-em.sh
env -u WASM_SKIP_GC UT2004_BASE="$PWD/data3369/UT2004/System" node build/ut2004.js
```

Historical diagnostic commands used the same environment and binary entry:

```sh
# Recursive version only: distinguish host stack from wasm linear stack.
env -u WASM_SKIP_GC UT2004_BASE="$PWD/data3369/UT2004/System" \
  node --stack-size=4096 build/ut2004.js

# With the temporary audit patch applied: dump all object/name marks.
env -u WASM_SKIP_GC UT2004_BASE="$PWD/data3369/UT2004/System" \
  WASM_GC_AUDIT="$PWD/build/phase2c-recursive-reachability.txt" \
  node --stack-size=4096 build/ut2004.js
# Repeat with worklist build, default node stack, and worklist output path.
cmp build/phase2c-recursive-reachability.txt build/phase2c-worklist-reachability.txt
```

Each historical boot was bounded by `timeout 90s`; all observed boot failures
exited 1 themselves, not by timeout. Boot transcripts:

| build/logs file | Observed boundary |
| --- | --- |
| phase2c-baseline.log | Wrong extraction-root path: MissingIni |
| phase2c-baseline-system.log | Original GC host-stack overflow |
| phase2c-gc-depth.log | Depth 2000; incoming name-format bug |
| phase2c-gc-names.log | Correct Pawn/PlayerController names; overflow |
| phase2c-gc-node-stack4096.log | Recursive GC succeeds; socket fatal |
| phase2c-gc-recursive-audit.log | Ownership/cycle/depth audit and recursive marks |
| phase2c-gc-recursive-path.log | Captured 2000-frame traversal path |
| phase2c-gc-worklist-audit.log | Default-stack GC succeeds; identical marks |
| phase2c-socket-fixed.log | SO_BROADCAST warning; missing ws dependency |
| phase2c-ws-installed.log | Missing native UWeb class |

`build/phase2c-audit-probe.patch` applies to source commit 491b6c6 and contains
only temporary instrumentation. Reachability dumps and the `.path` capture
are retained under build/. `phase2c-gc-comparison.txt` records the assertion.

## Final acceptance

The full rebuild compiled **166 wasm objects** and linked. Ordinary Node with
GC active and the restored 8 MiB wasm stack now completes NvidiaLogo map load,
runs the bounded loop, and exits cleanly:

```text
$ npm ci --ignore-scripts --no-audit --no-fund
added 1 package
$ ./link-em.sh
LINK OK: build/ut2004.js + build/ut2004.wasm
$ env -u WASM_SKIP_GC UT2004_BASE="$PWD/data3369/UT2004/System" node build/ut2004.js
Log: Collecting garbage
Log: Purging garbage
Log: Garbage: objects: 21115->20947; refs: 205962
Warning: WASM: setsockopt SO_BROADCAST unsupported (ENOPROTOOPT); continuing without broadcast
Log: Bringing Level NvidiaLogo.myLevel up for play (50) ...
Init: WASM: engine initialized
Init: WASM: bounded loop complete
WASM: clean exit
[harness] exit=0
```

The launcher calls Engine::Tick three times with 1/60 second deltas after Init.
The final object totals differ from the earlier differential experiment because
UWeb now registers its native classes and fields before startup.

Final artifacts:

- `build/logs/phase2c-uweb-linked.log`: first completed full boot, exit 0.
- `build/logs/phase2c-final.log`: final acceptance, command/environment and exit 0.
- `build/logs/phase2c-mount.log`: package-table mode, exit 0.
- `build/logs/phase2c-usage.log`: bad option rejected, exit 2.
- `build/logs/phase2c-full-compile.log`: all 166 compilation units, clean link.
- `build/logs/phase2c-npm-ci.log`: dependency reinstall from lockfile.
- `build/phase2c-validate.py`: executable assertion harness for those runtime
  cases, historical differential comparison, wasm headers and unchanged data.
- `build/phase2c-validation.txt`: all checks pass.
- `build/phase2c-data-before.sha256`: Core.u, Engine.u, Ipdrv.u, UT2004.ini and
  User.ini checksums, unchanged after the final runs.

Re-run validation after linking with `python3 build/phase2c-validate.py`.
No temporary audit hooks remain in production source. The initial audit patch
is retained as evidence and is not required for acceptance.

## Scope and repository state

Source patches are committed in the nested `src/UT2004_CMAKE` repository on
`wasm-port`. Build/dependency recipes, status/report, and selected build evidence
are committed in the parent `wasm-port` repository. Existing briefs, compile
harness and previous phase reports were preserved unchanged in parent history.
The parent ignores local game data, independently versioned source checkouts,
node_modules and generated build outputs; phase2c evidence is explicitly tracked.
The separate `src/UT2004Patches` checkout was not changed.

Existing nonfatal messages about Editor.TransBuffer and SO_REUSEADDR remain.
Browser rendering, actual multiplayer traffic, native builds and arbitrary maps
were not tested. The synchronous three-tick probe verifies headless engine boot
and GC, not WebSocket/UDP service behavior.

Source commits on `wasm-port`:

- `491b6c6` — refined depth probes and preserved selectable boot data.
- `b1c50b9` — worklist GC fixes host stack exhaustion.
- `32a62ef` — nonfatal Emscripten SO_BROADCAST failure.
- `e10e60e` — UWeb exports and completed acceptance record.
