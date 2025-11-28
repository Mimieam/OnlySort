#!/bin/bash

# --- CONFIGURATION ---
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_CANARY="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
SRC="src"
KEY="privateKey.pem"
DIST_DIR="dist"

# --- VARIABLE SETUP ---
# $2 is the optional base name, defaults to 'extension'
BASE_NAME=${2:-extension}

# Get version from package.json if available
VERSION=$(grep -m1 '"version":' $SRC/manifest.json 2>/dev/null | cut -d'"' -f4)
[ -n "$VERSION" ] && BASE_NAME="${BASE_NAME}-v${VERSION}"

ZIP="$BASE_NAME.zip"
CRX="$BASE_NAME.crx"

# --- UTILITY FUNCTIONS ---
log() { echo "[$(date +'%H:%M:%S')] ${1}"; }
err() { log "ERROR: ${1}"; exit 1; }

# --- CORE FUNCTIONS ---
zip_source() {
    (
        cd "$SRC" || err "Source directory ($SRC) not found."
        zip -r -q "../$DIST_DIR/$ZIP" . -x "*.DS_Store"
    )
}

pack_crx() {
    [ ! -f "$KEY" ] && err "Private key ($KEY) not found. Run '$0 create-key'."
    "$CHROME" --headless --pack-extension="$SRC" --pack-extension-key="$KEY" >/dev/null 2>&1 || err "CRX packaging failed."
    mv "$SRC.crx" "$DIST_DIR/$CRX" || err "Failed to move $SRC.crx to $DIST_DIR."
    log "📦 Packaged CRX to $DIST_DIR/$CRX";
}

# --- COMMANDS ---
case "$1" in
    clean)
        log "🧹 Cleaning artifacts...";
        rm -rf "$DIST_DIR/*"
        log "Clean complete.";
        ;;

    create-key)
        [ -f "$KEY" ] && err "Key ($KEY) already exists. Delete it manually to regenerate."
        log "🔑 Generating new private key...";
        openssl genrsa -out "$KEY" 2048 2>/dev/null
        log "✅ $KEY created successfully.";
        ;;

    pack)
        mkdir -p "$DIST_DIR" || err "Failed to create directory $DIST_DIR."

        pack_crx
        zip_source
        ;;
    canary)
        [ ! -d "$SRC" ] && err "Source directory ($SRC) not found."
        log "🚀 Launching Chrome Canary with '$SRC' loaded...";
        "$CHROME" --load-extension="$(pwd)/$SRC"
        ;;
    *)
        log "ℹ️ Usage: $0 [pack|clean|create-key|canary] (name)";
        ;;
esac