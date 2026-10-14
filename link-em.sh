#!/usr/bin/env bash
# Standalone headless Node build. No SDL/OpenGL, Windows launcher, or external zlib port.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$ROOT/build/logs"
# Pin the phase-1 SDK (Emscripten 6.0.12).
SDK=emscripten/emsdk@sha256:77638e6c215a65f25a704c0c831d5c2463a8c0468a58c6cb82489dbe621dfa05
docker run --rm -i --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$ROOT:/work" -w /work/src/UT2004_CMAKE "$SDK" bash -s \
  >"$ROOT/build/logs/link.log" 2>&1 <<'BUILD' || { tail -80 "$ROOT/build/logs/link.log"; exit 1; }
set -euo pipefail
DEFS="-DNDEBUG -DNO_KARMA=1 -DSTUB_KARMA_FUNCS -DASM=0 -DASM3DNOW=0 -DDO_CHECK=0 -DDO_CHECK_SLOW=0 -DDO_GUARD=0 -DDO_GUARD_SLOW=0 -DDO_STAT=0 -DDO_STAT_SLOW=0 -DDO_CLOCK=0 -DDO_CLOCK_SLOW=0 -DFORCE_EXTREME_PACKING=0 -DWINDOWS_IGNORE_PACKING_MISMATCH=1 -DRESTRICTEXPORT=0 -DNO_SSE_SUPPORT=1"
INCS="-ICore/Inc -IEngine/Inc -IIpDrv/Inc -IUWeb/Inc -IOnslaught/Inc -IFire/Inc -IXGame/Inc -IXInterface/Inc -Izlib -I."
OBJ=/work/build/wasm/obj
STAMP=/work/build/wasm/headers.stamp
mkdir -p "$OBJ"/{core,engine,ipdrv,uweb,onslaught,fire,xgame,xinterface,launch,zlib}
rebuild=0
if [[ ! -f "$STAMP" ]]; then
  rebuild=1
elif [[ -n $(find Core Engine IpDrv UWeb Onslaught Fire XGame XInterface Launch zlib -name '*.h' -newer "$STAMP" -print -quit) ]]; then
  rebuild=1
fi
objects=()
compile() {
  local src=$1 mod=$2 pkg=$3 obj="$OBJ/$2/$(basename "${1%.*}").o"
  if [[ $rebuild == 1 || ! -f "$obj" || "$src" -nt "$obj" ]]; then
    if [[ $mod == zlib ]]; then
      emcc -O1 -DZ_HAVE_UNISTD_H -Izlib -c "$src" -o "$obj"
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
for src in Fire/Src/*.cpp; do compile "$src" fire Fire; done
for src in XGame/Src/*.cpp; do compile "$src" xgame XGame; done
for src in XInterface/Src/*.cpp; do compile "$src" xinterface XInterface; done
# Match the bundled zlib headers exactly and avoid fetching SDK ports.
for src in zlib/*.c; do compile "$src" zlib Zlib; done
compile Launch/Src/LaunchEmscripten.cpp launch Launch
python3 Launch/Src/wasm-registry.py "$OBJ" /work/build/wasm/WasmRegistry.cpp Fire XGame XInterface Onslaught
compile /work/build/wasm/WasmRegistry.cpp launch Launch
em++ "${objects[@]}" \
  -sALLOW_MEMORY_GROWTH=1 -sNODERAWFS=1 -sEXIT_RUNTIME=1 \
  -sENVIRONMENT=node -sASSERTIONS=1 -fexceptions -sNO_DISABLE_EXCEPTION_CATCHING=1 -sSTACK_SIZE=8388608 -Wl,--allow-multiple-definition -Wl,--error-limit=0 -O1 -g2 \
  -o /work/build/ut2004.js
touch "$STAMP"
BUILD
printf 'LINK OK: build/ut2004.js + build/ut2004.wasm\n'
