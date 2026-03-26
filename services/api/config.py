from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://ontrail:ontrail_dev@localhost:5432/ontrail"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 7
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    web3_rpc_url: str = "http://localhost:8545"
    poi_nft_address: str = ""
    route_nft_address: str = ""
    bonding_curve_address: str = ""
    tge_factory_address: str = ""
    treasury_address: str = ""

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
