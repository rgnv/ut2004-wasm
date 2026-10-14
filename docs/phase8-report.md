# Phase 8 — map selection, rotation and shared administration

Evidence is in `build/phase8/`. The browser shell lists all 242 `Maps/*.ut2`
entries from the live manifest, grouped by prefix and sorted. `?map=` validates
against that manifest, selects local play with two bots, and persists the
selection. The default portal join ignores the saved local map and keeps using
its existing 3369 relay. The multiplayer form also leaves local mode.

## Engine changes

The real Fire module from phase 7b remains linked. No further native module has
been needed in the representative sweep. A separate rendering failure appeared
on ARM chi1: BSP coplanar recursion exceeded the browser host stack while
precaching Rankin. The original exception was `RangeError: Maximum call stack
size exceeded` in `ProcessNode`; teardown obscured it with
`RuntimeError: memory access out of bounds`. The wasm branch now walks the same
coplanar chain with a loop. Visibility, rendering order, lights and projectors
are unchanged; native-platform recursion is untouched. The failing diagnostic
and passing interactive keyboard/mouse regression are retained.

The web launcher sends `adminlogin ut2004` through the existing viewport console
dispatcher once a replicated network player exists, including before spawn.
It only runs for `Module.connect` with the exact
`wss://games.rgnv.dev/ut2004b/connect2` relay. It logs grant or timeout once and
never waits for authentication to continue gameplay. Replicated admin state is
included in the existing browser player-state evidence. Native and Node launch
paths and the `/opt` 3374 server remain outside this change.

## Server administration prerequisite

This 3369 `GameInfo.InitGame` only calls `AccessControl.SetAdminFromURL` when
both `AdminName` and `AdminPassword` are supplied. The requested password flag
alone was ignored: both automatic login and a manual post-spawn `adminlogin`
failed. The unit therefore also supplies generic `AdminName=Admin`. The next
server start logged `SetAdminFromURL called`. No client timing workaround was
needed. The failed automatic/manual tests are retained as evidence.

## Voting conflict in the brief

The stated premise that built-in defaults enable all modes is false for the
shipped 3369 packages. An isolated native server using the same packages and
starting configuration returned:

```
get xVoting.xVotingHandler bMapVote
False
get xVoting.xVotingHandler GameConfig
<empty>
get xVoting.DefaultMapListLoader MapNamePrefixes
<empty>
```

`GameInfo` only spawns the handler when its `IsEnabled()` returns true.
`xVotingHandler.LoadMapList` falls back to the current game type alone when
`GameConfig` is empty. Adding the requested URL handler does not enable voting.
See `voting-probe-engine.log` and `voting-defaults.txt`. The probe used its own
INI, bound loopback on 7897, omitted unrelated server actors, and exited cleanly;
the persistent INI stayed byte-identical. An initial probe hit an unrelated
GameSpy query-port collision; that failed attempt is retained too.

The brief explicitly forbids a custom `[xVoting.xVotingHandler]` section.
`proposed-voting.ini` contains the smallest practical exception: `bMapVote=True`
and the 10 standard game configurations. Applying this exception requires the
user's pending clarification; it has not been applied.

## Verification and limits

`verified-maps.txt` and `verified-maps.json` record 27 passing maps: both DM rotation lists plus
CTF-FaceClassic, CTF-BridgeOfFate and DOM-Suntemple. Per-map tests require the
actual level-play log, spawned pawn, local net mode, a nonblank rendered frame,
zero GL/WebGL errors and clean engine exit. Two tests navigate the real picker.
Screenshots cover Osiris2, Corrugation, FaceClassic and Suntemple. Metallurgy
selects its embedded `xMutantGame`; the two CTF maps select `xCTFGame` and
Suntemple selects `xDoubleDom`. The other
215 manifest entries are outside this representative sweep; accessibility in
the picker is not a universal playability claim.

Node boot, range-cache, websocket transport, resolution shell, map shell,
bounded browser, live display/fullscreen and interactive keyboard/mouse
regressions are recorded. The bounded test preceded the BSP change; the final
interactive regression, Node boot and 27-map sweep use the final engine.
The shell tests cover persistence, query precedence, default-join isolation,
unknown-map rejection and storage denial. Browsers run on chi1. A temporary,
checksum-verified Node runtime runs the map harness beside the browser to avoid
slow CDP image transfers. Two independent browser profiles cover the two map
lists; this is functional verification, not a performance benchmark.

An early launcher attempt constructed `FString` before `appInit`; the live test
caught the uninitialized allocator use. The final startup path uses a fixed
character buffer. That failed attempt is preserved, along with the original
BSP failure and a slow transport attempt. The final shell uses `v=phase8-bsp`
to avoid reusing earlier cached wasm.

## Reproduction and deployment

From the wrapper root, run `node scripts/test-map-shell.cjs`,
`node scripts/test-shell.cjs`, `node scripts/test-http-cache.cjs` and
`node scripts/test-ws-transport.cjs`. With a browser exposing CDP on `<port>`,
`node scripts/test-map-live.cjs <port> <map> <map> build/phase8` checks a local
map. Use `picker:DM-DE-Osiris2` and `picker:CTF-FaceClassic` as the mode for
real picker navigation, or `admin` and `default` for the multiplayer checks.
The admin harness injects only test key bindings (F8: admin say/unsuppress,
F9: DM travel, K: CTF travel) into its fetched User.ini;
it does not inject the login command or change the deployed configuration.

Final live HTML, JS, wasm and Brotli wasm match build artifacts; hashes are in
`deployed-sha256.txt`. The lab HTML mirror matches too. The running unit matches
the committed unit. Default deathmatch limits remain 20 minutes / 25 frags;
`rotation-defaults.txt` records the restored DM list. The server still starts
on Rankin; it is no longer pinned there. Voting remains disabled for the
explicit conflict above, so this phase is incomplete until that decision.

One multiplayer harness attempt pressed Escape after travel, opening the
server menu and intercepting the next command. Its screenshot and logs are
retained. The harness now closes the initial menu only, leaving post-travel
play focused. Diagnostic attempts are not counted as passing tests.

The final `Phase8Admin` run passed: automatic grant preceded any test admin
command, the screenshot shows `PHASE8ADMIN: ADMINCHECK`, and the server accepted
`ProcessServerTravel: DM-Corrugation` followed by
`ProcessServerTravel: CTF-FaceClassic?game=XGame.xCTFGame`. The same browser
client spawned, rendered and regained admin after both changes, then exited
with code 0. `Phase8Admin-transport.json` records a healthy final relay session.
Server acceptance of the admin-only travel command proves server-side authority;
the client screenshots and replicated `admin:true` prove the return path.

The final `Phase8Default` run used only `?res=640x480&name=Phase8Default`
while localStorage held `DOM-Suntemple`. It connected to the server's current
CTF-FaceClassic, spawned, received automatic admin and exited cleanly. The
server remains active on that verified map with normal match flow.

All four owned chi1 browser units are inactive; their browser processes,
profiles and temporary Node/tools are removed. Both Phase 8 SSH masters are
closed, and no owned mesa browser remains. The native voting probe and local
test HTTP servers exited. `/opt` server PID 4483 is unchanged. UT99 and both
UT2004 relays remain running, with the checked deployment specifications
unchanged. `cleanup.txt` records the checks. The pre-existing untracked
`codex-phase7b-final.txt` handoff was preserved in `build/phase8/`.

Engine commit: `a1a6969` on `wasm-port`; lab commit: `e37652716` on `master`.
The wrapper commit and final clean statuses are in `build/phase8/commits.txt`.
No commits were pushed. No long-duration soak or exhaustive 242-map playability
test was performed. Full game administration for every 3369 web player is
intentional; voting remains the only unresolved requested behavior.


