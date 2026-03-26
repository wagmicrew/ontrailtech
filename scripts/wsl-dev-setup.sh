#!/bin/bash
set -e

PROJECT_DIR="/home/johs/ontrail"
echo "=== OnTrail WSL Dev Environment Setup ==="

# Install Python venv and pip
echo "[1/6] Installing Python tools..."
apt-get update -qq
apt-get install -y -qq python3-venv python3-pip python3-dev libpq-dev

# Install Redis
echo "[2/6] Installing Redis..."
apt-get install -y -qq redis-server
systemctl enable redis-server
systemctl start redis-server

# Set up Python virtual environment
echo "[3/6] Setting up Python venv..."
cd "$PROJECT_DIR/services/api"
python3 -m venv .venv
source .venv/bin/activate
pip install --quiet -r requirements.txt
deactivate

# Install Node dependencies (root monorepo)
echo "[4/6] Installing Node dependencies..."
cd "$PROJECT_DIR"
npm install --silent 2>/dev/null || true

# Install contract dependencies
echo "[5/6] Installing contract dependencies..."
cd "$PROJECT_DIR/contracts"
npm install --silent 2>/dev/null || true

# Create .env for API
echo "[6/6] Creating API .env..."
cd "$PROJECT_DIR/services/api"
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
else
    echo ".env already exists"
fi

# Apply database schema
echo "Applying database schema..."
sudo -u postgres psql -d ontrail -f "$PROJECT_DIR/scripts/schema.sql" 2>/dev/null || true

# Fix ownership
chown -R johs:johs "$PROJECT_DIR"

echo ""
echo "=== Setup Complete ==="
echo "Project: $PROJECT_DIR"
echo "Python venv: $PROJECT_DIR/services/api/.venv"
echo "Redis: $(redis-cli ping)"
echo ""
echo "To start developing:"
echo "  cd $PROJECT_DIR/services/api"
echo "  source .venv/bin/activate"
echo "  uvicorn main:app --reload --port 8000"
echo ""
echo "  cd $PROJECT_DIR/apps/web"
echo "  npm run dev"
