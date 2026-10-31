#!/usr/bin/env bash
# Publishes app builds on https://goprofile.ir/app/ so installed apps offer the update.
# Copy the files to the server first (scp), then run as the deploy user:
#   bash publish-app.sh <version> <build-number> <goprofile.apk> [goprofile-windows.zip]
# The build number must be the +N of pubspec.yaml's version and must grow with every release.
set -euo pipefail

VERSION=${1:?usage: publish-app.sh <version> <build> <apk> [windows-zip]}
BUILD=${2:?build number required}
APK=${3:?apk path required}
WIN=${4:-}
OUT=/var/www/goprofile/app

[[ $BUILD =~ ^[0-9]+$ ]] || { echo "Build number must be an integer" >&2; exit 1; }
mkdir -p "$OUT"
install -m 644 "$APK" "$OUT/goprofile-$VERSION.apk"
ln -sfn "goprofile-$VERSION.apk" "$OUT/goprofile.apk"
WIN_NAME=""
if [ -n "$WIN" ]; then
  install -m 644 "$WIN" "$OUT/goprofile-$VERSION-windows.zip"
  WIN_NAME="/app/goprofile-$VERSION-windows.zip"
fi

SHA=$(sha256sum "$OUT/goprofile-$VERSION.apk" | cut -d' ' -f1)
cat >"$OUT/version.json.tmp" <<EOF
{"version":"$VERSION","build":$BUILD,"android":"/app/goprofile-$VERSION.apk","android_sha256":"$SHA","windows":"$WIN_NAME","notes":""}
EOF
mv "$OUT/version.json.tmp" "$OUT/version.json"

# Keep the three newest versions.
ls -1t "$OUT"/goprofile-*.apk 2>/dev/null | grep -v '/goprofile.apk$' | tail -n +4 | xargs -r rm -f
ls -1t "$OUT"/goprofile-*-windows.zip 2>/dev/null | tail -n +4 | xargs -r rm -f
echo "Published $VERSION (build $BUILD): https://goprofile.ir/app/goprofile.apk  sha256 $SHA"
