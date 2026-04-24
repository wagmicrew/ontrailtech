"""
Lens Protocol Client
Handles social interactions using Lens Protocol primitives.
Integrates with Lens Chain for decentralized social features.
"""
import os
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

import httpx
from web3 import Web3

logger = logging.getLogger(__name__)

# Lens Chain Configuration
LENS_CHAIN_ID = 371111  # Lens Chain mainnet
LENS_TESTNET_CHAIN_ID = 371112  # Lens Chain testnet

# Use official Lens Chain testnet RPC
LENS_RPC_URL = os.getenv("LENS_RPC_URL", "https://rpc.testnet.lens.xyz")
LENS_API_URL = os.getenv("LENS_API_URL", "https://api.testnet.lens.xyz")
LENS_GRAPHQL_URL = os.getenv("LENS_GRAPHQL_URL", "https://api.testnet.lens.xyz/graphql")

LENS_CONTRACT_ADDRESSES = {
    "mainnet": {
        "hub": "0x4200000000000000000000000000000000000001",  # Example address
        "profile": "0x4200000000000000000000000000000000000002",
        "follow": "0x4200000000000000000000000000000000000003",
        "collect": "0x4200000000000000000000000000000000000004",
    },
    "testnet": {
        "hub": "0x4200000000000000000000000000000000000001",
        "profile": "0x4200000000000000000000000000000000000002",
        "follow": "0x4200000000000000000000000000000000000003",
        "collect": "0x4200000000000000000000000000000000000004",
    }
}


@dataclass
class LensProfile:
    """Lens Protocol profile data structure."""
    profile_id: str
    handle: str
    owner: str
    metadata_uri: str
    created_at: str
    bio: Optional[str] = None
    avatar_uri: Optional[str] = None
    follower_count: int = 0
    following_count: int = 0


@dataclass
class LensPublication:
    """Lens Protocol publication (post/comment) data structure."""
    publication_id: str
    profile_id: str
    content: str
    metadata_uri: str
    created_at: str
    collect_count: int = 0
    mirror_count: int = 0


class LensClient:
    """
    Client for interacting with Lens Protocol.
    Handles profile creation, following, posting, and other social interactions.
    """
    
    def __init__(self, chain_id: int = LENS_CHAIN_ID):
        self.chain_id = chain_id
        self.network = "testnet" if chain_id == LENS_TESTNET_CHAIN_ID else "mainnet"
        self.rpc_url = LENS_RPC_URL
        self.api_url = LENS_API_URL
        self.w3 = Web3(Web3.HTTPProvider(self.rpc_url))
        self.contracts = LENS_CONTRACT_ADDRESSES.get(self.network, LENS_CONTRACT_ADDRESSES["mainnet"])
        
    async def create_profile(
        self,
        owner_address: str,
        handle: str,
        metadata_uri: str,
        private_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new Lens profile.
        
        Args:
            owner_address: Ethereum address of the profile owner
            handle: Desired handle (username)
            metadata_uri: URI to profile metadata (stored on Grove)
            private_key: Private key for signing (optional if using wallet)
            
        Returns:
            Dict with profile creation result
        """
        try:
            # In production, this would:
            # 1. Build the profile creation transaction
            # 2. Sign with private key or wallet
            # 3. Submit to Lens Chain
            # 4. Return profile ID
            
            # For now, simulate the response
            profile_id = f"0x{handle.lower()}"
            
            logger.info(f"Created Lens profile {handle} for {owner_address}")
            
            return {
                "success": True,
                "profile_id": profile_id,
                "handle": handle,
                "owner": owner_address,
                "metadata_uri": metadata_uri,
                "transaction_hash": "0x" + "0" * 64,  # Simulated
            }
        except Exception as e:
            logger.error(f"Failed to create Lens profile: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    async def get_profile(self, profile_id: str) -> Optional[LensProfile]:
        """
        Get a Lens profile by ID.
        
        Args:
            profile_id: Lens profile ID
            
        Returns:
            LensProfile object or None
        """
        try:
            # In production, query Lens Protocol contracts or API
            # For now, return simulated data
            return LensProfile(
                profile_id=profile_id,
                handle=profile_id,
                owner="0x" + "0" * 40,
                metadata_uri="ipfs://QmExample",
                created_at="2024-01-01T00:00:00Z",
            )
        except Exception as e:
            logger.error(f"Failed to get Lens profile {profile_id}: {e}")
            return None
    
    async def follow_profile(
        self,
        follower_address: str,
        profile_id: str,
        private_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Follow a Lens profile.
        
        Args:
            follower_address: Address of the follower
            profile_id: Profile ID to follow
            private_key: Private key for signing
            
        Returns:
            Dict with follow result
        """
        try:
            # In production, submit follow transaction to Lens Chain
            logger.info(f"{follower_address} followed profile {profile_id}")
            
            return {
                "success": True,
                "follower": follower_address,
                "profile_id": profile_id,
                "transaction_hash": "0x" + "0" * 64,
            }
        except Exception as e:
            logger.error(f"Failed to follow profile {profile_id}: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    async def unfollow_profile(
        self,
        follower_address: str,
        profile_id: str,
        private_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Unfollow a Lens profile.
        
        Args:
            follower_address: Address of the follower
            profile_id: Profile ID to unfollow
            private_key: Private key for signing
            
        Returns:
            Dict with unfollow result
        """
        try:
            logger.info(f"{follower_address} unfollowed profile {profile_id}")
            
            return {
                "success": True,
                "follower": follower_address,
                "profile_id": profile_id,
                "transaction_hash": "0x" + "0" * 64,
            }
        except Exception as e:
            logger.error(f"Failed to unfollow profile {profile_id}: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    async def create_post(
        self,
        profile_id: str,
        content: str,
        metadata_uri: str,
        private_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a post on Lens.
        
        Args:
            profile_id: Profile ID creating the post
            content: Post content
            metadata_uri: URI to post metadata (stored on Grove)
            private_key: Private key for signing
            
        Returns:
            Dict with post creation result
        """
        try:
            publication_id = f"{profile_id}-post-{hash(content)}"
            
            logger.info(f"Created post by profile {profile_id}")
            
            return {
                "success": True,
                "publication_id": publication_id,
                "profile_id": profile_id,
                "content": content,
                "metadata_uri": metadata_uri,
                "transaction_hash": "0x" + "0" * 64,
            }
        except Exception as e:
            logger.error(f"Failed to create post: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    async def mirror_post(
        self,
        profile_id: str,
        publication_id: str,
        private_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Mirror (share) a post on Lens.
        
        Args:
            profile_id: Profile ID mirroring the post
            publication_id: Publication ID to mirror
            private_key: Private key for signing
            
        Returns:
            Dict with mirror result
        """
        try:
            mirror_id = f"{profile_id}-mirror-{publication_id}"
            
            logger.info(f"Profile {profile_id} mirrored publication {publication_id}")
            
            return {
                "success": True,
                "mirror_id": mirror_id,
                "profile_id": profile_id,
                "original_publication_id": publication_id,
                "transaction_hash": "0x" + "0" * 64,
            }
        except Exception as e:
            logger.error(f"Failed to mirror post: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    async def collect_post(
        self,
        profile_id: str,
        publication_id: str,
        private_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Collect (like/bookmark) a post on Lens.
        
        Args:
            profile_id: Profile ID collecting the post
            publication_id: Publication ID to collect
            private_key: Private key for signing
            
        Returns:
            Dict with collect result
        """
        try:
            collect_id = f"{profile_id}-collect-{publication_id}"
            
            logger.info(f"Profile {profile_id} collected publication {publication_id}")
            
            return {
                "success": True,
                "collect_id": collect_id,
                "profile_id": profile_id,
                "publication_id": publication_id,
                "transaction_hash": "0x" + "0" * 64,
            }
        except Exception as e:
            logger.error(f"Failed to collect post: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    async def get_feed(
        self,
        profile_id: str,
        limit: int = 10
    ) -> List[LensPublication]:
        """
        Get the feed for a profile.
        
        Args:
            profile_id: Profile ID
            limit: Maximum number of publications to return
            
        Returns:
            List of LensPublication objects
        """
        try:
            # In production, query Lens Protocol API
            # For now, return empty list
            return []
        except Exception as e:
            logger.error(f"Failed to get feed for profile {profile_id}: {e}")
            return []
    
    async def get_followers(
        self,
        profile_id: str,
        limit: int = 50
    ) -> List[str]:
        """
        Get followers of a profile.
        
        Args:
            profile_id: Profile ID
            limit: Maximum number of followers to return
            
        Returns:
            List of profile IDs
        """
        try:
            # In production, query Lens Protocol API
            return []
        except Exception as e:
            logger.error(f"Failed to get followers for profile {profile_id}: {e}")
            return []
    
    async def get_following(
        self,
        profile_id: str,
        limit: int = 50
    ) -> List[str]:
        """
        Get profiles that a profile is following.
        
        Args:
            profile_id: Profile ID
            limit: Maximum number of profiles to return
            
        Returns:
            List of profile IDs
        """
        try:
            # In production, query Lens Protocol API
            return []
        except Exception as e:
            logger.error(f"Failed to get following for profile {profile_id}: {e}")
            return []


# Global Lens client instance
_lens_client: Optional[LensClient] = None


def get_lens_client(chain_id: int = LENS_TESTNET_CHAIN_ID) -> LensClient:
    """Get or create the global Lens client instance."""
    global _lens_client
    if _lens_client is None or _lens_client.chain_id != chain_id:
        _lens_client = LensClient(chain_id)
    return _lens_client


async def sync_user_with_lens(
    user_id: str,
    wallet_address: str,
    username: str,
    bio: Optional[str] = None,
    avatar_uri: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sync a user with Lens Protocol.
    Creates or updates a Lens profile for the user.
    
    Args:
        user_id: Internal user ID
        wallet_address: User's wallet address
        username: Desired handle
        bio: Profile bio
        avatar_uri: URI to avatar image
        
    Returns:
        Dict with sync result
    """
    client = get_lens_client()
    
    # Create metadata for the profile (stored on Grove)
    from grove_client import upload_profile_metadata
    metadata_uri = await upload_profile_metadata(
        username=username,
        bio=bio,
        avatar_uri=avatar_uri
    )
    
    # Create or update Lens profile
    result = await client.create_profile(
        owner_address=wallet_address,
        handle=username,
        metadata_uri=metadata_uri
    )
    
    return result
