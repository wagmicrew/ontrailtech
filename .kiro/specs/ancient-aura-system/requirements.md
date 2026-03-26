# Requirements Document

## Introduction

This document defines the requirements for the Ancient Aura System feature of the OnTrail platform. The Ancient Aura System is a protocol-level enhancement that amplifies economic activity around runners supported by Ancient NFT holders. Ancient NFT holders act as economic amplifiers: their backing of a runner produces an "Aura" influence multiplier that accelerates bonding curve progression, increases token demand pressure, boosts reputation gains, and provides visible trust signals in the UI. The system introduces an Aura Engine (backend service), an Aura Index (per-runner data structure), on-chain Ancient NFT ownership indexing on Base L2, and frontend Aura visualizations including leaderboards.

## Glossary

- **Ancient_NFT**: An ERC-721 or ERC-1155 NFT on Base L2 airdropped to Ethereum snapshot holders. Holding an Ancient_NFT qualifies a wallet as an Ancient holder with economic amplification privileges.
- **Aura_Engine**: The backend service that calculates per-runner aura scores, applies multipliers to bonding curve pricing, token allocation, TGE acceleration, and reputation scoring. Runs within the FastAPI backend.
- **Aura_Index**: The data structure (database table and Redis cache) tracking each runner's `totalAura`, `ancientSupporterCount`, `weightedAura`, and `auraLevel` for fast retrieval.
- **Aura_Score**: A numeric value representing the aggregate influence of Ancient holders supporting a given runner, computed as `Σ (AncientHolderWeight × SupportStrength)`.
- **AncientHolderWeight**: The influence weight of a single Ancient holder, computed as `log(reputationScore + 1) × NFT_multiplier`.
- **SupportStrength**: The strength of an Ancient holder's support for a specific runner, derived from FriendPass holdings, tip contributions, and token participation for that runner.
- **NFT_Multiplier**: A configurable multiplier based on the Ancient_NFT tier or quantity held. Stored in `admin_config`.
- **Aura_Level**: A human-readable tier derived from the Aura_Score: Low (0–25th percentile), Rising (25th–50th), Strong (50th–75th), Dominant (75th–100th).
- **Aura_Boost_Factor**: The multiplier applied to bonding curve effective supply reduction, computed from `totalAura` and a configurable scaling constant.
- **Aura_Multiplier**: The multiplier applied to tip effectiveness and token allocation, derived from the runner's Aura_Score.
- **Ancient_NFT_Indexer**: The backend process that monitors Ancient_NFT ownership on Base L2 and maintains an up-to-date mapping of wallet addresses to Ancient holder status.
- **Aura_Leaderboard**: The ranked lists of runners by Aura_Score and Ancient holders by total influence contributed.
- **Backend_API**: The FastAPI backend providing all API endpoints for aura data, leaderboards, and runner profiles.
- **Bonding_Curve_Engine**: The existing token economy engine (`token_economy.py`) that calculates bonding curve prices and manages share trading.
- **Reputation_Engine**: The existing reputation engine (`reputation_engine.py`) that calculates weighted reputation scores.
- **Runner_Profile**: The frontend component displaying a runner's profile, stats, and now Aura indicators.
- **Sybil_Resistance**: Anti-abuse mechanisms including reputation weighting, square-root balance capping, and linked-wallet collusion detection.

## Requirements

### Requirement 1: Ancient NFT Ownership Indexing

**User Story:** As a platform operator, I want Ancient NFT ownership on Base L2 to be indexed and kept current, so that the Aura Engine can identify which wallets qualify as Ancient holders.

#### Acceptance Criteria

1. WHEN the Ancient_NFT_Indexer starts, THE Ancient_NFT_Indexer SHALL scan the Ancient_NFT contract on Base L2 for all current token holders and persist each holder's wallet address and token count to the `ancient_holders` database table.
2. WHEN a Transfer event is emitted by the Ancient_NFT contract, THE Ancient_NFT_Indexer SHALL update the `ancient_holders` table within 30 seconds to reflect the new ownership state.
3. WHEN a wallet's Ancient_NFT balance changes to zero, THE Ancient_NFT_Indexer SHALL mark that wallet as inactive in the `ancient_holders` table and trigger an aura recalculation for all runners that wallet supported.
4. THE Ancient_NFT_Indexer SHALL poll the Base L2 chain for Transfer events at an interval of 5–10 seconds.
5. IF the Ancient_NFT_Indexer encounters a chain RPC error, THEN THE Ancient_NFT_Indexer SHALL retry with exponential backoff (max 3 retries) and log the failure without crashing.
6. THE Ancient_NFT_Indexer SHALL store the last processed block number in Redis so that restarts resume from the correct position without reprocessing.

### Requirement 2: Aura Score Calculation

**User Story:** As a runner backed by Ancient holders, I want my aura score to reflect the combined influence of my Ancient supporters, so that my economic benefits scale with the quality and quantity of support.

#### Acceptance Criteria

1. WHEN the Aura_Engine calculates a runner's Aura_Score, THE Aura_Engine SHALL compute it as `Σ (AncientHolderWeight × SupportStrength)` across all active Ancient holders supporting that runner.
2. WHEN the Aura_Engine computes AncientHolderWeight for a holder, THE Aura_Engine SHALL use the formula `log(reputationScore + 1) × NFT_multiplier` where `reputationScore` is the holder's current `User.reputation_score` and `NFT_multiplier` is retrieved from `admin_config`.
3. WHEN the Aura_Engine computes SupportStrength for a holder-runner pair, THE Aura_Engine SHALL aggregate the holder's FriendPass count for that runner, total tip contributions to that runner, and token participation (shares held) for that runner into a single numeric value.
4. WHEN an Ancient holder's contribution is calculated, THE Aura_Engine SHALL apply a square-root cap: `auraContribution = sqrt(balance)` where `balance` is the holder's total financial participation, to limit whale influence.
5. THE Aura_Engine SHALL complete a single runner's aura calculation within 50 milliseconds.
6. WHEN the Aura_Engine finishes calculating a runner's Aura_Score, THE Aura_Engine SHALL persist the result to the `aura_index` database table and cache it in Redis with a TTL of 10–30 seconds.
7. THE Aura_Engine SHALL ensure that an Aura_Score is never negative; the minimum value is 0.0.

### Requirement 3: Aura Recalculation Triggers

**User Story:** As a runner, I want my aura score to update automatically when relevant economic events occur, so that my aura always reflects the current state of Ancient holder support.

#### Acceptance Criteria

1. WHEN a new tip is recorded for a runner and the tipper is an active Ancient holder, THE Aura_Engine SHALL recalculate that runner's Aura_Score within 5 seconds.
2. WHEN a FriendPass is purchased for a runner and the buyer is an active Ancient holder, THE Aura_Engine SHALL recalculate that runner's Aura_Score within 5 seconds.
3. WHEN a bonding curve share is bought or sold for a runner and the trader is an active Ancient holder, THE Aura_Engine SHALL recalculate that runner's Aura_Score within 5 seconds.
4. WHEN an Ancient holder's reputation score changes, THE Aura_Engine SHALL enqueue aura recalculations for all runners that holder supports.
5. WHEN an Ancient_NFT Transfer event changes a wallet's holder status, THE Aura_Engine SHALL recalculate aura scores for all runners previously or newly supported by that wallet.
6. WHEN multiple recalculation triggers fire for the same runner within a 5-second window, THE Aura_Engine SHALL batch them into a single recalculation to avoid redundant computation.

### Requirement 4: Bonding Curve Acceleration

**User Story:** As a runner with high aura, I want my bonding curve to progress faster, so that my token reaches TGE sooner due to Ancient holder backing.

#### Acceptance Criteria

1. WHEN the Bonding_Curve_Engine calculates a buy price for a runner with a non-zero Aura_Score, THE Bonding_Curve_Engine SHALL compute an effective supply as `effectiveSupply = supply - (auraBoostFactor × totalAura)` where `effectiveSupply` is clamped to a minimum of 0.
2. WHEN the effective supply is used in pricing, THE Bonding_Curve_Engine SHALL produce a lower price per share compared to the same runner with zero Aura_Score at the same actual supply.
3. THE Bonding_Curve_Engine SHALL retrieve the `auraBoostFactor` from `admin_config` with a default value of 0.1.
4. WHEN a runner's Aura_Score is 0, THE Bonding_Curve_Engine SHALL use the standard bonding curve formula without modification.
5. THE Bonding_Curve_Engine SHALL ensure that the effective supply reduction from aura never exceeds 50% of the actual supply, preventing extreme price distortion.

### Requirement 5: Token Allocation Boost

**User Story:** As an investor buying shares in an aura-backed runner, I want to receive bonus tokens reflecting the runner's Ancient support, so that investing in aura-backed runners is more attractive.

#### Acceptance Criteria

1. WHEN a share purchase is executed for a runner with a non-zero Aura_Score, THE Bonding_Curve_Engine SHALL compute the allocated tokens as `baseTokens × (1 + auraBoost)` where `auraBoost` is derived from the runner's cached Aura_Score.
2. THE Bonding_Curve_Engine SHALL cap `auraBoost` at a configurable maximum (default 0.5, meaning a maximum 50% bonus) stored in `admin_config`.
3. WHEN a runner's Aura_Score is 0, THE Bonding_Curve_Engine SHALL allocate the standard `baseTokens` without any bonus.
4. THE Bonding_Curve_Engine SHALL log each aura-boosted allocation as a `token_transaction` with `event_metadata` containing the applied `auraBoost` value.

### Requirement 6: TGE Acceleration

**User Story:** As a runner with strong Ancient backing, I want tips to count for more toward my TGE threshold, so that high-aura runners reach token launch faster.

#### Acceptance Criteria

1. WHEN a tip is received for a runner with a non-zero Aura_Score, THE Aura_Engine SHALL compute effective tips as `effectiveTips = rawTips × (1 + auraMultiplier)` where `auraMultiplier` is derived from the runner's Aura_Score.
2. THE Aura_Engine SHALL cap `auraMultiplier` at a configurable maximum (default 1.0, meaning tips count for at most double) stored in `admin_config`.
3. WHEN the TGE threshold check runs for a runner, THE Bonding_Curve_Engine SHALL compare `effectiveTips` (not raw tips) against the TGE threshold to determine readiness.
4. WHEN a runner's Aura_Score is 0, THE Aura_Engine SHALL set `effectiveTips` equal to `rawTips` with no multiplier applied.

### Requirement 7: Reputation Integration

**User Story:** As a runner backed by Ancient holders, I want my reputation gains to be amplified by my aura, so that Ancient-backed runners build trust and status faster.

#### Acceptance Criteria

1. WHEN a reputation event is recorded for a runner with a non-zero Aura_Score, THE Reputation_Engine SHALL compute the effective reputation gain as `reputationGain × (1 + auraFactor)` where `auraFactor` is derived from the runner's cached Aura_Score.
2. THE Reputation_Engine SHALL cap `auraFactor` at a configurable maximum (default 0.5) stored in `admin_config`.
3. WHEN the final reputation score is computed for a runner who is also an Ancient holder, THE Reputation_Engine SHALL apply an Ancient multiplier stack: `finalReputation = base × ancientMultiplier × auraMultiplier` where `ancientMultiplier` is a configurable value (default 1.2) for Ancient holders.
4. WHEN a runner's Aura_Score is 0 and the runner is not an Ancient holder, THE Reputation_Engine SHALL compute reputation using the standard formula without any aura or Ancient multipliers.
5. THE Reputation_Engine SHALL ensure that `User.reputation_score` remains at or above 0.0 after applying aura-modified reputation gains.

### Requirement 8: Aura Level Classification

**User Story:** As a user viewing a runner's profile, I want to see a clear aura level label, so that I can quickly assess the runner's Ancient backing strength.

#### Acceptance Criteria

1. WHEN the Aura_Engine computes a runner's Aura_Score, THE Aura_Engine SHALL classify the score into one of four levels: Low, Rising, Strong, or Dominant.
2. THE Aura_Engine SHALL determine level thresholds using percentile-based boundaries across all runners with non-zero aura: Low (0–25th percentile), Rising (25th–50th), Strong (50th–75th), Dominant (75th–100th).
3. WHEN a runner has an Aura_Score of 0, THE Aura_Engine SHALL assign the level "None" (no aura).
4. WHEN the Aura_Engine recalculates percentile boundaries, THE Aura_Engine SHALL do so at most once per 5 minutes and cache the boundaries in Redis.
5. THE Aura_Engine SHALL persist the computed `auraLevel` string alongside the `totalAura` in the `aura_index` table and Redis cache.

### Requirement 9: Aura API Endpoints

**User Story:** As a frontend developer, I want API endpoints to retrieve aura data for runners and Ancient holders, so that I can display aura information and leaderboards in the UI.

#### Acceptance Criteria

1. WHEN a GET request is made to `/aura/{runner_id}`, THE Backend_API SHALL return the runner's `totalAura`, `auraLevel`, `ancientSupporterCount`, `weightedAura`, and the list of Ancient supporters with their individual contributions.
2. WHEN a GET request is made to `/aura/{runner_id}`, THE Backend_API SHALL serve the response from Redis cache when available, falling back to database query on cache miss.
3. WHEN a GET request is made to `/aura/leaderboard/runners`, THE Backend_API SHALL return the top 100 runners ranked by `totalAura` in descending order, each entry including `runnerId`, `username`, `totalAura`, `auraLevel`, and `ancientSupporterCount`.
4. WHEN a GET request is made to `/aura/leaderboard/ancients`, THE Backend_API SHALL return the top 100 Ancient holders ranked by total influence contributed across all runners, each entry including `walletAddress`, `username`, `totalInfluence`, and `runnersSupported` count.
5. WHEN a GET request is made to `/aura/leaderboard/runners` or `/aura/leaderboard/ancients`, THE Backend_API SHALL cache the leaderboard response in Redis with a TTL of 60 seconds.
6. IF an invalid or non-existent `runner_id` is provided to `/aura/{runner_id}`, THEN THE Backend_API SHALL return a 404 response with a descriptive error message.

### Requirement 10: Frontend Aura Display

**User Story:** As a user viewing a runner's profile, I want to see visual aura indicators including glow effects, supporter count, and aura level, so that I can perceive the runner's Ancient-backed influence at a glance.

#### Acceptance Criteria

1. WHEN the Runner_Profile loads for a runner with a non-zero Aura_Score, THE Runner_Profile SHALL display the aura level label (Low, Rising, Strong, Dominant) with a corresponding color (gray, blue, purple, gold).
2. WHEN the Runner_Profile loads for a runner with a non-zero Aura_Score, THE Runner_Profile SHALL display the number of Ancient supporters (e.g., "Backed by 5 Ancients").
3. WHEN the Runner_Profile loads for a runner with aura level Strong or Dominant, THE Runner_Profile SHALL render a visual glow or ring effect around the runner's avatar using the level-appropriate color.
4. WHEN a user performs a tip or FriendPass purchase for an aura-backed runner, THE Runner_Profile SHALL display a boost feedback message (e.g., "🔥 Aura Boost: +20% tip effectiveness") for 3 seconds.
5. WHEN the Runner_Profile loads for a runner with an Aura_Score of 0, THE Runner_Profile SHALL display no aura indicators.
6. WHEN the Runner_Profile renders aura data, THE Runner_Profile SHALL fetch aura information from the `/aura/{runner_id}` endpoint and display it within the existing profile layout without a separate page load.

### Requirement 11: Aura Leaderboard UI

**User Story:** As a user, I want to browse leaderboards of top aura runners and most influential Ancient holders, so that I can discover high-value runners and see the impact of Ancient backing.

#### Acceptance Criteria

1. WHEN the Aura_Leaderboard page loads, THE Aura_Leaderboard SHALL display two tabs: "Top Aura Runners" and "Most Influential Ancients".
2. WHEN the "Top Aura Runners" tab is active, THE Aura_Leaderboard SHALL render a ranked list from the `/aura/leaderboard/runners` endpoint showing rank, avatar, username, aura level badge, total aura score, and Ancient supporter count for each runner.
3. WHEN the "Most Influential Ancients" tab is active, THE Aura_Leaderboard SHALL render a ranked list from the `/aura/leaderboard/ancients` endpoint showing rank, avatar or wallet address, username (if available), total influence contributed, and number of runners supported.
4. WHEN a user clicks on a runner in the leaderboard, THE Aura_Leaderboard SHALL navigate to that runner's profile page.
5. WHEN a user clicks on an Ancient holder in the leaderboard, THE Aura_Leaderboard SHALL navigate to that holder's profile page if the holder has a registered account, or display a wallet summary if not.

### Requirement 12: Anti-Abuse and Sybil Resistance

**User Story:** As a platform operator, I want the aura system to resist manipulation by whales, sybil attackers, and colluding wallets, so that aura scores reflect genuine community support.

#### Acceptance Criteria

1. WHEN the Aura_Engine computes an Ancient holder's contribution, THE Aura_Engine SHALL apply a square-root cap on the holder's total financial balance: `cappedBalance = sqrt(totalBalance)` to reduce whale dominance.
2. WHEN the Aura_Engine detects that multiple wallets share the same Privy user account or are flagged as linked in the `fraud_events` table, THE Aura_Engine SHALL aggregate those wallets as a single entity for aura contribution purposes.
3. THE Aura_Engine SHALL enforce a maximum aura contribution per Ancient holder per runner, configurable via `admin_config` (default: cap at the 95th percentile of all individual contributions).
4. WHEN an Ancient holder's reputation score is below a configurable minimum threshold (default 1.0), THE Aura_Engine SHALL exclude that holder from aura calculations to prevent zero-reputation sybil accounts from contributing.
5. THE Aura_Engine SHALL weight aura contributions by the holder's reputation score, ensuring that high-reputation Ancient holders have proportionally more influence than low-reputation holders.
6. WHEN the Aura_Engine detects a sudden spike in aura score for a runner (increase exceeding 200% within 1 hour), THE Aura_Engine SHALL flag the runner for manual review and log an entry in the `audit_logs` table.

### Requirement 13: Aura Score Caching and Performance

**User Story:** As a platform operator, I want aura scores to be served with low latency and computed efficiently, so that the system performs well under load without degrading user experience.

#### Acceptance Criteria

1. THE Aura_Engine SHALL cache each runner's computed aura data (totalAura, auraLevel, ancientSupporterCount, weightedAura) in Redis with a configurable TTL between 10 and 30 seconds.
2. WHEN the Backend_API receives a request for aura data, THE Backend_API SHALL serve from Redis cache on cache hit and fall back to database query on cache miss.
3. WHEN a batch recalculation is triggered (e.g., Ancient_NFT transfer affecting multiple runners), THE Aura_Engine SHALL process recalculations in batches of up to 50 runners per cycle to avoid database contention.
4. THE Aura_Engine SHALL complete a single runner's aura calculation (including database reads and cache write) within 50 milliseconds under normal load.
5. WHEN the Aura_Engine writes to the `aura_index` table, THE Aura_Engine SHALL use an upsert operation to avoid duplicate rows for the same runner.
6. THE Aura_Engine SHALL store aura percentile boundaries in Redis with a TTL of 5 minutes, recalculating only on cache expiry.

### Requirement 14: Aura Data Model

**User Story:** As a backend developer, I want well-defined database tables for Ancient holder tracking and aura indexing, so that aura data is persisted reliably and queryable for all system components.

#### Acceptance Criteria

1. THE Backend_API SHALL maintain an `ancient_holders` table with columns: `id` (UUID primary key), `wallet_address` (String, unique, indexed), `token_count` (Integer), `is_active` (Boolean, default true), `last_synced_at` (DateTime), and `created_at` (DateTime).
2. THE Backend_API SHALL maintain an `aura_index` table with columns: `id` (UUID primary key), `runner_id` (UUID, foreign key to users, unique, indexed), `total_aura` (Numeric), `weighted_aura` (Numeric), `ancient_supporter_count` (Integer), `aura_level` (String), `updated_at` (DateTime), and `created_at` (DateTime).
3. THE Backend_API SHALL maintain an `aura_contributions` table with columns: `id` (UUID primary key), `ancient_holder_id` (UUID, foreign key to ancient_holders), `runner_id` (UUID, foreign key to users), `holder_weight` (Numeric), `support_strength` (Numeric), `contribution` (Numeric), `updated_at` (DateTime), with a composite unique index on `(ancient_holder_id, runner_id)`.
4. THE Backend_API SHALL use `Numeric` type for all financial and score fields in aura tables to maintain precision.
5. THE Backend_API SHALL use UUID primary keys for all aura-related tables, consistent with the existing data model.

### Requirement 15: Aura Configuration Management

**User Story:** As a platform administrator, I want all aura system parameters to be configurable via the admin panel, so that I can tune economic effects without code deployments.

#### Acceptance Criteria

1. THE Backend_API SHALL store the following aura configuration keys in the `admin_config` table: `nft_multiplier` (default 1.0), `aura_boost_factor` (default 0.1), `max_aura_boost` (default 0.5), `max_aura_multiplier` (default 1.0), `max_aura_factor` (default 0.5), `ancient_multiplier` (default 1.2), `min_reputation_threshold` (default 1.0), and `max_contribution_percentile` (default 95).
2. WHEN an admin updates an aura configuration value, THE Backend_API SHALL invalidate the corresponding Redis cache entry and log the change in the `audit_logs` table.
3. THE Aura_Engine SHALL read configuration values from Redis cache with a TTL of 1 hour, falling back to database on cache miss.
4. WHEN a configuration value is missing from both cache and database, THE Aura_Engine SHALL use the hardcoded default value and log a warning.

### Requirement 16: Off-Chain Aura with Future On-Chain Path

**User Story:** As a platform architect, I want aura logic to remain off-chain initially while contracts read adjusted parameters, so that the system is simple to iterate on now with a clear path to partial on-chain migration later.

#### Acceptance Criteria

1. THE Aura_Engine SHALL compute all aura scores, multipliers, and economic adjustments off-chain in the FastAPI backend.
2. WHEN the Bonding_Curve_Engine or TipVault contract requires aura-adjusted parameters, THE Backend_API SHALL pass the pre-computed adjusted values (effectiveSupply, effectiveTips, auraBoost) to the contract call rather than having the contract compute aura logic.
3. THE Backend_API SHALL sign aura-adjusted parameters using EIP-712 typed data signatures before passing them to smart contracts, enabling on-chain verification of off-chain computations.
4. THE Aura_Engine SHALL expose aura multiplier data in a format compatible with future on-chain Merkle proof verification, storing periodic snapshots of runner aura scores.

### Requirement 17: Aura Score Serialization Round-Trip

**User Story:** As a backend developer, I want aura score data to serialize and deserialize consistently between the API, cache, and database, so that no data is lost or corrupted during storage and retrieval.

## Requirements (Extended): Influence Graph & Aura Visualization

---

### Requirement 18: Influence Graph Data Model

**User Story:** As a system, I want to model relationships between users and runners as a graph, so that influence can be computed, visualized, and navigated.

#### Acceptance Criteria

1. THE Backend_API SHALL maintain an `influence_nodes` table with columns: `id` (UUID), `user_id` (UUID), `reputation_score` (Numeric), `aura_score` (Numeric), `is_ancient` (Boolean), `created_at`.
2. THE Backend_API SHALL maintain an `influence_edges` table with columns: `id` (UUID), `from_user_id` (UUID), `to_runner_id` (UUID), `edge_type` (String: friendpass | tip | token | referral), `weight` (Numeric), `updated_at`.
3. THE Backend_API SHALL enforce a composite index on `(from_user_id, to_runner_id)` to prevent duplicate edges.
4. THE Backend_API SHALL store edge weights as Numeric values to preserve precision.

---

### Requirement 19: Influence Score Calculation

**User Story:** As a user, I want influence to reflect real activity and aura, so that high-value actors are visible.

#### Acceptance Criteria

1. WHEN calculating a node's influence score, THE Backend_API SHALL compute:
   `influence = Σ incoming_edge_weights × auraMultiplier`.
2. WHEN a node is an Ancient holder, THE Backend_API SHALL apply an additional multiplier (default 1.25).
3. THE Backend_API SHALL cap influence contribution per edge using a configurable limit from `admin_config`.
4. THE Backend_API SHALL recalculate influence scores when:

   * a tip occurs
   * a FriendPass is bought
   * token balance changes
   * aura score updates

---

### Requirement 20: Influence Graph API

**User Story:** As a frontend developer, I want to retrieve graph data for navigation and visualization.

#### Acceptance Criteria

1. WHEN a GET request is made to `/graph/node/{username}`, THE Backend_API SHALL return:

   * node info (reputation, aura, influence)
   * immediate neighbors (max 20)
2. WHEN a GET request is made to `/graph/neighbors/{username}`, THE Backend_API SHALL return:

   * connected nodes
   * edge weights
3. THE Backend_API SHALL cache graph responses in Redis (TTL 15 seconds).
4. THE Backend_API SHALL limit responses to prevent payloads > 200KB.

---

### Requirement 21: Graph Navigation UX

**User Story:** As a user, I want to explore runners through relationships, so that discovery feels natural and engaging.

#### Acceptance Criteria

1. WHEN a user taps a node in the graph, THE frontend SHALL center that node and load its neighbors.
2. WHEN navigating between nodes, THE frontend SHALL animate transitions smoothly (<300ms).
3. THE frontend SHALL support:

   * local graph (1-hop)
   * extended graph (2–3 hops)
4. THE frontend SHALL lazy-load additional nodes on demand.

---

### Requirement 22: Aura Visualization in Activity Rings

**User Story:** As a user, I want aura to be visually embedded into the runner’s profile rings, so that I can instantly perceive influence.

#### Acceptance Criteria

1. WHEN rendering the Apple Activity Card, THE frontend SHALL overlay an aura layer behind the rings.
2. WHEN `auraLevel` is:

   * Rising → faint animated gradient
   * Strong → visible flowing glow
   * Dominant → dynamic shimmering glow
3. THE aura visualization SHALL:

   * use low-opacity gradients (<30%)
   * remain behind all UI elements
   * not interfere with readability
4. THE animation SHALL:

   * use slow wave motion (northern lights style)
   * run at 30–60 FPS
   * not exceed 5% CPU usage on mobile devices

---

### Requirement 23: Aura Color System

**User Story:** As a user, I want aura colors to communicate meaning intuitively.

#### Acceptance Criteria

1. THE frontend SHALL map aura levels to colors:

   * Low → gray
   * Rising → blue
   * Strong → purple
   * Dominant → gold + purple blend
2. WHEN Ancient backing is present, THE frontend SHALL add a secondary purple glow layer.
3. WHEN aura changes level, THE frontend SHALL animate color transitions smoothly.

---

### Requirement 24: Influence Graph Visualization

**User Story:** As a user, I want a visual map of influence so I can discover high-value runners.

#### Acceptance Criteria

1. THE frontend SHALL render nodes with:

   * size proportional to reputation
   * glow intensity proportional to aura
2. THE frontend SHALL render edges with:

   * thickness proportional to weight
   * pulse animation for recent activity
3. THE graph SHALL:

   * support zoom and pan
   * limit visible nodes to 50 at a time
4. THE frontend SHALL maintain 60 FPS during interaction.

---

### Requirement 25: Aura Feedback System

**User Story:** As a user, I want to feel the effect of aura when interacting.

#### Acceptance Criteria

1. WHEN a user supports an aura-backed runner, THE UI SHALL display:

   * "⚡ Aura Boost Applied"
2. WHEN a runner’s aura increases significantly, THE UI SHALL display:

   * "🔥 This runner is gaining momentum"
3. WHEN aura crosses a level threshold, THE UI SHALL trigger:

   * a visual pulse animation
   * a notification event

---

### Requirement 26: Influence Discovery Mechanics

**User Story:** As a user, I want help discovering valuable runners.

#### Acceptance Criteria

1. THE Backend_API SHALL expose `/graph/trending` endpoint returning:

   * top aura growth
   * top influence gain
2. THE frontend SHALL provide a “Follow the Alpha” action that:

   * navigates to high-aura clusters
3. THE system SHALL prioritize:

   * recent growth over static ranking

---

### Requirement 27: Performance & Limits (Graph)

**User Story:** As a platform operator, I want graph rendering to remain performant.

#### Acceptance Criteria

1. THE frontend SHALL limit graph nodes to 50 per render cycle.
2. THE backend SHALL paginate graph results.
3. THE system SHALL degrade gracefully on low-performance devices by:

   * disabling animations
   * reducing node count
4. THE graph SHALL load initial data within 500ms.

---

### Requirement 28: Anti-Abuse (Graph)

**User Story:** As a platform operator, I want to prevent manipulation of influence graphs.

#### Acceptance Criteria

1. THE Backend_API SHALL detect circular support loops and reduce their weight.
2. THE system SHALL decay inactive edges over time.
3. THE system SHALL cap influence from a single wallet across multiple runners.
4. WHEN suspicious graph patterns are detected, THE system SHALL log events in `audit_logs`.

---

### Requirement 29: Emotional UX (Aura Presence)

**User Story:** As a user, I want aura to feel alive and meaningful.

#### Acceptance Criteria

1. THE UI SHALL display contextual messages such as:

   * "⚡ Backed by Ancient holders"
   * "🔥 High momentum detected"
2. THE UI SHALL ensure aura is:

   * subtle but noticeable
   * never overwhelming
3. THE system SHALL maintain visual consistency across:

   * profile
   * graph
   * dashboard


#### Acceptance Criteria

1. THE Aura_Engine SHALL serialize Aura_Index records to JSON for Redis caching and deserialize them back to the same numeric precision.
2. FOR ALL valid Aura_Index records, serializing to JSON then deserializing SHALL produce a record with identical `totalAura`, `weightedAura`, `ancientSupporterCount`, and `auraLevel` values (round-trip property).
3. THE Backend_API SHALL serialize all Numeric aura fields as strings in JSON API responses to preserve decimal precision, consistent with the existing token economy API pattern.
4. WHEN the Aura_Engine reads a cached aura record from Redis, THE Aura_Engine SHALL validate that required fields (`totalAura`, `auraLevel`) are present and fall back to database on validation failure.
