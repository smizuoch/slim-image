#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUST_DIR="$ROOT_DIR/rust"
WASM_OUT_DIR="$ROOT_DIR/assets/wasm"

rustup target add wasm32-unknown-unknown >/dev/null

pushd "$RUST_DIR" >/dev/null
cargo build --target wasm32-unknown-unknown --release
wasm-bindgen \
  --target web \
  --out-dir "$WASM_OUT_DIR" \
  --out-name optimizer \
  "$RUST_DIR/target/wasm32-unknown-unknown/release/slim_image_wasm.wasm"
popd >/dev/null

echo "Built WASM artifacts into $WASM_OUT_DIR"
