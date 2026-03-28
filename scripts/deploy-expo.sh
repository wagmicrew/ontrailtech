#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/ontrail}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
BRANCH="${BRANCH:-main}"
API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-8100}"
EXPO_PORT="${EXPO_PORT:-8081}"
WEB_URL="${WEB_URL:-https://app.ontrail.tech}"
API_URL="${API_URL:-https://api.ontrail.tech/health}"
EXPO_URL="${EXPO_URL:-https://expo.ontrail.tech}"

if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

log() {
  printf '\n[%s] %s\n' "$1" "$2"
}

die() {
  printf '\n[ERROR] %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

run_curl_check() {
  local label="$1"
  local url="$2"
  local expected_prefix="$3"
  local output

  output="$(curl -ksS -o /dev/null -w '%{http_code}' "$url")"
  if [[ "$output" != ${expected_prefix}* ]]; then
    die "$label health check failed for $url (status: $output)"
  fi
  printf '  %s -> %s\n' "$label" "$output"
}

safe_prepare_git_tree() {
  local stash_created=0

  if git status --short -- package-lock.json | grep -q .; then
    git stash push --quiet -- package-lock.json
    stash_created=1
  fi

  if [[ -e apps/web/tsconfig.tsbuildinfo ]]; then
    rm -f apps/web/tsconfig.tsbuildinfo
  fi

  git pull --ff-only "$REMOTE_NAME" "$BRANCH"

  if [[ "$stash_created" -eq 1 ]]; then
    git stash drop --quiet || true
  fi
}

restart_api() {
  if pm2 describe ontrail-api >/dev/null 2>&1; then
    pm2 restart ontrail-api --update-env
  else
    pm2 start "uvicorn main:app --host $API_HOST --port $API_PORT" \
      --name ontrail-api \
      --cwd "$PROJECT_DIR/services/api"
  fi
}

restart_expo() {
  if pm2 describe ontrail-expo >/dev/null 2>&1; then
    pm2 delete ontrail-expo
  fi

  pm2 start npx --name ontrail-expo \
    --cwd "$PROJECT_DIR/apps/mobile" \
    --interpreter none \
    -- expo start --port "$EXPO_PORT" --tunnel --non-interactive
}

print_pm2_summary() {
  pm2 list | grep -E 'ontrail-(api|expo)' || true
}

trap 'die "Deploy failed near line $LINENO"' ERR

echo "=== OnTrail Expo Companion App Deploy ==="

require_cmd git
require_cmd npm
require_cmd python3
require_cmd curl
require_cmd pm2
require_cmd nginx

cd "$PROJECT_DIR"

log "1/8" "Updating code"
safe_prepare_git_tree

log "2/8" "Installing workspace dependencies"
npm install --workspaces --include-workspace-root

log "3/8" "Installing API dependencies"
python3 -m pip install -r "$PROJECT_DIR/services/api/requirements.txt"

log "4/8" "Building web app"
npm run build --workspace=apps/web

log "5/8" "Updating nginx configuration"
$SUDO cp "$PROJECT_DIR/infra/nginx/ontrail-tech.conf" /etc/nginx/sites-available/ontrail-tech
$SUDO ln -sfn /etc/nginx/sites-available/ontrail-tech /etc/nginx/sites-enabled/ontrail-tech
$SUDO nginx -t
$SUDO systemctl reload nginx

log "6/8" "Restarting API"
restart_api

log "7/8" "Restarting Expo Go server"
restart_expo
pm2 save

log "8/8" "Running health checks"
run_curl_check "Local API" "http://$API_HOST:$API_PORT/health" "2"
run_curl_check "Web" "$WEB_URL" "2"
run_curl_check "API" "$API_URL" "2"
run_curl_check "Expo" "$EXPO_URL" "2"

echo ""
echo "=== Deploy Complete ==="
echo "Services:"
echo "  API:     $API_URL"
echo "  Web:     $WEB_URL"
echo "  Expo Go: $EXPO_URL"
echo ""
echo "Expo status check: https://api.ontrail.tech/expo/status"
echo ""
print_pm2_summary
