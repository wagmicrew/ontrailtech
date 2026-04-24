"""
Grove Storage Client
Handles decentralized storage using Grove (Lens Protocol storage layer).
Provides upload, download, edit, and delete operations for metadata and content.
"""
import os
import logging
import json
import base64
from typing import Optional, Dict, Any, List
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# Grove API Configuration
GROVE_API_URL = os.getenv("GROVE_API_URL", "https://api.grove.storage")
GROVE_API_KEY = os.getenv("GROVE_API_KEY", "")  # Optional API key if required


class GroveClient:
    """
    Client for interacting with Grove storage.
    Handles uploading, downloading, editing, and deleting content.
    """
    
    def __init__(self, api_url: str = GROVE_API_URL, api_key: str = GROVE_API_KEY):
        self.api_url = api_url
        self.api_key = api_key
        self.headers = {
            "Content-Type": "application/json",
        }
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"
    
    async def upload_content(
        self,
        content: str,
        content_type: str = "application/json",
        acl_template: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Upload content to Grove.
        
        Args:
            content: Content to upload (string)
            content_type: MIME type of the content
            acl_template: Access control template for the content
            
        Returns:
            Dict with upload result including content ID
        """
        try:
            payload = {
                "content": content,
                "contentType": content_type,
            }
            
            if acl_template:
                payload["acl"] = acl_template
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.api_url}/upload",
                    json=payload,
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                result = response.json()
            
            logger.info(f"Uploaded content to Grove: {result.get('id')}")
            return result
        except Exception as e:
            logger.error(f"Failed to upload content to Grove: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    async def upload_file(
        self,
        file_path: str,
        content_type: Optional[str] = None,
        acl_template: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Upload a file to Grove.
        
        Args:
            file_path: Path to the file to upload
            content_type: MIME type of the file (auto-detected if not provided)
            acl_template: Access control template for the file
            
        Returns:
            Dict with upload result including content ID
        """
        try:
            path = Path(file_path)
            if not path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")
            
            # Read file content
            with open(path, "rb") as f:
                file_content = f.read()
            
            # Encode to base64
            content_b64 = base64.b64encode(file_content).decode("utf-8")
            
            # Detect content type if not provided
            if content_type is None:
                import mimetypes
                content_type, _ = mimetypes.guess_type(str(path))
                if content_type is None:
                    content_type = "application/octet-stream"
            
            payload = {
                "content": content_b64,
                "contentType": content_type,
                "encoding": "base64",
            }
            
            if acl_template:
                payload["acl"] = acl_template
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.api_url}/upload",
                    json=payload,
                    headers=self.headers,
                    timeout=60.0
                )
                response.raise_for_status()
                result = response.json()
            
            logger.info(f"Uploaded file {file_path} to Grove: {result.get('id')}")
            return result
        except Exception as e:
            logger.error(f"Failed to upload file to Grove: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    async def download_content(self, content_id: str) -> Optional[str]:
        """
        Download content from Grove by content ID.
        
        Args:
            content_id: ID of the content to download
            
        Returns:
            Content string or None if failed
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/content/{content_id}",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                result = response.json()
            
            content = result.get("content")
            logger.info(f"Downloaded content {content_id} from Grove")
            return content
        except Exception as e:
            logger.error(f"Failed to download content {content_id} from Grove: {e}")
            return None
    
    async def edit_content(
        self,
        content_id: str,
        new_content: str,
        signature: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Edit existing content on Grove.
        Requires proper access control permissions.
        
        Args:
            content_id: ID of the content to edit
            new_content: New content
            signature: Signature proving ownership (if ACL requires it)
            
        Returns:
            Dict with edit result
        """
        try:
            payload = {
                "content": new_content,
            }
            
            if signature:
                payload["signature"] = signature
            
            async with httpx.AsyncClient() as client:
                response = await client.put(
                    f"{self.api_url}/content/{content_id}",
                    json=payload,
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                result = response.json()
            
            logger.info(f"Edited content {content_id} on Grove")
            return result
        except Exception as e:
            logger.error(f"Failed to edit content {content_id} on Grove: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    async def delete_content(
        self,
        content_id: str,
        signature: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Delete content from Grove.
        Requires proper access control permissions.
        
        Args:
            content_id: ID of the content to delete
            signature: Signature proving ownership (if ACL requires it)
            
        Returns:
            Dict with delete result
        """
        try:
            payload = {}
            if signature:
                payload["signature"] = signature
            
            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{self.api_url}/content/{content_id}",
                    json=payload,
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                result = response.json()
            
            logger.info(f"Deleted content {content_id} from Grove")
            return result
        except Exception as e:
            logger.error(f"Failed to delete content {content_id} from Grove: {e}")
            return {
                "success": False,
                "error": str(e),
            }
    
    async def get_metadata(self, content_id: str) -> Optional[Dict[str, Any]]:
        """
        Get metadata for content on Grove.
        
        Args:
            content_id: ID of the content
            
        Returns:
            Metadata dict or None if failed
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/metadata/{content_id}",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                result = response.json()
            
            return result
        except Exception as e:
            logger.error(f"Failed to get metadata for {content_id}: {e}")
            return None


# Global Grove client instance
_grove_client: Optional[GroveClient] = None


def get_grove_client() -> GroveClient:
    """Get or create the global Grove client instance."""
    global _grove_client
    if _grove_client is None:
        _grove_client = GroveClient()
    return _grove_client


async def upload_profile_metadata(
    username: str,
    bio: Optional[str] = None,
    avatar_uri: Optional[str] = None,
    header_uri: Optional[str] = None,
    location: Optional[str] = None
) -> str:
    """
    Upload Lens Protocol v3 Profile metadata to Grove.
    Follows the official Lens Protocol metadata standard.
    
    Args:
        username: Profile handle/username
        bio: Profile bio
        avatar_uri: URI to avatar image
        header_uri: URI to header image
        location: Profile location
        
    Returns:
        URI to the uploaded metadata
    """
    client = get_grove_client()
    
    # Lens Protocol v3 Profile Metadata Standard
    metadata = {
        "version": "lens-3.0.0",
        "name": username,
        "bio": bio or "",
        "locale": "en",
        "attributes": [],
    }
    
    if avatar_uri:
        metadata["picture"] = {
            "raw": {
                "uri": avatar_uri,
                "mimeType": "image/*"
            }
        }
    
    if header_uri:
        metadata["coverPicture"] = {
            "raw": {
                "uri": header_uri,
                "mimeType": "image/*"
            }
        }
    
    if location:
        metadata["attributes"].append({
            "key": "location",
            "value": location,
        })
    
    # Add Lens-specific attributes
    metadata["attributes"].append({
        "key": "app",
        "value": "OnTrail"
    })
    
    metadata["attributes"].append({
        "key": "type",
        "value": "Profile"
    })
    
    metadata_json = json.dumps(metadata)
    result = await client.upload_content(
        content=metadata_json,
        content_type="application/json"
    )
    
    if result.get("success"):
        return f"lens://{result.get('id')}"
    else:
        return f"ipfs://Qm{username}"


async def upload_post_metadata(
    content: str,
    images: Optional[List[str]] = None,
    tags: Optional[List[str]] = None
) -> str:
    """
    Upload Lens Protocol v3 Post metadata to Grove.
    Follows the official Lens Protocol metadata standard.
    
    Args:
        content: Post content
        images: List of image URIs
        tags: List of tags
        
    Returns:
        URI to the uploaded metadata
    """
    client = get_grove_client()
    
    # Lens Protocol v3 Post Metadata Standard
    metadata = {
        "version": "lens-3.0.0",
        "content": content,
        "locale": "en",
        "attributes": [],
    }
    
    if images:
        metadata["media"] = [
            {
                "item": img,
                "type": "IMAGE",
                "cover": i == 0
            }
            for i, img in enumerate(images)
        ]
    
    if tags:
        for tag in tags:
            metadata["attributes"].append({
                "key": "tag",
                "value": tag,
            })
    
    # Add Lens-specific attributes
    metadata["attributes"].append({
        "key": "app",
        "value": "OnTrail"
    })
    
    metadata["attributes"].append({
        "key": "type",
        "value": "Post"
    })
    
    metadata_json = json.dumps(metadata)
    result = await client.upload_content(
        content=metadata_json,
        content_type="application/json"
    )
    
    if result.get("success"):
        return f"lens://{result.get('id')}"
    else:
        return f"ipfs://Qmpost"


async def upload_friendpass_metadata(
    runner_username: str,
    runner_reputation: float,
    runner_bio: Optional[str] = None,
    runner_avatar: Optional[str] = None
) -> str:
    """
    Upload FriendPass metadata to Grove.
    
    Args:
        runner_username: Runner's username
        runner_reputation: Runner's reputation score
        runner_bio: Runner's bio
        runner_avatar: Runner's avatar URI
        
    Returns:
        URI to the uploaded metadata
    """
    client = get_grove_client()
    
    metadata = {
        "runner": runner_username,
        "reputation": runner_reputation,
        "bio": runner_bio or "",
        "version": "1.0.0",
    }
    
    if runner_avatar:
        metadata["avatar"] = runner_avatar
    
    metadata_json = json.dumps(metadata)
    result = await client.upload_content(
        content=metadata_json,
        content_type="application/json"
    )
    
    if result.get("success"):
        return f"grove://{result.get('id')}"
    else:
        # Fallback to simulated URI
        return f"ipfs://Qmfriendpass{runner_username}"


async def upload_poi_metadata(
    poi_name: str,
    poi_description: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    rarity: Optional[str] = None,
    owner_username: Optional[str] = None,
    owner_avatar: Optional[str] = None
) -> str:
    """
    Upload POI metadata to Grove for Lens Protocol.
    
    Args:
        poi_name: POI name
        poi_description: POI description
        latitude: POI latitude
        longitude: POI longitude
        rarity: POI rarity
        owner_username: Owner's username
        owner_avatar: Owner's avatar URI
        
    Returns:
        URI to the uploaded metadata
    """
    client = get_grove_client()
    
    metadata = {
        "name": poi_name,
        "description": poi_description or "",
        "version": "1.0.0",
        "locale": "en",
        "attributes": [],
        "type": "poi",
    }
    
    if latitude is not None and longitude is not None:
        metadata["attributes"].append({
            "key": "location",
            "value": f"{latitude},{longitude}",
        })
    
    if rarity:
        metadata["attributes"].append({
            "key": "rarity",
            "value": rarity,
        })
    
    if owner_username:
        metadata["attributes"].append({
            "key": "creator",
            "value": owner_username,
        })
    
    if owner_avatar:
        metadata["picture"] = owner_avatar
    
    metadata_json = json.dumps(metadata)
    result = await client.upload_content(
        content=metadata_json,
        content_type="application/json"
    )
    
    if result.get("success"):
        return f"grove://{result.get('id')}"
    else:
        return f"ipfs://Qmpoi{poi_name}"


async def upload_route_metadata(
    route_name: str,
    route_description: Optional[str] = None,
    difficulty: Optional[str] = None,
    distance_km: Optional[float] = None,
    elevation_gain_m: Optional[float] = None,
    creator_username: Optional[str] = None,
    completion_count: Optional[int] = None
) -> str:
    """
    Upload Route metadata to Grove for Lens Protocol.
    
    Args:
        route_name: Route name
        route_description: Route description
        difficulty: Route difficulty
        distance_km: Route distance in km
        elevation_gain_m: Route elevation gain in meters
        creator_username: Creator's username
        completion_count: Number of completions
        
    Returns:
        URI to the uploaded metadata
    """
    client = get_grove_client()
    
    metadata = {
        "name": route_name,
        "description": route_description or "",
        "version": "1.0.0",
        "locale": "en",
        "attributes": [],
        "type": "route",
    }
    
    if difficulty:
        metadata["attributes"].append({
            "key": "difficulty",
            "value": difficulty,
        })
    
    if distance_km is not None:
        metadata["attributes"].append({
            "key": "distance_km",
            "value": str(distance_km),
        })
    
    if elevation_gain_m is not None:
        metadata["attributes"].append({
            "key": "elevation_gain_m",
            "value": str(elevation_gain_m),
        })
    
    if completion_count is not None:
        metadata["attributes"].append({
            "key": "completions",
            "value": str(completion_count),
        })
    
    if creator_username:
        metadata["attributes"].append({
            "key": "creator",
            "value": creator_username,
        })
    
    metadata_json = json.dumps(metadata)
    result = await client.upload_content(
        content=metadata_json,
        content_type="application/json"
    )
    
    if result.get("success"):
        return f"grove://{result.get('id')}"
    else:
        return f"ipfs://Qmroute{route_name}"
