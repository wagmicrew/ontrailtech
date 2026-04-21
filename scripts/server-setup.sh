#!/bin/bash
set -e

echo "=== OnTrail Server Setup ==="

API_ENV_PATH="/var/www/ontrail/services/api/.env"
WEB_ENV_PATH="/var/www/ontrail/apps/web/.env"
GOOGLE_CLIENT_ID_VALUE="${GOOGLE_CLIENT_ID:-SET_FROM_SECRETS}"
GOOGLE_CLIENT_SECRET_VALUE="${GOOGLE_CLIENT_SECRET:-SET_FROM_SECRETS}"

upsert_env_var() {
  local env_file="$1"
  local key="$2"
  local value="$3"

  mkdir -p "$(dirname "$env_file")"
  touch "$env_file"

  if grep -q "^${key}=" "$env_file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}

# 1. Apply database schema
echo "[1/6] Setting up database..."
sudo -u postgres psql -d ontrail_tech -f /var/www/ontrail/scripts/schema.sql
echo "Schema applied."

# 2. Install Python dependencies
echo "[2/6] Installing Python dependencies..."
cd /var/www/ontrail/services/api
pip3 install -r requirements.txt 2>&1 | tail -5

# 3. Create .env for API
echo "[3/6] Creating API .env..."
cat > "$API_ENV_PATH" << ENVEOF
DATABASE_URL=postgresql+asyncpg://postgres:@localhost:5432/ontrail_tech
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=ontrail-prod-secret-change-me-2025
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=https://ontrail.tech,https://app.ontrail.tech,http://localhost:5173
WEB3_RPC_URL=http://localhost:8545
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID_VALUE}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET_VALUE}
SMTP_HOST=smtp.ontrail.tech
SMTP_PORT=587
SMTP_USER=admin@ontrail.tech
SMTP_PASSWORD=SET_AFTER_MAIL_SETUP
SMTP_FROM=noreply@ontrail.tech
ENVEOF
echo ".env created."

if [ "$GOOGLE_CLIENT_ID_VALUE" = "SET_FROM_SECRETS" ] || [ -z "$GOOGLE_CLIENT_ID_VALUE" ]; then
  echo "ERROR: GOOGLE_CLIENT_ID must be provided before building the web app."
  echo "       Example: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... bash scripts/server-setup.sh"
  exit 1
fi

echo "[3.5/6] Syncing web build env..."
upsert_env_var "$WEB_ENV_PATH" "VITE_API_URL" "https://api.ontrail.tech"
upsert_env_var "$WEB_ENV_PATH" "VITE_GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_ID_VALUE"
echo "Web build env synced."

# 4. Install Node dependencies and build web app
echo "[4/6] Installing Node dependencies and building web app..."
cd /var/www/ontrail
npm install 2>&1 | tail -3
npm run build --workspace=apps/web 2>&1 | tail -5
echo "Web app built."

# 5. Set up PM2 processes for ontrail
echo "[5/6] Setting up PM2..."
cd /var/www/ontrail

# Stop existing ontrail processes if any
pm2 delete ontrail-api 2>/dev/null || true
pm2 delete ontrail-web 2>/dev/null || true

# Start API
pm2 start /var/www/ontrail/services/api/main.py \
  --name ontrail-api \
  --interpreter python3 \
  --cwd /var/www/ontrail/services/api \
  -- --host 127.0.0.1 --port 8100

# Actually use uvicorn for FastAPI
pm2 delete ontrail-api 2>/dev/null || true
pm2 start "uvicorn main:app --host 127.0.0.1 --port 8100" \
  --name ontrail-api \
  --cwd /var/www/ontrail/services/api

pm2 save
echo "PM2 processes started."

# 6. Verify
echo "[6/6] Verifying..."
sleep 2
pm2 list | grep ontrail
echo ""
echo "=== Setup Complete ==="
