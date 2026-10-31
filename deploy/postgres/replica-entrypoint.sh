#!/bin/sh
# Clones the primary on first boot, then runs as a hot standby.
set -eu

: "${PRIMARY_HOST:?}" "${REPLICATION_PASSWORD:?}" "${SLOT_NAME:?}"
PGDATA=${PGDATA:-/var/lib/postgresql/data}
export PGPASSWORD="$REPLICATION_PASSWORD"
# Newer postgres images ship gosu instead of su-exec.
ASPG="$(command -v gosu || command -v su-exec) postgres"

mkdir -p "$PGDATA"
chown postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  until pg_isready -h "$PRIMARY_HOST" -U replicator -q; do
    echo "waiting for primary"
    sleep 2
  done
  # Create the slot only if missing so a rebuilt replica reuses it.
  $ASPG psql "host=$PRIMARY_HOST user=replicator dbname=postgres replication=database" -tAc \
    "SELECT 1 FROM pg_replication_slots WHERE slot_name='$SLOT_NAME'" 2>/dev/null | grep -q 1 \
    || $ASPG psql "host=$PRIMARY_HOST user=replicator dbname=postgres replication=database" \
      -c "CREATE_REPLICATION_SLOT $SLOT_NAME PHYSICAL"
  $ASPG pg_basebackup -h "$PRIMARY_HOST" -U replicator -D "$PGDATA" \
    -X stream -R -S "$SLOT_NAME" --checkpoint=fast
fi

unset PGPASSWORD
exec $ASPG postgres -c hot_standby=on -c hot_standby_feedback=on
