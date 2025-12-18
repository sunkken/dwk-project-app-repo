#!/usr/bin/env bash
set -e

if [ -z "$URL" ]; then
  echo "Error: URL environment variable is required"
  exit 1
fi

if [ -z "$GCS_BUCKET" ]; then
  echo "Error: GCS_BUCKET environment variable is required"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)

pg_dump -v "$URL" > /usr/src/app/backup.sql

# Activate the service account explicitly to avoid falling back to node metadata scopes
if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  gcloud auth activate-service-account --key-file="$GOOGLE_APPLICATION_CREDENTIALS"
fi

# Force gsutil to use the provided key file (avoids scope issues on node SA)
gsutil -o "Credentials:gs_service_key_file=${GOOGLE_APPLICATION_CREDENTIALS}" \
  cp /usr/src/app/backup.sql "gs://${GCS_BUCKET}/backups/tododb-${TIMESTAMP}.sql"

echo "Backup uploaded to gs://${GCS_BUCKET}/backups/tododb-${TIMESTAMP}.sql"
