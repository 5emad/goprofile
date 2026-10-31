#!/usr/bin/env bash
# Restores a backup made by backup.sh into the primary (replicas follow).
#   bash restore.sh /var/backups/goprofile/goprofile-....dump
set -euo pipefail

FILE=${1:?usage: restore.sh <backup.dump>}
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }
cd /opt/goprofile/deploy

read -r -p "This replaces all current data with $FILE. Type RESTORE to continue: " ok
[ "$ok" = RESTORE ] || { echo "Cancelled."; exit 1; }

bash /opt/goprofile/deploy/scripts/backup.sh pre-restore
docker compose --env-file .env stop api
docker compose --env-file .env exec -T db-primary pg_restore -U goprofile -d goprofile --clean --if-exists --no-owner --single-transaction <"$FILE"
docker compose --env-file .env start api
echo "Restored $FILE"
