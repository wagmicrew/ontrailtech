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
import subprocess
import uuid
from base64 import b64decode, b64encode
from pathlib import Path
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, RootModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, AsyncSessionLocal
from dependencies import require_admin
from models import User, SiteSetting

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


# ─── DB-backed persistent store ───────────────────────────────────────────────
# All Alchemy settings are stored in the site_settings table under keys like
# "alchemy:config", "alchemy:chains", etc.  An in-process write-through cache
# avoids hitting the DB on every request while surviving server restarts.

_DB_PREFIX = "alchemy:"
_STORE_KEYS = ("config", "chains", "contracts", "access_rules", "wallet", "connectkit", "runnercoin", "jwt_config")

_store: dict[str, Any] = {
    "config": {
        "api_key_enc": "",
        "network": "eth-mainnet",
        "webhook_signing_key_enc": "",
    },
    "chains": None,          # None → use defaults
    "contracts": [],         # list[dict]
    "access_rules": [],      # list[dict]
    "wallet": {},            # {"address": str, "private_key_enc": str, …}
    "connectkit": {},
    "runnercoin": {},
    "jwt_config": {"private_key_enc": "", "public_key": "", "key_id": "", "enabled": False},
}
_store_loaded: dict[str, bool] = {k: False for k in _STORE_KEYS}


async def _db_load(key: str) -> Any | None:
    """Read one alchemy setting from the DB; returns parsed JSON or None."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SiteSetting).where(SiteSetting.setting_key == f"{_DB_PREFIX}{key}")
            )
            row = result.scalar_one_or_none()
            if row:
                return json.loads(row.setting_value)
    except Exception as exc:
        logger.warning("alchemy _db_load(%s) failed: %s", key, exc)
    return None


async def _db_save(key: str, value: Any) -> None:
    """Upsert one alchemy setting to the DB."""
    try:
        async with AsyncSessionLocal() as db:
            db_key = f"{_DB_PREFIX}{key}"
            result = await db.execute(
                select(SiteSetting).where(SiteSetting.setting_key == db_key)
            )
            row = result.scalar_one_or_none()
            payload = json.dumps(value, default=str)
            if row:
                row.setting_value = payload
            else:
                db.add(SiteSetting(setting_key=db_key, setting_value=payload))
            await db.commit()
    except Exception as exc:
        logger.error("alchemy _db_save(%s) failed: %s", key, exc)


async def _store_get(key: str) -> Any:
    """Return store value, loading from DB on first access."""
    if not _store_loaded.get(key):
        loaded = await _db_load(key)
        if loaded is not None:
            _store[key] = loaded
        _store_loaded[key] = True
    return _store[key]


async def _store_set(key: str, value: Any) -> None:
    """Update in-memory cache and persist to DB."""
    _store[key] = value
    _store_loaded[key] = True
    await _db_save(key, value)


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


async def _api_key() -> str:
    cfg = await _store_get("config")
    return _decrypt(cfg.get("api_key_enc", ""))


async def _alchemy_base(network: str | None = None) -> str:
    cfg = await _store_get("config")
    net = network or cfg.get("network", "eth-mainnet")
    key = await _api_key()
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


class PrebuiltContractActionIn(BaseModel):
    contract_name: str
    chain: str = "base-mainnet"
    deploy: bool = False
    constructor_args: list[Any] = []


class CustomContractActionIn(BaseModel):
    name: str
    chain: str = "base-mainnet"
    abi: str
    bytecode: str
    deploy: bool = False
    constructor_args: list[Any] = []


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
    cfg = await _store_get("config")
    return {
        "api_key": "••••••••" if cfg.get("api_key_enc") else "",
        "network": cfg.get("network", "eth-mainnet"),
        "webhook_signing_key": "••••••••" if cfg.get("webhook_signing_key_enc") else "",
    }


@router.post("/config")
async def save_config(body: AlchemyConfigIn, admin: User = Depends(require_admin)):
    cfg = await _store_get("config")
    cfg["network"] = body.network
    if body.api_key and not body.api_key.startswith("••"):
        cfg["api_key_enc"] = _encrypt(body.api_key)
    if body.webhook_signing_key and not body.webhook_signing_key.startswith("••"):
        cfg["webhook_signing_key_enc"] = _encrypt(body.webhook_signing_key)
    await _store_set("config", cfg)
    return {"status": "saved"}


# ─── Test connection ──────────────────────────────────────────────────────────

@router.get("/test")
async def test_connection(admin: User = Depends(require_admin)):
    base = await _alchemy_base()
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
    base = await _alchemy_base(chain)
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
    base = await _alchemy_base(chain)
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
    await _store_set("chains", body)
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
    await _store_set("contracts", _store["contracts"])
    return record


@router.delete("/contracts/{contract_id}")
async def delete_contract(contract_id: str, admin: User = Depends(require_admin)):
    _store["contracts"] = [c for c in _store["contracts"] if c["id"] != contract_id]
    await _store_set("contracts", _store["contracts"])
    return {"status": "deleted"}


_PREBUILT_CONTRACTS = {
    "AccessNFT": "AccessNFT",
    "POINFT": "POINFT",
    "RouteNFT": "RouteNFT",
    "RunnerToken": "RunnerToken",
}


def _repo_root() -> Path:
    # services/api/routers/alchemy.py -> repo root is 3 levels up
    return Path(__file__).resolve().parents[3]


def _contracts_root() -> Path:
    return _repo_root() / "contracts"


def _artifact_path(contract_name: str) -> Path:
    canonical = _PREBUILT_CONTRACTS.get(contract_name)
    if not canonical:
        raise HTTPException(status_code=400, detail=f"Unsupported prebuilt contract: {contract_name}")
    return _contracts_root() / "artifacts" / "contracts" / f"{canonical}.sol" / f"{canonical}.json"


def _compile_contracts_if_needed() -> None:
    cmd = ["npx", "hardhat", "compile"]
    proc = subprocess.run(
        cmd,
        cwd=str(_contracts_root()),
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    if proc.returncode != 0:
        tail = "\n".join((proc.stderr or proc.stdout or "").splitlines()[-20:])
        raise HTTPException(
            status_code=500,
            detail=f"Hardhat compile failed on server. {tail}",
        )


def _load_artifact(contract_name: str) -> tuple[list[Any], str]:
    artifact_file = _artifact_path(contract_name)
    if not artifact_file.exists():
        _compile_contracts_if_needed()
    if not artifact_file.exists():
        raise HTTPException(status_code=500, detail=f"Artifact still missing: {artifact_file}")

    artifact = json.loads(artifact_file.read_text(encoding="utf-8"))
    abi = artifact.get("abi") or []
    bytecode = artifact.get("bytecode") or ""
    if not isinstance(abi, list):
        raise HTTPException(status_code=500, detail=f"Invalid ABI in artifact for {contract_name}")
    if not isinstance(bytecode, str) or not bytecode:
        raise HTTPException(status_code=500, detail=f"Missing bytecode in artifact for {contract_name}")
    return abi, bytecode


def _default_constructor_args(contract_name: str, wallet_address: str) -> list[Any]:
    if contract_name == "RunnerToken":
        # 1B supply with 18 decimals for EVM fallback token
        return ["OnTrail Runner", "RUNR", 1_000_000_000 * (10 ** 18), wallet_address]
    return []


def _chain_rpc_url(chain: str, api_key: str) -> str:
    return f"https://{chain}.g.alchemy.com/v2/{api_key}"


async def _estimate_deploy(
    private_key_hex: str,
    chain: str,
    abi: list[Any],
    bytecode: str,
    constructor_args: list[Any],
) -> dict[str, Any]:
    from eth_account import Account
    from web3 import AsyncWeb3
    from web3.providers import AsyncHTTPProvider

    api_key = await _api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Alchemy API key not configured")

    w3 = AsyncWeb3(AsyncHTTPProvider(_chain_rpc_url(chain, api_key)))
    acct = Account.from_key(private_key_hex)
    contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    ctor = contract.constructor(*constructor_args)

    gas = await ctor.estimate_gas({"from": acct.address})
    gas_price = await w3.eth.gas_price
    max_cost_wei = int(gas * 12 // 10) * gas_price
    return {
        "from": acct.address,
        "gas_estimate": int(gas),
        "gas_price_wei": int(gas_price),
        "max_cost_wei": int(max_cost_wei),
        "max_cost_eth": str(max_cost_wei / 10**18),
    }


async def _deploy_prebuilt_contract(
    private_key_hex: str,
    chain: str,
    abi: list[Any],
    bytecode: str,
    constructor_args: list[Any],
) -> dict[str, Any]:
    from eth_account import Account
    from web3 import AsyncWeb3
    from web3.providers import AsyncHTTPProvider

    api_key = await _api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Alchemy API key not configured")

    w3 = AsyncWeb3(AsyncHTTPProvider(_chain_rpc_url(chain, api_key)))
    acct = Account.from_key(private_key_hex)
    contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    ctor = contract.constructor(*constructor_args)

    nonce = await w3.eth.get_transaction_count(acct.address)
    gas_price = await w3.eth.gas_price
    chain_id = await w3.eth.chain_id
    gas = await ctor.estimate_gas({"from": acct.address})
    tx = await ctor.build_transaction({
        "from": acct.address,
        "nonce": nonce,
        "gas": int(gas * 12 // 10),
        "gasPrice": gas_price,
        "chainId": chain_id,
    })
    signed = acct.sign_transaction(tx)
    tx_hash = await w3.eth.send_raw_transaction(signed.rawTransaction)
    receipt = await w3.eth.wait_for_transaction_receipt(tx_hash, timeout=240)
    return {
        "tx_hash": "0x" + tx_hash.hex(),
        "contract_address": receipt.contractAddress,
    }


@router.get("/contracts/prebuilt")
async def list_prebuilt_contracts(admin: User = Depends(require_admin)):
    contracts = []
    for key in _PREBUILT_CONTRACTS:
        artifact = _artifact_path(key)
        contracts.append({
            "name": key,
            "artifact_path": str(artifact),
            "artifact_exists": artifact.exists(),
        })
    return contracts


@router.get("/contracts/prebuilt/template/{contract_name}")
async def get_prebuilt_template(contract_name: str, chain: str = "base-mainnet", admin: User = Depends(require_admin)):
    wallet = await _store_get("wallet")
    address = wallet.get("address", "")
    abi, bytecode = _load_artifact(contract_name)
    return {
        "name": contract_name,
        "chain": chain,
        "abi": json.dumps(abi),
        "bytecode": bytecode,
        "constructor_args": _default_constructor_args(contract_name, address) if address else [],
        "wallet_address": address,
    }


@router.post("/contracts/prebuilt/estimate")
async def estimate_prebuilt_contract(body: PrebuiltContractActionIn, admin: User = Depends(require_admin)):
    wallet = await _store_get("wallet")
    private_key = _decrypt(wallet.get("private_key_enc", ""))
    address = wallet.get("address", "")
    if not private_key or not address:
        raise HTTPException(status_code=400, detail="Site wallet not configured")

    abi, bytecode = _load_artifact(body.contract_name)
    ctor_args = body.constructor_args or _default_constructor_args(body.contract_name, address)
    estimate = await _estimate_deploy(private_key, body.chain, abi, bytecode, ctor_args)
    return {
        "contract_name": body.contract_name,
        "chain": body.chain,
        "constructor_args": ctor_args,
        **estimate,
    }


@router.post("/contracts/prebuilt/publish")
async def publish_prebuilt_contract(body: PrebuiltContractActionIn, admin: User = Depends(require_admin)):
    wallet = await _store_get("wallet")
    private_key = _decrypt(wallet.get("private_key_enc", ""))
    address = wallet.get("address", "")
    if not private_key or not address:
        raise HTTPException(status_code=400, detail="Site wallet not configured")

    abi, bytecode = _load_artifact(body.contract_name)
    ctor_args = body.constructor_args or _default_constructor_args(body.contract_name, address)
    estimate = await _estimate_deploy(private_key, body.chain, abi, bytecode, ctor_args)

    deployed: dict[str, Any] | None = None
    contract_address = ""
    if body.deploy:
        deployed = await _deploy_prebuilt_contract(private_key, body.chain, abi, bytecode, ctor_args)
        contract_address = deployed["contract_address"]

    record = {
        "id": str(uuid.uuid4()),
        "name": body.contract_name,
        "address": contract_address,
        "chain": body.chain,
        "abi": json.dumps(abi),
        "bytecode": bytecode,
        "created_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
    _store["contracts"].insert(0, record)
    await _store_set("contracts", _store["contracts"])

    return {
        "record": record,
        "estimate": estimate,
        "deployed": deployed,
    }


@router.post("/contracts/custom/publish")
async def publish_custom_contract(body: CustomContractActionIn, admin: User = Depends(require_admin)):
    wallet = await _store_get("wallet")
    private_key = _decrypt(wallet.get("private_key_enc", ""))
    if not private_key:
        raise HTTPException(status_code=400, detail="Site wallet not configured")

    try:
        abi = json.loads(body.abi)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid ABI JSON: {exc}")
    if not isinstance(abi, list):
        raise HTTPException(status_code=400, detail="ABI must be a JSON array")

    bytecode = (body.bytecode or "").strip()
    if not bytecode:
        raise HTTPException(status_code=400, detail="Bytecode is required for deploy/publish draft")
    if not bytecode.startswith("0x"):
        bytecode = "0x" + bytecode

    estimate = await _estimate_deploy(private_key, body.chain, abi, bytecode, body.constructor_args or [])

    deployed: dict[str, Any] | None = None
    contract_address = ""
    if body.deploy:
        deployed = await _deploy_prebuilt_contract(private_key, body.chain, abi, bytecode, body.constructor_args or [])
        contract_address = deployed["contract_address"]

    record = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "address": contract_address,
        "chain": body.chain,
        "abi": json.dumps(abi),
        "bytecode": bytecode,
        "created_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
    _store["contracts"].insert(0, record)
    await _store_set("contracts", _store["contracts"])

    return {
        "record": record,
        "estimate": estimate,
        "deployed": deployed,
    }


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
    await _store_set("access_rules", _store["access_rules"])
    return record


@router.patch("/access-rules/{rule_id}")
async def patch_access_rule(rule_id: str, body: PatchActive, admin: User = Depends(require_admin)):
    for rule in _store["access_rules"]:
        if rule["id"] == rule_id:
            rule["active"] = body.active
            await _store_set("access_rules", _store["access_rules"])
            return rule
    raise HTTPException(status_code=404, detail="Rule not found")


@router.delete("/access-rules/{rule_id}")
async def delete_access_rule(rule_id: str, admin: User = Depends(require_admin)):
    _store["access_rules"] = [r for r in _store["access_rules"] if r["id"] != rule_id]
    await _store_set("access_rules", _store["access_rules"])
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

    key = await _api_key()
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
    signing_key = _decrypt(_store.get("config", {}).get("webhook_signing_key_enc", ""))

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


# ─── Site Wallet ──────────────────────────────────────────────────────────────

@router.get("/wallet")
async def get_wallet(admin: User = Depends(require_admin)):
    w = _store["wallet"]
    if not w.get("address"):
        raise HTTPException(status_code=404, detail="No site wallet exists")
    return {
        "address": w["address"],
        "has_private_key": bool(w.get("private_key_enc")),
        "created_at": w.get("created_at", ""),
    }


@router.post("/wallet/create")
async def create_wallet(admin: User = Depends(require_admin)):
    if _store["wallet"].get("address"):
        raise HTTPException(status_code=409, detail="Site wallet already exists")

    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    acct, mnemonic = Account.create_with_mnemonic()

    import datetime
    wallet_data = {
        "address": acct.address,
        "private_key_enc": _encrypt(acct.key.hex()),
        "mnemonic_enc": _encrypt(mnemonic),
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    await _store_set("wallet", wallet_data)
    return {
        "address": acct.address,
        "has_private_key": True,
        "created_at": wallet_data["created_at"],
    }


@router.post("/wallet/export")
async def export_wallet(admin: User = Depends(require_admin)):
    w = _store["wallet"]
    if not w.get("address"):
        raise HTTPException(status_code=404, detail="No site wallet exists")
    private_key = _decrypt(w.get("private_key_enc", ""))
    mnemonic = _decrypt(w.get("mnemonic_enc", ""))
    if not private_key:
        raise HTTPException(status_code=404, detail="No private key stored for this wallet")
    return {"private_key": private_key, "mnemonic": mnemonic}


# ─── ConnectKit Config ────────────────────────────────────────────────────────

DEFAULT_CONNECTKIT = {
    "walletconnect_project_id": "",
    "alchemy_id": "",
    "infura_id": "",
    "app_name": "OnTrail",
    "app_description": "Web3 SocialFi Running App",
    "app_url": "https://ontrail.tech",
    "app_icon": "https://ontrail.tech/logo.png",
}


class ConnectKitIn(BaseModel):
    walletconnect_project_id: str = ""
    alchemy_id: str = ""
    infura_id: str = ""
    app_name: str = "OnTrail"
    app_description: str = ""
    app_url: str = ""
    app_icon: str = ""


@router.get("/connectkit")
async def get_connectkit(admin: User = Depends(require_admin)):
    stored = _store.get("connectkit") or {}
    result = dict(DEFAULT_CONNECTKIT)
    result.update(stored)
    # Mask secrets
    for field in ("walletconnect_project_id", "alchemy_id", "infura_id"):
        if result.get(field):
            result[field] = "••••••••"
    return result


@router.put("/connectkit")
async def save_connectkit(body: ConnectKitIn, admin: User = Depends(require_admin)):
    existing = _store.get("connectkit") or {}
    data = body.dict()
    # Only overwrite encrypted fields if non-sentinel submitted
    for field in ("walletconnect_project_id", "alchemy_id", "infura_id"):
        if data[field] and data[field].startswith("••"):
            data[field] = existing.get(field, "")  # keep old value
    await _store_set("connectkit", data)
    return {"status": "saved"}


# ─── RunnerCoin Config ────────────────────────────────────────────────────────

DEFAULT_RUNNERCOIN = {
    "token_name": "OnTrail Runner",
    "token_symbol": "ONTR",
    "total_supply": "1000000000",
    "bonding_curve_k": "0.0001",
    "base_price": "0.000001",
    "tge_threshold": "69420",
    "contract_address": "",
    "treasury_address": "",
}


class RunnerCoinIn(BaseModel):
    token_name: str = "OnTrail Runner"
    token_symbol: str = "ONTR"
    total_supply: str = "1000000000"
    bonding_curve_k: str = "0.0001"
    base_price: str = "0.000001"
    tge_threshold: str = "69420"
    contract_address: str = ""
    treasury_address: str = ""


@router.get("/runnercoin")
async def get_runnercoin(admin: User = Depends(require_admin)):
    stored = _store.get("runnercoin") or {}
    result = dict(DEFAULT_RUNNERCOIN)
    result.update(stored)
    return result


@router.put("/runnercoin")
async def save_runnercoin(body: RunnerCoinIn, admin: User = Depends(require_admin)):
    await _store_set("runnercoin", body.dict())
    return {"status": "saved"}


# ─── Mint helpers ─────────────────────────────────────────────────────────────

def _get_site_wallet_key() -> str:
    """Returns decrypted private key hex for the site wallet."""
    w = _store.get("wallet") or {}
    key = _decrypt(w.get("private_key_enc", ""))
    if not key:
        raise HTTPException(status_code=400, detail="Site wallet not configured or has no private key")
    return key


def _find_contract_by_name(name: str, chain: str) -> dict:
    """Find a published contract record by name and chain."""
    for c in _store["contracts"]:
        if c.get("name") == name and c.get("chain") == chain:
            return c
    # Fallback: find by name only
    for c in _store["contracts"]:
        if c.get("name") == name:
            return c
    raise HTTPException(status_code=404, detail=f"Contract '{name}' not found. Publish the ABI first.")


async def _send_contract_tx(
    private_key_hex: str,
    chain: str,
    contract_address: str,
    abi: list,
    method: str,
    args: list,
) -> str:
    """Sign and broadcast a contract call via Alchemy RPC. Returns tx hash."""
    from eth_account import Account
    from web3 import AsyncWeb3
    from web3.providers import AsyncHTTPProvider

    api_key = await _api_key()
    rpc_url = f"https://{chain}.g.alchemy.com/v2/{api_key}"
    w3 = AsyncWeb3(AsyncHTTPProvider(rpc_url))

    acct = Account.from_key(private_key_hex)
    contract = w3.eth.contract(
        address=AsyncWeb3.to_checksum_address(contract_address),
        abi=abi,
    )
    fn = contract.functions[method](*args)
    nonce = await w3.eth.get_transaction_count(acct.address)
    gas_price = await w3.eth.gas_price
    chain_id = await w3.eth.chain_id
    gas = await fn.estimate_gas({"from": acct.address})

    tx = await fn.build_transaction({
        "from": acct.address,
        "nonce": nonce,
        "gas": int(gas * 1.2),
        "gasPrice": gas_price,
        "chainId": chain_id,
    })
    signed = acct.sign_transaction(tx)
    tx_hash = await w3.eth.send_raw_transaction(signed.rawTransaction)
    return "0x" + tx_hash.hex()


# ─── Mint: Access NFT ─────────────────────────────────────────────────────────

class MintAccessNftIn(BaseModel):
    to: str
    tier: str = "runner"
    uri: str = ""
    chain: str = "base-mainnet"
    contract_name: str = "AccessNFT"


@router.post("/mint/access-nft")
async def mint_access_nft(body: MintAccessNftIn, admin: User = Depends(require_admin)):
    pk = _get_site_wallet_key()
    c = _find_contract_by_name(body.contract_name, body.chain)
    if not c.get("address"):
        raise HTTPException(status_code=400, detail="Contract has no deployed address")
    abi = json.loads(c["abi"])
    tx_hash = await _send_contract_tx(pk, body.chain, c["address"], abi, "mint", [body.to, body.tier, body.uri])
    return {"tx_hash": tx_hash, "token_id": "pending"}


# ─── Mint: POI NFT ────────────────────────────────────────────────────────────

class MintPoiIn(BaseModel):
    to: str
    uri: str = ""
    rarity: str = "common"
    chain: str = "base-mainnet"
    contract_name: str = "POINFT"


@router.post("/mint/poi")
async def mint_poi(body: MintPoiIn, admin: User = Depends(require_admin)):
    pk = _get_site_wallet_key()
    c = _find_contract_by_name(body.contract_name, body.chain)
    if not c.get("address"):
        raise HTTPException(status_code=400, detail="Contract has no deployed address")
    abi = json.loads(c["abi"])
    tx_hash = await _send_contract_tx(pk, body.chain, c["address"], abi, "mint", [body.to, body.uri, body.rarity])
    return {"tx_hash": tx_hash, "token_id": "pending"}


# ─── Mint: Route NFT ──────────────────────────────────────────────────────────

class MintRouteIn(BaseModel):
    to: str
    uri: str = ""
    difficulty: str = "easy"
    distance_meters: int = 0
    elevation_gain_meters: int = 0
    gps_waypoints: list[int] = []  # int32 packed [lat*1e6, lng*1e6, …]
    chain: str = "base-mainnet"
    contract_name: str = "RouteNFT"


@router.post("/mint/route")
async def mint_route(body: MintRouteIn, admin: User = Depends(require_admin)):
    if len(body.gps_waypoints) % 2 != 0:
        raise HTTPException(status_code=400, detail="gps_waypoints must have even count (lat/lng pairs)")
    pk = _get_site_wallet_key()
    c = _find_contract_by_name(body.contract_name, body.chain)
    if not c.get("address"):
        raise HTTPException(status_code=400, detail="Contract has no deployed address")
    abi = json.loads(c["abi"])
    tx_hash = await _send_contract_tx(
        pk, body.chain, c["address"], abi, "mint",
        [body.to, body.uri, body.difficulty, body.distance_meters, body.elevation_gain_meters, body.gps_waypoints],
    )
    return {"tx_hash": tx_hash, "token_id": "pending", "waypoint_count": len(body.gps_waypoints) // 2}


# ─── Airdrop (runner tokens – Solana) ────────────────────────────────────────

class AirdropIn(BaseModel):
    addresses: list[str]
    amount: int = 1


@router.post("/mint/airdrop")
async def airdrop_runner_tokens(body: AirdropIn, admin: User = Depends(require_admin)):
    """
    Record-only endpoint. Actual Solana SPL airdrop must be executed via the
    runner-token-solana.ts script or a dedicated Solana worker. This endpoint
    persists the intent and returns a queue receipt.
    """
    if not body.addresses:
        raise HTTPException(status_code=400, detail="No addresses provided")
    # TODO: enqueue to a Solana worker / BullMQ job
    logger.info("Airdrop queued: %d addresses, amount=%d", len(body.addresses), body.amount)
    return {"status": "queued", "success": len(body.addresses), "failed": 0}


# ─── Portfolio API — tokens by address ───────────────────────────────────────
# Alchemy Portfolio API v3:
# GET https://api.g.alchemy.com/v3/{apiKey}/assets/tokens/by-address
#   ?walletAddress={addr}&networks={network}

@router.get("/portfolio/tokens")
async def portfolio_tokens(
    address: str = "",
    networks: str = "eth-mainnet",
    admin: User = Depends(require_admin),
):
    """
    Fetch ERC-20 token balances for a wallet address using Alchemy Portfolio API v3.
    `networks` accepts a comma-separated list of Alchemy network IDs.
    """
    if not address:
        raise HTTPException(status_code=400, detail="address required")
    key = await _api_key()
    if not key:
        raise HTTPException(status_code=400, detail="Alchemy API key not configured")

    url = f"https://api.g.alchemy.com/v3/{key}/assets/tokens/by-address"
    params: dict[str, str] = {
        "walletAddress": address,
        "networks": networks,
    }

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()

    tokens = []
    for item in data.get("data", {}).get("tokens", []):
        tokens.append({
            "symbol": item.get("symbol", ""),
            "name": item.get("name", ""),
            "balance": item.get("tokenBalance", "0"),
            "decimals": item.get("decimals", 18),
            "contract_address": item.get("contractAddress", ""),
            "network": item.get("network", networks.split(",")[0]),
            "logo": item.get("logo") or item.get("thumbnail"),
            "price_usd": item.get("price", {}).get("value") if isinstance(item.get("price"), dict) else None,
            "value_usd": item.get("valueUsd"),
        })
    return {"tokens": tokens, "wallet": address}


# ─── Token Prices API ─────────────────────────────────────────────────────────
# Alchemy Prices API v1:
# POST https://api.g.alchemy.com/prices/v1/{apiKey}/tokens/by-symbol
# POST https://api.g.alchemy.com/prices/v1/{apiKey}/tokens/by-address

class PricesBySymbolIn(BaseModel):
    symbols: list[str]  # e.g. ["ETH", "USDC", "ONTR"]


class PricesByAddressIn(BaseModel):
    addresses: list[dict]  # e.g. [{"network": "base-mainnet", "address": "0x..."}]


@router.post("/prices/by-symbol")
async def prices_by_symbol(body: PricesBySymbolIn, admin: User = Depends(require_admin)):
    """Get token prices by symbol using Alchemy Prices API."""
    key = await _api_key()
    if not key:
        raise HTTPException(status_code=400, detail="Alchemy API key not configured")
    url = f"https://api.g.alchemy.com/prices/v1/{key}/tokens/by-symbol"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, json={"symbols": body.symbols})
        r.raise_for_status()
    return r.json()


@router.post("/prices/by-address")
async def prices_by_address(body: PricesByAddressIn, admin: User = Depends(require_admin)):
    """Get token prices by contract address using Alchemy Prices API."""
    key = await _api_key()
    if not key:
        raise HTTPException(status_code=400, detail="Alchemy API key not configured")
    url = f"https://api.g.alchemy.com/prices/v1/{key}/tokens/by-address"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, json={"addresses": body.addresses})
        r.raise_for_status()
    return r.json()


@router.get("/prices/runner-token")
async def runner_token_price(admin: User = Depends(require_admin)):
    """
    Valuation lookup for the deployed runner token.
    Uses Prices API by address if contract is deployed, else returns bonding curve preview.
    """
    rc = _store.get("runnercoin") or {}
    contract = rc.get("contract_address", "")
    chain = rc.get("launch_chain", "base-mainnet")

    if contract and chain in ("eth-mainnet", "base-mainnet", "polygon-mainnet"):
        key = await _api_key()
        if key:
            url = f"https://api.g.alchemy.com/prices/v1/{key}/tokens/by-address"
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    r = await client.post(url, json={"addresses": [{"network": chain, "address": contract}]})
                    if r.status_code == 200:
                        return {"source": "alchemy-prices", "data": r.json()}
            except Exception as exc:
                logger.warning("Prices API failed: %s", exc)

    # Fallback: bonding curve formula preview
    k = float(rc.get("bonding_curve_k", 0.0001))
    base_price = float(rc.get("base_price", 0.000001))
    total_supply = float(rc.get("total_supply", 1_000_000_000))
    tge_threshold = float(rc.get("tge_threshold", 69420))
    symbol = rc.get("token_symbol", "ONTR")

    simulated_supply = total_supply * 0.2  # assume 20% sold
    price_at_20pct = base_price + k * (simulated_supply ** 2)

    return {
        "source": "bonding-curve-estimate",
        "symbol": symbol,
        "chain": chain,
        "contract": contract or "not deployed",
        "estimated_price_eth": price_at_20pct,
        "bonding_curve": {"k": k, "base_price": base_price, "tge_threshold": tge_threshold},
    }


# ─── Runner Token launch chain setting ───────────────────────────────────────

class RunnerCoinLaunchIn(BaseModel):
    launch_chain: str = "base-mainnet"  # "solana-mainnet" | "eth-mainnet" | "base-mainnet"
    bonding_curve_locked: bool = False
    lp_tx_hash: str = ""
    lp_address: str = ""


@router.put("/runnercoin/launch")
async def save_runner_launch(body: RunnerCoinLaunchIn, admin: User = Depends(require_admin)):
    """Save launch chain, bonding curve lock state, and LP details."""
    rc = dict(_store.get("runnercoin") or {})
    rc.update(body.dict())
    await _store_set("runnercoin", rc)
    return {"status": "saved", **body.dict()}


@router.get("/runnercoin/launch-guide")
async def runner_launch_guide(admin: User = Depends(require_admin)):
    """
    Return the chain-specific LP creation guide for the configured launch chain.
    """
    rc = _store.get("runnercoin") or {}
    chain = rc.get("launch_chain", "base-mainnet")
    token_symbol = rc.get("token_symbol", "ONTR")
    contract = rc.get("contract_address", "<deploy first>")

    guides = {
        "eth-mainnet": {
            "chain": "Ethereum Mainnet",
            "dex": "Uniswap v3",
            "steps": [
                f"1. Deploy {token_symbol} ERC-20 to Ethereum mainnet via Contracts tab",
                "2. Go to Smithii LP creator: https://tools.smithii.io/liquidity-pool/ethereum",
                f"3. Select Base Token: {contract} ({token_symbol})",
                "4. Select Quote Token: WETH (0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2)",
                "5. Add liquidity amounts — this sets the initial price",
                "6. Click 'Create Liquidity Pool' (costs ~0.001 ETH + gas)",
                "   — OR — go directly to https://app.uniswap.org/pool",
            ],
            "smithii_url": "https://tools.smithii.io/liquidity-pool/ethereum",
            "uniswap_url": "https://app.uniswap.org/pool",
            "cost_estimate": "~0.001 ETH + gas (~$5-30)",
        },
        "base-mainnet": {
            "chain": "Base Mainnet (recommended — cheapest gas)",
            "dex": "Uniswap v3 on Base",
            "steps": [
                f"1. Deploy {token_symbol} ERC-20 to Base mainnet via Contracts tab",
                "2. Go to Smithii Base LP creator: https://tools.smithii.io/liquidity-pool/base",
                f"3. Select Base Token: {contract} ({token_symbol})",
                "4. Select Quote Token: WETH on Base (0x4200000000000000000000000000000000000006)",
                "5. Set liquidity amounts (determines initial price)",
                "6. Click 'Create Liquidity Pool'",
                "   — OR — use Uniswap on Base: https://app.uniswap.org/pool?chain=base",
            ],
            "smithii_url": "https://tools.smithii.io/liquidity-pool/base",
            "uniswap_url": "https://app.uniswap.org/pool?chain=base",
            "cost_estimate": "~$0.05-0.50 gas",
        },
        "solana-mainnet": {
            "chain": "Solana Mainnet (pump.fun bonding curve)",
            "dex": "pump.fun → Raydium on TGE",
            "steps": [
                f"1. Run the Solana deployment script: cd contracts && npx ts-node scripts/runner-token-solana.ts deploy",
                f"2. Token Symbol: {token_symbol} | TGE threshold: {rc.get('tge_threshold', '69420')} SOL",
                "3. pump.fun automatically manages the bonding curve from launch",
                "4. On TGE threshold reached, pump.fun migrates liquidity to Raydium AMM automatically",
                "5. Monitor migration: npx ts-node scripts/runner-token-solana.ts check-migration",
                "6. After migration, the token trades on Raydium with permanent liquidity",
            ],
            "smithii_url": None,
            "uniswap_url": "https://pump.fun",
            "cost_estimate": "~0.02 SOL to deploy + pump.fun fees",
        },
    }

    return guides.get(chain, guides["base-mainnet"])


# ─── JWT Auth Config ──────────────────────────────────────────────────────────

class JwtConfigIn(BaseModel):
    key_id: str = ""
    enabled: bool = False


@router.get("/jwt/config")
async def get_jwt_config(admin: User = Depends(require_admin)):
    cfg = await _store_get("jwt_config")
    return {
        "has_private_key": bool(cfg.get("private_key_enc")),
        "public_key": cfg.get("public_key", ""),
        "key_id": cfg.get("key_id", ""),
        "enabled": cfg.get("enabled", False),
    }


@router.post("/jwt/generate")
async def jwt_generate_keypair(admin: User = Depends(require_admin)):
    """Generate a new RSA-2048 key pair for Alchemy JWT auth."""
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    cfg = await _store_get("jwt_config")
    cfg["private_key_enc"] = _encrypt(private_pem)
    cfg["public_key"] = public_pem
    await _store_set("jwt_config", cfg)
    return {"status": "generated", "public_key": public_pem}


@router.put("/jwt/config")
async def save_jwt_config(body: JwtConfigIn, admin: User = Depends(require_admin)):
    """Save key_id returned by Alchemy dashboard after uploading public key."""
    cfg = await _store_get("jwt_config")
    cfg["key_id"] = body.key_id
    cfg["enabled"] = body.enabled
    await _store_set("jwt_config", cfg)
    return {"status": "saved"}


@router.post("/jwt/test-token")
async def test_jwt_token(admin: User = Depends(require_admin)):
    """Generate a short-lived test JWT using the stored private key."""
    import time
    import jwt as pyjwt

    cfg = await _store_get("jwt_config")
    pk_pem = _decrypt(cfg.get("private_key_enc", ""))
    key_id = cfg.get("key_id", "")
    if not pk_pem:
        raise HTTPException(status_code=400, detail="No private key generated. Run 'Generate Key Pair' first.")
    if not key_id:
        raise HTTPException(status_code=400, detail="key_id not set. Upload the public key to Alchemy dashboard and paste the key_id.")
    now = int(time.time())
    token = pyjwt.encode(
        {"iat": now, "exp": now + 600},
        pk_pem,
        algorithm="RS256",
        headers={"kid": key_id},
    )
    return {"jwt": token, "expires_in": 600}


# ─── Trail Lab pickers ────────────────────────────────────────────────────────

@router.get("/traillab/pois")
async def traillab_pois(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """List all POIs for the Mint tab picker."""
    result = await db.execute(text(
        "SELECT id, name, description, latitude, longitude, rarity FROM pois ORDER BY minted_at DESC LIMIT 300"
    ))
    rows = result.fetchall()
    return [
        {"id": str(r[0]), "name": r[1], "description": r[2] or "", "lat": float(r[3]), "lng": float(r[4]), "rarity": r[5] or "common"}
        for r in rows
    ]


@router.get("/traillab/routes")
async def traillab_routes(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """List all routes for the Mint tab picker."""
    result = await db.execute(text(
        "SELECT id, name, description, difficulty, distance_km, elevation_gain_m FROM routes ORDER BY created_at DESC LIMIT 300"
    ))
    rows = result.fetchall()
    return [
        {"id": str(r[0]), "name": r[1], "description": r[2] or "", "difficulty": r[3] or "easy",
         "distance_km": float(r[4] or 0), "elevation_m": float(r[5] or 0)}
        for r in rows
    ]


# ─── NFT Metadata Image Upload ────────────────────────────────────────────────

@router.post("/upload/image")
async def upload_nft_image(
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
):
    """Upload an image for use in NFT metadata. Returns a hosted URL."""
    allowed = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG/GIF/WEBP images are allowed")

    # Limit size to 5MB
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 5MB")

    ext = (file.filename or "img").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        ext = "jpg"
    filename = f"nft_{uuid.uuid4().hex}.{ext}"
    media_dir = os.path.join(os.path.dirname(__file__), "..", "media", "nft")
    os.makedirs(media_dir, exist_ok=True)
    with open(os.path.join(media_dir, filename), "wb") as fh:
        fh.write(content)

    base_url = os.environ.get("API_BASE_URL", "https://api.ontrail.tech")
    return {"url": f"{base_url}/media/nft/{filename}", "filename": filename}
