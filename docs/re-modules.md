# UT2004 binary RE — module evidence (REA + Ghidra 12.1.4)

First evidence pass, 2026-10-13. Command per module:

    GHIDRA_INSTALL_DIR=/opt/ghidra_12.1.4_PUBLIC \
    JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
    npx -y rea-agents@latest analyze /opt/ut2004/System/<module> --provider ghidra --json

Outputs (evidence/): rea.analysis `binary_overview` records — subject sha256,
segment maps, analysis-profile digests. Each record's evidence_id is stable.

| module      | sha256 (16)        | segs | role in a wasm+websocket port |
|-------------|--------------------|------|-------------------------------|
| UT2004      | 209ce0bb24f22614   | 33   | launcher (SDL3 bootstrap, dlopen order) |
| SDLDrv.so   | 78ce7edddb59c847   | 31   | platform layer (SDL3) — swaps to emscripten SDL |
| IpDrv.so    | 133137883f1f6e57   | 31   | networking (UDP master/socket layer) — swaps to the websocket transport |
| OpenGLDrv.so| 38395684db081f8b   | 31   | renderer — swaps to GL4ES/WebGL (Wwasm/Qwasm2 precedent) |
| Core.so     | c1dd211b6a153848   | 32   | runtime core (objects, UnrealScript VM host) |
| ALAudio.so  | f834db7dff206bce   | 31   | audio — openal-soft (emscripten build exists) |
| AntiDrv.so  | b2cfe7e9bb68135c   | 31   | anticheat (server-side; likely stubbed/absent in a port) |
| UTV2004.so  | 90dc41892f98def4   | 31   | TV/spectator (optional) |
| Engine.so   | (retry running — 10MB binary exceeded the 5-min provider budget on first pass) |

Build provenance (from binary strings, 2026-10-13): built by `stijn` from
`/home/stijn/ut2004` (Core/Inc headers + SDLLaunch/Src visible), clang 18.1.8,
matches OldUnreal v3374 label `UT2004_v3374_[2026-07-18_18.42]_d1b145e1`.

Next steps (evidence-driven):
1. Engine.so overview (retry) + targeted function work on:
   - `IpDrv` socket layer (find the UDP send/recv entry points a websocket
     replacement must satisfy),
   - `SDLDrv` init path (module load + display/audio bring-up order),
   - launcher dlopen order (defines the minimal module set for a headless/web
     boot).
2. Produce the REA "reconstruction obligation ledger" for the swap-point set.
3. Pair with the websocket relay component (already validated end-to-end by the
   rtcw port) to define the exact netcode boundary UT2004's port will reuse.

Note: REA's pwntools ELF-layout provider is configured at
/opt/rea-pwntools-venv (REA_PWNTOOLS_PYTHON); Ghidra headless is the deep
analysis provider.
