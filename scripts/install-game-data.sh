#!/usr/bin/env bash
# install-game-data.sh — provision UT2004 game data for the wasm port (3374 era).
#
# Route: Epic-approved OldUnreal distribution only. We download from OldUnreal's
# own approved URLs, we never re-host or redistribute game content.
#
#   * ISO     — the Epic-approved full-game image listed by OldUnreal's own
#               installer (Windows/UT2004.nsi in OldUnreal/FullGameInstallers).
#   * Patch   — the pinned community Linux patch release from
#               OldUnreal/UT2004Patches (same source their installer uses).
#
# The ISO root's CD `System` directory is deliberately NOT copied. The verified
# InstallShield component supplies the base packages/support files; the pinned
# patch is then overlaid, with its filename casing and bytes taking precedence.
#
# Usage:
#   scripts/install-game-data.sh [options]
#
#   --dest DIR     install tree (default: ./data3374)
#   --cache DIR    download/extract cache (default: ${XDG_CACHE_HOME:-~/.cache}/ut2004-game-data)
#   --iso PATH     use an already-downloaded ISO instead of fetching one
#   --keep-iso     keep the ISO in the cache after a successful install
#   --force        redo extraction steps (verified downloads are reused)
#   --dry-run      print every action without touching the network or disk
#   -h, --help     this text
#
# Content © Epic Games, Inc. Personal, non-commercial use only.
set -euo pipefail

readonly ISO_URLS=(
  "https://files.oldunreal.net/UT2004.ISO"
  "https://files2.oldunreal.net/UT2004.ISO"
  "https://files3.oldunreal.net/UT2004.ISO"
)
readonly ISO_SIZE=2995322880
# Verified against the Epic-approved primary download in PHASE-12-BRIEF.md.
readonly ISO_SHA256=43e9182ae20bcbc0f6f4588fee6c1b336c261f1465403118a1973b09b1a22541

readonly PATCH_REPO="OldUnreal/UT2004Patches"
readonly PATCH_TAG="3374-preview-23"
readonly PATCH_ASSET="OldUnreal-UT2004Patch3374-Linux-094b94dc.tar.bz2"
readonly PATCH_SIZE=59562107
# SHA-256 of the pinned preview-23 GitHub release asset, not a moving latest URL.
readonly PATCH_SHA256=179ea43c8831bff147005850cd373c0ec2b70dcf6f841c2109c1525ef11ad4d3

DEST="./data3374"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/ut2004-game-data"
ISO_LOCAL=""
KEEP_ISO=0
FORCE=0
DRY=0

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '[%s] warning: %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die()  { printf '[%s] error: %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }
run()  { if (( DRY )); then printf '  + %s\n' "$*"; else "$@"; fi; }

usage() {
  local line
  while IFS= read -r line; do
    [[ "$line" == '#!'* ]] && continue
    [[ "$line" == '#'* ]] || break
    line="${line#\#}"
    printf '%s\n' "${line# }"
  done <"${BASH_SOURCE[0]}"
}

while (( $# )); do
  case "$1" in
    --dest)  DEST="${2:?}"; shift 2 ;;
    --cache) CACHE="${2:?}"; shift 2 ;;
    --iso)   ISO_LOCAL="${2:?}"; shift 2 ;;
    --keep-iso) KEEP_ISO=1; shift ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done

(( EUID == 0 )) && die "refusing to run as root: this script writes only into --dest and --cache"

need() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1${2:+ ($2)}"; }
need curl   "Debian/Ubuntu: apt-get install curl"
need 7z     "Debian/Ubuntu: apt-get install p7zip-full"
need unshield "Debian/Ubuntu: apt-get install unshield"
need sha256sum "coreutils"
need tar    "coreutils/tar"
need bzip2  "Debian/Ubuntu: apt-get install bzip2"

DEST=$(readlink -m "$DEST")
CACHE=$(readlink -m "$CACHE")
for directory in "$DEST" "$CACHE"; do
  case "$directory" in
    /|/bin|/bin/*|/sbin|/sbin/*|/etc|/etc/*|/usr|/usr/*|/lib|/lib/*|/lib64|/lib64/*|/boot|/boot/*|/dev|/dev/*|/proc|/proc/*|/sys|/sys/*|/run|/run/*|/opt|/opt/*)
      die "refusing system directory: $directory" ;;
  esac
  ancestor="$directory"
  while [[ ! -e "$ancestor" ]]; do ancestor=$(dirname "$ancestor"); done
  [[ -O "$ancestor" || "$directory" == /tmp/* || "$directory" == /var/tmp/* ]] \
    || die "destination/cache must be in a user-owned tree: $directory"
done
ISO="$CACHE/UT2004.ISO"
CABS="$CACHE/cabs"
RAW="$CACHE/unshield"

log "dest:  $DEST"
log "cache: $CACHE"
(( DRY )) && log "dry run: nothing will be downloaded or written"

run mkdir -p "$CACHE"
# --------------------------------------------------------------------- 1. ISO
fetch_iso() {
  if [[ -n "$ISO_LOCAL" ]]; then
    log "using local ISO: $ISO_LOCAL"
    ISO="$ISO_LOCAL"
  elif [[ -f "$ISO" ]] && [[ $(stat -c '%s' "$ISO") == "$ISO_SIZE" ]]; then
    log "reusing complete cached ISO: $ISO"
  else
    for url in "${ISO_URLS[@]}"; do
      log "downloading ISO (resumable) from $url"
      if (( DRY )); then
        printf '  + curl -L -C - --fail --retry 3 -o %s %s (curl meter includes ETA)\n' "$ISO" "$url"
        return 0
      fi
      if curl -L -C - --fail --retry 3 --retry-delay 5 -o "$ISO" "$url"; then
        break
      fi
      warn "mirror failed: $url"
    done
    [[ -f "$ISO" && $(stat -c '%s' "$ISO") == "$ISO_SIZE" ]] || die "ISO download incomplete; re-run to resume from the cached bytes"
  fi

  if (( DRY )); then
    log "dry run: skipping ISO size/sha256 verification"
    return 0
  fi
  local actual
  actual=$(stat -c '%s' "$ISO")
  (( actual == ISO_SIZE )) || die "ISO size mismatch: $actual != $ISO_SIZE bytes (truncated download? re-run to resume)"
  log "verifying ISO sha256 (${ISO_SIZE} bytes; takes ~30s)"
  echo "$ISO_SHA256  $ISO" | sha256sum -c - >/dev/null || die "ISO sha256 mismatch"
  log "ISO verified: sha256 $ISO_SHA256"
}

# ------------------------------------------------------------------- 2. cabs
extract_cabs() {
  if [[ -f "$CACHE/cabs.complete" && "$FORCE" == 0 ]]; then
    log "reusing extracted cab set: $CABS"
    return 0
  fi
  log "extracting InstallShield cab set from the ISO (7z)"
  run mkdir -p "$CABS"
  if (( DRY )); then
    run 7z e -aoa -y "-o$CABS" -ir'!*.cab' -ir'!*.hdr' "$ISO"
  else
    mkdir -p "$CACHE"
    rm -f "$CACHE/cabs.complete"
    7z e -aoa -y "-o$CABS" -ir'!*.cab' -ir'!*.hdr' "$ISO" >"$CACHE/7z.log"
  fi
  if ! (( DRY )); then
    [[ -f "$CABS/data1.cab" ]] || die "7z did not produce data1.cab"
    [[ -f "$CABS/engine32.cab" ]] || warn "engine32.cab missing (optional)"
    touch "$CACHE/cabs.complete"
  fi
}

# ---------------------------------------------------------------- 3. unshield
unshield_all() {
  if [[ -f "$CACHE/unshield.complete" && "$FORCE" == 0 ]]; then
    log "reusing unshielded components: $RAW"
    return 0
  fi
  log "unshielding data1.cab (continuation cabs resolve from the same directory; ~70s)"
  run mkdir -p "$RAW"
  if (( DRY )); then
    printf '  + (cd %s && unshield -d %s x data1.cab) > %s/unshield.log 2>&1\n' "$CABS" "$RAW" "$CACHE"
    return 0
  fi
  rm -f "$CACHE/unshield.complete"
  ( cd "$CABS" && unshield -d "$RAW" x data1.cab ) >"$CACHE/unshield.log" 2>&1 || {
    warn "unshield see $CACHE/unshield.log"; die "unshield failed"; }
  [[ -d "$RAW/All_Textures" ]] || die "unshield produced no All_Textures directory"
  touch "$CACHE/unshield.complete"
}

# --------------------------------------------------------------- 4. assembly
# Verified component mapping (Installer/FullGameInstallers ships the same layout).
assemble() {
  log "assembling the game tree at $DEST"
  local pairs=(
    "All_Maps:Maps"
    "All_Textures:Textures"
    "All_StaticMeshes:StaticMeshes"
    "All_Music:Music"
    "All_Animations:Animations"
    "All_KarmaData:KarmaData"
    "All_Web:Web"
    "All_Help:Help"
    "All_ForceFeedback:ForceFeedback"
  )
  run mkdir -p "$DEST"
  for pair in "${pairs[@]}"; do
    local src="$RAW/${pair%%:*}" dst="$DEST/${pair##*:}"
    if [[ -d "$src" ]]; then
      run mkdir -p "$dst"
      log "  ${pair%%:*} -> ${pair##*:}"
      run cp -a "$src/." "$dst/"
    elif (( ! DRY )); then
      die "required component missing: $src"
    else
      run mkdir -p "$dst"
      printf '  + cp -a %s/. %s/\n' "$src" "$dst"
    fi
  done
  # The InstallShield component System is required; this is not the ISO root System.
  local es="$RAW/English_Sounds_Speech_System_Help"
  if [[ -d "$es" ]]; then
    for d in Sounds Speech System Help; do
      [[ -d "$es/$d" ]] || die "required component missing: $es/$d"
      run mkdir -p "$DEST/$d"
      log "  English_Sounds_Speech_System_Help/$d -> $d"
      run cp -a "$es/$d/." "$DEST/$d/"
    done
  elif (( DRY )); then
    for d in Sounds Speech System Help; do
      run mkdir -p "$DEST/$d"
      run cp -a "$es/$d/." "$DEST/$d/"
    done
  else
    die "required component missing: $es"
  fi
  log "components copied; the ISO root System directory was not used"
}

# ------------------------------------------------------------------ 5. patch
fetch_patch() {
  local tarball="$CACHE/$PATCH_ASSET"
  if [[ -f "$tarball" ]] && [[ $(stat -c '%s' "$tarball") == "$PATCH_SIZE" ]]; then
    log "reusing complete cached patch: $tarball"
  else
    local url="https://github.com/$PATCH_REPO/releases/download/$PATCH_TAG/$PATCH_ASSET"
    log "downloading pinned Linux 3374 patch ($PATCH_TAG)"
    if (( DRY )); then
      printf '  + curl -L -C - --fail --retry 3 -o %s %s (curl meter includes ETA)\n' "$tarball" "$url"
      return 0
    fi
    curl -L -C - --fail --retry 3 --retry-delay 5 -o "$tarball" "$url" \
      || die "patch download failed: $url"
  fi
  if ! (( DRY )); then
    local sz; sz=$(stat -c '%s' "$tarball")
    (( sz == PATCH_SIZE )) || die "patch size mismatch: $sz != $PATCH_SIZE"
    echo "$PATCH_SHA256  $tarball" | sha256sum -c - >/dev/null || die "patch sha256 mismatch"
    log "patch verified: $PATCH_ASSET sha256 $PATCH_SHA256"
  fi
}

apply_patch() {
  log "extracting the 3374 patch over $DEST (System becomes 3374)"
  if ! (( DRY )); then
    # Linux filesystems distinguish XVoting.u/xVoting.u. Unreal packages do not.
    # Remove only case-colliding files that the verified patch replaces.
    local member relative existing
    local -A patch_names=()
    while IFS= read -r member; do
      relative="${member#./}"
      [[ "$relative" == */ || -z "$relative" ]] && continue
      patch_names["${relative,,}"]="$relative"
    done < <(tar -tjf "$CACHE/$PATCH_ASSET")
    while IFS= read -r -d '' existing; do
      relative="${existing#"$DEST/"}"
      member="${patch_names["${relative,,}"]-}"
      if [[ -n "$member" && "$member" != "$relative" ]]; then
        log "  replacing case-colliding $relative with $member"
        rm -- "$existing"
      fi
    done < <(find "$DEST" -type f -print0)
  else
    log "dry run: patch filename casing takes precedence over component files"
  fi
  run tar -xjf "$CACHE/$PATCH_ASSET" -C "$DEST"
}

# ----------------------------------------------------------------- 6. verify
verify() {
  (( DRY )) && { log "dry run complete; no verification performed"; return 0; }
  log "verifying the installed tree"
  [[ -f "$DEST/System/Core.u" ]] || die "System/Core.u missing"
  local label
  label=$(sed -n 's/^Label=//p' "$DEST/System/Build.ini" 2>/dev/null | head -1)
  [[ "$label" == *UT2004_v3374* ]] \
    || die "System/Build.ini does not carry a v3374 build label (got '${label:-<none>}')"
  local ucount maps systemcount
  ucount=$(find "$DEST/System" -maxdepth 1 -name '*.u' | wc -l)
  maps=$(find "$DEST/Maps" -maxdepth 1 -name '*.ut2' | wc -l)
  systemcount=$(find "$DEST/System" -maxdepth 1 -type f | wc -l)
  (( ucount >= 35 )) || die "unexpectedly few System packages: $ucount"
  (( maps >= 50 ))  || die "unexpectedly few maps: $maps"
  log "verified: build label $label, $ucount .u packages, $maps maps, $systemcount System files"
  log "tree logical size: $(du -sh --apparent-size "$DEST" | cut -f1)"
}

# ------------------------------------------------------------------- cleanup
cleanup() {
  (( KEEP_ISO )) && { log "keeping ISO: $ISO"; return 0; }
  if [[ -z "$ISO_LOCAL" && -f "$ISO" ]]; then
    log "removing cached ISO (use --keep-iso to retain)"
    run rm -f "$ISO"
  fi
  log "keeping the cab set + unshielded components in $CACHE for fast re-runs"
}

trap 'die "interrupted at line $LINENO"' INT TERM

if [[ -f "$CACHE/cabs.complete" && "$FORCE" == 0 ]]; then
  log "reusing cab set from a completed verified ISO extraction"
else
  fetch_iso
  extract_cabs
fi
unshield_all
assemble
fetch_patch
apply_patch
verify
cleanup

if (( DRY )); then log "DRY RUN ONLY — no installation performed"; else log "Install complete: $DEST"; fi
cat <<'LEGAL_NOTICE'

------------------------------------------------------------------
NOTICE
  All game content is © Epic Games, Inc. and is
  licensed for personal, non-commercial use only.
  The ISO links above are published by OldUnreal and approved by Epic.
  This script downloads from those approved URLs; it does not
  redistribute any game content.

  Use the chosen destination's System directory as UT2004_BASE.
------------------------------------------------------------------
LEGAL_NOTICE
