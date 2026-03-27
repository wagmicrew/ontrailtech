# Implementation Plan: Ancient Aura System

## Overview

Implement the Ancient Aura System as a protocol-level influence layer where Ancient NFT holders amplify economic activity for runners. The implementation follows a bottom-up approach: data models first, then core engines, API endpoints, integration with existing engines, and finally frontend components. Backend is Python/FastAPI, frontend is React/TypeScript.

## Tasks

- [ ] 1. Data models and database migration
  - [x] 1.1 Add Ancient Aura SQLAlchemy models to `services/api/models.py`
    - Add `AncientHolder`, `AuraIndex`, `AuraContribution`, `InfluenceNode`, `InfluenceEdge` models
    - All use UUID primary keys, Numeric for financial/score fields, proper indexes
    - `AuraContribution` has composite unique index on `(ancient_holder_id, runner_id)`
    - `InfluenceEdge` has composite index on `(from_user_id, to_runner_id)`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 18.1, 18.2, 18.3, 18.4_

  - [-] 1.2 Create Alembic migration for aura tables
    - Create `services/api/alembic/versions/002_aura_tables.py`
    - Tables: `ancient_holders`, `aura_index`, `aura_contributions`, `influence_nodes`, `influence_edges`
    - _Requirements: 14.1, 14.2, 14.3, 18.1, 18.2_

  - [~] 1.3 Seed default aura config keys in `admin_config`
    - Add migration or seed script for: `nft_multiplier`, `aura_boost_factor`, `max_aura_boost`, `max_aura_multiplier`, `max_aura_factor`, `ancient_multiplier`, `min_reputation_threshold`, `max_contribution_percentile`
    - _Requirements: 15.1, 15.4_

- [~] 2. Add Redis cache constants and aura config helpers
  - Add aura TTL constants to `services/api/redis_client.py`: `TTL_AURA_SCORE=15`, `TTL_AURA_PERCENTILES=300`, `TTL_AURA_LEADERBOARD=60`, `TTL_AURA_CONFIG=3600`, `TTL_GRAPH_NODE=15`, `TTL_GRAPH_TRENDING=60`
  - _Requirements: 13.1, 13.6, 9.5, 20.3_

- [~] 3. Checkpoint — Ensure models and migration are correct
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement Aura Engine core (`services/api/engines/aura_engine.py`)
  - [~] 4.1 Create `aura_engine.py` with config loader and core calculation
    - `get_aura_config()`: read from Redis (TTL 1hr) → DB → hardcoded defaults, log warning on fallback
    - `calculate_aura(db, runner_id)`: compute `Σ (holderWeight × cappedBalance)` per active Ancient holder
      - `holderWeight = log(reputation + 1) × nft_multiplier`
      - `supportStrength = friendpass_count + tip_total + shares_held`
      - `cappedBalance = sqrt(supportStrength)` (whale cap)
      - Exclude holders with reputation below `min_reputation_threshold`
      - Enforce per-holder contribution cap at `max_contribution_percentile`
      - Aggregate linked wallets (same Privy user or `fraud_events` flagged) as single entity
      - Clamp totalAura >= 0
    - Upsert result to `aura_index` table and `aura_contributions` table
    - Cache in Redis with TTL 15s
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.4, 13.5, 15.3, 15.4_

  - [ ]* 4.2 Write property test: aura score is non-negative
    - **Property 1: Non-negative aura score**
    - For any combination of holder weights and support strengths, `totalAura >= 0`
    - **Validates: Requirements 2.7**

  - [ ]* 4.3 Write property test: sqrt cap reduces whale dominance
    - **Property 2: Square-root cap monotonicity**
    - For any `balance > 0`, `sqrt(balance) < balance` when `balance > 1`, ensuring whale reduction
    - **Validates: Requirements 2.4, 12.1**

  - [~] 4.4 Implement aura level classification
    - `classify_aura_level(db, total_aura)`: percentile-based boundaries (Low/Rising/Strong/Dominant/None)
    - Cache percentile boundaries in Redis with TTL 5 minutes, recalculate only on expiry
    - Aura score of 0 → "None"
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 13.6_

  - [~] 4.5 Implement recalculation queue and batching
    - `enqueue_recalculation(runner_id)`: add to Redis Set `aura:recalc_queue`
    - `process_recalculation_batch()`: process queued runner_ids in batches of 50, debounce within 5-second windows
    - _Requirements: 3.6, 13.3_

  - [~] 4.6 Implement multiplier functions for other engines
    - `get_effective_supply(db, runner_id, actual_supply)`: `supply - (auraBoostFactor × totalAura)`, clamped to `[supply * 0.5, supply]`
    - `get_effective_tips(db, runner_id, raw_tips)`: `rawTips × (1 + auraMultiplier)`, capped at `max_aura_multiplier`
    - `get_aura_boost(db, runner_id)`: token allocation boost, capped at `max_aura_boost`
    - `get_reputation_aura_factor(db, runner_id)`: reputation amplification, capped at `max_aura_factor`
    - Return unmodified values when aura is 0
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 6.1, 6.2, 6.4, 7.1, 7.2, 7.4_

  - [ ]* 4.7 Write property test: effective supply clamping
    - **Property 3: Effective supply bounds**
    - For any `actual_supply > 0` and `totalAura >= 0`, `effectiveSupply` is in `[actual_supply * 0.5, actual_supply]`
    - **Validates: Requirements 4.1, 4.5**

  - [ ]* 4.8 Write property test: zero aura produces identity multipliers
    - **Property 4: Zero aura identity**
    - When `totalAura == 0`, `effectiveSupply == actual_supply`, `effectiveTips == rawTips`, `auraBoost == 0`, `auraFactor == 0`
    - **Validates: Requirements 4.4, 5.3, 6.4, 7.4**

  - [~] 4.9 Implement spike detection and audit logging
    - When aura increases >200% within 1 hour, flag runner for review and log to `audit_logs`
    - _Requirements: 12.6_

- [~] 5. Checkpoint — Ensure aura engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Ancient NFT Indexer (`services/api/engines/ancient_indexer.py`)
  - [~] 6.1 Create `ancient_indexer.py` with polling loop
    - `AncientNFTIndexer` class with `start()`, `sync_full_state()`, `process_transfer_events()`
    - Poll Base L2 for Transfer events every 5-10 seconds
    - Store last processed block in Redis (`ancient_indexer:last_block`) for restart resilience
    - Upsert `ancient_holders` table on each Transfer event
    - Mark wallet inactive when token_count drops to 0, trigger aura recalc for affected runners
    - Retry with exponential backoff (max 3 retries) on RPC errors, log without crashing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [~] 6.2 Register indexer as FastAPI startup background task in `main.py`
    - _Requirements: 1.1_

  - [~] 6.3 Add Ancient NFT contract ABI to `web3_client.py`
    - Add `ANCIENT_NFT_ABI` with Transfer event and `balanceOf` function
    - Add `get_ancient_nft_client()` factory function
    - Add `ancient_nft_address` to config settings
    - _Requirements: 1.1_

- [ ] 7. Implement recalculation triggers in existing engines
  - [~] 7.1 Add aura recalculation hooks to `event_indexer.py`
    - After processing a FriendPass mint where buyer is Ancient holder → `enqueue_recalculation(runner_id)`
    - After processing a tip where tipper is Ancient holder → `enqueue_recalculation(runner_id)`
    - _Requirements: 3.1, 3.2_

  - [~] 7.2 Add aura recalculation hook to token buy/sell in `routers/tokens.py`
    - After share buy/sell, check if trader is Ancient holder → `enqueue_recalculation(runner_id)`
    - _Requirements: 3.3_

  - [~] 7.3 Add aura recalculation hook to `reputation_engine.py`
    - After reputation score change, if user is Ancient holder → enqueue recalc for all runners they support
    - _Requirements: 3.4_

  - [~] 7.4 Add aura recalculation from Ancient NFT Transfer events in `ancient_indexer.py`
    - On holder status change → recalculate aura for all runners that wallet supported
    - _Requirements: 3.5_

- [ ] 8. Integrate aura multipliers into existing engines
  - [~] 8.1 Modify `bonding_curve_price()` in `routers/tokens.py` to accept effective supply
    - Read aura data from Redis, compute effective supply via `get_effective_supply()`
    - Use effective supply in price calculation for runners with non-zero aura
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [~] 8.2 Modify `buy_shares()` in `routers/tokens.py` to apply aura boost to token allocation
    - Compute `allocated = amount × (1 + auraBoost)` for aura-backed runners
    - Log aura boost in `token_transaction.event_metadata`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [~] 8.3 Modify TGE threshold check to use effective tips
    - Compare `effectiveTips` (from `get_effective_tips()`) against threshold
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [~] 8.4 Modify `record_reputation_event()` in `reputation_engine.py` to apply aura factor
    - Multiply reputation gain by `(1 + auraFactor)` for runners with non-zero aura
    - Apply `ancientMultiplier` (default 1.2) for runners who are also Ancient holders
    - Ensure `reputation_score >= 0.0` after modification
    - After reputation update, call `enqueue_recalculation()` for affected runners
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [~] 9. Checkpoint — Ensure integration tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 10. Implement Influence Graph Engine (`services/api/engines/influence_engine.py`)
  - [~] 10.1 Create `influence_engine.py` with core functions
    - `calculate_influence(db, user_id)`: `Σ incoming_edge_weights × auraMultiplier`, Ancient holders get 1.25× additional multiplier
    - `upsert_edge(db, from_user_id, to_runner_id, edge_type, weight)`: upsert influence edge
    - `get_node_with_neighbors(db, user_id, max_neighbors=20)`: return node info + immediate neighbors
    - `get_trending(db)`: top aura growth + influence gain, prioritize recent growth over static ranking
    - Per-edge contribution cap from `admin_config`
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 18.1, 18.2, 18.3, 18.4_

  - [~] 10.2 Add influence edge creation hooks to existing event flows
    - On FriendPass purchase → upsert edge (type: friendpass)
    - On tip → upsert edge (type: tip)
    - On token buy → upsert edge (type: token)
    - On referral → upsert edge (type: referral)
    - _Requirements: 19.4_

  - [ ]* 10.3 Write property test: influence score with Ancient multiplier
    - **Property 5: Ancient holder influence multiplier**
    - For any Ancient holder node, influence >= equivalent non-Ancient node influence (given same edges)
    - **Validates: Requirements 19.2**

- [ ] 11. Implement Aura API Router (`services/api/routers/aura.py`)
  - [~] 11.1 Create `aura.py` router with runner aura endpoint
    - `GET /aura/{runner_id}`: return `totalAura`, `auraLevel`, `ancientSupporterCount`, `weightedAura`, and list of Ancient supporters with contributions
    - Serve from Redis cache, fall back to DB on miss
    - Return 404 for invalid/non-existent runner_id
    - _Requirements: 9.1, 9.2, 9.6_

  - [~] 11.2 Add leaderboard endpoints
    - `GET /aura/leaderboard/runners`: top 100 runners by totalAura, cached 60s in Redis
    - `GET /aura/leaderboard/ancients`: top 100 Ancient holders by total influence, cached 60s in Redis
    - _Requirements: 9.3, 9.4, 9.5_

  - [~] 11.3 Register aura router in `main.py`
    - `app.include_router(aura.router, prefix="/aura", tags=["Aura"])`
    - _Requirements: 9.1_

  - [ ]* 11.4 Write unit tests for aura API endpoints
    - Test cache hit/miss behavior, 404 on invalid runner, leaderboard ordering
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ] 12. Implement Graph API Router (`services/api/routers/graph.py`)
  - [~] 12.1 Create `graph.py` router with graph endpoints
    - `GET /graph/node/{username}`: node info + max 20 neighbors, cached 15s, max 200KB response
    - `GET /graph/neighbors/{username}`: connected nodes with edge weights, paginated
    - `GET /graph/trending`: top aura growth + influence gain
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 26.1, 26.3_

  - [~] 12.2 Register graph router in `main.py`
    - `app.include_router(graph.router, prefix="/graph", tags=["Graph"])`
    - _Requirements: 20.1_

  - [ ]* 12.3 Write unit tests for graph API endpoints
    - Test neighbor limit, pagination, response size cap, trending ordering
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 27.1, 27.2_

- [~] 13. Implement EIP-712 signing for aura-adjusted parameters
  - Create `services/api/engines/aura_signer.py`
  - Sign `AuraParams` (runnerId, effectiveSupply, auraBoost, effectiveTips, timestamp) with platform private key
  - Pass signed parameters to contract calls instead of having contracts compute aura
  - Store periodic aura score snapshots for future Merkle proof compatibility
  - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [ ] 14. Implement admin config management for aura
  - [~] 14.1 Add aura config update endpoint to `routers/admin.py`
    - On aura config update: invalidate Redis cache entry, log change in `audit_logs`
    - _Requirements: 15.1, 15.2_

  - [ ]* 14.2 Write unit test for config cache invalidation
    - Test that updating an aura config key invalidates Redis and logs to audit_logs
    - _Requirements: 15.2_

- [~] 15. Implement aura serialization with round-trip consistency
  - Serialize `AuraIndex` records to JSON for Redis with Numeric fields as strings
  - Deserialize back to same numeric precision
  - Validate required fields (`totalAura`, `auraLevel`) on cache read, fall back to DB on failure
  - All Numeric aura fields serialized as strings in API responses
  - _Requirements: 17.1, 17.2, 17.3, 17.4_

- [~] 16. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Implement frontend AuraIndicator component
  - [~] 17.1 Create `apps/web/src/components/AuraIndicator.tsx`
    - Display aura level badge with color mapping: Low→gray, Rising→blue, Strong→purple, Dominant→gold
    - Show Ancient supporter count ("Backed by N Ancients")
    - Render glow/ring effect around avatar for Strong/Dominant levels
    - Display boost feedback toast on tip/FriendPass actions ("🔥 Aura Boost: +X% tip effectiveness") for 3 seconds
    - No aura indicators when aura score is 0
    - Fetch from `/aura/{runner_id}` endpoint within existing profile layout
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 23.1, 23.2, 23.3_

  - [~] 17.2 Integrate AuraIndicator into runner profile pages
    - Add to `RunnerLanding.tsx` and `Profile.tsx`
    - _Requirements: 10.6_

- [~] 18. Implement AuraRings overlay component
  - Create `apps/web/src/components/AuraRings.tsx`
  - Overlay behind activity rings on runner profile
  - Animated gradient based on aura level: Rising→faint gradient, Strong→flowing glow, Dominant→dynamic shimmer
  - Low opacity (<30%), slow wave motion (northern lights style), target 30-60 FPS
  - Must not interfere with readability or exceed 5% CPU on mobile
  - _Requirements: 22.1, 22.2, 22.3, 22.4_

- [ ] 19. Implement Aura Leaderboard page
  - [~] 19.1 Create `apps/web/src/pages/AuraLeaderboard.tsx`
    - Two tabs: "Top Aura Runners" / "Most Influential Ancients"
    - Runners tab: rank, avatar, username, aura level badge, total aura, Ancient supporter count from `/aura/leaderboard/runners`
    - Ancients tab: rank, avatar/wallet, username, total influence, runners supported count from `/aura/leaderboard/ancients`
    - Click runner → navigate to runner profile
    - Click Ancient → navigate to profile (if registered) or wallet summary
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [~] 19.2 Add leaderboard route to `apps/web/src/pages/Routes.tsx` (app router)
    - _Requirements: 11.1_

- [ ] 20. Implement Influence Graph visualization
  - [~] 20.1 Update `apps/web/src/components/InfluenceGraph.tsx`
    - Force-directed graph: node size ∝ reputation, glow intensity ∝ aura
    - Edge thickness ∝ weight, pulse animation for recent activity
    - Zoom/pan support, max 50 visible nodes, lazy-load on demand
    - Tap node → center + load neighbors with smooth transition (<300ms)
    - Support local (1-hop) and extended (2-3 hop) graph views
    - Maintain 60 FPS during interaction
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 24.1, 24.2, 24.3, 24.4, 27.1_

  - [~] 20.2 Add "Follow the Alpha" discovery action
    - Navigate to high-aura clusters from trending endpoint
    - _Requirements: 26.2_

- [~] 21. Implement Aura Feedback system in frontend
  - Add feedback toasts/notifications to existing interaction flows:
    - "⚡ Aura Boost Applied" when supporting aura-backed runner
    - "🔥 This runner is gaining momentum" on significant aura increase
    - Visual pulse animation + notification on aura level threshold crossing
  - _Requirements: 25.1, 25.2, 25.3_

- [~] 22. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Backend: Python/FastAPI. Frontend: React/TypeScript with Tailwind CSS
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design
- The aura engine runs entirely off-chain; contracts receive pre-computed signed parameters
