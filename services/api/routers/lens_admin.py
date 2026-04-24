"""
Lens Protocol Admin Router
Admin endpoints for Lens Protocol configuration and management.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from database import get_db
from models import AdminConfig, User, POI, Route
from dependencies import require_admin
from lens_client import LensClient, sync_user_with_lens
from lens_sync import get_lens_sync_service
from grove_client import upload_profile_metadata

router = APIRouter()


# ── Pydantic Models ──

class LensConfigCreate(BaseModel):
    lens_api_key: Optional[str] = None
    lens_api_url: str = "https://api.testnet.lens.xyz"
    lens_graphql_url: str = "https://api.testnet.lens.xyz/graphql"
    lens_rpc_url: str = "https://rpc.testnet.lens.xyz"
    lens_chain_id: int = 371112
    auth_endpoint_url: Optional[str] = None
    auth_secret: Optional[str] = None
    auth_access: str = "custom"
    lens_wallet_address: Optional[str] = None
    lens_explorer_url: Optional[str] = None
    mode: str = "simulate"
    friendpass_contract_address: Optional[str] = None
    profile_wallet_contract_address: Optional[str] = None
    gho_onramp_enabled: bool = False
    gho_onramp_amount: Optional[str] = None
    lens_token_onramp_enabled: bool = False
    lens_token_onramp_amount: Optional[str] = None


class LensConfigUpdate(BaseModel):
    lens_api_key: Optional[str] = None
    lens_api_url: Optional[str] = None
    lens_graphql_url: Optional[str] = None
    lens_rpc_url: Optional[str] = None
    lens_chain_id: Optional[int] = None
    auth_endpoint_url: Optional[str] = None
    auth_secret: Optional[str] = None
    auth_access: Optional[str] = None
    lens_wallet_address: Optional[str] = None
    lens_explorer_url: Optional[str] = None
    mode: Optional[str] = None
    friendpass_contract_address: Optional[str] = None
    profile_wallet_contract_address: Optional[str] = None
    gho_onramp_enabled: Optional[bool] = None
    gho_onramp_amount: Optional[str] = None
    lens_token_onramp_enabled: Optional[bool] = None
    lens_token_onramp_amount: Optional[str] = None


class LensProfileCreateRequest(BaseModel):
    user_id: str
    handle: str
    bio: Optional[str] = None
    avatar_uri: Optional[str] = None


class LensProfileSyncRequest(BaseModel):
    user_id: str
    wallet_address: str
    username: str
    bio: Optional[str] = None
    avatar_uri: Optional[str] = None


# ── Lens Configuration Endpoints ──

@router.get("/lens/config")
async def get_lens_config(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get Lens Protocol configuration."""
    result = await db.execute(
        select(AdminConfig).where(AdminConfig.config_key == "lens_config")
    )
    config = result.scalar_one_or_none()
    
    if not config:
        # Return default configuration
        return {
            "chain_id": 371111,
            "rpc_url": "https://rpc.lens.xyz",
            "api_url": "https://api.lens.xyz",
            "api_key": None,
        }
    
    return config.config_value


@router.post("/lens/config")
async def update_lens_config(
    req: LensConfigCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update Lens Protocol configuration in database."""
    from decimal import Decimal
    
    # Check if config already exists
    result = await db.execute(select(LensConfig))
    existing_config = result.scalar_one_or_none()
    
    if existing_config:
        # Update existing config
        existing_config.lens_api_key = req.lens_api_key
        existing_config.lens_api_url = req.lens_api_url
        existing_config.lens_graphql_url = req.lens_graphql_url
        existing_config.lens_rpc_url = req.lens_rpc_url
        existing_config.lens_chain_id = req.lens_chain_id
        existing_config.auth_endpoint_url = req.auth_endpoint_url
        existing_config.auth_secret = req.auth_secret
        existing_config.auth_access = req.auth_access
        existing_config.lens_wallet_address = req.lens_wallet_address
        existing_config.lens_explorer_url = req.lens_explorer_url
        existing_config.mode = req.mode
        existing_config.friendpass_contract_address = req.friendpass_contract_address
        existing_config.profile_wallet_contract_address = req.profile_wallet_contract_address
        existing_config.gho_onramp_enabled = req.gho_onramp_enabled
        existing_config.gho_onramp_amount = Decimal(str(req.gho_onramp_amount)) if req.gho_onramp_amount else None
        existing_config.lens_token_onramp_enabled = req.lens_token_onramp_enabled
        existing_config.lens_token_onramp_amount = Decimal(str(req.lens_token_onramp_amount)) if req.lens_token_onramp_amount else None
        existing_config.updated_by = user.id
    else:
        # Create new config
        new_config = LensConfig(
            lens_api_key=req.lens_api_key,
            lens_api_url=req.lens_api_url,
            lens_graphql_url=req.lens_graphql_url,
            lens_rpc_url=req.lens_rpc_url,
            lens_chain_id=req.lens_chain_id,
            auth_endpoint_url=req.auth_endpoint_url,
            auth_secret=req.auth_secret,
            auth_access=req.auth_access,
            lens_wallet_address=req.lens_wallet_address,
            lens_explorer_url=req.lens_explorer_url,
            mode=req.mode,
            friendpass_contract_address=req.friendpass_contract_address,
            profile_wallet_contract_address=req.profile_wallet_contract_address,
            gho_onramp_enabled=req.gho_onramp_enabled,
            gho_onramp_amount=Decimal(str(req.gho_onramp_amount)) if req.gho_onramp_amount else None,
            lens_token_onramp_enabled=req.lens_token_onramp_enabled,
            lens_token_onramp_amount=Decimal(str(req.lens_token_onramp_amount)) if req.lens_token_onramp_amount else None,
            created_by=user.id,
        )
        db.add(new_config)
    
    await db.commit()
    return {"message": "Lens configuration saved successfully"}


@router.patch("/lens/config")
async def patch_lens_config(
    req: LensConfigUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Partially update Lens Protocol configuration."""
    result = await db.execute(
        select(AdminConfig).where(AdminConfig.config_key == "lens_config")
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(status_code=404, detail="Lens configuration not found")
    
    if req.chain_id is not None:
        config.config_value["chain_id"] = req.chain_id
    if req.rpc_url is not None:
        config.config_value["rpc_url"] = req.rpc_url
    if req.api_url is not None:
        config.config_value["api_url"] = req.api_url
    if req.api_key is not None:
        config.config_value["api_key"] = req.api_key
    
    config.updated_by = user.id
    await db.commit()
    
    return {"message": "Lens configuration updated successfully"}


# ── Lens Profile Management Endpoints ──

@router.post("/lens/profile/create")
async def create_lens_profile(
    req: LensProfileCreateRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a Lens profile for a user."""
    # Get user's wallet address
    user_result = await db.execute(
        select(User).where(User.id == req.user_id)
    )
    target_user = user_result.scalar_one_or_none()
    
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not target_user.wallet_address:
        raise HTTPException(status_code=400, detail="User does not have a wallet address")
    
    # Upload profile metadata to Grove
    metadata_uri = await upload_profile_metadata(
        username=req.handle,
        bio=req.bio,
        avatar_uri=req.avatar_uri
    )
    
    # Create Lens profile
    from lens_client import get_lens_client
    client = get_lens_client()
    
    result = await client.create_profile(
        owner_address=target_user.wallet_address,
        handle=req.handle,
        metadata_uri=metadata_uri
    )
    
    return result


@router.post("/lens/profile/sync")
async def sync_lens_profile(
    req: LensProfileSyncRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Sync a user with Lens Protocol (create or update profile)."""
    result = await sync_user_with_lens(
        user_id=req.user_id,
        wallet_address=req.wallet_address,
        username=req.username,
        bio=req.bio,
        avatar_uri=req.avatar_uri
    )
    
    return result


@router.get("/lens/profile/{profile_id}")
async def get_lens_profile(
    profile_id: str,
    user: User = Depends(require_admin),
):
    """Get a Lens profile by ID."""
    from lens_client import get_lens_client
    client = get_lens_client()
    
    profile = await client.get_profile(profile_id)
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    return {
        "profile_id": profile.profile_id,
        "handle": profile.handle,
        "owner": profile.owner,
        "metadata_uri": profile.metadata_uri,
        "created_at": profile.created_at,
        "bio": profile.bio,
        "avatar_uri": profile.avatar_uri,
        "follower_count": profile.follower_count,
        "following_count": profile.following_count,
    }


# ── Lens Social Interaction Endpoints ──

@router.post("/lens/follow")
async def follow_lens_profile(
    follower_user_id: str,
    profile_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Follow a Lens profile on behalf of a user."""
    # Get follower's wallet address
    user_result = await db.execute(
        select(User).where(User.id == follower_user_id)
    )
    follower = user_result.scalar_one_or_none()
    
    if not follower:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not follower.wallet_address:
        raise HTTPException(status_code=400, detail="User does not have a wallet address")
    
    from lens_client import get_lens_client
    client = get_lens_client()
    
    result = await client.follow_profile(
        follower_address=follower.wallet_address,
        profile_id=profile_id
    )
    
    return result


@router.post("/lens/unfollow")
async def unfollow_lens_profile(
    follower_user_id: str,
    profile_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Unfollow a Lens profile on behalf of a user."""
    # Get follower's wallet address
    user_result = await db.execute(
        select(User).where(User.id == follower_user_id)
    )
    follower = user_result.scalar_one_or_none()
    
    if not follower:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not follower.wallet_address:
        raise HTTPException(status_code=400, detail="User does not have a wallet address")
    
    from lens_client import get_lens_client
    client = get_lens_client()
    
    result = await client.unfollow_profile(
        follower_address=follower.wallet_address,
        profile_id=profile_id
    )
    
    return result


@router.post("/lens/post")
async def create_lens_post(
    user_id: str,
    content: str,
    images: Optional[List[str]] = None,
    tags: Optional[List[str]] = None,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a post on Lens on behalf of a user."""
    # Get user's wallet address and Lens profile
    user_result = await db.execute(
        select(User).where(User.id == user_id)
    )
    target_user = user_result.scalar_one_or_none()
    
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not target_user.wallet_address:
        raise HTTPException(status_code=400, detail="User does not have a wallet address")
    
    # Upload post metadata to Grove
    from grove_client import upload_post_metadata
    metadata_uri = await upload_post_metadata(
        content=content,
        images=images,
        tags=tags
    )
    
    # Create Lens post
    from lens_client import get_lens_client
    client = get_lens_client()
    
    # Use username as profile_id (in production, this should be the actual Lens profile ID)
    profile_id = target_user.username or target_user.wallet_address
    
    result = await client.create_post(
        profile_id=profile_id,
        content=content,
        metadata_uri=metadata_uri
    )
    
    return result


@router.get("/lens/feed/{profile_id}")
async def get_lens_feed(
    profile_id: str,
    limit: int = 10,
    user: User = Depends(require_admin),
):
    """Get the Lens feed for a profile."""
    from lens_client import get_lens_client
    client = get_lens_client()
    
    feed = await client.get_feed(profile_id, limit)
    
    return {
        "profile_id": profile_id,
        "limit": limit,
        "publications": [
            {
                "publication_id": pub.publication_id,
                "profile_id": pub.profile_id,
                "content": pub.content,
                "created_at": pub.created_at,
                "collect_count": pub.collect_count,
                "mirror_count": pub.mirror_count,
            }
            for pub in feed
        ],
    }


@router.get("/lens/followers/{profile_id}")
async def get_lens_followers(
    profile_id: str,
    limit: int = 50,
    user: User = Depends(require_admin),
):
    """Get followers of a Lens profile."""
    from lens_client import get_lens_client
    client = get_lens_client()
    
    followers = await client.get_followers(profile_id, limit)
    
    return {
        "profile_id": profile_id,
        "limit": limit,
        "followers": followers,
    }


@router.get("/lens/following/{profile_id}")
async def get_lens_following(
    profile_id: str,
    limit: int = 50,
    user: User = Depends(require_admin),
):
    """Get profiles that a Lens profile is following."""
    from lens_client import get_lens_client
    client = get_lens_client()
    
    following = await client.get_following(profile_id, limit)
    
    return {
        "profile_id": profile_id,
        "limit": limit,
        "following": following,
    }


# ── Grove Storage Endpoints ──

@router.post("/lens/grove/upload")
async def upload_to_grove(
    content: str,
    content_type: str = "application/json",
    user: User = Depends(require_admin),
):
    """Upload content to Grove storage."""
    from grove_client import get_grove_client
    client = get_grove_client()
    
    result = await client.upload_content(
        content=content,
        content_type=content_type
    )
    
    return result


@router.get("/lens/grove/{content_id}")
async def download_from_grove(
    content_id: str,
    user: User = Depends(require_admin),
):
    """Download content from Grove storage."""
    from grove_client import get_grove_client
    client = get_grove_client()
    
    content = await client.download_content(content_id)
    
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    return {
        "content_id": content_id,
        "content": content,
    }


@router.delete("/lens/grove/{content_id}")
async def delete_from_grove(
    content_id: str,
    user: User = Depends(require_admin),
):
    """Delete content from Grove storage."""
    from grove_client import get_grove_client
    client = get_grove_client()
    
    result = await client.delete_content(content_id)
    
    return result


# ── Lens Sync Endpoints ──

@router.post("/lens/sync/poi/{poi_id}")
async def sync_poi_to_lens(
    poi_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Sync a POI to Lens as a publication."""
    sync_service = get_lens_sync_service()
    
    # Get POI to find owner
    result = await db.execute(
        select(POI).where(POI.id == poi_id)
    )
    poi = result.scalar_one_or_none()
    
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")
    
    sync_result = await sync_service.sync_poi_to_lens(poi_id, poi.owner_id, db)
    
    return sync_result


@router.post("/lens/sync/route/{route_id}")
async def sync_route_to_lens(
    route_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Sync a Route to Lens as a collection."""
    sync_service = get_lens_sync_service()
    
    # Get Route to find creator
    result = await db.execute(
        select(Route).where(Route.id == route_id)
    )
    route = result.scalar_one_or_none()
    
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    
    sync_result = await sync_service.sync_route_to_lens(route_id, route.creator_id, db)
    
    return sync_result


@router.post("/lens/sync/pois/batch")
async def batch_sync_pois(
    poi_ids: List[str],
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Batch sync multiple POIs to Lens."""
    sync_service = get_lens_sync_service()
    
    results = await sync_service.batch_sync_pois(poi_ids, db)
    
    return {
        "total": len(results),
        "successful": sum(1 for r in results if r.get("success")),
        "failed": sum(1 for r in results if not r.get("success")),
        "results": results,
    }


@router.post("/lens/sync/routes/batch")
async def batch_sync_routes(
    route_ids: List[str],
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Batch sync multiple routes to Lens."""
    sync_service = get_lens_sync_service()
    
    results = await sync_service.batch_sync_routes(route_ids, db)
    
    return {
        "total": len(results),
        "successful": sum(1 for r in results if r.get("success")),
        "failed": sum(1 for r in results if not r.get("success")),
        "results": results,
    }


@router.post("/lens/sync/friendpass")
async def sync_friendpass_to_lens(
    runner_id: str,
    holder_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Sync a FriendPass purchase to Lens as a collect/mirror."""
    sync_service = get_lens_sync_service()
    
    sync_result = await sync_service.sync_friendpass_to_lens(runner_id, holder_id, db)
    
    return sync_result


# ── Lens Test Execution Endpoints ──

@router.post("/lens/tests/run")
async def run_lens_tests(
    user: User = Depends(require_admin),
):
    """
    Run Lens integration tests and return results.
    """
    import subprocess
    import sys
    
    try:
        # Run pytest on the lens integration tests
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "tests/test_lens_integration.py", "-v", "--tb=short"],
            cwd="services/api",
            capture_output=True,
            text=True,
            timeout=60
        )
        
        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "summary": "All tests passed" if result.returncode == 0 else "Some tests failed"
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": "Test execution timed out",
            "summary": "Tests timed out after 60 seconds"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "summary": f"Test execution failed: {str(e)}"
        }


@router.post("/lens/tests/connection")
async def test_lens_connection(
    user: User = Depends(require_admin),
):
    """
    Test connection to Lens Protocol and Grove storage.
    """
    results = {
        "lens_connection": {"success": False, "message": ""},
        "grove_connection": {"success": False, "message": ""},
        "lens_testnet": {"success": False, "message": ""},
    }
    
    # Test Lens connection
    try:
        from lens_client import get_lens_client
        client = get_lens_client()
        results["lens_connection"] = {
            "success": True,
            "message": f"Connected to Lens {client.network}",
            "chain_id": client.chain_id,
            "api_url": client.api_url,
        }
    except Exception as e:
        results["lens_connection"] = {
            "success": False,
            "message": f"Failed to connect to Lens: {str(e)}"
        }
    
    # Test Grove connection
    try:
        from grove_client import get_grove_client
        client = get_grove_client()
        results["grove_connection"] = {
            "success": True,
            "message": "Connected to Grove storage",
            "api_url": client.api_url,
        }
    except Exception as e:
        results["grove_connection"] = {
            "success": False,
            "message": f"Failed to connect to Grove: {str(e)}"
        }
    
    # Test Lens testnet specifically
    try:
        from lens_client import LENS_TESTNET_CHAIN_ID, get_lens_client
        testnet_client = get_lens_client(LENS_TESTNET_CHAIN_ID)
        results["lens_testnet"] = {
            "success": True,
            "message": "Connected to Lens testnet (Amoy)",
            "chain_id": testnet_client.chain_id,
        }
    except Exception as e:
        results["lens_testnet"] = {
            "success": False,
            "message": f"Failed to connect to Lens testnet: {str(e)}"
        }
    
    return results


@router.get("/lens/config")
async def get_lens_config(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Get current Lens Protocol configuration from database.
    """
    from models import LensConfig
    
    result = await db.execute(select(LensConfig))
    config = result.scalar_one_or_none()
    
    if config:
        return {
            "id": str(config.id),
            "lens_api_key": config.lens_api_key,
            "lens_api_url": config.lens_api_url,
            "lens_graphql_url": config.lens_graphql_url,
            "lens_rpc_url": config.lens_rpc_url,
            "lens_chain_id": config.lens_chain_id,
            "auth_endpoint_url": config.auth_endpoint_url,
            "auth_secret": config.auth_secret,
            "auth_access": config.auth_access,
            "lens_wallet_address": config.lens_wallet_address,
            "lens_explorer_url": config.lens_explorer_url,
            "mode": config.mode,
            "friendpass_contract_address": config.friendpass_contract_address,
            "profile_wallet_contract_address": config.profile_wallet_contract_address,
            "gho_onramp_enabled": config.gho_onramp_enabled,
            "gho_onramp_amount": str(config.gho_onramp_amount) if config.gho_onramp_amount else None,
            "lens_token_onramp_enabled": config.lens_token_onramp_enabled,
            "lens_token_onramp_amount": str(config.lens_token_onramp_amount) if config.lens_token_onramp_amount else None,
        }
    else:
        # Return default configuration with user's testnet address
        return {
            "lens_api_key": None,
            "lens_api_url": "https://api.testnet.lens.xyz",
            "lens_graphql_url": "https://api.testnet.lens.xyz/graphql",
            "lens_rpc_url": "https://rpc.testnet.lens.xyz",
            "lens_chain_id": 371112,
            "auth_endpoint_url": None,
            "auth_secret": None,
            "auth_access": "custom",
            "lens_wallet_address": "0x034bc3b8faae33369ad27ed89f455a95ef8f9629",
            "lens_explorer_url": "https://explorer.lens.xyz",
            "mode": "simulate",
            "friendpass_contract_address": None,
            "profile_wallet_contract_address": None,
            "gho_onramp_enabled": False,
            "gho_onramp_amount": "0.1",
            "lens_token_onramp_enabled": False,
            "lens_token_onramp_amount": "0.1",
        }


@router.get("/lens/tests/status")
async def get_lens_test_status(
    user: User = Depends(require_admin),
):
    """
    Get current Lens integration test status and configuration.
    """
    from lens_client import LENS_CHAIN_ID, LENS_TESTNET_CHAIN_ID, LENS_RPC_URL, LENS_API_URL
    
    return {
        "config": {
            "mainnet_chain_id": LENS_CHAIN_ID,
            "testnet_chain_id": LENS_TESTNET_CHAIN_ID,
            "rpc_url": LENS_RPC_URL,
            "api_url": LENS_API_URL,
        },
        "default_chain": "testnet" if LENS_RPC_URL.endswith("lens.xyz") else "mainnet",
        "components": {
            "lens_client": "lens_client.py",
            "grove_client": "grove_client.py",
            "lens_sync": "lens_sync.py",
            "tests": "tests/test_lens_integration.py",
        },
        "endpoints": {
            "config": "/api/admin/lens/config",
            "sync_poi": "/api/admin/lens/sync/poi/{poi_id}",
            "sync_route": "/api/admin/lens/sync/route/{route_id}",
            "batch_sync_pois": "/api/admin/lens/sync/pois/batch",
            "batch_sync_routes": "/api/admin/lens/sync/routes/batch",
            "run_tests": "/api/admin/lens/tests/run",
            "test_connection": "/api/admin/lens/tests/connection",
        },
    }


@router.post("/lens/onramp/gho")
async def onramp_gho(
    user_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin onramp GHO tokens to a user for gas/testing.
    """
    from models import LensConfig, ProfileWallet
    from decimal import Decimal
    
    # Get Lens config
    result = await db.execute(select(LensConfig))
    config = result.scalar_one_or_none()
    
    if not config or not config.gho_onramp_enabled:
        return {"success": False, "error": "GHO onramp not enabled"}
    
    # Get user's profile wallet
    wallet_result = await db.execute(
        select(ProfileWallet).where(ProfileWallet.user_id == user_id)
    )
    profile_wallet = wallet_result.scalar_one_or_none()
    
    if not profile_wallet:
        return {"success": False, "error": "Profile wallet not found"}
    
    amount = config.gho_onramp_amount or Decimal("0.1")
    
    # In production, this would call the GHO contract to transfer tokens
    # For now, simulate the onramp
    profile_wallet.balance_eth = (profile_wallet.balance_eth or Decimal("0")) + amount
    
    await db.commit()
    
    return {
        "success": True,
        "message": f"Onramped {amount} GHO to {profile_wallet.wallet_address}",
        "wallet_address": profile_wallet.wallet_address,
        "amount": str(amount),
    }


@router.post("/lens/onramp/lens")
async def onramp_lens(
    user_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin onramp Lens tokens to a user for gas/testing.
    """
    from models import LensConfig, ProfileWallet
    from decimal import Decimal
    
    # Get Lens config
    result = await db.execute(select(LensConfig))
    config = result.scalar_one_or_none()
    
    if not config or not config.lens_token_onramp_enabled:
        return {"success": False, "error": "Lens token onramp not enabled"}
    
    # Get user's profile wallet
    wallet_result = await db.execute(
        select(ProfileWallet).where(ProfileWallet.user_id == user_id)
    )
    profile_wallet = wallet_result.scalar_one_or_none()
    
    if not profile_wallet:
        return {"success": False, "error": "Profile wallet not found"}
    
    amount = config.lens_token_onramp_amount or Decimal("0.1")
    
    # In production, this would call the Lens token contract to transfer tokens
    # For now, simulate the onramp
    profile_wallet.balance_matic = (profile_wallet.balance_matic or Decimal("0")) + amount
    
    await db.commit()
    
    return {
        "success": True,
        "message": f"Onramped {amount} Lens tokens to {profile_wallet.wallet_address}",
        "wallet_address": profile_wallet.wallet_address,
        "amount": str(amount),
    }


@router.get("/lens/sync/status")
async def get_sync_status(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Get Social-Fi sync status dashboard.
    Shows counts of synced and unsynced objects.
    """
    from models import POI, Route, User
    
    # Get total counts
    poi_result = await db.execute(select(POI))
    total_pois = len(poi_result.scalars().all())
    
    route_result = await db.execute(select(Route))
    total_routes = len(route_result.scalars().all())
    
    user_result = await db.execute(select(User).where(User.onboarding_completed == True))
    total_users = len(user_result.scalars().all())
    
    # In production, these would be actual sync counts from a sync_log table
    # For now, return simulated data
    return {
        "summary": {
            "total_pois": total_pois,
            "synced_pois": 0,  # Would come from sync_log table
            "unsynced_pois": total_pois,
            "total_routes": total_routes,
            "synced_routes": 0,
            "unsynced_routes": total_routes,
            "total_users": total_users,
            "synced_users": 0,
            "unsynced_users": total_users,
        },
        "sync_percentage": {
            "pois": 0,
            "routes": 0,
            "users": 0,
        },
        "last_sync": None,  # Would come from sync_log table
        "sync_enabled": True,
    }
