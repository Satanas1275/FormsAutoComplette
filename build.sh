#!/usr/bin/env bash
# Usage: ./build.sh   ->  dist/chrome (manifest.json) and dist/firefox (manifest.firefox.json)
set -euo pipefail

cd "$(dirname "$0")"

SHARED=(background.js content.js popup.html popup.js LICENSE)

build() {
  local target="$1" manifest="$2" out="dist/$1"
  rm -rf "$out"
  mkdir -p "$out"
  cp "${SHARED[@]}" "$out/"
  cp "$manifest" "$out/manifest.json"
  echo "-> $out"
}

build chrome manifest.json
build firefox manifest.firefox.json
