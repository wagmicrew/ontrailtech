#!/bin/bash
set -e
echo "=== OnTrail Production Deploy ==="

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

# 1. Fix BIND DNS
echo "[1/7] Configuring DNS..."
python3 /var/www/ontrail/scripts/fix-bind.py
named-checkconf && systemctl reload named
echo "DNS configured."

# 2. Apply database schema
echo "[2/7] Setting up database..."
sudo -u postgres psql -d ontrail_tech -f /var/www/ontrail/scripts/schema.sql 2>&1 | tail -5
echo "Schema applied."

# 3. Install Python deps
echo "[3/7] Installing Python dependencies..."
pip3 install fastapi uvicorn sqlalchemy asyncpg alembic redis pydantic pydantic-settings python-jose passlib eth-account web3 h3 httpx python-multipart 2>&1 | tail -3
echo "Python deps installed."

# 4. Create API .env
echo "[4/7] Creating API config..."
cat > "$API_ENV_PATH" << EOF
DATABASE_URL=postgresql+asyncpg://postgres:@localhost:5432/ontrail_tech
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=ontrail-prod-2025-xK9mP2vL8nQ4
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=https://ontrail.tech,https://app.ontrail.tech
WEB3_RPC_URL=http://localhost:8545
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID_VALUE}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET_VALUE}
SMTP_HOST=smtp.ontrail.tech
SMTP_PORT=587
SMTP_USER=admin@ontrail.tech
SMTP_PASSWORD=SET_AFTER_MAIL_SETUP
SMTP_FROM=noreply@ontrail.tech
EOF
echo "API config created."

if [ "$GOOGLE_CLIENT_ID_VALUE" = "SET_FROM_SECRETS" ] || [ -z "$GOOGLE_CLIENT_ID_VALUE" ]; then
  echo "ERROR: GOOGLE_CLIENT_ID must be provided before building the web app."
  echo "       Example: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... bash scripts/deploy-server.sh"
  exit 1
fi

echo "[4.5/7] Syncing web build env..."
upsert_env_var "$WEB_ENV_PATH" "VITE_API_URL" "https://api.ontrail.tech"
upsert_env_var "$WEB_ENV_PATH" "VITE_GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_ID_VALUE"
echo "Web build env synced."

# 5. Build web app
echo "[5/7] Building web app..."
cd /var/www/ontrail
npm install 2>&1 | tail -3
npm run build --workspace=apps/web 2>&1 | tail -5
echo "Web app built."

# 6. Configure nginx
echo "[6/7] Configuring nginx..."
cp /var/www/ontrail/infra/nginx/ontrail-tech.conf /etc/nginx/sites-available/ontrail-tech

# First get certs with HTTP challenge (need nginx to serve .well-known)
# Create a temp HTTP-only config first
cat > /etc/nginx/sites-available/ontrail-temp << 'TEMPEOF'
server {
    listen 80;
    server_name ontrail.tech www.ontrail.tech app.ontrail.tech api.ontrail.tech;
    root /var/www/ontrail/apps/web/dist;
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        return 200 'OnTrail coming soon';
        add_header Content-Type text/plain;
    }
}
TEMPEOF

# Enable temp config
ln -sf /etc/nginx/sites-available/ontrail-temp /etc/nginx/sites-enabled/ontrail-tech
nginx -t && systemctl reload nginx

# Get TLS certs
echo "Getting TLS certificates..."
certbot certonly --webroot -w /var/www/html \
  -d ontrail.tech -d www.ontrail.tech -d app.ontrail.tech -d api.ontrail.tech \
  --non-interactive --agree-tos --email admin@ontrail.tech \
  2>&1 | tail -5

# Now enable the real config with SSL
ln -sf /etc/nginx/sites-available/ontrail-tech /etc/nginx/sites-enabled/ontrail-tech
nginx -t && systemctl reload nginx
echo "Nginx configured with TLS."

# 6.5. Set up mail server
echo "[6.5/7] Setting up mail server..."
bash /var/www/ontrail/scripts/mail-setup.sh
# After mail-setup.sh runs, update SMTP_PASSWORD in .env with the printed password
echo "IMPORTANT: Update SMTP_PASSWORD in /var/www/ontrail/services/api/.env"
echo "          with the admin@ontrail.tech password printed above."

# 7. Start PM2 services
echo "[7/7] Starting services..."
cd /var/www/ontrail
pm2 delete ontrail-api 2>/dev/null || true
pm2 start "uvicorn main:app --host 127.0.0.1 --port 8100" \
  --name ontrail-api \
  --cwd /var/www/ontrail/services/api
pm2 save

echo ""
echo "=== Deploy Complete ==="
echo "Sites:"
echo "  https://ontrail.tech"
echo "  https://app.ontrail.tech"
echo "  https://api.ontrail.tech/health"
echo ""
pm2 list | grep ontrail
