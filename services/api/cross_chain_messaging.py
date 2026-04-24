"""
Cross-Chain Messaging Service
Enables messaging between Polygon (FriendPass NFTs) and Lens Chain (Social features).
"""
import logging
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime
import json

from lens_graphql import LensGraphQLClient, get_lens_graphql_client
from models import User, ProfileWallet, FriendPassHolding

logger = logging.getLogger(__name__)


class CrossChainMessage:
    """Represents a cross-chain message."""
    
    def __init__(
        self,
        source_chain: str,
        target_chain: str,
        message_type: str,
        payload: Dict[str, Any],
        sender_address: str,
        recipient_address: Optional[str] = None
    ):
        self.source_chain = source_chain  # "polygon" or "lens"
        self.target_chain = target_chain  # "lens" or "polygon"
        self.message_type = message_type  # e.g., "friendpass_purchase", "social_action"
        self.payload = payload
        self.sender_address = sender_address
        self.recipient_address = recipient_address
        self.timestamp = datetime.utcnow()
        self.signature = None  # To be generated
        self.status = "pending"  # pending, sent, confirmed, failed


class CrossChainMessagingService:
    """
    Service for handling cross-chain messaging between Polygon and Lens Chain.
    Enables Social-Fi bridge integration.
    """
    
    POLYGON_CHAIN_ID = 137  # Polygon mainnet
    LENS_CHAIN_ID = 371112  # Lens Chain testnet
    
    def __init__(
        self,
        lens_client: Optional[LensGraphQLClient] = None
    ):
        self.lens_client = lens_client or get_lens_graphql_client()
    
    async def send_friendpass_purchase_to_lens(
        self,
        user_id: str,
        friendpass_id: str,
        purchase_amount: float,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Send FriendPass purchase event from Polygon to Lens Chain as a social action.
        
        Args:
            user_id: User ID who purchased FriendPass
            friendpass_id: FriendPass ID
            purchase_amount: Purchase amount in ETH
            db: Database session
            
        Returns:
            Dict with message status
        """
        try:
            # Get user and profile wallet
            user_result = await db.execute(
                select(User).where(User.id == user_id)
            )
            user = user_result.scalar_one_or_none()
            
            if not user:
                return {"success": False, "error": "User not found"}
            
            # Get profile wallet for Lens Chain
            wallet_result = await db.execute(
                select(ProfileWallet).where(ProfileWallet.user_id == user_id)
            )
            profile_wallet = wallet_result.scalar_one_or_none()
            
            if not profile_wallet:
                return {"success": False, "error": "Profile wallet not found"}
            
            # Create cross-chain message
            message = CrossChainMessage(
                source_chain="polygon",
                target_chain="lens",
                message_type="friendpass_purchase",
                payload={
                    "friendpass_id": str(friendpass_id),
                    "purchase_amount": str(purchase_amount),
                    "timestamp": datetime.utcnow().isoformat(),
                },
                sender_address=profile_wallet.wallet_address,
            )
            
            # Post to Lens as a publication (social action)
            content = f"🎉 Purchased FriendPass #{friendpass_id} for {purchase_amount} ETH!"
            
            # Upload metadata to Grove
            from grove_client import upload_post_metadata
            metadata_uri = await upload_post_metadata(
                content=content,
                tags=["friendpass", "purchase", "social-fi"]
            )
            
            # Create Lens publication
            result = await self.lens_client.create_post(
                profile_id=profile_wallet.wallet_address,
                content=content,
                metadata_uri=metadata_uri
            )
            
            if result.get("data") and result["data"].get("createPost"):
                publication_id = result["data"]["createPost"].get("id")
                message.status = "confirmed"
                logger.info(f"FriendPass purchase sent to Lens: {publication_id}")
                
                return {
                    "success": True,
                    "message_id": str(message.timestamp),
                    "lens_publication_id": publication_id,
                    "status": "confirmed",
                }
            else:
                message.status = "failed"
                return {
                    "success": False,
                    "error": "Failed to create Lens publication",
                    "details": result.get("errors", []),
                }
                
        except Exception as e:
            logger.error(f"Failed to send FriendPass purchase to Lens: {e}")
            return {"success": False, "error": str(e)}
    
    async def send_social_action_to_polygon(
        self,
        lens_publication_id: str,
        action_type: str,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Send social action from Lens Chain to Polygon (e.g., for reputation updates).
        
        Args:
            lens_publication_id: Lens publication ID
            action_type: Action type (e.g., "like", "comment", "mirror")
            db: Database session
            
        Returns:
            Dict with message status
        """
        try:
            # Get publication details from Lens
            result = await self.lens_client.get_publication(lens_publication_id)
            
            if not result.get("data") or not result["data"].get("publication"):
                return {"success": False, "error": "Publication not found"}
            
            publication = result["data"]["publication"]
            profile_id = publication.get("profile", {}).get("id")
            
            # Find user by profile wallet address
            wallet_result = await db.execute(
                select(ProfileWallet).where(ProfileWallet.wallet_address == profile_id)
            )
            profile_wallet = wallet_result.scalar_one_or_none()
            
            if not profile_wallet:
                return {"success": False, "error": "Profile wallet not found"}
            
            # Create cross-chain message
            message = CrossChainMessage(
                source_chain="lens",
                target_chain="polygon",
                message_type="social_action",
                payload={
                    "lens_publication_id": lens_publication_id,
                    "action_type": action_type,
                    "timestamp": datetime.utcnow().isoformat(),
                },
                sender_address=profile_id,
                recipient_address=profile_wallet.wallet_address,
            )
            
            # In production, this would:
            # 1. Sign the message with the profile wallet
            # 2. Send to Polygon via a bridge contract
            # 3. Update reputation on Polygon
            
            # For now, simulate the bridge
            message.status = "sent"
            logger.info(f"Social action sent to Polygon: {action_type} on {lens_publication_id}")
            
            return {
                "success": True,
                "message_id": str(message.timestamp),
                "status": "sent",
                "action_type": action_type,
            }
            
        except Exception as e:
            logger.error(f"Failed to send social action to Polygon: {e}")
            return {"success": False, "error": str(e)}
    
    async def sync_reputation_from_lens(
        self,
        user_id: str,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Sync user reputation from Lens Chain social actions to Polygon.
        
        Args:
            user_id: User ID
            db: Database session
            
        Returns:
            Dict with sync status
        """
        try:
            # Get user and profile wallet
            user_result = await db.execute(
                select(User).where(User.id == user_id)
            )
            user = user_result.scalar_one_or_none()
            
            if not user:
                return {"success": False, "error": "User not found"}
            
            wallet_result = await db.execute(
                select(ProfileWallet).where(ProfileWallet.user_id == user_id)
            )
            profile_wallet = wallet_result.scalar_one_or_none()
            
            if not profile_wallet:
                return {"success": False, "error": "Profile wallet not found"}
            
            # Get user's Lens profile and feed
            profile_result = await self.lens_client.get_profile(
                profile_id=profile_wallet.wallet_address
            )
            
            if not profile_result.get("data") or not profile_result["data"].get("profile"):
                return {"success": False, "error": "Lens profile not found"}
            
            profile = profile_result["data"]["profile"]
            stats = profile.get("stats", {})
            
            # Calculate reputation score from Lens social stats
            lens_reputation = (
                stats.get("totalFollowers", 0) * 1 +
                stats.get("totalPosts", 0) * 0.5 +
                stats.get("totalCollects", 0) * 2
            )
            
            # In production, update user reputation on Polygon
            # For now, return the calculated reputation
            logger.info(f"Reputation synced from Lens: {lens_reputation}")
            
            return {
                "success": True,
                "lens_reputation": lens_reputation,
                "stats": stats,
            }
            
        except Exception as e:
            logger.error(f"Failed to sync reputation from Lens: {e}")
            return {"success": False, "error": str(e)}
    
    async def bridge_friendpass_to_lens_profile(
        self,
        friendpass_holding_id: str,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Bridge FriendPass holding from Polygon to Lens Chain as a collectible.
        
        Args:
            friendpass_holding_id: FriendPass holding ID
            db: Database session
            
        Returns:
            Dict with bridge status
        """
        try:
            # Get FriendPass holding
            holding_result = await db.execute(
                select(FriendPassHolding).where(FriendPassHolding.id == friendpass_holding_id)
            )
            holding = holding_result.scalar_one_or_none()
            
            if not holding:
                return {"success": False, "error": "FriendPass holding not found"}
            
            # Get user and profile wallet
            user_result = await db.execute(
                select(User).where(User.id == holding.user_id)
            )
            user = user_result.scalar_one_or_none()
            
            if not user:
                return {"success": False, "error": "User not found"}
            
            wallet_result = await db.execute(
                select(ProfileWallet).where(ProfileWallet.user_id == holding.user_id)
            )
            profile_wallet = wallet_result.scalar_one_or_none()
            
            if not profile_wallet:
                return {"success": False, "error": "Profile wallet not found"}
            
            # Create Lens publication announcing the FriendPass holding
            content = f"✨ Holding FriendPass for {holding.runner_username}!\n\nReputation: {holding.runner_reputation}"
            
            from grove_client import upload_post_metadata
            metadata_uri = await upload_post_metadata(
                content=content,
                tags=["friendpass", "holding", "social-fi"]
            )
            
            result = await self.lens_client.create_post(
                profile_id=profile_wallet.wallet_address,
                content=content,
                metadata_uri=metadata_uri
            )
            
            if result.get("data") and result["data"].get("createPost"):
                publication_id = result["data"]["createPost"].get("id")
                logger.info(f"FriendPass bridged to Lens: {publication_id}")
                
                return {
                    "success": True,
                    "lens_publication_id": publication_id,
                    "friendpass_holding_id": str(friendpass_holding_id),
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to create Lens publication",
                    "details": result.get("errors", []),
                }
                
        except Exception as e:
            logger.error(f"Failed to bridge FriendPass to Lens: {e}")
            return {"success": False, "error": str(e)}


# Global cross-chain messaging service instance
_cross_chain_service: Optional[CrossChainMessagingService] = None


def get_cross_chain_service() -> CrossChainMessagingService:
    """Get or create the global cross-chain messaging service instance."""
    global _cross_chain_service
    if _cross_chain_service is None:
        _cross_chain_service = CrossChainMessagingService()
    return _cross_chain_service
