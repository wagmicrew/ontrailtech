"""
Alchemy integration router.

Endpoints:
  GET  /admin/alchemy/config              - Return masked config (key replaced with sentinel)
  POST /admin/alchemy/config              - Save Alchemy config (key encrypted with AES-256 Fernet)
  GET  /admin/alchemy/test                - Test Alchemy connection (latest block)
  GET  /admin/alchemy/nft/wallet          - Fetch NFTs for a wallet address
  GET  /admin/alchemy/nft/contract        - Fetch NFTs from a contract
  GET  /admin/alchemy/chains              - Return saved chain config
  POST /admin/alchemy/chains              - Save chain config
  GET  /admin/alchemy/contracts           - List published ABIs
  POST /admin/alchemy/contracts           - Publish a new ABI
  DELETE /admin/alchemy/contracts/{id}    - Delete an ABI record
  GET  /admin/alchemy/access-rules        - List NFT access rules
  POST /admin/alchemy/access-rules        - Create an NFT access rule
  PATCH /admin/alchemy/access-rules/{id}  - Toggle active state
  DELETE /admin/alchemy/access-rules/{id} - Delete an access rule
  POST /admin/alchemy/webhook             - Receive Alchemy Notify webhooks
  POST /admin/alchemy/nft-check/{user_id} - Trigger NFT ownership check for a user
"""

import hashlib
import hmac
import json
import logging
import os
import uuid
from base64 import b64decode, b64encode
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, RootModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_admin
from models import User

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Encryption helpers ───────────────────────────────────────────────────────

def _get_fernet() -> Fernet:
    """Derive a Fernet key from ALCHEMY_ENCRYPTION_KEY env var (or wallet_encryption_key)."""
    raw = os.environ.get("ALCHEMY_ENCRYPTION_KEY") or os.environ.get("WALLET_ENCRYPTION_KEY", "change-me-32-bytes")
    # Fernet keys must be 32 url-safe base64-encoded bytes
    key = b64encode(hashlib.sha256(raw.encode()).digest())
    return Fernet(key)


def _encrypt(value: str) -> str:
    if not value:
        return ""
    return _get_fernet().encrypt(value.encode()).decode()


def _decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except (InvalidToken, Exception):
        return ""


# ─── In-memory store (replace with DB table for production) ──────────────────
# In production, persist to a dedicated table. For now we use an in-process dict
# which survives across requests in the same worker process.

_store: dict[str, Any] = {
    "config": {
        "api_key_enc": "",
        "network": "eth-mainnet",
        "webhook_signing_key_enc": "",
    },
    "chains": None,  # None → use defaults
    "contracts": [],        # list[dict]
    "access_rules": [],     # list[dict]
}

DEFAULT_CHAINS = [
    {"id": "eth-mainnet",      "name": "Ethereum",     "network": "mainnet", "rpc": "https://eth-mainnet.g.alchemy.com/v2/",     "explorer": "https://etherscan.io",             "currency": "ETH", "alchemy_supported": True,  "enabled": True},
    {"id": "base-mainnet",     "name": "Base",         "network": "mainnet", "rpc": "https://base-mainnet.g.alchemy.com/v2/",    "explorer": "https://basescan.org",             "currency": "ETH", "alchemy_supported": True,  "enabled": True},
    {"id": "base-sepolia",     "name": "Base Sepolia", "network": "testnet", "rpc": "https://base-sepolia.g.alchemy.com/v2/",    "explorer": "https://sepolia.basescan.org",     "currency": "ETH", "alchemy_supported": True,  "enabled": False},
    {"id": "polygon-mainnet",  "name": "Polygon",      "network": "mainnet", "rpc": "https://polygon-mainnet.g.alchemy.com/v2/", "explorer": "https://polygonscan.com",          "currency": "MATIC","alchemy_supported": True, "enabled": False},
    {"id": "opt-mainnet",      "name": "Optimism",     "network": "mainnet", "rpc": "https://opt-mainnet.g.alchemy.com/v2/",     "explorer": "https://optimistic.etherscan.io",  "currency": "ETH", "alchemy_supported": True,  "enabled": False},
    {"id": "arb-mainnet",      "name": "Arbitrum One", "network": "mainnet", "rpc": "https://arb-mainnet.g.alchemy.com/v2/",     "explorer": "https://arbiscan.io",              "currency": "ETH", "alchemy_supported": True,  "enabled": False},
    {"id": "solana-mainnet",   "name": "Solana",       "network": "mainnet", "rpc": "https://solana-mainnet.g.alchemy.com/v2/",  "explorer": "https://explorer.solana.com",      "currency": "SOL", "alchemy_supported": True,  "enabled": True},
    {"id": "solana-devnet",    "name": "Solana Devnet","network": "testnet", "rpc": "https://solana-devnet.g.alchemy.com/v2/",   "explorer": "https://explorer.solana.com/?cluster=devnet", "currency": "SOL", "alchemy_supported": True, "enabled": False},
]


def _api_key() -> str:
    return _decrypt(_store["config"]["api_key_enc"])


def _alchemy_base(network: str | None = None) -> str:
    net = network or _store["config"].get("network", "eth-mainnet")
    key = _api_key()
    if not key:
        raise HTTPException(status_code=400, detail="Alchemy API key not configured")
    return f"https://{net}.g.alchemy.com/v2/{key}"


# ─── Pydantic models ──────────────────────────────────────────────────────────

class AlchemyConfigIn(BaseModel):
    api_key: str
    network: str = "eth-mainnet"
    webhook_signing_key: str = ""


class ChainList(RootModel[list[dict]]):
    pass


class ContractIn(BaseModel):
    name: str
    address: str = ""
    chain: str = "base-mainnet"
    abi: str  # JSON string
    bytecode: str = ""


class AccessRuleIn(BaseModel):
    name: str
    chain: str = "base-mainnet"
    contract_address: str
    token_id: str = ""
    min_balance: int = 1
    granted_roles: list[str]
    active: bool = True


class PatchActive(BaseModel):
    active: bool


# ─── Config ───────────────────────────────────────────────────────────────────

@router.get("/config")
async def get_config(admin: User = Depends(require_admin)):
    cfg = _store["config"]
    return {
        "api_key": "••••••••" if cfg["api_key_enc"] else "",
        "network": cfg.get("network", "eth-mainnet"),
        "webhook_signing_key": "••••••••" if cfg.get("webhook_signing_key_enc") else "",
    }


@router.post("/config")
async def save_config(body: AlchemyConfigIn, admin: User = Depends(require_admin)):
    _store["config"]["network"] = body.network
    # Only update encrypted fields if non-sentinel value provided
    if body.api_key and not body.api_key.startswith("••"):
        _store["config"]["api_key_enc"] = _encrypt(body.api_key)
    if body.webhook_signing_key and not body.webhook_signing_key.startswith("••"):
        _store["config"]["webhook_signing_key_enc"] = _encrypt(body.webhook_signing_key)
    return {"status": "saved"}


# ─── Test connection ──────────────────────────────────────────────────────────

@router.get("/test")
async def test_connection(admin: User = Depends(require_admin)):
    base = _alchemy_base()
    payload = {"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(base, json=payload)
        r.raise_for_status()
        data = r.json()
    block_hex = data.get("result", "0x0")
    return {"status": "ok", "block": int(block_hex, 16)}


# ─── NFT endpoints ────────────────────────────────────────────────────────────

def _parse_nft(item: dict) -> dict:
    """Normalize Alchemy NFT API v3 response."""
    image_url = None
    img = item.get("image") or {}
    if isinstance(img, dict):
        image_url = img.get("cachedUrl") or img.get("originalUrl") or img.get("thumbnailUrl")
    elif isinstance(img, str):
        image_url = img

    return {
        "tokenId": item.get("tokenId") or item.get("id", {}).get("tokenId", "0"),
        "title": item.get("name") or item.get("title") or f"Token #{item.get('tokenId', '?')}",
        "description": item.get("description"),
        "image": image_url,
        "contract": {"address": (item.get("contract") or {}).get("address", "")},
        "tokenType": (item.get("contract") or {}).get("tokenType", "ERC721"),
    }


@router.get("/nft/wallet")
async def nft_for_wallet(
    chain: str = "base-mainnet",
    address: str = "",
    page_key: str | None = None,
    admin: User = Depends(require_admin),
):
    if not address:
        raise HTTPException(status_code=400, detail="address required")
    base = _alchemy_base(chain)
    url = f"{base}/getNFTsForOwner"
    params: dict[str, Any] = {"owner": address, "withMetadata": "true", "pageSize": 20}
    if page_key:
        params["pageKey"] = page_key

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()

    nfts = [_parse_nft(n) for n in data.get("ownedNfts", [])]
    return {"nfts": nfts, "page_key": data.get("pageKey")}


@router.get("/nft/contract")
async def nft_for_contract(
    chain: str = "base-mainnet",
    contract: str = "",
    admin: User = Depends(require_admin),
):
    if not contract:
        raise HTTPException(status_code=400, detail="contract required")
    base = _alchemy_base(chain)
    url = f"{base}/getNFTsForContract"
    params = {"contractAddress": contract, "withMetadata": "true", "limit": 20}

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()

    nfts = [_parse_nft(n) for n in data.get("nfts", [])]
    return {"nfts": nfts, "page_key": data.get("pageKey")}


# ─── Chains ───────────────────────────────────────────────────────────────────

@router.get("/chains")
async def get_chains(admin: User = Depends(require_admin)):
    return _store["chains"] or DEFAULT_CHAINS


@router.post("/chains")
async def save_chains(body: list[dict], admin: User = Depends(require_admin)):
    _store["chains"] = body
    return {"status": "saved"}


# ─── Contracts / ABI publisher ────────────────────────────────────────────────

@router.get("/contracts")
async def list_contracts(admin: User = Depends(require_admin)):
    return _store["contracts"]


@router.post("/contracts")
async def publish_contract(body: ContractIn, admin: User = Depends(require_admin)):
    # Validate ABI is valid JSON
    try:
        json.loads(body.abi)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid ABI JSON: {e}")

    record = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "address": body.address,
        "chain": body.chain,
        "abi": body.abi,
        "bytecode": body.bytecode,
        "created_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
    _store["contracts"].insert(0, record)
    return record


@router.delete("/contracts/{contract_id}")
async def delete_contract(contract_id: str, admin: User = Depends(require_admin)):
    _store["contracts"] = [c for c in _store["contracts"] if c["id"] != contract_id]
    return {"status": "deleted"}


# ─── NFT Access Rules ─────────────────────────────────────────────────────────

@router.get("/access-rules")
async def list_access_rules(admin: User = Depends(require_admin)):
    return _store["access_rules"]


@router.post("/access-rules")
async def create_access_rule(body: AccessRuleIn, admin: User = Depends(require_admin)):
    record = {
        "id": str(uuid.uuid4()),
        **body.dict(),
    }
    _store["access_rules"].insert(0, record)
    return record


@router.patch("/access-rules/{rule_id}")
async def patch_access_rule(rule_id: str, body: PatchActive, admin: User = Depends(require_admin)):
    for rule in _store["access_rules"]:
        if rule["id"] == rule_id:
            rule["active"] = body.active
            return rule
    raise HTTPException(status_code=404, detail="Rule not found")


@router.delete("/access-rules/{rule_id}")
async def delete_access_rule(rule_id: str, admin: User = Depends(require_admin)):
    _store["access_rules"] = [r for r in _store["access_rules"] if r["id"] != rule_id]
    return {"status": "deleted"}


# ─── NFT ownership check for a user ──────────────────────────────────────────

@router.post("/nft-check/{user_id}")
async def check_nft_access(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Check all active NFT access rules against a user's wallet and assign/revoke roles.
    Called on login and profile visit from the API.
    """
    result = await db.execute(
        text("SELECT wallet_address FROM users WHERE id = :uid"),
        {"uid": user_id},
    )
    row = result.fetchone()
    if not row or not row[0]:
        return {"status": "no_wallet", "roles_granted": [], "roles_revoked": []}

    wallet = row[0]
    active_rules = [r for r in _store["access_rules"] if r.get("active")]
    if not active_rules:
        return {"status": "ok", "roles_granted": [], "roles_revoked": []}

    granted: list[str] = []
    errors: list[str] = []

    key = _api_key()
    if not key:
        return {"status": "no_api_key", "roles_granted": [], "roles_revoked": []}

    async with httpx.AsyncClient(timeout=15) as client:
        for rule in active_rules:
            chain = rule.get("chain", "base-mainnet")
            contract = rule.get("contract_address", "")
            min_balance = int(rule.get("min_balance", 1))
            base_url = f"https://{chain}.g.alchemy.com/v2/{key}"
            try:
                r = await client.get(
                    f"{base_url}/getNFTsForOwner",
                    params={"owner": wallet, "contractAddresses[]": contract, "withMetadata": "false", "pageSize": 1},
                )
                r.raise_for_status()
                data = r.json()
                balance = int(data.get("totalCount", 0))
                if balance >= min_balance:
                    granted.extend(rule.get("granted_roles", []))
            except Exception as exc:
                errors.append(f"{rule['name']}: {exc}")
                logger.warning("NFT check failed for rule %s: %s", rule["name"], exc)

    # Deduplicate
    granted = list(set(granted))

    # Persist roles into acl_user_roles (best-effort)
    if granted:
        try:
            for role_name in granted:
                await db.execute(
                    text("""
                        INSERT INTO acl_user_roles (user_id, role_id)
                        SELECT :uid, id FROM acl_roles WHERE role_name = :role
                        ON CONFLICT DO NOTHING
                    """),
                    {"uid": user_id, "role": role_name},
                )
            await db.commit()
        except Exception as exc:
            logger.warning("Failed to persist NFT roles: %s", exc)

    return {"status": "ok", "roles_granted": granted, "errors": errors}


# ─── Webhook receiver ─────────────────────────────────────────────────────────

@router.post("/webhook")
async def alchemy_webhook(request: Request):
    """Receive Alchemy Notify webhooks and trigger NFT checks."""
    body = await request.body()
    signature = request.headers.get("x-alchemy-signature", "")
    signing_key = _decrypt(_store["config"].get("webhook_signing_key_enc", ""))

    # Verify HMAC-SHA256 signature when a signing key is configured
    if signing_key:
        expected = hmac.new(signing_key.encode(), body, hashlib.sha256).hexdigest()  # type: ignore[attr-defined]
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    logger.info("Alchemy webhook received: type=%s", payload.get("type"))
    # Future: queue NFT check tasks for affected addresses
    return {"status": "received"}
