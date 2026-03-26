# OnTrail Technology Stack

## Frontend

- Next.js (migrating from Vite) or React + Vite
- Tailwind CSS for styling
- wagmi + viem for Web3 interaction
- Privy for Web2+Web3 auth (email, social, embedded wallets)
- ConnectKit by Family for external wallet connection
- i18next for internationalization

## Auth & Onboarding

- Privy SDK: email/social login → auto-creates embedded wallet
- ConnectKit: MetaMask, WalletConnect, Coinbase Wallet
- Users without wallets get embedded wallets via Privy
- Frictionless Web2 onboarding with Web3 capabilities

## Mobile

- Expo framework (React Native)
- GPS tracking and step counting
- Device attestation for anti-cheat

## Backend

- FastAPI (Python)
- PostgreSQL database
- Redis cache
- H3 grid library for geospatial indexing

## Blockchain (Base L2)

- Solidity smart contracts deployed on Base
- ethers.js / viem for blockchain interaction
- OpenZeppelin contract libraries
- ERC721 (POI NFTs, Route NFTs)
- ERC20 (Runner Tokens via Factory)
- Bonding Curve contracts
- Uniswap v3 integration for TGE liquidity

## Smart Contracts

- RunnerFactory: deploys ERC-20 tokens per runner
- BondingCurve: pricing logic, mints tokens on deposit
- POIRegistry: verifies signed POIs, mints rare ones
- RewardsDistributor: handles boosts and distributions

## Indexing

- The Graph for: token trades, liquidity events, NFT mints

## Infrastructure

- Nginx reverse proxy
- PM2 process manager
- Ubuntu 22.04 server (loppio.se)
- Certbot for TLS certificates
- Mapbox for map tiles

## Testing

- Vitest for unit and integration tests
- Focus: bonding curves, POI grid logic, GPS validation, token simulations

## Common Commands

### Development
```bash
npm install
npm run dev
npm run build
npm run test
```

### Backend
```bash
uvicorn main:app --reload
alembic upgrade head
```

### Deployment
```bash
pm2 restart ontrail-api
cd apps/web && npx vite build
```
