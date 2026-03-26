#!/bin/bash
set -e

echo "========================================="
echo "  OnTrail WSL Environment Setup"
echo "========================================="

# Update system packages
echo ""
echo "[1/5] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# Install Node.js 22 LTS via NodeSource
echo ""
echo "[2/5] Installing Node.js 22 LTS..."
if command -v node &> /dev/null; then
    echo "Node.js already installed: $(node --version)"
else
    apt-get install -y -qq ca-certificates curl gnupg
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs
    echo "Node.js installed: $(node --version)"
    echo "npm installed: $(npm --version)"
fi

# Install PM2 globally
echo ""
echo "[3/5] Installing PM2..."
if command -v pm2 &> /dev/null; then
    echo "PM2 already installed: $(pm2 --version)"
else
    npm install -g pm2
    echo "PM2 installed: $(pm2 --version)"
fi

# Install PostgreSQL
echo ""
echo "[4/5] Installing PostgreSQL..."
if command -v psql &> /dev/null; then
    echo "PostgreSQL already installed: $(psql --version)"
else
    apt-get install -y -qq postgresql postgresql-contrib
    echo "PostgreSQL installed: $(psql --version)"
fi

# Start and configure PostgreSQL
echo ""
echo "[5/5] Configuring PostgreSQL..."
service postgresql start

# Create ontrail database and user
su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='ontrail'\" | grep -q 1 || psql -c \"CREATE USER ontrail WITH PASSWORD 'ontrail_dev' CREATEDB;\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='ontrail'\" | grep -q 1 || psql -c \"CREATE DATABASE ontrail OWNER ontrail;\""

# Enable required extensions
su - postgres -c "psql -d ontrail -c 'CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";'"
su - postgres -c "psql -d ontrail -c 'CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";'"

echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "  Node.js:     $(node --version)"
echo "  npm:         $(npm --version)"
echo "  PM2:         $(pm2 --version)"
echo "  PostgreSQL:  $(psql --version | head -1)"
echo ""
echo "  Database:    ontrail"
echo "  DB User:     ontrail"
echo "  DB Password: ontrail_dev"
echo "  DB Host:     localhost"
echo "  DB Port:     5432"
echo ""
echo "========================================="
