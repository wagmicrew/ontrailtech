# OnTrail Project Structure

## Monorepo Organization

```
ontrail/
├── apps/
│   ├── web/              # React web application (Vite)
│   └── mobile/           # Expo mobile app
├── services/
│   ├── api/              # FastAPI backend service
│   └── data/             # Data gateway service
├── contracts/            # Solidity smart contracts
├── infra/                # Infrastructure configuration
├── scripts/              # Deployment and utility scripts
├── docs/                 # Documentation
└── Devdoc/              # Development documentation
```

## Key Directories

### apps/web
React frontend with Vite, Tailwind CSS, and i18next. Contains:
- Login/auth flows
- Runner profile pages
- Map explorer UI
- POI mint interface
- Route explorer
- Social feed
- Token dashboards

### apps/mobile
Expo React Native app with:
- GPS tracking
- Step counting
- POI detection
- Route completion
- Push notifications

### services/api
FastAPI backend with endpoints for:
- Authentication (`/auth/login`)
- User profiles (`/users/{id}`)
- POI operations (`/poi/nearby`, `/poi/mint`)
- Check-ins (`/checkin`)
- Token operations (`/token/buy`, `/token/sell`)
- Runner profiles (`/runner/{username}`)
- Admin configuration (`/admin/config`)

### contracts
Smart contracts in deployment order:
1. Treasury
2. POI NFT (ERC721)
3. Route NFT (ERC721)
4. BondingCurve
5. FriendShares
6. RunnerToken (ERC20 template)
7. TGEFactory

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

## Configuration Files

- `.kiro/steering/` - AI assistant steering rules
- `Devdoc/` - Comprehensive project documentation
- Infrastructure configs in `infra/`
- Nginx configs for domain routing
- PM2 process configurations

## Naming Conventions

- Use snake_case for database tables and columns
- Use camelCase for JavaScript/TypeScript
- Use PascalCase for React components and Solidity contracts
- API endpoints use lowercase with hyphens or underscores
- Test files: `*.test.ts` or `*.test.js`

## Module Dependencies

Map Engine → H3 grid library
Backend API → PostgreSQL, Redis, Map Engine
Frontend → Backend API, Web3 contracts
Mobile → Backend API, GPS services
Smart Contracts → OpenZeppelin libraries
Admin Tools → Backend API, Token simulation engine
