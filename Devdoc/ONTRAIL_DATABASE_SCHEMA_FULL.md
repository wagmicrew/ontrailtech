# ONTRAIL_DATABASE_SCHEMA_FULL

Comprehensive production database schema for the OnTrail platform.
Designed for PostgreSQL.

This schema supports:

-   POI economy
-   H3 grid scarcity engine
-   runner reputation graph
-   route NFTs
-   token economy
-   fraud detection
-   admin simulation tools
-   i18n localization

------------------------------------------------------------------------

# 1. USERS

Table: users

Fields:

-   id (PK)
-   username (unique)
-   email
-   wallet_address
-   reputation_score
-   created_at

------------------------------------------------------------------------

# 2. WALLETS

Table: wallets

-   id (PK)
-   user_id (FK users)
-   wallet_address
-   wallet_type
-   created_at

------------------------------------------------------------------------

# 3. FRIEND NETWORK

Table: friends

-   id (PK)
-   user_id
-   friend_id
-   created_at

------------------------------------------------------------------------

# 4. REPUTATION EVENTS

Table: reputation_events

-   id (PK)
-   user_id
-   event_type
-   weight
-   created_at

Examples:

-   poi_minted
-   route_completed
-   friend_reputation_gain
-   token_launch

------------------------------------------------------------------------

# 5. GRID SYSTEM

Table: grid_cells

-   id (PK)
-   h3_index
-   max_pois
-   rarity_distribution
-   created_at

Table: poi_slots

-   id (PK)
-   grid_id
-   rarity
-   occupied
-   poi_id

------------------------------------------------------------------------

# 6. POINTS OF INTEREST

Table: pois

-   id (PK)
-   name
-   latitude
-   longitude
-   rarity
-   owner_id
-   grid_id
-   minted_at

------------------------------------------------------------------------

# 7. ROUTES

Table: routes

-   id (PK)
-   name
-   creator_id
-   difficulty
-   distance_km
-   created_at

Table: route_pois

-   id (PK)
-   route_id
-   poi_id
-   position

------------------------------------------------------------------------

# 8. ROUTE NFTs

Table: route_nfts

-   id (PK)
-   route_id
-   owner_id
-   minted_at

------------------------------------------------------------------------

# 9. CHECKINS

Table: checkins

-   id (PK)
-   user_id
-   poi_id
-   created_at

------------------------------------------------------------------------

# 10. ACTIVITY TRACKS

Table: activity_sessions

-   id (PK)
-   user_id
-   started_at
-   ended_at

Table: gps_points

-   id (PK)
-   session_id
-   latitude
-   longitude
-   timestamp

------------------------------------------------------------------------

# 11. STEPS

Table: steps

-   id (PK)
-   user_id
-   step_count
-   recorded_at

------------------------------------------------------------------------

# 12. FRAUD DETECTION

Table: fraud_events

-   id (PK)
-   user_id
-   event_type
-   severity
-   created_at

------------------------------------------------------------------------

# 13. RUNNER TOKENS

Table: runner_tokens

-   id (PK)
-   runner_id
-   contract_address
-   supply
-   bonding_curve_pool
-   created_at

------------------------------------------------------------------------

# 14. FRIEND SHARES

Table: friend_shares

-   id (PK)
-   owner_id
-   runner_id
-   amount

------------------------------------------------------------------------

# 15. TOKEN POOLS

Table: token_pools

-   id (PK)
-   runner_token_id
-   liquidity
-   created_at

------------------------------------------------------------------------

# 16. TOKEN TRANSACTIONS

Table: token_transactions

-   id (PK)
-   user_id
-   token_id
-   action
-   amount
-   created_at

------------------------------------------------------------------------

# 17. ADMIN CONFIGURATION

Table: admin_config

-   id (PK)
-   config_key
-   config_value
-   updated_at

Examples:

-   bonding_curve_base
-   poi_max_per_cell
-   reputation_weights

------------------------------------------------------------------------

# 18. TOKEN PLAYBOOK SIMULATIONS

Table: token_simulations

-   id (PK)
-   simulation_name
-   parameters
-   results
-   created_at

------------------------------------------------------------------------

# 19. LOCALIZATION

Table: translations

-   id (PK)
-   locale
-   key
-   value

------------------------------------------------------------------------

# 20. ACCESS CONTROL

Table: acl_roles

-   id (PK)
-   role_name
-   permissions

Table: user_roles

-   id (PK)
-   user_id
-   role_id

------------------------------------------------------------------------

# 21. AUDIT LOG

Table: audit_logs

-   id (PK)
-   user_id
-   action
-   metadata
-   created_at

------------------------------------------------------------------------

# Notes for AI builders

Important build order:

1.  users
2.  wallets
3.  grid_cells
4.  pois
5.  routes
6.  reputation system
7.  token economy
8.  fraud detection
9.  admin simulation tools
