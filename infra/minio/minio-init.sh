#!/bin/sh
# Target location: infra/minio/minio-init.sh — idempotent bucket bootstrap.
set -eu

until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "waiting for minio..."; sleep 2
done

for bucket in "$S3_BUCKET_ASSETS" "$S3_BUCKET_RENDERS"; do
  mc mb --ignore-existing "local/$bucket"
  mc anonymous set none "local/$bucket"   # private; access only via presigned URLs
done

echo "minio buckets ready"
