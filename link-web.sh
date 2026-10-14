#!/usr/bin/env bash
# Browser client: main-thread SDL3, async HTTP ranges, GL4ES renderer.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$ROOT/build/logs" "$ROOT/build/web"
# Pin the phase-1 SDK (Emscripten 6.0.12).
SDK=emscripten/emsdk@sha256:77638e6c215a65f25a704c0c831d5c2463a8c0468a58c6cb82489dbe621dfa05
docker run --rm -i --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$ROOT:/work" -w /work/src/UT2004_CMAKE "$SDK" bash -s \
  >"$ROOT/build/logs/link-web.log" 2>&1 <<'BUILD' || { tail -80 "$ROOT/build/logs/link-web.log"; exit 1; }
set -euo pipefail
DEFS="-DUT2004_WEB_CLIENT=1 -DNDEBUG -DNO_KARMA=1 -DSTUB_KARMA_FUNCS -DASM=0 -DASM3DNOW=0 -DDO_CHECK=0 -DDO_CHECK_SLOW=0 -DDO_GUARD=0 -DDO_GUARD_SLOW=0 -DDO_STAT=0 -DDO_STAT_SLOW=0 -DDO_CLOCK=0 -DDO_CLOCK_SLOW=0 -DFORCE_EXTREME_PACKING=0 -DWINDOWS_IGNORE_PACKING_MISMATCH=1 -DRESTRICTEXPORT=0 -DNO_SSE_SUPPORT=1"
INCS="-ICore/Inc -IEngine/Inc -IIpDrv/Inc -IUWeb/Inc -IOnslaught/Inc -Izlib -ISDL/include -ISDLDrv/Inc -IOpenGLDrv/Inc -IXInterface/Inc -IXGame/Inc -IFire/Inc -IALAudio/Inc -IOpenAL/Inc -IVorbis/vorbis/include -IVorbis/ogg/include -I."
emcmake cmake -S SDL -B /work/build/web-sdl -DCMAKE_BUILD_TYPE=Release -DSDL_SHARED=OFF -DSDL_STATIC=ON -DSDL_TEST_LIBRARY=OFF -DSDL_TESTS=OFF
cmake --build /work/build/web-sdl -j4
emcmake cmake -S /work/src/gl4es -B /work/build/web-gl4es -DCMAKE_BUILD_TYPE=Release -DNOX11=ON -DNOEGL=ON -DSTATICLIB=ON -DDEFAULT_ES=2
cmake --build /work/build/web-gl4es -j4
OBJ=/work/build/web-obj/obj
STAMP=/work/build/web-obj/headers.stamp
mkdir -p "$OBJ"/{core,engine,ipdrv,uweb,onslaught,launch,zlib,sdl_drv,opengl_drv,xinterface,xgame,fire,vorbis,alaudio}
rebuild=0
if [[ ! -f "$STAMP" || /work/link-web.sh -nt "$STAMP" ]]; then
  rebuild=1
elif [[ -n $(find Core Engine IpDrv UWeb Onslaught Launch zlib SDLDrv OpenGLDrv XInterface XGame Fire ALAudio OpenAL Vorbis -name '*.h' -newer "$STAMP" -print -quit) ]]; then
  rebuild=1
fi
objects=()
compile() {
  local src=$1 mod=$2 pkg=$3 obj="$OBJ/$2/$(basename "${1%.*}").o"
  if [[ $rebuild == 1 || ! -f "$obj" || "$src" -nt "$obj" ]]; then
    if [[ $mod == zlib ]]; then
      emcc -O1 -DZ_HAVE_UNISTD_H -Izlib -c "$src" -o "$obj"
    elif [[ $mod == vorbis ]]; then
      emcc -O2 -w -IVorbis/ogg/include -IVorbis/vorbis/include -IVorbis/vorbis/lib -c "$src" -o "$obj"
    else
      em++ -std=gnu++03 -w -fexceptions $DEFS -DGPackage=$pkg $INCS -c "$src" -o "$obj"
    fi
    echo "ok $src"
  fi
  objects+=("$obj")
}
for file in Core.cpp UExporter.cpp UFactory.cpp UnAnsi.cpp UnArc.cpp UnBits.cpp UnCache.cpp UnClass.cpp UnCoreNative.cpp UnCoreNet.cpp UnCorSc.cpp UnGUID.cpp UnLinker.cpp UnMath.cpp UnMem.cpp UnMisc.cpp UnName.cpp UnObj.cpp UnProp.cpp UnUnix.cpp; do
  compile "Core/Src/$file" core Core
done
for file in AFileLog.cpp AGameStats.cpp ASceneSubtitles.cpp AxEmitter.cpp AxPickupBase.cpp AxProcMesh.cpp AxWeatherEffect.cpp Engine.cpp LIPSincSupport.cpp NullDrv.cpp UExportCacheCommandlet.cpp ULodMesh.cpp UnActCol.cpp UnActor.cpp UnAudio.cpp UnBeamEmitter.cpp UnBunch.cpp UnCacheManager.cpp UnCamera.cpp UnCameraEffects.cpp UnCamMgr.cpp UnCanvas.cpp UnCDKey.cpp UnChan.cpp UnConn.cpp UnController.cpp UnConvexVolume.cpp UnDemoPenLev.cpp UnDemoRec.cpp UnDownload.cpp UnEngine.cpp UnErrorChecking.cpp UnFluidSurface.cpp UnFont.cpp UnFPoly.cpp UnGame.cpp UnGameUtilities.cpp UnIn.cpp UnInteraction.cpp UnInteractionMaster.cpp UnkDOP.cpp UnLevAct.cpp UnLevel.cpp UnLevTic.cpp UnLodMesh.cpp UnManifest.cpp UnMaterial.cpp UnMatineeTools.cpp UnMesh.cpp UnMeshEmitter.cpp UnModel.cpp UnModelLight.cpp UnMover.cpp UnNavigationPoint.cpp UnNetDrv.cpp UnOctree.cpp UnPackageCheckInfo.cpp UnParams.cpp UnParticleEmitter.cpp UnParticleSystem.cpp UnPath.cpp UnPawn.cpp UnPenLev.cpp UnPhysic.cpp UnPlayer.cpp UnPlayInfo.cpp UnPrim.cpp UnProjector.cpp UnReach.cpp UnRebuildTools.cpp UnRenderBatch.cpp UnRenderBSP.cpp UnRender.cpp UnRenderEditorActor.cpp UnRenderLight.cpp UnRenderPool.cpp UnRenderResource.cpp UnRenderStaticMesh.cpp UnRenderUtil.cpp UnRenderVisibility.cpp UnRoute.cpp UnSceneManager.cpp UnScript.cpp UnScriptedTexture.cpp UnSecurity.cpp UnShadowProjector.cpp UnSkeletalMeshCollision.cpp UnSkeletalMesh.cpp UnSkeletalTools.cpp UnSparkEmitter.cpp UnSpriteEmitter.cpp UnStatGraph.cpp UnStaticMeshBuild.cpp UnStaticMeshCollision.cpp UnStaticMesh.cpp UnStats.cpp UnSVehicle.cpp UnTerrain.cpp UnTerrainTools.cpp UnTex.cpp UnTrace.cpp UnTrailEmitter.cpp UnURL.cpp UnVehicle.cpp UnVertMesh.cpp UnVoiceChat.cpp UnVolume.cpp USpline.cpp UStreamInterface.cpp xDataObject.cpp xParticleMgr.cpp KConstraint.cpp KScript.cpp KPhysic.cpp KSkeletal.cpp xForceFeedback.cpp; do
  compile "Engine/Src/$file" engine Engine
done
for file in IpDrv.cpp UnSocket.cpp InternetLink.cpp UdpLink.cpp TcpLink.cpp MasterServerClient.cpp UnIpDrvNative.cpp TcpNetDriver.cpp MasterServerUplink.cpp HTTPDownload.cpp UCompressCommandlet.cpp; do
  compile "IpDrv/Src/$file" ipdrv IpDrv
done
for file in UWeb.cpp UWebNative.cpp WebServer.cpp; do
  compile "UWeb/Src/$file" uweb UWeb
done
for file in Onslaught.cpp ONSVehicle.cpp ONSWeapon.cpp ONSWheeledCraft.cpp ONSPlaneCraft.cpp ONSHoverCraft.cpp ONSChopperCraft.cpp ONSTreadCraft.cpp; do
  compile "Onslaught/Src/$file" onslaught Onslaught
done
# Match the bundled zlib headers exactly and avoid fetching SDK ports.
for src in zlib/*.c; do compile "$src" zlib Zlib; done
for src in SDLDrv/Src/*.cpp; do compile "$src" sdl_drv SDLDrv; done
for src in OpenGLDrv/Src/*.cpp; do compile "$src" opengl_drv OpenGLDrv; done
for src in XGame/Src/*.cpp; do compile "$src" xgame XGame; done
for src in XInterface/Src/*.cpp; do compile "$src" xinterface XInterface; done
for src in Fire/Src/*.cpp; do compile "$src" fire Fire; done
for file in bitwise.c framing.c; do compile "Vorbis/ogg/src/$file" vorbis Vorbis; done
for file in mdct.c smallft.c block.c envelope.c window.c lsp.c lpc.c analysis.c synthesis.c psy.c info.c floor1.c floor0.c res0.c mapping0.c registry.c codebook.c sharedbook.c lookup.c bitrate.c vorbisfile.c; do
  compile "Vorbis/vorbis/lib/$file" vorbis Vorbis
done
for src in ALAudio/Src/*.cpp; do compile "$src" alaudio ALAudio; done
compile Launch/Src/LaunchEmscripten.cpp launch Launch
python3 Launch/Src/wasm-registry.py "$OBJ" /work/build/web-obj/WasmRegistry.cpp SDLDrv:sdl_drv OpenGLDrv:opengl_drv XGame XInterface Fire ALAudio:alaudio Onslaught
compile /work/build/web-obj/WasmRegistry.cpp launch Launch
em++ "${objects[@]}" /work/build/web-sdl/libSDL3.a /work/src/gl4es/lib/libGL.a -lopenal \
  -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1 \
  -sASYNCIFY=1 -sASYNCIFY_IMPORTS=wasi_snapshot_preview1.fd_read -sASYNCIFY_STACK_SIZE=1048576 -sGL_ENABLE_GET_PROC_ADDRESS=1 -sFULL_ES2=1 -sENVIRONMENT=web --pre-js /work/web/pre.js --js-library /work/web/http-library.js -sASSERTIONS=1 -fexceptions -sNO_DISABLE_EXCEPTION_CATCHING=1 -sSTACK_SIZE=8388608 -Wl,--allow-multiple-definition -Wl,--error-limit=0 -O1 -g2 \
  -o /work/build/web/ut2004.js
touch "$STAMP"
BUILD
# Caddy serves these sidecars without spending CPU compressing each cold load.
brotli -q 11 -f -o "$ROOT/build/web/ut2004.wasm.br" "$ROOT/build/web/ut2004.wasm"
gzip -9 -n -c "$ROOT/build/web/ut2004.wasm" > "$ROOT/build/web/ut2004.wasm.gz"
python3 "$ROOT/scripts/web-manifest.py" --data "${UT2004_DATA:-$ROOT/data3374}"
cp "$ROOT"/web/index.html "$ROOT/build/web/"
mkdir -p "$ROOT/build/assets" "$ROOT/build/web/assets"
cp "$ROOT"/web/mobile/mobile-input.{js,css} "$ROOT/build/assets/"
cp "$ROOT"/web/mobile/mobile-input.{js,css} "$ROOT/build/web/assets/"
printf 'LINK OK: build/web/ut2004.js + build/web/ut2004.wasm\n'
