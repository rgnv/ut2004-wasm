#!/usr/bin/env bash
# Isolated stretch-milestone experiment; never changes the accepted browser target.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
SDK=emscripten/emsdk@sha256:77638e6c215a65f25a704c0c831d5c2463a8c0468a58c6cb82489dbe621dfa05
test "$(git -C "$ROOT/src/gl4es" rev-parse HEAD)" = ec16bedd8819c475326f4f1a3063772c6d986e06
mkdir -p "$ROOT/build/phase3b"
docker run --rm -i --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$ROOT:/work" -w /work "$SDK" bash -s <<'BUILD'
set -euo pipefail
emcc -E -P -x c '-DGL_EXT(name)=' '-DGL_PROC(ext,ret,func,parms)={#ext,#func},' \
  src/UT2004_CMAKE/OpenGLDrv/Inc/OpenGLFuncs.h | sed -e 's/;//g' -e '/^[[:space:]]*$/d' > build/phase3b/gl-requirements.h
emcmake cmake -S src/gl4es -B build/phase3b/gl4es \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo -DNOX11=ON -DNOEGL=ON -DSTATICLIB=ON -DDEFAULT_ES=2
cmake --build build/phase3b/gl4es -j4
emcc web/gl4es-probe.c src/gl4es/lib/libGL.a -Isrc/gl4es/include \
  -Ibuild/phase3b -sFULL_ES2=1 -sGL_ENABLE_GET_PROC_ADDRESS=1 \
  -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=1 -sENVIRONMENT=web -sASSERTIONS=1 \
  -O1 -g2 -o build/phase3b/gl4es-probe.js
cp web/gl4es-probe.html build/phase3b/
BUILD
