#!/usr/bin/env bash
# Deploys a version tag (or branch) to the server. Run as the deploy user:
#   bash deploy.sh 0.3.0
# Data is never touched: the database lives in Docker volumes, a backup is
# taken before every update, and migrations only add to the schema.
set -euo pipefail

REF=${1:-main}
APP_DIR=/opt/goprofile
WEB_ROOT=/var/www/goprofile
cd "$APP_DIR"

PREV=$(git describe --tags --always 2>/dev/null || echo none)
git fetch --tags --prune origin
git checkout --quiet "$REF"
if git symbolic-ref -q HEAD >/dev/null; then git pull --ff-only; fi
VERSION=$(git describe --tags --always)
sed -i "s|^APP_VERSION=.*|APP_VERSION=$VERSION|" deploy/.env

cd deploy

# Back up the database before the new API runs its migrations.
if docker compose --env-file .env ps --status running --services 2>/dev/null | grep -qx db-primary; then
  bash "$APP_DIR/deploy/scripts/backup.sh" "pre-$VERSION"
fi

docker compose --env-file .env build api
if ! docker compose --env-file .env up -d --wait; then
  echo "Deploy of $VERSION failed health checks. Roll back with: bash $0 $PREV" >&2
  docker compose --env-file .env logs --tail 50 api >&2 || true
  exit 1
fi

# Pin the server public key into the web build so clients refuse a swapped key.
for _ in $(seq 30); do curl -fsS -o /dev/null http://127.0.0.1:8080/healthz && break; sleep 2; done
PUB=$(curl -fsS http://127.0.0.1:8080/api/key | sed -E 's/.*"pub":"([^"]+)".*/\1/')

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
docker build --build-arg NEXT_PUBLIC_SERVER_KEY="$PUB" --output "type=local,dest=$TMP" ../web
# /app holds the published APK and Windows build (see publish-app.sh); keep it.
rsync -a --delete --exclude /app/ "$TMP/dist/" "$WEB_ROOT/"

docker image prune -f >/dev/null
echo "Deployed $VERSION (was $PREV). Server key: $PUB"
