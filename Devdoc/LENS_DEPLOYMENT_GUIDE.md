# Lens Protocol Deployment Guide

## Overview
This guide covers deploying the Lens Protocol integration on the server (ssh loppio).

## Prerequisites
- SSH access to loppio server
- Database access (PostgreSQL)
- Hardhat installed on server
- PM2 for process management

## Server Deployment Steps

### 1. SSH into Server
```bash
ssh loppio
```

### 2. Navigate to Project Directory
```bash
cd /path/to/ontrail
```

### 3. Pull Latest Changes
```bash
git pull origin main
```

### 4. Run Database Migration
```bash
cd services/api
alembic upgrade head
```

This will create the following tables:
- `lens_config`
- `graphql_message_types`
- `graphql_message_templates`

### 5. Seed Lens Configuration
```bash
cd ../scripts
python3 seed-lens-config.py
```

This will initialize the Lens config with:
- Testnet Address: `0x034bc3b8faae33369ad27ed89f455a95ef8f9629`
- Mode: `simulate`
- Chain ID: `371112` (Lens Chain Testnet)
- API URL: `https://api.testnet.lens.xyz`
- GraphQL URL: `https://api.testnet.lens.xyz/graphql`
- RPC URL: `https://rpc.testnet.lens.xyz`

### 6. Restart API Service
```bash
pm2 restart ontrail-api
```

### 7. Verify Deployment
```bash
curl -X GET http://localhost:8000/api/admin/lens/config
```

## Hardhat Testing Setup

### 1. Navigate to Contracts Directory
```bash
cd /path/to/contracts
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the contracts directory:
```env
LENS_PRIVATE_KEY=your_private_key_here
PLATFORM_PRIVATE_KEY=your_platform_private_key_here
ALCHEMY_API_KEY=your_alchemy_api_key
```

### 4. Test Lens Chain Connection
```bash
npx hardhat run scripts/test-lens-connection.js --network lens_testnet
```

### 5. Compile Contracts
```bash
npx hardhat compile
```

### 6. Run Tests
```bash
npx hardhat test --network localhost
```

### 7. Deploy to Lens Testnet
```bash
npx hardhat run scripts/deploy-lens-testnet.js --network lens_testnet
```

## Admin OS Configuration

### 1. Access Admin OS
Navigate to `/admin/lens` in your web application.

### 2. Configure API Key
Enter your Lens API key: `YHh26i-gv-Tpvun2KFmVVKJV5-O2O-c1Jl`

### 3. Configure Authentication
- Auth Endpoint URL: Set your custom auth endpoint
- Auth Secret: Set your auth secret
- Auth Access: Set to `custom` for App Verification

### 4. Configure Onramp
- Enable GHO Onramp: Toggle as needed
- GHO Amount: Set default amount (e.g., 0.1)
- Enable Lens Token Onramp: Toggle as needed
- Lens Token Amount: Set default amount (e.g., 0.1)

### 5. Switch to Live Mode (When Ready)
- Change Mode from `simulate` to `live`
- Enter contract addresses when deployed
- Test with real transactions

## Contract Deployment

### FriendPass Contract (Polygon)
```bash
npx hardhat run scripts/deploy-friendpass-polygon.js --network polygon
```

### Profile Wallet Contract (Polygon)
```bash
npx hardhat run scripts/deploy-profile-wallet-polygon.js --network polygon
```

### Verify Contracts
```bash
npx hardhat verify --network polygon CONTRACT_ADDRESS CONSTRUCTOR_ARGS
```

## Troubleshooting

### Database Migration Fails
- Check database connection in `.env`
- Ensure PostgreSQL is running
- Check database permissions

### API Service Won't Start
- Check PM2 logs: `pm2 logs ontrail-api`
- Check port conflicts
- Verify Python dependencies are installed

### Hardhat Connection Issues
- Verify RPC URLs are correct
- Check private key format (0x prefix)
- Ensure wallet has testnet tokens

## Network Details

### Lens Chain Testnet
- Chain ID: 371112
- RPC: https://rpc.testnet.lens.xyz
- Explorer: https://explorer.lens.xyz
- Your Address: 0x034bc3b8faae33369ad27ed89f455a95ef8f9629

### Lens Chain Mainnet
- Chain ID: 371111
- RPC: https://rpc.lens.xyz
- Explorer: https://explorer.lens.xyz

### Polygon
- Chain ID: 137
- RPC: https://polygon-rpc.com
- Explorer: https://polygonscan.com

### Polygon Amoy Testnet
- Chain ID: 80002
- RPC: https://rpc-amoy.polygon.technology
- Explorer: https://amoy.polygonscan.com

## Quick Deployment Script

Run the automated deployment script:
```bash
bash scripts/deploy-lens-server.sh
```

This will:
1. Run database migration
2. Seed Lens configuration
3. Restart API service
4. Test endpoints

## Next Steps

1. Complete server deployment
2. Configure API key in Admin OS
3. Test GraphQL endpoints
4. Test onramp functionality
5. Deploy contracts when ready
6. Switch to live mode
