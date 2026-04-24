#!/bin/bash
# Lens Protocol Server Deployment Script
# Run this on the server (ssh loppio) to deploy Lens Protocol integration

echo "=== Lens Protocol Server Deployment ==="
echo "Server: loppio"
echo "Testnet Address: 0x034bc3b8faae33369ad27ed89f455a95ef8f9629"
echo ""

# Navigate to API directory
cd /path/to/services/api || { echo "API directory not found"; exit 1; }

echo "=== Step 1: Running Database Migration ==="
alembic upgrade head

if [ $? -ne 0 ]; then
    echo "Migration failed. Please check your database connection."
    exit 1
fi

echo "Migration completed successfully."
echo ""

echo "=== Step 2: Seeding Lens Configuration ==="
python3 ../scripts/seed-lens-config.py

if [ $? -ne 0 ]; then
    echo "Config seeding failed. Please check the script."
    exit 1
fi

echo "Lens configuration seeded successfully."
echo ""

echo "=== Step 3: Restarting API Service ==="
pm2 restart ontrail-api

if [ $? -ne 0 ]; then
    echo "API service restart failed. Please check PM2."
    exit 1
fi

echo "API service restarted successfully."
echo ""

echo "=== Step 4: Testing Lens Endpoints ==="
echo "Testing /api/admin/lens/config..."
curl -X GET http://localhost:8000/api/admin/lens/config

echo ""
echo "=== Deployment Complete ==="
echo "Lens Protocol integration is now ready."
echo "Please configure your API key in the Admin OS UI."
