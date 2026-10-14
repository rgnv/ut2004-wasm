#!/bin/bash
# build-em.sh — emscripten (wasm) build harness for the UT2004 source tree.
# Compiles each module's .cpp list to build/obj/<module>/<name>.o inside the
# emsdk docker image; failures logged per-file to build/logs/.
set -u
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BUILD=$ROOT/build
mkdir -p $BUILD/obj $BUILD/logs

# ---------------------------------------------------------------- definitions
DEFS="-DNDEBUG -DNO_KARMA=1 -DSTUB_KARMA_FUNCS -DASM=0 -DASM3DNOW=0 \
-DDO_CHECK=0 -DDO_CHECK_SLOW=0 -DDO_GUARD=0 -DDO_GUARD_SLOW=0 \
-DDO_STAT=0 -DDO_STAT_SLOW=0 -DDO_CLOCK=0 -DDO_CLOCK_SLOW=0 \
-DFORCE_EXTREME_PACKING=0 -DWINDOWS_IGNORE_PACKING_MISMATCH=1 -DRESTRICTEXPORT=0 -DNO_SSE_SUPPORT=1"
INCS="-ICore/Inc -IEngine/Inc -IIpDrv/Inc -ISDLDrv/Inc -IOpenGLDrv/Inc -ISDL/include -Izlib -I."
CXXFLAGS="-std=gnu++03 -w -c"

# ---------------------------------------------------------------- file lists
CORE_CPP="Core.cpp UExporter.cpp UFactory.cpp UnAnsi.cpp UnArc.cpp UnBits.cpp UnCache.cpp UnClass.cpp UnCoreNative.cpp UnCoreNet.cpp UnCorSc.cpp UnGUID.cpp UnLinker.cpp UnMath.cpp UnMem.cpp UnMisc.cpp UnName.cpp UnObj.cpp UnProp.cpp UnUnix.cpp"
ENGINE_CPP="AFileLog.cpp AGameStats.cpp ASceneSubtitles.cpp AxEmitter.cpp AxPickupBase.cpp AxProcMesh.cpp AxWeatherEffect.cpp Engine.cpp LIPSincSupport.cpp NullDrv.cpp UExportCacheCommandlet.cpp ULodMesh.cpp UnActCol.cpp UnActor.cpp UnAudio.cpp UnBeamEmitter.cpp UnBunch.cpp UnCacheManager.cpp UnCamera.cpp UnCameraEffects.cpp UnCamMgr.cpp UnCanvas.cpp UnCDKey.cpp UnChan.cpp UnConn.cpp UnController.cpp UnConvexVolume.cpp UnDemoPenLev.cpp UnDemoRec.cpp UnDownload.cpp UnEngine.cpp UnErrorChecking.cpp UnFluidSurface.cpp UnFont.cpp UnFPoly.cpp UnGame.cpp UnGameUtilities.cpp UnIn.cpp UnInteraction.cpp UnInteractionMaster.cpp UnkDOP.cpp UnLevAct.cpp UnLevel.cpp UnLevTic.cpp UnLodMesh.cpp UnManifest.cpp UnMaterial.cpp UnMatineeTools.cpp UnMesh.cpp UnMeshEmitter.cpp UnModel.cpp UnModelLight.cpp UnMover.cpp UnNavigationPoint.cpp UnNetDrv.cpp UnOctree.cpp UnPackageCheckInfo.cpp UnParams.cpp UnParticleEmitter.cpp UnParticleSystem.cpp UnPath.cpp UnPawn.cpp UnPenLev.cpp UnPhysic.cpp UnPlayer.cpp UnPlayInfo.cpp UnPrim.cpp UnProjector.cpp UnReach.cpp UnRebuildTools.cpp UnRenderBatch.cpp UnRenderBSP.cpp UnRender.cpp UnRenderEditorActor.cpp UnRenderLight.cpp UnRenderPool.cpp UnRenderResource.cpp UnRenderStaticMesh.cpp UnRenderUtil.cpp UnRenderVisibility.cpp UnRoute.cpp UnSceneManager.cpp UnScript.cpp UnScriptedTexture.cpp UnSecurity.cpp UnShadowProjector.cpp UnSkeletalMeshCollision.cpp UnSkeletalMesh.cpp UnSkeletalTools.cpp UnSparkEmitter.cpp UnSpriteEmitter.cpp UnStatGraph.cpp UnStaticMeshBuild.cpp UnStaticMeshCollision.cpp UnStaticMesh.cpp UnStats.cpp UnSVehicle.cpp UnTerrain.cpp UnTerrainTools.cpp UnTex.cpp UnTrace.cpp UnTrailEmitter.cpp UnURL.cpp UnVehicle.cpp UnVertMesh.cpp UnVoiceChat.cpp UnVolume.cpp USpline.cpp UStreamInterface.cpp xDataObject.cpp xParticleMgr.cpp"
IPDRV_CPP="IpDrv.cpp UnSocket.cpp InternetLink.cpp UdpLink.cpp TcpLink.cpp MasterServerClient.cpp UnIpDrvNative.cpp"
SDLDRV_CPP="SDLDrv.cpp SDLClient.cpp SDLViewport.cpp"
GLDRV_CPP="OpenGLDrv.cpp OpenGLMaterialState.cpp OpenGLRenderDevice.cpp OpenGLRenderInterface.cpp OpenGLResource.cpp"
LAUNCH_CPP="Launch.cpp Helper.cpp"

WANT="${*:-core engine ipdrv sdldrv gldrv launch}"

# ---------------------------------------------------------------- inner script
INNER=$BUILD/em-build-inner.sh
{
echo '#!/bin/bash'
echo 'set -u'
for mod in $WANT; do
  case $mod in
    core)   dir="Core/Src";      files="$CORE_CPP";   gpkg="Core";;
    engine) dir="Engine/Src";    files="$ENGINE_CPP"; gpkg="Engine";;
    ipdrv)  dir="IpDrv/Src";     files="$IPDRV_CPP";  gpkg="IpDrv";;
    sdldrv) dir="SDLDrv/Src";    files="$SDLDRV_CPP"; gpkg="SDLDrv";;
    gldrv)  dir="OpenGLDrv/Src"; files="$GLDRV_CPP";  gpkg="OpenGLDrv";;
    launch) dir="Launch/Src";    files="$LAUNCH_CPP"; gpkg="Launch";;
    *) echo "unknown module $mod"; exit 1;;
  esac
  echo "mkdir -p /work/build/obj/$mod"
  for f in $files; do
    b="${f%.cpp}"
    echo "if [ ! -f /work/build/obj/$mod/$b.o ] || [ $dir/$f -nt /work/build/obj/$mod/$b.o ]; then"
    echo "  if em++ $CXXFLAGS $DEFS -DGPackage=$gpkg $INCS $dir/$f -o /work/build/obj/$mod/$b.o >/work/build/logs/$mod-$b.log 2>&1; then"
    echo "    echo \"ok $mod/$f\""
    echo "  else"
    echo "    echo \"FAIL $mod/$f\""
    echo "  fi"
    echo "fi"
  done
done
echo "echo '=== build-em done ==='"
} > $INNER
chmod +x $INNER

docker run --rm --user 10000:10000 -e HOME=/tmp \
  -v $ROOT:/work -w /work/src/UT2004_CMAKE \
  emscripten/emsdk:latest bash -lc "/work/build/em-build-inner.sh"
