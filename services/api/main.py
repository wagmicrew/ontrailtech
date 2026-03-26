from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings
from routers import auth, users, pois, routes, tokens, admin, onboarding, friendpass, identity, referrals, runners
from error_handlers import register_error_handlers
from security import register_security

settings = get_settings()

app = FastAPI(title="OnTrail API", version="0.1.0", description="OnTrail Web3 Social-Fi Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
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

register_error_handlers(app)
register_security(app)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ontrail-api"}
