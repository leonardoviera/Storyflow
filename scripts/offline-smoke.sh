#!/usr/bin/env bash
# Offline gate (constitution v1.0.0 — required before merge).
# Run with the host network disconnected after one-time provisioning (quickstart.md Check 9).
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash on Windows: don't rewrite container paths

BASE=${STORYFLOW_URL:-http://127.0.0.1:3000}
TIMEOUT_S=${RENDER_TIMEOUT_S:-900}
step() { printf '\n==> %s\n' "$*"; }
die() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
jget() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const v=JSON.parse(s)$1;console.log(typeof v==='object'?JSON.stringify(v):v)})"; }

step "Starting stack"
docker compose up -d --wait

step "Health"
health=$(curl -fsS "$BASE/api/health") || die "/api/health not ok: $health"
echo "$health"
[ "$(echo "$health" | jget .status)" = "ok" ] || die "stack degraded"

step "Egress must be blocked from render-worker and blender-mcp"
docker compose exec -T render-worker node -e \
  "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(1),()=>process.exit(0))" \
  || die "render-worker can reach the internet"
docker compose exec -T blender-mcp python3 -c "
import sys, urllib.request
try:
    urllib.request.urlopen('https://example.com', timeout=5); sys.exit(1)
except Exception:
    sys.exit(0)" || die "blender-mcp can reach the internet"
echo "egress blocked"

step "Create project from the reference template"
project=$(curl -fsS -X POST "$BASE/api/projects" -H 'content-type: application/json' \
  -d '{"title":"offline-smoke","templateSlug":"reference"}')
pid=$(echo "$project" | jget .id)
echo "project $pid"

step "Render (forced)"
render=$(curl -sS -X POST "$BASE/api/projects/$pid/renders" -H 'content-type: application/json' -d '{"force":true}')
job=$(echo "$render" | jget .job.id) || die "render not enqueued: $render"
deadline=$(( $(date +%s) + TIMEOUT_S ))
while :; do
  status=$(curl -fsS "$BASE/api/jobs/$job" | jget .status)
  case "$status" in
    SUCCEEDED) break ;;
    FAILED|CANCELLED) die "render $status: $(curl -fsS "$BASE/api/jobs/$job" | jget .error)" ;;
  esac
  [ "$(date +%s)" -lt "$deadline" ] || die "render timed out after ${TIMEOUT_S}s"
  sleep 3
done
asset=$(curl -fsS "$BASE/api/jobs/$job" | jget .output.assetId)

step "MP4 must exist in MinIO (remotion-videos)"
url=$(curl -fsS "$BASE/api/assets/$asset/url" | jget .url)
# Judge by HTTP status only (curl may exit 23 when the ranged body is discarded on some shells).
code=$(curl -s -o /dev/null -w '%{http_code}' -r 0-1023 "$url" || true)
[[ "$code" =~ ^20[06]$ ]] || die "MP4 not downloadable (HTTP $code)"
case "$url" in *remotion-videos/projects/$pid/FINAL_RENDER/*.mp4*) ;; *) die "unexpected object location: $url" ;; esac

printf '\nOffline smoke test passed.\n'
