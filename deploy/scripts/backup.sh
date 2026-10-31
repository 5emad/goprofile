#!/usr/bin/env bash
# Writes a compressed pg_dump to /var/backups/goprofile and keeps the newest 30.
#   bash backup.sh [label]
# Restore with restore.sh.
set -euo pipefail

LABEL=${1:-daily}
DIR=/var/backups/goprofile
cd /opt/goprofile/deploy

mkdir -p "$DIR"
FILE="$DIR/goprofile-$(date +%Y%m%d-%H%M%S)-$LABEL.dump"
docker compose --env-file .env exec -T db-primary pg_dump -U goprofile -d goprofile -Fc -Z 6 >"$FILE.part"
mv "$FILE.part" "$FILE"
chmod 600 "$FILE"
ls -1t "$DIR"/goprofile-*.dump | tail -n +31 | xargs -r rm -f
echo "Backup: $FILE ($(du -h "$FILE" | cut -f1))"
