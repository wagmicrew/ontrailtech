from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://ontrail:ontrail_dev@localhost:5432/ontrail"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 43200  # 30 days
    jwt_refresh_token_expire_days: int = 30
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    google_client_id: str = ""
    google_client_secret: str = ""
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@ontrail.tech"
    wallet_encryption_key: str = "change-me-32-bytes"
    siwe_domain: str = "ontrail.tech"
    web3_rpc_url: str = "http://localhost:8545"
    poi_nft_address: str = ""
    route_nft_address: str = ""
    bonding_curve_address: str = ""
    tge_factory_address: str = ""
    treasury_address: str = ""
    friend_shares_address: str = ""

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
