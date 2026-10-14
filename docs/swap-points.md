# Wasm port — subsystem swap points (REA evidence)

Derived 2026-10-14 from REA (rea-agents 6.4.0) + Ghidra 12.1.4 headless, and
the pwntools ELF layouts in `evidence/`.

## Method (reproducible)

```
# module overviews
npx rea-agents analyze /opt/ut2004/System/<module>.so --provider ghidra --json
# full ELF layout incl. every symbol (imports + defines)
REA_PWNTOOLS_PYTHON=/opt/rea-pwntools-venv/bin/python \
  npx rea-agents inspect-binary-layout /opt/ut2004/System/<module>.so --json
# one complete function (pseudocode + callers/callees + strings + value flow)
npx rea-agents function /opt/ut2004/System/IpDrv.so <ghidra-addr> --provider ghidra --json
```
Ghidra maps the ELFs at base 0x100000: Ghidra address = linked VA + 0x100000
(e.g. `FUdpLink::SendTo` VA 0x434a0 -> Ghidra 0x1434a0).

## Swap map

| module | role | REA evidence | wasm-side replacement | status |
|---|---|---|---|---|
| UT2004 (launcher) | SDLLaunch bootstrap, dlopen order | evidence/launcher.json | same flow under emscripten main() | mapped |
| **IpDrv.so** | **netcode: sockets + net driver + master server** | evidence/layout-IpDrv.json (2451 syms), evidence/f-udplink-sendto.json, evidence/f-udplink-poll.json | **emscripten SOCKFS websocket transport** — identical swap shape to the live rtcw/q3 ports | **PROVEN SHAPE** |
| SDLDrv.so | platform layer (SDL3, 115 SDL_* symbols: display/input/joystick/clipboard) | evidence/layout-SDLDrv.json | emscripten SDL3 (SDL3 has an official emscripten backend) | mapped |
| OpenGLDrv.so | render device (context via `SDL_GL_*`, GL entry via `SDL_GL_GetProcAddress`) | evidence/layout-OpenGLDrv.json | GL4ES/WebGL2 (proc-address indirection is the standard GL4ES hook) | mapped |
| Core.so | runtime (objects, VM host, FOutputDevice...) | evidence/layout-Core.json | compiler-agnostic; keep | low risk |
| Engine.so | engine core (31,826 symbols) | evidence/layout-Engine.json | keep; Ghidra overview deferred (provider budget) | partial |
| ALAudio / AntiDrv / UTV2004 | audio / anticheat / spectator TV | evidence/*.json | openal-soft (emscripten; WC3-port precedent) / likely stub / optional | later |

## Netcode deep-dive (the decisive evidence)

`FUdpLink::SendTo(FIpAddr, uchar*, int)` — evidence f-udplink-sendto.json:

```c
uVar2 = sendto(*(int *)(this + 0x20), param_3, (long)param_4, 0, &local_38, 0x10);
if ((int)uVar2 < 0) { ... FOutputDevice::Logf(GWarn, L"SendTo: %s returned %d: %d", ...); }
```

`FUdpLink::Poll()` — evidence f-udplink-poll.json:

```c
do {
  sVar3 = recvfrom(fd, buf, 0x1000, 0, &sockaddr, &socklen);
  ... EWOULDBLOCK/EAGAIN handling, "RecvFrom returned SOCKET_ERROR %d" ...
} while (...);
```

Socket surface imported (layout-IpDrv linkage): `socket, bind, connect, send,
sendto, recv, recvfrom, getsockname, getaddrinfo, gethostname, poll, inet_pton`.

Why this is the money shot: emscripten's SOCKFS websocket transport intercepts
**exactly** `socket/sendto/recvfrom/poll` — and this precise interception is
already running in production twice over (`wss://games.rgnv.dev/rtcw/connect2`
and `/q3/connect2`), where iortcw's and ioquake3's engines use the same BSD
socket calls. A compiled-for-wasm IpDrv with `Module.websocket.url` set would
speak to the existing relay unchanged.

Other netcode classes inventoried (defined in IpDrv): `UTcpNetDriver`
(InitListen/InitConnect/TickDispatch/GetSocketData), `FUdpLink`, `FTcpLink`,
`AMasterServerUplinkLink` (UDP heartbeats/challenges), `AMasterServerClient`,
`FServerLANInterface`, `InitSockets` (module init).

## Engine.so provider-budget boundary (recorded)

REA's provider caps every operation at a fixed 330000 ms; on Engine.so (10 MB,
~31k symbols) any enumeration/function op exceeds it (evidence/
engine-provider-budget-note.json; `open_binary` itself is instant once the
import is cached). Workaround in flight: an unbounded local Ghidra headless
pass (analyzeHeadless, 12G heap, analysisTimeoutPerFile=3h) exporting function
count + decompiled net/netdriver functions into evidence/ eng-*.c.

## Next obligations

1. Engine.so overview retry (unbounded-budget pass) + function-level pass on
   `UNetDriver::TickDispatch` (defined in Engine, currently blocked by import
   budget on the 10MB module).
2. Reconstruction obligation ledger (REA) for: IpDrv (net swallow points),
   SDLDrv (SDL3 call set), OpenGLDrv (GL feature set used).
3. Source-availability decision document (see toolchain-and-method.md).

## Engine.so analysis complete (unbounded local pass)

The local Ghidra headless pass finished: **13,953 functions** decompilable in
Engine.so (symbol table = 31,826 entries; functions fewer). The net entry
points in Engine are **dispatch thunks** — e.g.:

```c
void UNetDriver::TickDispatch(UNetDriver *this,float dt) {
  (*(code *)PTR_TickDispatch_0099f9b8)();   // pointer slot, resolved at load
}
```

with the real overrides living in IpDrv (`UTcpNetDriver::TickDispatch` 0x5dd80,
`GetSocketData` 0x5efe0 -> FUdpLink). Port implication: the ws-transport patch
point is IpDrv's socket layer (already decompiled: evidence/f-udplink-*.json),
not Engine. 21 decompiled functions archived as evidence/eng-*.c.
(Export note: Ghidra 12 headless needs Java or PyGhidra for post-scripts —
ExportEvidence.py fails under plain analyzeHeadless; use the .java twin.)
