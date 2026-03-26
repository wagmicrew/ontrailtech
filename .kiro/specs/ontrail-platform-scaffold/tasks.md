# Implementation Plan: OnTrail Web3 Social-Fi Platform

## Overview

This implementation plan breaks down the OnTrail platform into discrete, actionable coding tasks. The platform is a comprehensive Web3 Social-Fi ecosystem combining React/Vite web app, Expo mobile app, FastAPI backend, PostgreSQL database, Redis cache, Solidity smart contracts, and Nginx gateway with domain routing. Implementation follows a phased approach starting with infrastructure and core services, then building out frontend applications, and finally integrating advanced features like token economy and admin tools.

## Tasks

- [x] 1. Initialize monorepo structure and development tooling
  - Create root directory structure: apps/, services/, contracts/, infra/, scripts/, docs/
  - Set up package.json with workspace configuration for monorepo
  - Configure TypeScript for shared types across packages
  - Set up ESLint and Prettier for code consistency
  - Create .gitignore with appropriate exclusions
  - Initialize README.md with project overview and setup instructions
  - _Requirements: Infrastructure foundation_

- [x] 2. Set up PostgreSQL database and schema
  - [x] 2.1 Install PostgreSQL and create ontrail database
    - Install PostgreSQL 15+ on server
    - Create database user with appropriate permissions
    - Configure connection pooling settings
    - _Requirements: 15.5_

  - [x] 2.2 Implement core user and authentication tables
    - Create users table with id, username, email, wallet_address, reputation_score, created_at, updated_at
    - Create wallets table for multi-wallet support
    - Create auth_nonces table for challenge-response authentication
    - Add indexes on wallet_address for fast lookups
    - _Requirements: 1.1, 1.2, 1.4, 15.1_

  - [x] 2.3 Implement POI and grid system tables
    - Create grid_cells table with h3_index, resolution, max_pois, rarity_distribution, current_pois_count
    - Create poi_slots table with grid_id, rarity, occupied, poi_id
    - Create pois table with name, description, latitude, longitude, rarity, owner_id, grid_id, nft_token_id, minted_at
    - Add composite index on pois(grid_id, rarity)
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 15.2_


  - [x] 2.4 Implement route and activity tracking tables
    - Create routes table with name, description, creator_id, difficulty, distance_km, elevation_gain_m, estimated_duration_min, completion_count
    - Create route_pois junction table linking routes to POIs with sequence order
    - Create activity_sessions table with user_id, route_id, start_time, end_time, status
    - Create checkins table with user_id, poi_id, session_id, timestamp, latitude, longitude
    - Create gps_points table with session_id, latitude, longitude, timestamp, accuracy, speed
    - Add indexes on gps_points(session_id, timestamp) and checkins(session_id)
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 15.3_

  - [x] 2.5 Implement token economy tables
    - Create runner_tokens table with runner_id, token_name, token_symbol, contract_address, total_supply, bonding_curve_pool, status, tge_date
    - Create friend_shares table with owner_id, runner_id, amount, purchase_price, purchased_at
    - Create token_pools table with runner_id, current_supply, liquidity_pool, threshold
    - Create token_transactions table with buyer_id, seller_id, runner_id, amount, price, tx_hash, timestamp
    - Add indexes on friend_shares(runner_id, owner_id)
    - _Requirements: 10.5, 10.6, 10.7, 15.4_

  - [x] 2.6 Implement reputation and fraud detection tables
    - Create reputation_events table with user_id, event_type, weight, metadata, timestamp
    - Create fraud_events table with user_id, session_id, event_type, severity, metadata, timestamp
    - Create admin_config table with key, value, updated_by, updated_at
    - Create audit_logs table with user_id, action, resource_type, resource_id, metadata, timestamp
    - _Requirements: 8.9, 7.8, 12.6, 22.1-22.6_

  - [x] 2.7 Implement supporting tables
    - Create route_nfts table with route_id, user_id, nft_token_id, completion_timestamp
    - Create translations table with language_code, key, value
    - Create acl_roles and user_roles tables for role-based access control
    - Create token_simulations table with simulation_name, parameters, results, created_at
    - _Requirements: 6.7, 19.2, 13.5_

- [x] 3. Set up Redis cache and session management
  - Install Redis 7+ on server
  - Configure Redis connection settings with connection pooling
  - Implement session storage with 24-hour TTL
  - Set up cache namespaces for different data types (sessions, grid_cells, reputation_weights, token_prices)
  - Configure cache eviction policies
  - _Requirements: 15.6, 15.7_

- [x] 4. Initialize FastAPI backend service structure
  - [x] 4.1 Create FastAPI application scaffold
    - Set up services/api/ directory structure
    - Create main.py with FastAPI app initialization
    - Configure CORS middleware with allowed origins
    - Set up request logging middleware
    - Configure exception handlers for common errors
    - _Requirements: 14.9_

  - [x] 4.2 Implement database connection and ORM models
    - Set up SQLAlchemy with async support
    - Create database.py with connection pool configuration (20-50 connections)
    - Define ORM models for all database tables
    - Implement database migration system using Alembic
    - _Requirements: 15.5_

  - [x] 4.3 Implement Redis client and caching utilities
    - Create redis_client.py with connection management
    - Implement cache decorator for function memoization
    - Create cache invalidation utilities
    - Implement session management functions
    - _Requirements: 15.6, 15.7, 15.8_

  - [x] 4.4 Implement authentication and JWT utilities
    - Create auth.py with wallet signature verification
    - Implement JWT token generation with RS256 algorithm
    - Create nonce generation and validation functions
    - Implement token refresh logic
    - Create authentication dependency for protected routes
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 14.6_


- [x] 5. Implement Map Engine with H3 grid system
  - [x] 5.1 Create Map Engine core module
    - Install h3-py library for H3 grid operations
    - Create map_engine.py with H3 cell conversion functions
    - Implement getH3Cell() to convert GPS coordinates to H3 index at resolution 9
    - Implement haversine distance calculation for geographic queries
    - _Requirements: 2.1, 2.2_

  - [x] 5.2 Implement grid cell initialization logic
    - Create initializeGridCell() function with default configuration
    - Set default max_pois to 10 per cell
    - Implement rarity distribution: 50% common, 30% rare, 15% epic, 5% legendary
    - Create POI slot records for each rarity level
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.3 Implement POI slot availability checking
    - Create getAvailableSlots() function to query unoccupied slots
    - Order slots by rarity (legendary → epic → rare → common)
    - Implement slot occupancy validation
    - _Requirements: 3.2, 4.3_

  - [x] 5.4 Implement nearby POI search
    - Create getNearbyPOIs() function with radius parameter
    - Use haversine formula for distance filtering
    - Return POIs with name, description, rarity, coordinates, owner info
    - Optimize query to respond within 100ms
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 15.10_

  - [ ]* 5.5 Write unit tests for Map Engine
    - Test H3 cell index generation for various coordinates
    - Test grid cell initialization with different configurations
    - Test POI slot availability logic
    - Test nearby POI search with various radii
    - _Requirements: 2.1, 4.1_

- [x] 6. Implement Reputation Engine
  - [x] 6.1 Create Reputation Engine core module
    - Create reputation_engine.py with calculation functions
    - Implement calculateReputation() with weighted components
    - Load reputation weights from admin_config or cache
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 6.2 Implement reputation component calculations
    - Calculate POI score: count × poi_weight
    - Calculate route score: count × route_weight
    - Calculate friend network score: sum of friend reputations × friend_weight
    - Calculate token impact score: sum of market caps × token_weight
    - Ensure non-negative results
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 6.3 Implement reputation event recording
    - Create recordEvent() function to store reputation events
    - Store user_id, event_type, weight, metadata, timestamp
    - Support event types: poi_minted, route_completed, friend_reputation_gain, token_launch
    - _Requirements: 8.9_

  - [x] 6.4 Implement reputation breakdown API
    - Create getReputationBreakdown() to show component contributions
    - Return total and individual scores for POIs, routes, friends, tokens
    - _Requirements: 8.8_

  - [ ]* 6.5 Write property test for reputation non-negativity
    - **Property 4: Reputation Non-Negativity**
    - **Validates: Requirements 8.6**
    - Use fast-check to generate random user states
    - Verify reputation score is always ≥ 0

  - [ ]* 6.6 Write unit tests for Reputation Engine
    - Test reputation calculation with various component values
    - Test weight updates and recalculation
    - Test reputation breakdown accuracy
    - _Requirements: 8.1, 8.7_

- [x] 7. Implement Fraud Detection System
  - [x] 7.1 Create Fraud Detection core module
    - Create fraud_detection.py with validation functions
    - Implement validateGPSTrack() for movement pattern analysis
    - Define fraud flags: impossible_speed, teleportation, gps_spoofing, route_discontinuity
    - _Requirements: 7.1, 7.2_

  - [x] 7.2 Implement GPS track validation logic
    - Validate timestamps are in chronological order
    - Calculate speed between consecutive points using haversine distance
    - Flag speeds exceeding 30 km/h as impossible_speed
    - Flag large distances (>1km) in short time (<10s) as teleportation
    - Flag GPS accuracy >50m as gps_spoofing
    - Calculate confidence score: 1 - (flagged_points / total_points)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

  - [x] 7.3 Implement fraud event recording and scoring
    - Create recordFraudEvent() to store fraud events
    - Store user_id, session_id, event_type, severity, metadata
    - Implement getFraudScore() to calculate user fraud score from historical events
    - _Requirements: 7.8, 7.9_

  - [ ]* 7.4 Write property test for GPS track validation
    - **Property 5: GPS Track Continuity and Speed Validation**
    - **Validates: Requirements 7.1, 7.3**
    - Generate valid GPS tracks with realistic speeds
    - Verify all valid tracks pass validation
    - Generate invalid tracks with impossible speeds
    - Verify all invalid tracks are flagged

  - [ ]* 7.5 Write unit tests for Fraud Detection
    - Test speed calculation accuracy
    - Test fraud flag detection for various anomalies
    - Test confidence score calculation
    - _Requirements: 7.1, 7.2, 15.12_


- [x] 8. Implement Token Economy Engine
  - [x] 8.1 Create Token Economy core module
    - Create token_economy.py with bonding curve functions
    - Implement calculatePrice() using formula: price = base_price + k × supply²
    - Support both single share and bulk purchase price calculations
    - _Requirements: 9.1, 9.2_

  - [x] 8.2 Implement bonding curve price calculation
    - Create calculateBondingCurvePrice() that sums prices for each share
    - Loop from current_supply to current_supply + amount
    - Ensure monotonically increasing prices
    - Cache prices in Redis with 30-second TTL
    - Return price quotes within 50ms
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 15.9_

  - [x] 8.3 Implement share buy/sell transaction logic
    - Create buyShares() function with investor and runner validation
    - Prevent self-purchase (investor_id ≠ runner_id)
    - Verify sufficient balance before purchase
    - Create friend_share record with amount and purchase_price
    - Update bonding curve pool and token pool supply
    - Create sellShares() function with inverse bonding curve calculation
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_

  - [x] 8.4 Implement TGE threshold checking
    - Create checkTGEThreshold() to verify pool balance ≥ threshold
    - Verify runner token status is 'tge_ready'
    - Return current pool size and required threshold
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ]* 8.5 Write property test for bonding curve monotonicity
    - **Property 2: Bonding Curve Monotonicity**
    - **Validates: Requirements 9.3**
    - Generate random supply values and amounts
    - Verify price at supply+1 > price at supply

  - [ ]* 8.6 Write unit tests for Token Economy Engine
    - Test bonding curve price calculation accuracy
    - Test share buy/sell transactions
    - Test TGE threshold detection
    - Test self-purchase prevention
    - _Requirements: 9.1, 10.1, 10.2_

- [ ] 9. Implement backend API authentication endpoints
  - [x] 9.1 Create authentication endpoints
    - Implement POST /auth/challenge to generate nonce
    - Implement POST /auth/login to verify signature and issue JWT
    - Implement POST /auth/register to create new user account
    - Implement POST /auth/refresh to refresh access token
    - Validate wallet addresses and signatures
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7_

  - [ ] 9.2 Implement rate limiting for authentication
    - Limit authentication attempts to 5 per minute per IP
    - Return HTTP 429 when rate limit exceeded
    - _Requirements: 14.4, 14.5_

  - [ ]* 9.3 Write integration tests for authentication flow
    - Test challenge generation and nonce uniqueness
    - Test signature verification
    - Test JWT token issuance and validation
    - Test token refresh logic
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 10. Implement backend API user endpoints
  - [x] 10.1 Create user profile endpoints
    - Implement GET /users/{user_id} to retrieve user profile
    - Implement PUT /users/{user_id} to update profile
    - Implement GET /runner/{username} for subdomain routing
    - Validate input fields before persisting changes
    - _Requirements: 1.6, 20.6_

  - [x] 10.2 Implement user reputation endpoint
    - Implement GET /users/{user_id}/reputation for reputation breakdown
    - Return total score and component contributions
    - _Requirements: 8.8_

  - [ ]* 10.3 Write integration tests for user endpoints
    - Test user profile retrieval and updates
    - Test runner profile subdomain routing
    - Test reputation breakdown API
    - _Requirements: 1.6_

- [ ] 11. Implement backend API POI endpoints
  - [x] 11.1 Create POI discovery endpoint
    - Implement GET /poi/nearby with lat, lon, radius_km parameters
    - Call Map Engine getNearbyPOIs()
    - Return POIs with all metadata within 100ms
    - Implement caching for nearby POI results (5-minute TTL)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 15.10_

  - [x] 11.2 Create POI minting endpoint
    - Implement POST /poi/mint with name, latitude, longitude
    - Validate user authentication
    - Call Map Engine to get H3 cell and check slot availability
    - Mint POI NFT on blockchain (placeholder for now)
    - Record POI in database with grid_id, owner_id, nft_token_id
    - Mark POI slot as occupied
    - Record reputation event
    - Return error if no slots available with nearby alternatives
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 21.1_

  - [ ] 11.3 Implement POI minting rate limiting
    - Limit POI mints to 10 per hour per user
    - Return HTTP 429 when limit exceeded
    - _Requirements: 3.10, 14.3_

  - [ ]* 11.4 Write property test for POI scarcity invariant
    - **Property 1: POI Scarcity Invariant**
    - **Validates: Requirements 3.2, 4.4**
    - Generate random POI mint sequences
    - Verify total POIs per cell never exceeds max_pois
    - Verify rarity counts match distribution

  - [ ]* 11.5 Write integration tests for POI endpoints
    - Test nearby POI search with various radii
    - Test POI minting flow end-to-end
    - Test slot availability validation
    - Test rate limiting enforcement
    - _Requirements: 2.1, 3.1, 3.10_


- [ ] 12. Implement backend API route endpoints
  - [x] 12.1 Create route management endpoints
    - Implement POST /route/create to create new routes
    - Validate route name (3-100 characters) and minimum 2 POIs
    - Validate all POI IDs exist in database
    - Calculate total distance by summing distances between consecutive POIs
    - Store route with creator_id, difficulty, estimated_duration_min
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 12.2 Create route tracking endpoints
    - Implement POST /route/start to begin route tracking session
    - Create activity_session with route_id, user_id, start timestamp
    - Implement POST /gps/track to record GPS points
    - Store GPS points with session_id, latitude, longitude, timestamp, accuracy, speed
    - _Requirements: 6.1, 17.2, 17.3_

  - [x] 12.3 Create check-in endpoint
    - Implement POST /checkin to validate POI check-ins
    - Verify user GPS coordinates within 50 meters of POI location
    - Record check-in with poi_id, user_id, timestamp, GPS coordinates
    - _Requirements: 6.2, 6.3_

  - [x] 12.4 Create route completion endpoint
    - Implement POST /route/complete to finalize route
    - Verify check-ins exist for all POIs in route
    - Return error listing missing POI names if incomplete
    - Mint Route NFT on blockchain (placeholder for now)
    - Record route_nft in database with completion timestamp
    - Increment route completion_count
    - Record reputation event with weight based on difficulty
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 21.4_

  - [ ]* 12.5 Write property test for route completion validity
    - **Property 7: Route Completion Validity**
    - **Validates: Requirements 6.4**
    - Generate routes with various POI counts
    - Verify completion only succeeds with all check-ins

  - [ ]* 12.6 Write integration tests for route endpoints
    - Test route creation with valid and invalid data
    - Test route tracking session lifecycle
    - Test check-in validation with GPS proximity
    - Test route completion flow
    - _Requirements: 5.1, 6.1, 6.4_

- [ ] 13. Implement backend API token economy endpoints
  - [x] 13.1 Create token price quote endpoint
    - Implement GET /token/price/{runner_id} with amount parameter
    - Call Token Economy Engine calculatePrice()
    - Return total_cost, current_supply, price_per_share
    - Respond within 50ms using Redis cache
    - _Requirements: 9.4, 9.7_

  - [x] 13.2 Create share trading endpoints
    - Implement POST /token/buy for purchasing runner shares
    - Validate investor_id ≠ runner_id
    - Verify sufficient balance
    - Execute buyShares() transaction
    - Return transaction record with tx_hash, amount, price
    - Implement POST /token/sell for selling shares
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.9, 10.10_

  - [x] 13.3 Create token pool status endpoint
    - Implement GET /token/pool/{runner_id} to get pool status
    - Return current_supply, liquidity_pool, threshold, readyForTGE
    - _Requirements: 11.1, 11.2_

  - [ ]* 13.4 Write integration tests for token endpoints
    - Test price quote calculation
    - Test share buy/sell transactions
    - Test self-purchase prevention
    - Test pool status retrieval
    - _Requirements: 9.4, 10.1, 10.2_

- [ ] 14. Checkpoint - Ensure backend API tests pass
  - Run all unit tests for Map Engine, Reputation Engine, Fraud Detection, Token Economy
  - Run all integration tests for API endpoints
  - Verify database schema is correctly implemented
  - Ensure all tests pass, ask the user if questions arise

- [ ] 15. Implement Solidity smart contracts
  - [x] 15.1 Set up Hardhat development environment
    - Initialize contracts/ directory with Hardhat
    - Install OpenZeppelin contracts library
    - Configure hardhat.config.js with networks (localhost, testnet, mainnet)
    - Set up deployment scripts structure
    - _Requirements: 16.1_

  - [x] 15.2 Implement Treasury contract
    - Create Treasury.sol with OpenZeppelin Ownable
    - Implement deposit and withdraw functions
    - Add reentrancy guards
    - Emit events for all state changes
    - _Requirements: 16.2, 16.6_

  - [x] 15.3 Implement POI NFT contract (ERC721)
    - Create POINFT.sol extending OpenZeppelin ERC721
    - Implement mint function with metadata URI
    - Add access control for minting (only backend can mint)
    - Implement pausability for emergency stops
    - Emit Transfer events
    - _Requirements: 3.4, 16.1, 16.3, 16.6_

  - [x] 15.4 Implement Route NFT contract (ERC721)
    - Create RouteNFT.sol extending OpenZeppelin ERC721
    - Implement mint function with route metadata
    - Add access control for minting
    - Implement pausability
    - _Requirements: 6.6, 16.1, 16.3, 16.6_

  - [x] 15.5 Implement BondingCurve contract
    - Create BondingCurve.sol with price calculation logic
    - Implement calculatePrice() using formula: base + k × supply²
    - Implement buyShares() function with payment handling
    - Implement sellShares() function with refund logic
    - Add reentrancy guards on all fund transfer functions
    - Use SafeMath for all arithmetic operations
    - Emit events for buy/sell transactions
    - _Requirements: 9.1, 9.2, 16.2, 16.4, 16.6_

  - [x] 15.6 Implement FriendShares contract
    - Create FriendShares.sol to track share ownership
    - Implement share transfer functions
    - Track total shares per runner
    - Add access control
    - _Requirements: 10.5, 10.6, 16.5_

  - [x] 15.7 Implement RunnerToken contract (ERC20 template)
    - Create RunnerToken.sol extending OpenZeppelin ERC20
    - Implement constructor with name, symbol, total_supply parameters
    - Make contract deployable by TGEFactory
    - _Requirements: 11.4, 16.1_

  - [x] 15.8 Implement TGEFactory contract
    - Create TGEFactory.sol to deploy runner tokens
    - Implement triggerTGE() function
    - Deploy new ERC20 token with runner's name and symbol
    - Calculate allocations: 35% runner, 20% friends, 25% liquidity, 10% DAO, 10% platform
    - Distribute tokens to all recipients
    - Create DEX liquidity pool (Uniswap V2 integration)
    - Emit TGE event with token address and allocations
    - _Requirements: 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 16.6_

  - [ ]* 15.9 Write property test for token allocation conservation
    - **Property 3: Token Allocation Conservation**
    - **Validates: Requirements 11.10**
    - Generate random TGE scenarios
    - Verify sum of allocations equals 100% of total supply

  - [ ]* 15.10 Write unit tests for smart contracts
    - Test Treasury deposit/withdraw
    - Test POI and Route NFT minting
    - Test BondingCurve price calculations
    - Test FriendShares tracking
    - Test TGEFactory token deployment and allocation
    - _Requirements: 9.1, 11.10, 16.8_


- [ ] 16. Integrate blockchain contracts with backend API
  - [ ] 16.1 Create Web3 client utilities
    - Install web3.py library
    - Create web3_client.py with connection to Ethereum RPC
    - Load contract ABIs and addresses from configuration
    - Implement contract interaction functions
    - _Requirements: 3.4, 6.6_

  - [ ] 16.2 Integrate POI NFT minting
    - Update POI mint endpoint to call POINFT.mint()
    - Store transaction hash and token ID in database
    - Handle blockchain transaction failures with rollback
    - _Requirements: 3.4, 3.5, 21.6_

  - [ ] 16.3 Integrate Route NFT minting
    - Update route completion endpoint to call RouteNFT.mint()
    - Store transaction hash and token ID in database
    - Handle transaction failures
    - _Requirements: 6.6, 6.7_

  - [ ] 16.4 Integrate bonding curve transactions
    - Update buyShares() to call BondingCurve.buyShares()
    - Update sellShares() to call BondingCurve.sellShares()
    - Handle transaction failures and gas estimation
    - _Requirements: 10.5, 10.6, 10.9_

  - [ ] 16.5 Implement TGE trigger endpoint
    - Create POST /token/tge/{runner_id} endpoint
    - Verify TGE eligibility (status and threshold)
    - Call TGEFactory.triggerTGE()
    - Update runner_token status to 'launched'
    - Record reputation event for token launch
    - Return token address and liquidity pool address
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.12, 11.13, 21.5_

  - [ ]* 16.6 Write integration tests for blockchain integration
    - Test POI NFT minting end-to-end
    - Test Route NFT minting end-to-end
    - Test bonding curve buy/sell transactions
    - Test TGE trigger flow
    - Use local Hardhat network for testing
    - _Requirements: 3.4, 6.6, 10.5, 11.4_

- [ ] 17. Implement admin configuration endpoints
  - [x] 17.1 Create admin authentication middleware
    - Implement require_admin dependency
    - Verify user has admin role from user_roles table
    - Return 403 Forbidden if not admin
    - _Requirements: 12.1_

  - [x] 17.2 Create admin configuration endpoints
    - Implement POST /admin/config to update system parameters
    - Support updating reputation weights (poi_weight, route_weight, friend_weight, token_weight)
    - Support updating bonding curve parameters (base_price, k)
    - Support updating TGE threshold
    - Support updating grid cell defaults (max_pois, rarity_distribution)
    - Validate rarity distribution sums to 100%
    - Validate all numeric parameters are positive
    - Store changes in admin_config table with admin_user_id and timestamp
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [x] 17.3 Create token simulation endpoint
    - Implement POST /admin/simulate for token economy simulations
    - Accept parameters: base_price, k, investor_count, avg_investment, tge_threshold
    - Simulate investor purchases over time
    - Calculate final supply, pool size, TGE reached status, final price
    - Store simulation results in token_simulations table
    - Return results within 1 second for up to 10,000 transactions
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 17.4 Create audit log query endpoint
    - Implement GET /admin/audit-logs with filtering parameters
    - Support filtering by date range, user, event type
    - Return paginated audit log entries
    - _Requirements: 22.7_

  - [ ]* 17.5 Write integration tests for admin endpoints
    - Test configuration updates with valid and invalid data
    - Test token simulations with various parameters
    - Test audit log querying and filtering
    - Test admin authorization enforcement
    - _Requirements: 12.1, 13.1_

- [ ] 18. Checkpoint - Ensure backend integration complete
  - Run all integration tests including blockchain interactions
  - Verify smart contracts deploy correctly on local network
  - Test end-to-end flows: POI mint, route completion, token trading, TGE
  - Ensure all tests pass, ask the user if questions arise

- [ ] 19. Set up Nginx reverse proxy and domain routing
  - [x] 19.1 Install and configure Nginx
    - Install Nginx 1.24+ on server
    - Create base nginx.conf with worker settings
    - Configure upstream servers for API and web app
    - _Requirements: 20.7_

  - [x] 19.2 Configure domain routing
    - Route ontrail.tech to landing page static files
    - Route app.ontrail.tech to React web application
    - Route api.ontrail.tech to FastAPI backend (port 8000)
    - Route data.ontrail.tech to data gateway service
    - Configure wildcard *.ontrail.tech for runner profiles
    - Extract username from subdomain and pass to backend
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_

  - [x] 19.3 Configure TLS certificates
    - Install Certbot for Let's Encrypt
    - Obtain TLS certificates for all domains
    - Configure automatic certificate renewal
    - Enforce HTTPS with HTTP to HTTPS redirect
    - _Requirements: 20.7, 20.8, 20.9, 14.9_

  - [ ]* 19.4 Test domain routing
    - Verify each subdomain routes to correct service
    - Test wildcard subdomain routing with various usernames
    - Verify HTTPS enforcement
    - _Requirements: 20.1-20.9_

- [ ] 20. Implement React web application
  - [x] 20.1 Initialize React app with Vite
    - Create apps/web/ directory
    - Initialize Vite project with React and TypeScript
    - Install dependencies: react-router-dom, @tanstack/react-query, wagmi, ethers
    - Configure Tailwind CSS
    - Set up i18next for internationalization
    - _Requirements: 19.1, 19.2_

  - [ ] 20.2 Create authentication flow
    - Implement wallet connection with wagmi
    - Create login page with MetaMask integration
    - Implement challenge-response authentication flow
    - Store JWT token in localStorage
    - Create authentication context provider
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 20.3 Create map explorer UI
    - Integrate Mapbox for map rendering
    - Display user's current location
    - Show nearby POI markers with rarity indicators
    - Implement POI detail modal
    - Add search and filter controls
    - _Requirements: 2.3, 2.5, 2.6_

  - [ ] 20.4 Create POI minting interface
    - Create POI mint form with name and description inputs
    - Show current location on map
    - Display available slot information
    - Handle mint transaction and show confirmation
    - Display error messages for no available slots
    - _Requirements: 3.1, 3.8, 21.1_

  - [ ] 20.5 Create route explorer and creation UI
    - Display list of available routes with filters
    - Show route details with POI list and map visualization
    - Create route creation interface with POI selection
    - Calculate and display route distance and difficulty
    - _Requirements: 5.1, 5.2, 5.4_

  - [ ] 20.6 Create runner profile pages
    - Display runner stats: POIs owned, routes completed, reputation score
    - Show reputation breakdown chart
    - Display owned POI NFTs and Route NFTs
    - Show token information if launched
    - _Requirements: 8.8_

  - [ ] 20.7 Create token dashboard
    - Display runner token information and bonding curve chart
    - Show current price and supply
    - Implement buy/sell share interface
    - Display friend share holdings
    - Show TGE progress bar
    - _Requirements: 9.7, 10.10, 11.2_

  - [ ] 20.8 Implement internationalization
    - Load translations from backend API
    - Detect browser language and set default
    - Create language selector component
    - Apply translations to all UI text
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_

  - [ ]* 20.9 Write component tests for web app
    - Test authentication flow
    - Test map explorer interactions
    - Test POI minting form
    - Test route creation
    - Test token trading interface


- [ ] 21. Implement Expo mobile application
  - [x] 21.1 Initialize Expo project
    - Create apps/mobile/ directory
    - Initialize Expo project with TypeScript
    - Install dependencies: @react-navigation/native, expo-location, expo-sensors
    - Configure app.json with permissions
    - _Requirements: 17.1_

  - [ ] 21.2 Implement GPS tracking functionality
    - Request location permissions from device
    - Implement background GPS tracking every 5 seconds
    - Record latitude, longitude, timestamp, accuracy, speed
    - Send GPS points to backend in batches every 30 seconds
    - Queue points locally when offline and sync when connected
    - Display real-time distance, duration, pace
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8_

  - [ ] 21.3 Implement POI discovery on mobile
    - Display map with user location
    - Show nearby POI markers
    - Update POI markers every 5 seconds as user moves
    - Implement POI detail view
    - _Requirements: 2.5_

  - [ ] 21.4 Implement route tracking on mobile
    - Create route start screen with route selection
    - Display route map with POI waypoints
    - Track GPS during route activity
    - Show progress indicator for checked-in POIs
    - Implement check-in button when near POI
    - Display completion screen when route finished
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 21.5 Implement device attestation
    - Generate device attestation challenge on app start
    - Use SafetyNet for Android and DeviceCheck for iOS
    - Send signed attestation response to backend
    - Handle attestation verification failures
    - Require fresh attestation every 24 hours
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

  - [ ] 21.6 Implement mobile authentication
    - Create wallet connection flow for mobile
    - Implement challenge-response authentication
    - Store JWT token securely
    - Handle token refresh
    - _Requirements: 1.1, 1.2, 1.7_

  - [ ]* 21.7 Write integration tests for mobile app
    - Test GPS tracking accuracy
    - Test POI discovery and updates
    - Test route tracking flow
    - Test check-in validation
    - Test offline GPS point queuing

- [ ] 22. Implement admin dashboard
  - [ ] 22.1 Create admin dashboard UI
    - Create admin login page with role verification
    - Build dashboard layout with navigation
    - Display key metrics: active users, POIs minted, routes completed, tokens launched
    - _Requirements: 24.8_

  - [ ] 22.2 Create configuration management interface
    - Build forms for updating reputation weights
    - Build forms for updating bonding curve parameters
    - Build forms for updating TGE thresholds
    - Build forms for updating grid cell defaults
    - Display current configuration values
    - Show validation errors clearly
    - _Requirements: 12.1-12.8_

  - [ ] 22.3 Create token simulation interface
    - Build simulation parameter input form
    - Display simulation results with charts
    - Show bonding curve visualization
    - Allow saving and comparing multiple simulations
    - _Requirements: 13.1-13.7_

  - [ ] 22.4 Create audit log viewer
    - Build audit log table with filtering
    - Implement date range picker
    - Add user and event type filters
    - Display detailed event information
    - _Requirements: 22.1-22.7_

  - [ ] 22.5 Create monitoring dashboard
    - Display API response time metrics
    - Show database connection pool usage
    - Display blockchain transaction success/failure rates
    - Show disk space and memory usage
    - Display error rates
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.8_

  - [ ]* 22.6 Write tests for admin dashboard
    - Test configuration updates
    - Test simulation execution
    - Test audit log filtering
    - Test metrics display

- [ ] 23. Implement monitoring and alerting
  - [ ] 23.1 Set up monitoring infrastructure
    - Install monitoring tools (Prometheus, Grafana, or similar)
    - Configure metrics collection from API
    - Set up database metrics collection
    - Configure blockchain transaction monitoring
    - _Requirements: 24.1-24.6_

  - [ ] 23.2 Configure alerting rules
    - Alert if API 95th percentile response time > 500ms
    - Alert if database connection pool usage > 80%
    - Alert if blockchain transaction failure rate > 5%
    - Alert if disk space < 20%
    - Alert if memory usage > 85%
    - Alert if error rate > 1%
    - Configure email and Slack notifications
    - _Requirements: 24.1-24.7_

  - [ ] 23.3 Create monitoring dashboard
    - Build Grafana dashboard with key metrics
    - Display request rate, error rate, response time
    - Show active users and system health
    - _Requirements: 24.8_

- [ ] 24. Implement data backup and recovery
  - [ ] 24.1 Set up automated database backups
    - Configure daily PostgreSQL backups at 2 AM UTC
    - Implement backup retention: 7 daily, 4 weekly, 12 monthly
    - Encrypt backups with AES-256
    - Store backups in secure location
    - _Requirements: 23.1, 23.2, 23.3_

  - [ ] 24.2 Implement backup verification
    - Create weekly backup verification script
    - Perform test restores to verify integrity
    - Alert administrators on backup failures
    - Document restore procedure
    - _Requirements: 23.4, 23.5, 23.6_

  - [ ] 24.3 Set up Redis backup
    - Configure Redis persistence (RDB + AOF)
    - Implement Redis backup schedule
    - _Requirements: 23.7_

- [ ] 25. Implement security hardening
  - [ ] 25.1 Configure API rate limiting
    - Implement 100 requests per minute per IP
    - Implement 1000 requests per hour per user
    - Implement 10 POI mints per hour per user
    - Implement 5 auth attempts per minute per IP
    - Return HTTP 429 with appropriate headers
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ] 25.2 Implement input validation and sanitization
    - Validate all user inputs against expected formats
    - Sanitize strings to prevent SQL injection
    - Sanitize strings to prevent XSS attacks
    - Validate GPS coordinates are within valid ranges
    - _Requirements: 14.8_

  - [ ] 25.3 Configure CORS and security headers
    - Whitelist allowed origins for CORS
    - Restrict to HTTPS in production
    - Add security headers (CSP, X-Frame-Options, etc.)
    - _Requirements: 14.9_

  - [ ] 25.4 Implement data privacy features
    - Hash email addresses before storage
    - Encrypt sensitive data at rest with AES-256
    - Implement data export feature for GDPR compliance
    - Implement data deletion feature
    - Anonymize data after deletion requests
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.9_

  - [ ]* 25.5 Perform security audit
    - Review all API endpoints for vulnerabilities
    - Test rate limiting enforcement
    - Test input validation
    - Verify encryption implementation
    - _Requirements: 14.1-14.9_


- [ ] 26. Implement error handling and logging
  - [ ] 26.1 Create centralized error handling
    - Implement custom exception classes for different error types
    - Create global exception handler in FastAPI
    - Return appropriate HTTP status codes and error messages
    - Log all errors with context information
    - _Requirements: 21.1-21.7_

  - [ ] 26.2 Implement user-friendly error messages
    - Return clear error messages for POI mint failures
    - Return clear error messages for insufficient balance
    - Return clear error messages for GPS spoofing detection
    - Return clear error messages for route completion failures
    - Return clear error messages for TGE trigger failures
    - Return clear error messages for blockchain transaction failures
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.8_

  - [ ] 26.3 Set up structured logging
    - Configure logging with timestamp, user_id, endpoint, error details
    - Implement log rotation and retention
    - Set up log aggregation for production
    - _Requirements: 21.7_

  - [ ]* 26.4 Test error handling
    - Test all error scenarios return correct status codes
    - Test error messages are user-friendly
    - Verify errors are logged correctly
    - _Requirements: 21.1-21.8_

- [ ] 27. Implement performance optimizations
  - [ ] 27.1 Add database indexes
    - Create index on users.wallet_address
    - Create composite index on pois(grid_id, rarity)
    - Create index on gps_points(session_id, timestamp)
    - Create index on friend_shares(runner_id, owner_id)
    - Verify query performance improvements
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [ ] 27.2 Implement caching strategy
    - Cache user sessions in Redis (24-hour TTL)
    - Cache grid cell configurations (1-hour TTL)
    - Cache reputation weights (1-hour TTL)
    - Cache token prices (30-second TTL)
    - Cache nearby POI results (5-minute TTL)
    - Implement cache invalidation on writes
    - _Requirements: 15.6, 15.7, 15.8, 15.9_

  - [ ] 27.3 Optimize database queries
    - Implement connection pooling with 20-50 connections
    - Use prepared statements for repeated queries
    - Optimize N+1 query problems with eager loading
    - _Requirements: 15.5_

  - [ ]* 27.4 Performance testing
    - Test POI nearby query responds within 100ms
    - Test reputation calculation within 200ms
    - Test token price calculation within 50ms
    - Test GPS track validation within 500ms for 1000 points
    - _Requirements: 15.10, 15.11, 15.12_

- [ ] 28. Create deployment scripts and documentation
  - [ ] 28.1 Create deployment scripts
    - Create script to deploy smart contracts to testnet
    - Create script to deploy smart contracts to mainnet
    - Create script to set up server infrastructure
    - Create script to deploy backend API with PM2
    - Create script to deploy web app
    - Create script to build and deploy mobile app

  - [ ] 28.2 Create environment configuration
    - Create .env.example files for all services
    - Document required environment variables
    - Create separate configs for development, staging, production
    - Document API keys and secrets management

  - [ ] 28.3 Write deployment documentation
    - Document server setup process
    - Document database setup and migration process
    - Document smart contract deployment process
    - Document Nginx configuration
    - Document monitoring setup
    - Document backup and recovery procedures

  - [ ] 28.4 Create developer documentation
    - Document API endpoints with examples
    - Document smart contract interfaces
    - Document database schema
    - Document development workflow
    - Create contribution guidelines

- [ ] 29. Perform end-to-end testing
  - [ ] 29.1 Test complete user journey
    - Test user registration and authentication
    - Test POI discovery and minting
    - Test route creation and completion
    - Test token trading and TGE
    - Test reputation calculation
    - Verify all flows work end-to-end

  - [ ] 29.2 Test mobile app flows
    - Test GPS tracking during route
    - Test POI check-ins
    - Test offline functionality
    - Test device attestation

  - [ ] 29.3 Test admin functionality
    - Test configuration updates
    - Test token simulations
    - Test audit log queries
    - Test monitoring dashboard

  - [ ]* 29.4 Load testing
    - Test API performance under load
    - Test database performance with concurrent users
    - Test blockchain transaction handling
    - Identify and fix bottlenecks

- [ ] 30. Deploy to production
  - [ ] 30.1 Deploy infrastructure
    - Set up production server (Ubuntu 22.04/24.04)
    - Install and configure PostgreSQL
    - Install and configure Redis
    - Install and configure Nginx
    - Configure firewall and security settings

  - [ ] 30.2 Deploy smart contracts
    - Deploy contracts to Ethereum mainnet (or chosen network)
    - Verify contracts on block explorer
    - Transfer ownership to appropriate addresses
    - Fund Treasury contract

  - [ ] 30.3 Deploy backend services
    - Deploy FastAPI backend with PM2
    - Run database migrations
    - Configure environment variables
    - Start services and verify health

  - [ ] 30.4 Deploy frontend applications
    - Build and deploy React web app
    - Configure CDN for static assets
    - Build and submit mobile app to app stores
    - Verify all domains are accessible

  - [ ] 30.5 Configure monitoring and alerts
    - Enable monitoring dashboards
    - Test alert notifications
    - Set up log aggregation
    - Configure backup schedules

  - [ ] 30.6 Final production verification
    - Test all critical user flows in production
    - Verify blockchain transactions work correctly
    - Test domain routing and TLS certificates
    - Monitor system performance and errors
    - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints (tasks 14, 18, 30.6) ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit and integration tests validate specific examples and edge cases
- Implementation follows the phased approach: infrastructure → backend → contracts → frontend → mobile → admin → production
- The platform uses multiple languages: TypeScript/JavaScript (frontend/mobile), Python (backend), Solidity (contracts)
- All blockchain interactions include error handling and transaction rollback on failure
- Security is prioritized throughout with rate limiting, input validation, encryption, and access control
- Performance targets are specified for critical operations (POI queries <100ms, reputation <200ms, etc.)
- The monorepo structure allows shared types and utilities across packages
- Testing strategy includes unit tests, integration tests, property-based tests, and end-to-end tests
