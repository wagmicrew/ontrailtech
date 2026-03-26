#!/bin/bash
set -e

echo "=== OnTrail Server Setup ==="

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
cat > /var/www/ontrail/services/api/.env << 'ENVEOF'
DATABASE_URL=postgresql+asyncpg://postgres:@localhost:5432/ontrail_tech
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=ontrail-prod-secret-change-me-2025
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=https://ontrail.tech,https://app.ontrail.tech,http://localhost:5173
WEB3_RPC_URL=http://localhost:8545
ENVEOF
echo ".env created."

# 4. Install Node dependencies and build web app
echo "[4/6] Installing Node dependencies and building web app..."
cd /var/www/ontrail
npm install 2>&1 | tail -3
cd /var/www/ontrail/apps/web
npm install 2>&1 | tail -3
npx vite build 2>&1 | tail -5
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
