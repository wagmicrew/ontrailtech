import uuid
from datetime import datetime
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
    username = Column(String(20), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=True)
    wallet_address = Column(String(42), unique=True, nullable=False, index=True)
    reputation_score = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Wallet(Base):
    __tablename__ = "wallets"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    wallet_address = Column(String(42), nullable=False)
    wallet_type = Column(String(50), default="ethereum")
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


# ── Reputation & Fraud ──

class ReputationEvent(Base):
    __tablename__ = "reputation_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    event_type = Column(String(50), nullable=False)
    weight = Column(Float, nullable=False)
    metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FraudEvent(Base):
    __tablename__ = "fraud_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("activity_sessions.id"), nullable=True)
    event_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    metadata = Column(JSON, nullable=True)
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
    metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
