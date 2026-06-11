#!/usr/bin/env bash
# ดาวน์โหลด code-server (VS Code จริง) ลง vendor/ — รันครั้งเดียวหลัง clone
# รองรับ macOS arm64/x64 และ linux arm64/x64
set -euo pipefail

VERSION="${CODE_SERVER_VERSION:-4.123.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/code-server"

if [ -x "$DEST/bin/code-server" ]; then
  echo "code-server มีอยู่แล้วที่ $DEST"
  "$DEST/bin/code-server" --version | head -1
  exit 0
fi

os="$(uname -s)"; arch="$(uname -m)"
case "$os-$arch" in
  Darwin-arm64) plat="macos-arm64" ;;
  Darwin-x86_64) plat="macos-amd64" ;;
  Linux-aarch64|Linux-arm64) plat="linux-arm64" ;;
  Linux-x86_64) plat="linux-amd64" ;;
  *) echo "ไม่รองรับ $os-$arch"; exit 1 ;;
esac

url="https://github.com/coder/code-server/releases/download/v${VERSION}/code-server-${VERSION}-${plat}.tar.gz"
echo "ดาวน์โหลด $url"
mkdir -p "$ROOT/vendor"
tmp="$(mktemp)"
curl -sL -o "$tmp" "$url"
tar -xzf "$tmp" -C "$ROOT/vendor"
rm -f "$tmp"
mv "$ROOT/vendor/code-server-${VERSION}-${plat}" "$DEST"
echo "ติดตั้งแล้ว:"
"$DEST/bin/code-server" --version | head -1
