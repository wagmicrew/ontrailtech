from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings
from routers import auth, users, pois, routes, tokens, admin

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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ontrail-api"}
