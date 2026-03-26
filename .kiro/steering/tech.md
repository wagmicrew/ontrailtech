# OnTrail Technology Stack

## Frontend

- React with Vite build system
- Tailwind CSS for styling
- i18next for internationalization
- wagmi for Web3 integration

## Mobile

- Expo framework
- React Native
- GPS tracking and step counting
- Device attestation for anti-cheat

## Backend

- FastAPI (Python)
- PostgreSQL database
- Redis cache
- H3 grid library for geospatial indexing

## Web3

- Solidity smart contracts
- ethers.js for blockchain interaction
- OpenZeppelin contract libraries
- ERC721 (POI NFTs, Route NFTs)
- ERC20 (Runner Tokens)

## Infrastructure

- Nginx reverse proxy
- PM2 process manager
- Ubuntu 22.04/24.04 server
- Docker for containerization
- Certbot for TLS certificates
- Mapbox for map tiles

## Testing

- Vitest for unit and integration tests
- Focus areas: bonding curves, POI grid logic, GPS validation, token simulations

## Common Commands

### Development
```bash
# Install dependencies
npm install

# Start development server (run manually in terminal)
npm run dev

# Build for production
npm run build

# Run tests
npm run test
```

### Backend
```bash
# Start FastAPI server
uvicorn main:app --reload

# Run database migrations
alembic upgrade head
```

### Deployment
```bash
# Deploy with PM2
pm2 start api/main.py --name ontrail-api
pm2 start npm --name ontrail-web -- start

# Check status
pm2 status

# View logs
pm2 logs
```

### Database
```bash
# Backup database
pg_dump ontrail > backup.sql

# Restore database
psql ontrail < backup.sql
```

## Build Order

1. Repository structure and tooling
2. Infrastructure setup (server, database, Redis)
3. Database schema implementation
4. Backend API endpoints
5. Smart contracts deployment
6. Map engine integration
7. Frontend web app
8. Mobile app
9. Admin dashboard and simulation tools
10. Testing and production deployment
