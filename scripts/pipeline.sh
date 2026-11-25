#!/usr/bin/env bash
# Test -> build -> smoke test -> export citystates as a Synology-importable tar.
#
#   scripts/pipeline.sh
#
# Env overrides:
#   IMAGE      image name               (default: citystates)
#   PLATFORM   target platform          (default: linux/amd64; use linux/arm64 for ARM NAS models)
#   OUT        output tar path          (default: dist/citystates.tar)
#   SKIP_SMOKE set to 1 to skip the container smoke test
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="${IMAGE:-citystates}"
PLATFORM="${PLATFORM:-linux/amd64}"
OUT="${OUT:-dist/citystates.tar}"
VERSION="$(git rev-parse --short HEAD 2>/dev/null || echo dev)$(git diff --quiet 2>/dev/null || echo -dirty)"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || fail "docker not found"
docker info >/dev/null 2>&1 || fail "docker daemon not reachable"
[[ -f bun.lock ]] || fail "no bun lockfile; run 'bun install' first"

export DOCKER_BUILDKIT=1

step "1/4 test"
docker build --pull --platform "$PLATFORM" --target test --progress plain -t "$IMAGE:test" .

step "2/4 build $IMAGE:$VERSION ($PLATFORM)"
docker build --pull --platform "$PLATFORM" --target runtime \
  --label "org.opencontainers.image.version=$VERSION" \
  --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -t "$IMAGE:$VERSION" -t "$IMAGE:latest" .
docker image rm "$IMAGE:test" >/dev/null 2>&1 || true

step "3/4 smoke test"
if [[ "${SKIP_SMOKE:-0}" == 1 ]]; then
  echo "skipped"
else
  name="citystates-smoke-$$"
  trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
  # same hardening as docker-compose.yml, throwaway /data
  docker run -d --name "$name" --platform "$PLATFORM" \
    --read-only --tmpfs /tmp:size=16m --tmpfs /data:uid=65532,gid=65532,mode=0700 \
    --cap-drop ALL --security-opt no-new-privileges:true --memory 256m \
    "$IMAGE:$VERSION" >/dev/null

  # status code of a request made from inside the container (no curl needed on the host)
  code() { docker exec "$name" bun -e "fetch('http://127.0.0.1:5160$1',{redirect:'manual'}).then(r=>console.log(r.status),()=>console.log(0))"; }

  for _ in $(seq 1 30); do
    [[ "$(code /games/citystates/)" == 200 ]] && break
    sleep 1
  done
  [[ "$(code /games/citystates/)" == 200 ]] || { docker logs "$name"; fail "server did not come up"; }
  [[ "$(code /games/citystates/somegame)" == 200 ]] || fail "game page does not fall back to the app"
  [[ "$(code /games/citystates/favicon.jpg)" == 200 ]] || fail "static files are not served"
  [[ "$(code /games/citystates/../../etc/passwd)" != 200 ]] || fail "path traversal"
  # the lobby answers over the websocket (it reads the database)
  docker exec "$name" bun -e "
    const ws = new WebSocket('ws://127.0.0.1:5160/games/citystates/ws');
    ws.onmessage = (e) => process.exit(JSON.parse(e.data).type === 'error' ? 1 : 0);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'lobby:subscribe' }));
    setTimeout(() => process.exit(1), 5000);" \
    || { docker logs "$name"; fail "websocket did not answer"; }
  [[ "$(docker exec "$name" bun -e 'console.log(process.getuid())')" != 0 ]] || fail "container runs as root"
  echo "ok: pages, static files, websocket, non-root"
fi

step "4/4 export $OUT"
mkdir -p "$(dirname "$OUT")"
docker save "$IMAGE:$VERSION" "$IMAGE:latest" -o "$OUT"
ls -lh "$OUT"
docker image ls "$IMAGE:$VERSION" --format 'image size: {{.Size}}'

printf '\n\033[1;32m✓ %s ready: Container Manager > Image > Import > %s\033[0m\n' "$IMAGE:$VERSION" "$OUT"
