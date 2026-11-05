"""MinIO upload over the internal S3 endpoint (no shared volumes — constitution V)."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

import boto3
from botocore.config import Config

_client = None


def client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=os.environ["S3_ENDPOINT"],
            region_name=os.environ.get("S3_REGION", "us-east-1"),
            aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
            config=Config(s3={"addressing_style": "path"}, retries={"max_attempts": 3}),
        )
    return _client


def bucket() -> str:
    return os.environ["S3_BUCKET_ASSETS"]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def upload(path: Path, key: str, mime_type: str) -> dict:
    client().upload_file(str(path), bucket(), key, ExtraArgs={"ContentType": mime_type})
    return {"objectKey": key, "sha256": sha256_file(path), "sizeBytes": path.stat().st_size}


def download(key: str, dest: Path) -> None:
    client().download_file(bucket(), key, str(dest))
