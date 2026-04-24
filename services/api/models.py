import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    Column, String, Float, Integer, Boolean, DateTime, ForeignKey, Text, JSON, Index, Numeric
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base


def gen_uuid():
    return uuid.uuid4()


# ── Users & Auth ──

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    username = Column(String(20), unique=True, nullable=True, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=True)
    wallet_address = Column(String(42), unique=True, nullable=True, index=True)
    avatar_url = Column(Text, nullable=True)
    header_image_url = Column(Text, nullable=True)
    bio = Column(Text, nullable=True)
    location = Column(String(120), nullable=True)
    preferred_reward_wallet = Column(String(42), nullable=True)
    google_id = Column(String(255), unique=True, nullable=True)
    onboarding_completed = Column(Boolean, default=False)
    reputation_score = Column(Float, default=0.0)
    profile_visibility_boost_until = Column(DateTime, nullable=True)
    profile_image_upload_credits = Column(Integer, nullable=False, default=0)
    header_image_upload_credits = Column(Integer, nullable=False, default=0)
    ai_avatar_credits = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Wallet(Base):
    __tablename__ = "wallets"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    wallet_address = Column(String(42), nullable=False, unique=True)
    wallet_type = Column(String(50), default="ethereum")
    encrypted_private_key = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuthNonce(Base):
    __tablename__ = "auth_nonces"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    wallet_address = Column(String(42), nullable=False, index=True)
    nonce = Column(String(64), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Friend(Base):
    __tablename__ = "friends"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    friend_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Grid & POI System ──

class GridCell(Base):
    __tablename__ = "grid_cells"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    h3_index = Column(String(20), unique=True, nullable=False, index=True)
    resolution = Column(Integer, default=9)
    max_pois = Column(Integer, default=10)
    rarity_distribution = Column(JSON, nullable=False)
    current_pois_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class POISlot(Base):
    __tablename__ = "poi_slots"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    grid_id = Column(UUID(as_uuid=True), ForeignKey("grid_cells.id"), nullable=False)
    rarity = Column(String(20), nullable=False)
    occupied = Column(Boolean, default=False)
    poi_id = Column(UUID(as_uuid=True), ForeignKey("pois.id", use_alter=True), nullable=True)


class POI(Base):
    __tablename__ = "pois"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    rarity = Column(String(20), nullable=False)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    grid_id = Column(UUID(as_uuid=True), ForeignKey("grid_cells.id"), nullable=False)
    nft_token_id = Column(String(100), nullable=True)
    nft_contract_address = Column(String(42), nullable=True)
    minted_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_pois_grid_rarity", "grid_id", "rarity"),
    )


# ── Routes & Activity ──

class Route(Base):
    __tablename__ = "routes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    difficulty = Column(String(20), default="moderate")
    distance_km = Column(Float, default=0.0)
    elevation_gain_m = Column(Float, nullable=True)
    estimated_duration_min = Column(Integer, default=0)
    completion_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class RoutePOI(Base):
    __tablename__ = "route_pois"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    route_id = Column(UUID(as_uuid=True), ForeignKey("routes.id"), nullable=False)
    poi_id = Column(UUID(as_uuid=True), ForeignKey("pois.id"), nullable=False)
    position = Column(Integer, nullable=False)


class RouteNFT(Base):
    __tablename__ = "route_nfts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    route_id = Column(UUID(as_uuid=True), ForeignKey("routes.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    nft_token_id = Column(String(100), nullable=True)
    completion_timestamp = Column(DateTime, default=datetime.utcnow)


class ActivitySession(Base):
    __tablename__ = "activity_sessions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    route_id = Column(UUID(as_uuid=True), ForeignKey("routes.id"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="active")


class Checkin(Base):
    __tablename__ = "checkins"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    poi_id = Column(UUID(as_uuid=True), ForeignKey("pois.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("activity_sessions.id"), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class GPSPoint(Base):
    __tablename__ = "gps_points"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    session_id = Column(UUID(as_uuid=True), ForeignKey("activity_sessions.id"), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    accuracy = Column(Float, nullable=True)
    speed = Column(Float, nullable=True)

    __table_args__ = (
        Index("ix_gps_points_session_ts", "session_id", "timestamp"),
    )


class Step(Base):
    __tablename__ = "steps"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    step_count = Column(Integer, nullable=False)
    recorded_at = Column(DateTime, default=datetime.utcnow)


# ── Token Economy ──

class RunnerToken(Base):
    __tablename__ = "runner_tokens"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    runner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token_name = Column(String(100), nullable=False)
    token_symbol = Column(String(10), nullable=False)
    contract_address = Column(String(42), nullable=True)
    total_supply = Column(Numeric, default=0)
    bonding_curve_pool = Column(Numeric, default=0)
    status = Column(String(20), default="bonding_curve")
    tge_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FriendShareModel(Base):
    __tablename__ = "friend_shares"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    runner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    amount = Column(Numeric, nullable=False)
    purchase_price = Column(Numeric, nullable=False)
    purchased_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_friend_shares_runner_owner", "runner_id", "owner_id"),
    )


class TokenPool(Base):
    __tablename__ = "token_pools"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    runner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    current_supply = Column(Numeric, default=0)
    liquidity_pool = Column(Numeric, default=0)
    threshold = Column(Numeric, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class TokenTransaction(Base):
    __tablename__ = "token_transactions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    buyer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    seller_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    runner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    amount = Column(Numeric, nullable=False)
    price = Column(Numeric, nullable=False)
    tx_hash = Column(String(66), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Referrals ──

class Referral(Base):
    __tablename__ = "referrals"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    referrer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    referred_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    referral_code = Column(String(64), nullable=False, index=True)
    runner_context = Column(String(100), nullable=True)
    status = Column(String(20), default="registered")  # pending | registered | converted
    converted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_referrals_referrer_referred", "referrer_id", "referred_id", unique=True),
    )


# ── Reputation & Fraud ──

class ReputationEvent(Base):
    __tablename__ = "reputation_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    event_type = Column(String(50), nullable=False)
    weight = Column(Float, nullable=False)
    event_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FraudEvent(Base):
    __tablename__ = "fraud_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("activity_sessions.id"), nullable=True)
    event_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    event_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Admin & System ──

class AdminConfig(Base):
    __tablename__ = "admin_config"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    config_key = Column(String(100), unique=True, nullable=False)
    config_value = Column(JSON, nullable=False)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TokenSimulation(Base):
    __tablename__ = "token_simulations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    simulation_name = Column(String(200), nullable=False)
    parameters = Column(JSON, nullable=False)
    results = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Translation(Base):
    __tablename__ = "translations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    locale = Column(String(10), nullable=False)
    key = Column(String(200), nullable=False)
    value = Column(Text, nullable=False)


class ACLRole(Base):
    __tablename__ = "acl_roles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    role_name = Column(String(50), unique=True, nullable=False)
    permissions = Column(JSON, nullable=True)


class UserRole(Base):
    __tablename__ = "user_roles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("acl_roles.id"), nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(50), nullable=True)
    resource_id = Column(String(100), nullable=True)
    event_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Site Settings ──

class SiteSetting(Base):
    __tablename__ = "site_settings"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    setting_key = Column(String(100), unique=True, nullable=False)
    setting_value = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LensConfig(Base):
    """Lens Protocol configuration with API keys and authentication."""
    __tablename__ = "lens_config"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    
    # Lens API Configuration
    lens_api_key = Column(String(255), nullable=True)  # Lens API key
    lens_api_url = Column(String(255), nullable=False, default="https://api.testnet.lens.xyz")
    lens_graphql_url = Column(String(255), nullable=False, default="https://api.testnet.lens.xyz/graphql")
    lens_rpc_url = Column(String(255), nullable=False, default="https://rpc.testnet.lens.xyz")
    lens_chain_id = Column(Integer, nullable=False, default=371112)  # Lens Chain testnet
    
    # Authentication Settings for App Verification
    auth_endpoint_url = Column(String(255), nullable=True)  # Custom auth endpoint
    auth_secret = Column(String(255), nullable=True)  # Auth secret
    auth_access = Column(String(50), nullable=False, default="custom")  # custom, public, restricted
    
    # Wallet Configuration
    lens_wallet_address = Column(String(255), nullable=True)  # Main wallet for operations
    lens_explorer_url = Column(String(255), nullable=True)  # Lens explorer URL
    
    # Mode Configuration
    mode = Column(String(20), nullable=False, default="simulate")  # simulate, live
    
    # Contract Addresses (for live mode)
    friendpass_contract_address = Column(String(255), nullable=True)
    profile_wallet_contract_address = Column(String(255), nullable=True)
    
    # Onramp Configuration
    gho_onramp_enabled = Column(Boolean, nullable=False, default=False)
    gho_onramp_amount = Column(Numeric, nullable=True, default=Decimal("0.1"))  # Default GHO amount
    lens_token_onramp_enabled = Column(Boolean, nullable=False, default=False)
    lens_token_onramp_amount = Column(Numeric, nullable=True, default=Decimal("0.1"))
    
    # Metadata
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Installed Apps ──

class InstalledApp(Base):
    __tablename__ = "installed_apps"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    app_id = Column(String(255), unique=True, nullable=False)   # slug from manifest
    name = Column(String(255), nullable=False)
    version = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    author = Column(String(255), nullable=True)
    icon = Column(Text, nullable=True)                          # SVG text or data URI
    status = Column(String(50), default="installed")            # installed | disabled
    settings = Column(JSON, default=dict)                       # current saved settings
    settings_schema = Column(JSON, default=list)                # field definitions for CMS UI
    tables_created = Column(JSON, default=list)                 # table names created by install.sql
    manifest = Column(JSON, default=dict)                       # full manifest.json contents
    installed_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Referral Rewards ──

class ReferralReward(Base):
    __tablename__ = "referral_rewards"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    referral_id = Column(UUID(as_uuid=True), ForeignKey("referrals.id"), nullable=False)
    referrer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    reward_type = Column(String(50), nullable=False)  # reputation | commission
    amount = Column(Numeric, nullable=False, default=0)
    tx_hash = Column(String(66), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Journey Events ──

class JourneyEvent(Base):
    __tablename__ = "journey_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    session_id = Column(String(100), nullable=True)
    runner_username = Column(String(100), nullable=True)
    phase = Column(String(50), nullable=False)
    action = Column(String(100), nullable=False)
    event_metadata = Column("metadata", JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    duration_ms = Column(Integer, nullable=True)


# ── Shareable Cards ──

class ShareableCard(Base):
    __tablename__ = "shareable_cards"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    type = Column(String(50), nullable=False)
    headline = Column(String(200), nullable=False)
    image_url = Column(Text, nullable=True)
    share_count = Column(Integer, default=0)
    click_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── User Notifications ──

class UserNotification(Base):
    __tablename__ = "user_notifications"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    urgency = Column(String(20), default="normal")  # low | normal | high | critical
    action_url = Column(Text, nullable=True)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Ancient Aura System ──

class AncientHolder(Base):
    __tablename__ = "ancient_holders"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    wallet_address = Column(String(42), unique=True, nullable=False, index=True)
    token_count = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    last_synced_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class AuraIndex(Base):
    __tablename__ = "aura_index"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    runner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False, index=True)
    total_aura = Column(Numeric, nullable=False, default=0)
    weighted_aura = Column(Numeric, nullable=False, default=0)
    ancient_supporter_count = Column(Integer, nullable=False, default=0)
    aura_level = Column(String(20), nullable=False, default="None")
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class AuraContribution(Base):
    __tablename__ = "aura_contributions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    ancient_holder_id = Column(UUID(as_uuid=True), ForeignKey("ancient_holders.id"), nullable=False)
    runner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    holder_weight = Column(Numeric, nullable=False)
    support_strength = Column(Numeric, nullable=False)
    contribution = Column(Numeric, nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_aura_contributions_holder_runner", "ancient_holder_id", "runner_id", unique=True),
    )


class InfluenceNode(Base):
    __tablename__ = "influence_nodes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False, index=True)
    reputation_score = Column(Numeric, nullable=False, default=0)
    aura_score = Column(Numeric, nullable=False, default=0)
    is_ancient = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class InfluenceEdge(Base):
    __tablename__ = "influence_edges"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    from_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    to_runner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    edge_type = Column(String(20), nullable=False)
    weight = Column(Numeric, nullable=False, default=0)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_influence_edges_from_to", "from_user_id", "to_runner_id"),
    )


# ── Store ──

class StoreItem(Base):
    __tablename__ = "store_items"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False)
    item_type = Column(String(50), nullable=False)
    step_cost = Column(Integer, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    fulfillment_type = Column(String(30), nullable=False, default="instant")
    item_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class StorePurchase(Base):
    __tablename__ = "store_purchases"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    store_item_id = Column(UUID(as_uuid=True), ForeignKey("store_items.id"), nullable=False)
    step_cost = Column(Integer, nullable=False)
    status = Column(String(30), nullable=False, default="completed")
    fulfillment_wallet = Column(String(42), nullable=True)
    purchase_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_store_purchases_user_created", "user_id", "created_at"),
    )


# ── Friend-Fi ──

class FriendPassHolding(Base):
    """Records each FriendPass purchase (ERC-1155 style, off-chain mirror)."""
    __tablename__ = "friend_pass_holdings"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    runner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    passes = Column(Integer, nullable=False, default=1)
    purchase_price_eth = Column(Numeric, nullable=False)
    sold = Column(Boolean, nullable=False, default=False)
    sale_price_eth = Column(Numeric, nullable=True)
    sold_at = Column(DateTime, nullable=True)
    purchased_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_friend_pass_holdings_owner_runner", "owner_id", "runner_id"),
    )


# ── POI-Fi ──

class POIListing(Base):
    """Marketplace listing for a POI NFT."""
    __tablename__ = "poi_listings"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    poi_id = Column(UUID(as_uuid=True), ForeignKey("pois.id"), nullable=False, index=True)
    seller_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    price_eth = Column(Numeric, nullable=False)
    status = Column(String(20), nullable=False, default="active")  # active | sold | cancelled
    buyer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    sold_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


# ── Profile Wallet System (Polygon) ──

class ProfileWallet(Base):
    """Profile wallet for each user on Polygon chain - managed by Admin OS."""
    __tablename__ = "profile_wallets"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True, index=True)
    wallet_address = Column(String(42), nullable=False, unique=True)
    chain_id = Column(Integer, default=137)  # Polygon mainnet (137) or testnet (80001)
    encrypted_private_key = Column(Text, nullable=True)
    balance_eth = Column(Numeric, default=0)
    balance_matic = Column(Numeric, default=0)
    is_active = Column(Boolean, default=True)
    created_by_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── FriendPass Configuration System ──

class FriendPassConfig(Base):
    """Global FriendPass configuration with tax and pricing settings."""
    __tablename__ = "friendpass_config"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    config_name = Column(String(100), unique=True, nullable=False, default="default")
    
    # Pricing parameters
    base_price_eth = Column(Numeric, default=Decimal("0.001"))
    slope_eth = Column(Numeric, default=Decimal("0.0001"))
    max_supply_per_runner = Column(Integer, default=100)
    max_per_wallet = Column(Integer, default=5)
    
    # Reputation-based pricing
    reputation_enabled = Column(Boolean, default=True)
    reputation_multiplier = Column(Numeric, default=Decimal("1.0"))  # Multiplier for reputation impact
    reputation_base_threshold = Column(Float, default=100.0)  # Min reputation to affect price
    
    # Tax structure (basis points, total = 10000)
    tax_sitewallet_bps = Column(Integer, default=3000)  # 30% to site wallet
    tax_profile_owner_bps = Column(Integer, default=4000)  # 40% to profile owner
    tax_dao_bps = Column(Integer, default=2000)  # 20% to DAO
    tax_ancient_bps = Column(Integer, default=1000)  # 10% to Ancient Owner
    
    # Volatile vs reputation-based pricing split
    volatile_price_percentage = Column(Integer, default=60)  # 60% volatile (market-based)
    reputation_price_percentage = Column(Integer, default=40)  # 40% reputation-based
    
    # Selling mechanism
    sell_enabled = Column(Boolean, default=True)
    sell_fee_bps = Column(Integer, default=500)  # 5% sell fee
    min_sell_price_eth = Column(Numeric, default=Decimal("0.0005"))
    
    # Chain configuration
    chain_id = Column(Integer, default=137)  # Polygon
    contract_address = Column(String(42), nullable=True)
    
    # Metadata
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FriendPassSimulation(Base):
    """Simulation results for different FriendPass configuration scenarios."""
    __tablename__ = "friendpass_simulations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    simulation_name = Column(String(200), nullable=False)
    
    # Input parameters
    config_params = Column(JSON, nullable=False)
    runner_reputation = Column(Float, default=0.0)
    supply_sold = Column(Integer, default=0)
    
    # Output results
    price_eth = Column(Numeric, nullable=False)
    price_breakdown = Column(JSON, nullable=False)  # {volatile: X, reputation: Y}
    tax_distribution = Column(JSON, nullable=False)  # {sitewallet: X, profile_owner: Y, dao: Z, ancient: W}
    total_revenue_eth = Column(Numeric, nullable=False)
    
    # Metadata
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class POIReward(Base):
    """Accumulated check-in reward owed to a POI owner."""
    __tablename__ = "poi_rewards"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    poi_id = Column(UUID(as_uuid=True), ForeignKey("pois.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    visitor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    checkin_id = Column(UUID(as_uuid=True), ForeignKey("checkins.id"), nullable=False)
    reward_amount_eth = Column(Numeric, nullable=False, default=Decimal("0.0001"))
    claimed = Column(Boolean, nullable=False, default=False)
    claimed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_poi_rewards_owner_claimed", "owner_id", "claimed"),
    )


class GraphQLMessageType(Base):
    """Custom GraphQL message type definitions for Lens Protocol integration."""
    __tablename__ = "graphql_message_types"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    
    # GraphQL schema definition
    type_definition = Column(Text, nullable=False)  # GraphQL type definition
    fields = Column(JSON, nullable=False)  # Array of field definitions
    query_template = Column(Text, nullable=True)  # GraphQL query template
    mutation_template = Column(Text, nullable=True)  # GraphQL mutation template
    
    # Lens Protocol integration
    lens_metadata_type = Column(String(50), nullable=True)  # PROFILE, POST, COMMENT, etc.
    metadata_attributes = Column(JSON, nullable=True)  # Metadata attribute mappings
    
    # Status
    is_active = Column(Boolean, nullable=False, default=True)
    is_system = Column(Boolean, nullable=False, default=False)  # System types cannot be deleted
    
    # Metadata
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class GraphQLMessageTemplate(Base):
    """Pre-configured GraphQL message templates."""
    __tablename__ = "graphql_message_templates"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    message_type_id = Column(UUID(as_uuid=True), ForeignKey("graphql_message_types.id"), nullable=False, index=True)
    
    template_name = Column(String(100), nullable=False)
    template_content = Column(Text, nullable=False)
    
    # Template variables
    variables_schema = Column(JSON, nullable=True)  # JSON schema for variables
    
    # Usage
    usage_count = Column(Integer, nullable=False, default=0)
    
    # Status
    is_active = Column(Boolean, nullable=False, default=True)
    
    # Metadata
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
