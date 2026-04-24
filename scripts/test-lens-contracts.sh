#!/bin/bash
# Hardhat Testing Script for Lens Protocol Contracts
# Run this on the server (ssh loppio) to test Lens Protocol integration

echo "=== Lens Protocol Contract Testing Script ==="
echo "Server: loppio"
echo "Network: Lens Chain Testnet"
echo "Wallet: 0x034bc3b8faae33369ad27ed89f455a95ef8f9629"
echo ""

# Navigate to contracts directory
cd /path/to/contracts || { echo "Contracts directory not found"; exit 1; }

# Check if Hardhat is installed
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found. Please install Node.js and npm."
    exit 1
fi

echo "=== Installing Dependencies ==="
npm install

echo "=== Compiling Contracts ==="
npx hardhat compile

echo "=== Running Tests ==="
npx hardhat test --network localhost

echo "=== Deploying to Local Network ==="
npx hardhat run scripts/deploy.js --network localhost

echo "=== Testing Lens Chain Testnet Connection ==="
npx hardhat run scripts/test-lens-connection.js --network lens_testnet

echo "=== Testing Contract Deployment on Lens Testnet ==="
npx hardhat run scripts/deploy-lens-testnet.js --network lens_testnet

echo "=== Verifying Contracts on Lens Explorer ==="
npx hardhat verify --network lens_testnet CONTRACT_ADDRESS CONSTRUCTOR_ARGS

echo ""
echo "=== Testing Complete ==="
echo "Check the output above for any errors."
