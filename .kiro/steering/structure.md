# OnTrail Project Structure

## Monorepo Organization

```
ontrail/
├── apps/
│   ├── web/              # React web application (Vite + Tailwind)
│   └── mobile/           # Expo mobile app
├── services/
│   ├── api/              # FastAPI backend service
│   └── data/             # Data gateway service
├── contracts/            # Solidity smart contracts (Base L2)
├── infra/                # Infrastructure configuration
├── packages/
│   └── shared/           # Shared TypeScript types
├── scripts/              # Deployment and utility scripts
├── docs/                 # Documentation
└── Devdoc/              # Development documentation
```

## Auth Stack

- Privy: Web2 onboarding (email/social → embedded wallet)
- ConnectKit: Web3 wallet connection (MetaMask, WalletConnect)
- Both integrated in apps/web via React providers

## Smart Contracts (Base L2)

Deployment order:
1. Treasury
2. RunnerFactory (creates ERC-20 per runner)
3. BondingCurve (pricing + minting)
4. POI NFT (ERC721)
5. Route NFT (ERC721)
6. RewardsDistributor

## Database Schema

Core tables (PostgreSQL):
- users, wallets, friends
- pois, routes, route_nfts, route_pois
- grid_cells, poi_slots
- checkins, activity_sessions, gps_points, steps
- runner_tokens, friend_shares, token_pools, token_transactions
- reputation_events, fraud_events
- admin_config, token_simulations
- translations, acl_roles, user_roles, audit_logs

## Naming Conventions

- snake_case for database tables and columns
- camelCase for JavaScript/TypeScript
- PascalCase for React components and Solidity contracts
- API endpoints use lowercase with hyphens or underscores
