"""
Lens Object Synchronization Service
Maps OnTrail objects (POIs, messages, routes) to Lens Protocol objects.
"""
import logging
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from lens_graphql import LensGraphQLClient, get_lens_graphql_client
from grove_client import upload_poi_metadata, upload_route_metadata
from models import POI, Route, User, POIListing, FriendPassHolding

logger = logging.getLogger(__name__)


class LensObjectSync:
    """
    Service for synchronizing OnTrail objects with Lens Protocol.
    Maps:
    - POIs → Lens Publications
    - Messages → Lens Comments
    - Routes → Lens Collections/Groups
    """
    
    def __init__(self, lens_client: Optional[LensGraphQLClient] = None):
        self.lens_client = lens_client or get_lens_graphql_client()
    
    async def sync_poi_to_lens(
        self,
        poi_id: str,
        owner_id: str,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Sync a POI to Lens as a publication using GraphQL API.
        
        Args:
            poi_id: POI ID
            owner_id: Owner user ID
            db: Database session
            
        Returns:
            Dict with sync result including Lens publication ID
        """
        try:
            # Get POI from database
            result = await db.execute(
                select(POI).where(POI.id == poi_id)
            )
            poi = result.scalar_one_or_none()
            
            if not poi:
                return {"success": False, "error": "POI not found"}
            
            # Get owner's Lens profile
            user_result = await db.execute(
                select(User).where(User.id == owner_id)
            )
            owner = user_result.scalar_one_or_none()
            
            if not owner or not owner.username:
                return {"success": False, "error": "Owner not found or has no username"}
            
            # Upload POI metadata to Grove
            metadata_uri = await upload_poi_metadata(
                poi_name=poi.name,
                poi_description=poi.description,
                latitude=poi.latitude,
                longitude=poi.longitude,
                rarity=poi.rarity,
                owner_username=owner.username,
                owner_avatar=owner.avatar_url
            )
            
            # Create Lens publication (post) using GraphQL
            # Note: This requires a valid Lens profile ID, not just username
            # In production, you would get the profile_id from the user's Lens profile
            profile_id = owner.username  # This would be the actual Lens profile ID in production
            
            content = f"📍 {poi.name}\n\n{poi.description or ''}\n\nRarity: {poi.rarity}\nLocation: {poi.latitude}, {poi.longitude}"
            
            result = await self.lens_client.create_post(
                profile_id=profile_id,
                content=content,
                metadata_uri=metadata_uri
            )
            
            if result.get("data") and result["data"].get("createPost"):
                publication_id = result["data"]["createPost"].get("id")
                logger.info(f"Synced POI {poi_id} to Lens publication {publication_id}")
                
                return {
                    "success": True,
                    "poi_id": str(poi_id),
                    "lens_publication_id": publication_id,
                    "profile_id": profile_id,
                    "metadata_uri": metadata_uri,
                }
            else:
                logger.warning(f"GraphQL response: {result}")
                return {
                    "success": False,
                    "error": "Failed to create Lens publication",
                    "details": result.get("errors", []),
                }
                
        except Exception as e:
            logger.error(f"Failed to sync POI {poi_id} to Lens: {e}")
            return {"success": False, "error": str(e)}
    
    async def sync_route_to_lens(
        self,
        route_id: str,
        creator_id: str,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Sync a Route to Lens as a collection using GraphQL API.
        
        Args:
            route_id: Route ID
            creator_id: Creator user ID
            db: Database session
            
        Returns:
            Dict with sync result including Lens publication ID
        """
        try:
            # Get Route from database
            result = await db.execute(
                select(Route).where(Route.id == route_id)
            )
            route = result.scalar_one_or_none()
            
            if not route:
                return {"success": False, "error": "Route not found"}
            
            # Get creator's Lens profile
            user_result = await db.execute(
                select(User).where(User.id == creator_id)
            )
            creator = user_result.scalar_one_or_none()
            
            if not creator or not creator.username:
                return {"success": False, "error": "Creator not found or has no username"}
            
            # Upload Route metadata to Grove
            metadata_uri = await upload_route_metadata(
                route_name=route.name,
                route_description=route.description,
                difficulty=route.difficulty,
                distance_km=route.distance_km,
                elevation_gain_m=route.elevation_gain_m,
                creator_username=creator.username,
                completion_count=route.completion_count
            )
            
            # Create Lens publication for the route using GraphQL
            profile_id = creator.username  # This would be the actual Lens profile ID in production
            
            content = f"🏃 {route.name}\n\n{route.description or ''}\n\nDifficulty: {route.difficulty}\nDistance: {route.distance_km} km\nCompletions: {route.completion_count}"
            
            result = await self.lens_client.create_post(
                profile_id=profile_id,
                content=content,
                metadata_uri=metadata_uri
            )
            
            if result.get("data") and result["data"].get("createPost"):
                publication_id = result["data"]["createPost"].get("id")
                logger.info(f"Synced Route {route_id} to Lens publication {publication_id}")
                
                return {
                    "success": True,
                    "route_id": str(route_id),
                    "lens_publication_id": publication_id,
                    "profile_id": profile_id,
                    "metadata_uri": metadata_uri,
                }
            else:
                logger.warning(f"GraphQL response: {result}")
                return {
                    "success": False,
                    "error": "Failed to create Lens publication",
                    "details": result.get("errors", []),
                }
                
        except Exception as e:
            logger.error(f"Failed to sync Route {route_id} to Lens: {e}")
            return {"success": False, "error": str(e)}
    
    async def sync_message_to_lens(
        self,
        message: str,
        sender_id: str,
        recipient_id: str,
        context_publication_id: Optional[str] = None,
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Sync a message to Lens as a comment.
        
        Args:
            message: Message content
            sender_id: Sender user ID
            recipient_id: Recipient user ID
            context_publication_id: Optional Lens publication ID to comment on
            db: Database session
            
        Returns:
            Dict with sync result including Lens comment ID
        """
        try:
            # Get sender's Lens profile
            user_result = await db.execute(
                select(User).where(User.id == sender_id)
            )
            sender = user_result.scalar_one_or_none()
            
            if not sender or not sender.username:
                return {"success": False, "error": "Sender not found or has no username"}
            
            # If there's a context publication, create a comment
            if context_publication_id:
                # In production, use Lens comment API
                # For now, simulate as a post mentioning the context
                profile_id = sender.username
                content = f"@{context_publication_id} {message}"
                
                result = await self.lens_client.create_post(
                    profile_id=profile_id,
                    content=content,
                    metadata_uri="grove://message-metadata"
                )
                
                return {
                    "success": True,
                    "message": message,
                    "lens_publication_id": result.get("publication_id"),
                    "context_publication_id": context_publication_id,
                }
            else:
                # Direct message - create as a post
                profile_id = sender.username
                
                result = await self.lens_client.create_post(
                    profile_id=profile_id,
                    content=message,
                    metadata_uri="grove://message-metadata"
                )
                
                return {
                    "success": True,
                    "message": message,
                    "lens_publication_id": result.get("publication_id"),
                }
                
        except Exception as e:
            logger.error(f"Failed to sync message to Lens: {e}")
            return {"success": False, "error": str(e)}
    
    async def sync_friendpass_to_lens(
        self,
        runner_id: str,
        holder_id: str,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Sync a FriendPass purchase to Lens as a collect/mirror.
        
        Args:
            runner_id: Runner user ID
            holder_id: Holder user ID
            db: Database session
            
        Returns:
            Dict with sync result
        """
        try:
            # Get runner and holder
            runner_result = await db.execute(
                select(User).where(User.id == runner_id)
            )
            runner = runner_result.scalar_one_or_none()
            
            holder_result = await db.execute(
                select(User).where(User.id == holder_id)
            )
            holder = holder_result.scalar_one_or_none()
            
            if not runner or not holder:
                return {"success": False, "error": "User not found"}
            
            # Mirror the runner's profile publication (if exists)
            # In production, this would be a proper collect/mirror operation
            profile_id = holder.username
            
            content = f"🎫 Just got a FriendPass for @{runner.username}!"
            
            result = await self.lens_client.create_post(
                profile_id=profile_id,
                content=content,
                metadata_uri="grove://friendpass-metadata"
            )
            
            return {
                "success": True,
                "runner_id": str(runner_id),
                "holder_id": str(holder_id),
                "lens_publication_id": result.get("publication_id"),
            }
            
        except Exception as e:
            logger.error(f"Failed to sync FriendPass to Lens: {e}")
            return {"success": False, "error": str(e)}
    
    async def batch_sync_pois(
        self,
        poi_ids: List[str],
        db: AsyncSession
    ) -> List[Dict[str, Any]]:
        """
        Batch sync multiple POIs to Lens.
        
        Args:
            poi_ids: List of POI IDs
            db: Database session
            
        Returns:
            List of sync results
        """
        results = []
        for poi_id in poi_ids:
            # Get POI to find owner
            result = await db.execute(
                select(POI).where(POI.id == poi_id)
            )
            poi = result.scalar_one_or_none()
            
            if poi:
                sync_result = await self.sync_poi_to_lens(poi_id, poi.owner_id, db)
                results.append(sync_result)
        
        return results
    
    async def batch_sync_routes(
        self,
        route_ids: List[str],
        db: AsyncSession
    ) -> List[Dict[str, Any]]:
        """
        Batch sync multiple routes to Lens.
        
        Args:
            route_ids: List of Route IDs
            db: Database session
            
        Returns:
            List of sync results
        """
        results = []
        for route_id in route_ids:
            # Get Route to find creator
            result = await db.execute(
                select(Route).where(Route.id == route_id)
            )
            route = result.scalar_one_or_none()
            
            if route:
                sync_result = await self.sync_route_to_lens(route_id, route.creator_id, db)
                results.append(sync_result)
        
        return results


# Global sync service instance
_lens_sync: Optional[LensObjectSync] = None


def get_lens_sync_service() -> LensObjectSync:
    """Get or create the global Lens sync service instance."""
    global _lens_sync
    if _lens_sync is None:
        _lens_sync = LensObjectSync()
    return _lens_sync
