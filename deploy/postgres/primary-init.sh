#!/bin/sh
# Runs once on first boot of the primary: creates the replication role and
# allows replicas from the private docker network only.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v pw="$REPLICATION_PASSWORD" <<'SQL'
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD :'pw';
SQL

cat >> "$PGDATA/pg_hba.conf" <<'HBA'
host replication replicator samenet scram-sha-256
HBA
