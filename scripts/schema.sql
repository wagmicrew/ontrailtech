-- OnTrail Database Schema
-- Run: psql -U ontrail -d ontrail -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users & Auth
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255),
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    reputation_score FLOAT DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_users_wallet ON users(wallet_address);

CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    wallet_address VARCHAR(42) NOT NULL,
    wallet_type VARCHAR(50) DEFAULT 'ethereum',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_nonces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(42) NOT NULL,
    nonce VARCHAR(64) NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_auth_nonces_wallet ON auth_nonces(wallet_address);

CREATE TABLE IF NOT EXISTS friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    friend_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Grid & POI System
CREATE TABLE IF NOT EXISTS grid_cells (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    h3_index VARCHAR(20) UNIQUE NOT NULL,
    resolution INTEGER DEFAULT 9,
    max_pois INTEGER DEFAULT 10,
    rarity_distribution JSONB NOT NULL,
    current_pois_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_grid_cells_h3 ON grid_cells(h3_index);

CREATE TABLE IF NOT EXISTS pois (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    rarity VARCHAR(20) NOT NULL,
    owner_id UUID REFERENCES users(id),
    grid_id UUID REFERENCES grid_cells(id),
    nft_token_id VARCHAR(100),
    nft_contract_address VARCHAR(42),
    minted_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_pois_grid_rarity ON pois(grid_id, rarity);

CREATE TABLE IF NOT EXISTS poi_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grid_id UUID REFERENCES grid_cells(id),
    rarity VARCHAR(20) NOT NULL,
    occupied BOOLEAN DEFAULT FALSE,
    poi_id UUID REFERENCES pois(id)
);

-- 3. Routes & Activity
CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    creator_id UUID REFERENCES users(id),
    difficulty VARCHAR(20) DEFAULT 'moderate',
    distance_km FLOAT DEFAULT 0.0,
    elevation_gain_m FLOAT,
    estimated_duration_min INTEGER DEFAULT 0,
    completion_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_pois (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID REFERENCES routes(id),
    poi_id UUID REFERENCES pois(id),
    position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS route_nfts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID REFERENCES routes(id),
    user_id UUID REFERENCES users(id),
    nft_token_id VARCHAR(100),
    completion_timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    route_id UUID REFERENCES routes(id),
    started_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    poi_id UUID REFERENCES pois(id),
    session_id UUID REFERENCES activity_sessions(id),
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gps_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES activity_sessions(id),
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    accuracy FLOAT,
    speed FLOAT
);
CREATE INDEX IF NOT EXISTS ix_gps_session_ts ON gps_points(session_id, timestamp);

CREATE TABLE IF NOT EXISTS steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    step_count INTEGER NOT NULL,
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- 4. Token Economy
CREATE TABLE IF NOT EXISTS runner_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    runner_id UUID REFERENCES users(id),
    token_name VARCHAR(100) NOT NULL,
    token_symbol VARCHAR(10) NOT NULL,
    contract_address VARCHAR(42),
    total_supply NUMERIC DEFAULT 0,
    bonding_curve_pool NUMERIC DEFAULT 0,
    status VARCHAR(20) DEFAULT 'bonding_curve',
    tge_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS friend_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES users(id),
    runner_id UUID REFERENCES users(id),
    amount NUMERIC NOT NULL,
    purchase_price NUMERIC NOT NULL,
    purchased_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_friend_shares_runner_owner ON friend_shares(runner_id, owner_id);

CREATE TABLE IF NOT EXISTS token_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    runner_id UUID REFERENCES users(id),
    current_supply NUMERIC DEFAULT 0,
    liquidity_pool NUMERIC DEFAULT 0,
    threshold NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_id UUID REFERENCES users(id),
    seller_id UUID REFERENCES users(id),
    runner_id UUID REFERENCES users(id),
    amount NUMERIC NOT NULL,
    price NUMERIC NOT NULL,
    tx_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Reputation & Fraud
CREATE TABLE IF NOT EXISTS reputation_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    event_type VARCHAR(50) NOT NULL,
    weight FLOAT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fraud_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    session_id UUID REFERENCES activity_sessions(id),
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Admin & System
CREATE TABLE IF NOT EXISTS admin_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_simulations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_name VARCHAR(200) NOT NULL,
    parameters JSONB NOT NULL,
    results JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    locale VARCHAR(10) NOT NULL,
    key VARCHAR(200) NOT NULL,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS acl_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_name VARCHAR(50) UNIQUE NOT NULL,
    permissions JSONB
);

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    role_id UUID REFERENCES acl_roles(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed default admin role
INSERT INTO acl_roles (role_name, permissions)
VALUES ('admin', '{"all": true}')
ON CONFLICT (role_name) DO NOTHING;


-- 7. Site Settings (admin-editable key/value store for app config)
CREATE TABLE IF NOT EXISTS site_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed site settings
INSERT INTO site_settings (setting_key, setting_value, description) VALUES
    ('privy_app_id', 'cmn7iq1in001u0dl5ttvqs1pr', 'Privy application ID for Web2+Web3 auth'),
    ('walletconnect_project_id', '75e29a9e66a4a448b52cf0e0945058d6', 'WalletConnect project ID for ConnectKit'),
    ('base_rpc_url', 'https://mainnet.base.org', 'Base L2 RPC endpoint'),
    ('mapbox_token', '', 'Mapbox API token for map tiles'),
    ('tge_threshold', '10', 'ETH threshold for Token Generation Event'),
    ('bonding_curve_base_price', '0.001', 'Base price for bonding curve'),
    ('bonding_curve_k', '0.0001', 'K factor for bonding curve steepness'),
    ('poi_max_per_cell', '10', 'Maximum POIs per H3 grid cell'),
    ('site_name', 'OnTrail', 'Platform display name'),
    ('site_tagline', 'Web3 SocialFi for Explorers', 'Platform tagline'),
    ('privy_jwks_url', 'https://auth.privy.io/api/v1/apps/cmn7iq1in001u0dl5ttvqs1pr/jwks.json', 'Privy JWKS endpoint for JWT verification')
ON CONFLICT (setting_key) DO NOTHING;

-- Seed AncientOwner role
INSERT INTO acl_roles (role_name, permissions) VALUES
    ('ancient_owner', '{"all": true, "super_admin": true, "manage_roles": true}')
ON CONFLICT (role_name) DO NOTHING;
