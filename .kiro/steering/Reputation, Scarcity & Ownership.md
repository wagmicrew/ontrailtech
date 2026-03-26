---
inclusion: fileMatch
fileMatchPattern: ['**/engines/reputation_engine.py', '**/engines/token_economy.py', '**/engines/fraud_detection.py', '**/contracts/*.sol', '**/models.py', '**/shared/src/types.ts', '**/routers/tokens.py', '**/routers/pois.py', '**/routers/routes.py', '**/engines/map_engine.py']
---

# Reputation, Scarcity & Ownership Rules

## Reputation Engine

- Reputation is a weighted composite score stored on `User.reputation_score` (float).
- Four scoring components: `pois_owned`, `routes_completed`, `friend_network`, `token_impact`.
- Default weights are defined in `services/api/engines/reputation_engine.py` (`DEFAULT_WEIGHTS`). Admin-configurable weights are stored in `admin_config` with key `reputation_weights` and cached in Redis with `TTL_REP_WEIGHTS`.
- Always recalculate and persist `User.reputation_score` after recording a `ReputationEvent`.
- Friend network score is recursive: each friend's `reputation_score` is multiplied by `friend_weight`. Keep this query efficient; avoid unbounded recursion.
- Reputation must never go below `0.0`.
- All reputation changes must create a `ReputationEvent` row with `event_type`, `weight`, and optional `event_metadata` JSON.

## Fraud & Anti-Cheat Impact on Reputation

- Fraud detection flags: `impossible_speed`, `teleportation`, `gps_spoofing`, `step_mismatch`, `route_discontinuity`, `device_attestation_failed`.
- Severity levels: `low`, `medium`, `high`, `critical` with weights `0.1`, `0.3`, `0.7`, `1.0`.
- Fraud score is normalized to `0.0–1.0` via `get_fraud_score()`. A high fraud score should gate minting and token operations.
- GPS validation thresholds: max speed `30 km/h`, max accuracy `50 m`, teleport distance `1 km` in under `10 s`.
- Never allow POI minting or route completion for sessions that fail GPS validation.

## POI Scarcity System

- POIs use H3 geospatial grid indexing (default resolution 9).
- Each `GridCell` has a `max_pois` cap and a `rarity_distribution` JSON mapping `{common, rare, epic, legendary}` to slot counts.
- `POISlot` tracks per-rarity availability within a grid cell. A POI can only be minted if an unoccupied slot of the matching rarity exists.
- Rarity tiers: `common`, `rare`, `epic`, `legendary` (defined as `Rarity` type in `packages/shared/src/types.ts`).
- When minting a POI, always: check slot availability → validate GPS proximity → assign slot → mint on-chain → record `ReputationEvent`.
- POI ownership is tracked both off-chain (`POI.owner_id`) and on-chain via `POINFT` (ERC-721). Keep these in sync.
- The `POINFT` contract emits `POIMinted(tokenId, owner, rarity)`. Index this event for consistency checks.

## Route NFTs & Ownership

- Route completion mints a `RouteNFT` (ERC-721) via the `RouteNFT` contract.
- Difficulty tiers: `easy`, `moderate`, `hard`, `expert` (defined as `Difficulty` type).
- The `RouteMinted(tokenId, owner, difficulty)` event must be indexed.
- A route links to POIs via the `route_pois` join table with a `position` column for ordering.
- Increment `Route.completion_count` on each successful completion.

## Token Economy & Bonding Curves

- Each runner has a personal ERC-20 token created via `RunnerToken` contract.
- Bonding curve formula: `price(i) = base_price + k * i²` where `i` is the supply index.
- Default parameters: `base_price = 0.001 ETH`, `k = 0.0001`.
- Buy cost is the sum of marginal prices from `supply` to `supply + amount - 1`.
- Sell payout is the sum from `supply - 1` down to `supply - amount`.
- Self-purchase is forbidden (`investor_id != runner_id`).
- Amount must be positive; supply must be sufficient for sells.
- Token statuses: `bonding_curve` → `tge_ready` → `launched`.
- TGE triggers when `liquidity_pool >= threshold`. After TGE, liquidity deploys to Uniswap v3 on Base.
- All trades create a `TokenTransaction` row. Cache price quotes in Redis with `TTL_TOKEN_PRICE`.

## Smart Contract Conventions

- All contracts use Solidity `^0.8.24` with OpenZeppelin v5 imports.
- Standard patterns: `Ownable(msg.sender)`, `ReentrancyGuard`, `Pausable`.
- NFT contracts (`POINFT`, `RouteNFT`) extend `ERC721URIStorage` for metadata.
- Minting is `onlyOwner` and `whenNotPaused` — the API backend is the owner/minter.
- The `BondingCurve` contract handles share accounting on-chain with `shares[runner][investor]` mapping.
- Refund excess ETH on buy; validate pool balance on sell.
- Emit events for all state changes: `SharesBought`, `SharesSold`, `POIMinted`, `RouteMinted`.

## Data Integrity Rules

- Use `UUID` primary keys everywhere (generated via `uuid4`).
- Numeric financial fields (`bonding_curve_pool`, `purchase_price`, `amount`, `price`) use `Numeric` / `Decimal` — never `Float`.
- Timestamps default to `datetime.utcnow`. Use `onupdate` for `updated_at` columns.
- Composite indexes exist on `(grid_id, rarity)` for POIs and `(runner_id, owner_id)` for friend shares. Maintain these for query performance.
- Off-chain and on-chain state must stay consistent. If an on-chain mint fails, roll back the database transaction.
