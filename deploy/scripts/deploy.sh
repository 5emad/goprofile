#!/usr/bin/env bash
# Deploys a version tag (or branch) to the server. Run as the deploy user:
#   bash deploy.sh 0.1.0
set -euo pipefail

REF=${1:-main}
APP_DIR=/opt/goprofile
WEB_ROOT=/var/www/goprofile
cd "$APP_DIR"

git fetch --tags --prune origin
git checkout --quiet "$REF"
if git symbolic-ref -q HEAD >/dev/null; then git pull --ff-only; fi
VERSION=$(git describe --tags --always)
sed -i "s|^APP_VERSION=.*|APP_VERSION=$VERSION|" deploy/.env

cd deploy
docker compose --env-file .env build api
docker compose --env-file .env up -d --wait

# Pin the server public key into the web build so clients refuse a swapped key.
PUB=$(curl -fsS http://127.0.0.1:8080/api/key | sed -E 's/.*"pub":"([^"]+)".*/\1/')

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
docker build --build-arg VITE_SERVER_KEY="$PUB" --output "type=local,dest=$TMP" ../web
rsync -a --delete "$TMP/dist/" "$WEB_ROOT/"

docker image prune -f >/dev/null
echo "Deployed $VERSION (server key $PUB)"
