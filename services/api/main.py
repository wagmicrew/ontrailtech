import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings
from routers import auth, users, pois, routes, tokens, admin, onboarding, friendpass, identity, referrals, runners, graph, aura
from error_handlers import register_error_handlers
from security import register_security

logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(title="OnTrail API", version="0.1.0", description="OnTrail Web3 Social-Fi Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    # Allow all runner subdomains: hansen.ontrail.tech, etc.
    allow_origin_regex=r"https://[a-z0-9][a-z0-9\-]*\.ontrail\.tech",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(pois.router, prefix="/poi", tags=["POI"])
app.include_router(routes.router, prefix="/route", tags=["Routes"])
app.include_router(tokens.router, prefix="/token", tags=["Tokens"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(onboarding.router, prefix="/onboarding", tags=["Onboarding"])
app.include_router(friendpass.router, prefix="/friendpass", tags=["FriendPass"])
app.include_router(identity.router, prefix="/identity", tags=["Identity"])
app.include_router(referrals.router, prefix="/referrals", tags=["Referrals"])
app.include_router(runners.router, prefix="/runners", tags=["Runners"])
app.include_router(graph.router, prefix="/graph", tags=["Graph"])
app.include_router(aura.router, prefix="/aura", tags=["Aura"])

register_error_handlers(app)
register_security(app)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ontrail-api"}


@app.on_event("startup")
async def start_ancient_nft_indexer():
    """Start the Ancient NFT Indexer as a background task."""
    try:
        from engines.ancient_indexer import AncientNFTIndexer
        from database import AsyncSessionLocal
        from redis_client import redis as redis_client

        # get_ancient_nft_client is added in task 6.3; gracefully skip if not available yet
        try:
            from web3_client import get_ancient_nft_client
            web3_client = get_ancient_nft_client()
        except (ImportError, AttributeError):
            logger.warning("Ancient NFT web3 client not configured, skipping indexer startup")
            return

        if web3_client is None:
            logger.warning("Ancient NFT contract not configured, skipping indexer startup")
            return

        indexer = AncientNFTIndexer(
            web3_client=web3_client,
            db_session_factory=AsyncSessionLocal,
            redis_client=redis_client,
        )
        asyncio.create_task(indexer.start())
        logger.info("Ancient NFT Indexer background task started")
    except Exception:
        logger.exception("Failed to start Ancient NFT Indexer — API will continue without it")
