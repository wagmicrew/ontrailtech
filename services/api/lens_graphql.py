"""
Lens Protocol GraphQL Client
Official GraphQL client for Lens Protocol v3 social operations.
"""
import os
import logging
from typing import Dict, Any, List, Optional
import httpx

logger = logging.getLogger(__name__)

# GraphQL API URLs
LENS_GRAPHQL_URL = os.getenv("LENS_GRAPHQL_URL", "https://api.testnet.lens.xyz/graphql")


class LensGraphQLClient:
    """
    GraphQL client for Lens Protocol v3.
    Handles social operations via the official GraphQL API.
    """
    
    def __init__(self, api_url: str = LENS_GRAPHQL_URL):
        self.api_url = api_url
        self.http_client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """Close the HTTP client."""
        await self.http_client.aclose()
    
    async def _execute_query(
        self,
        query: str,
        variables: Dict[str, Any] = None,
        headers: Dict[str, str] = None
    ) -> Dict[str, Any]:
        """
        Execute a GraphQL query.
        
        Args:
            query: GraphQL query string
            variables: Query variables
            headers: Additional headers (e.g., authorization)
            
        Returns:
            Query response data
        """
        default_headers = {
            "Content-Type": "application/json",
        }
        if headers:
            default_headers.update(headers)
        
        payload = {
            "query": query,
            "variables": variables or {},
        }
        
        try:
            response = await self.http_client.post(
                self.api_url,
                json=payload,
                headers=default_headers
            )
            response.raise_for_status()
            data = response.json()
            
            if "errors" in data:
                logger.error(f"GraphQL errors: {data['errors']}")
                return {"errors": data["errors"], "data": data.get("data")}
            
            return {"data": data.get("data")}
        except Exception as e:
            logger.error(f"GraphQL query failed: {e}")
            return {"errors": [str(e)], "data": None}
    
    # ── Profile Queries ──
    
    async def get_profile(
        self,
        profile_id: Optional[str] = None,
        handle: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get a Lens profile by ID or handle.
        
        Args:
            profile_id: Profile ID
            handle: Profile handle (e.g., "lens/@username")
            
        Returns:
            Profile data
        """
        query = """
        query Profile($request: SingleProfileQueryRequest!) {
            profile(request: $request) {
                id
                handle {
                    fullHandle
                    localName
                    namespace
                }
                metadata {
                    displayName
                    bio
                    picture
                    coverPicture
                    attributes {
                        key
                        value
                    }
                }
                stats {
                    totalFollowers
                    totalFollowing
                    totalPosts
                }
                owner {
                    address
                }
            }
        }
        """
        
        variables = {
            "request": {}
        }
        
        if profile_id:
            variables["request"]["forProfileId"] = profile_id
        elif handle:
            variables["request"]["forHandle"] = handle
        else:
            return {"errors": ["Either profile_id or handle is required"]}
        
        return await self._execute_query(query, variables)
    
    async def create_profile(
        self,
        handle: str,
        metadata_uri: str,
        signer_address: str
    ) -> Dict[str, Any]:
        """
        Create a new Lens profile (requires signed request).
        
        Args:
            handle: Desired handle (e.g., "username")
            metadata_uri: URI to profile metadata
            signer_address: Signer wallet address
            
        Returns:
            Created profile data
        """
        mutation = """
        mutation CreateProfile($request: CreateProfileRequest!) {
            createProfile(request: $request) {
                ... on RelayerResult {
                    txId
                    txHash
                }
                ... on ProfileCreationReason {
                    profile {
                        id
                        handle {
                            fullHandle
                        }
                    }
                }
            }
        }
        """
        
        variables = {
            "request": {
                "handle": handle,
                "uri": metadata_uri,
                "to": signer_address,
            }
        }
        
        return await self._execute_query(mutation, variables)
    
    # ── Post/Publication Queries ──
    
    async def create_post(
        self,
        profile_id: str,
        content: str,
        metadata_uri: str,
        reference_module: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a post/publication.
        
        Args:
            profile_id: Profile ID
            content: Post content
            metadata_uri: URI to post metadata
            reference_module: Optional reference module
            
        Returns:
            Created post data
        """
        mutation = """
        mutation CreatePost($request: CreatePostRequest!) {
            createPost(request: $request) {
                ... on RelayerResult {
                    txId
                    txHash
                }
                ... on CreatePostResult {
                    id
                    contentURI
                }
            }
        }
        """
        
        variables = {
            "request": {
                "profileId": profile_id,
                "contentURI": metadata_uri,
            }
        }
        
        if reference_module:
            variables["request"]["referenceModule"] = reference_module
        
        return await self._execute_query(mutation, variables)
    
    async def get_publication(
        self,
        publication_id: str
    ) -> Dict[str, Any]:
        """
        Get a publication by ID.
        
        Args:
            publication_id: Publication ID
            
        Returns:
            Publication data
        """
        query = """
        query Publication($request: PublicationQueryRequest!) {
            publication(request: $request) {
                id
                profile {
                    id
                    handle {
                        fullHandle
                    }
                }
                metadata {
                    content
                    attributes {
                        key
                        value
                    }
                }
                stats {
                    totalAmountOfMirrors
                    totalAmountOfCollects
                    totalAmountOfComments
                    totalUpvotes
                    totalDownvotes
                }
            }
        }
        """
        
        variables = {
            "request": {
                "forId": publication_id
            }
        }
        
        return await self._execute_query(query, variables)
    
    async def get_feed(
        self,
        profile_id: str,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Get feed for a profile.
        
        Args:
            profile_id: Profile ID
            limit: Number of items to return
            
        Returns:
            Feed data
        """
        query = """
        query Feed($request: FeedRequest!) {
            feed(request: $request) {
                items {
                    publication {
                        id
                        profile {
                            id
                            handle {
                                fullHandle
                            }
                        }
                        metadata {
                            content
                        }
                    }
                }
                pageInfo {
                    next
                }
            }
        }
        """
        
        variables = {
            "request": {
                "forProfileId": profile_id,
                "limit": limit
            }
        }
        
        return await self._execute_query(query, variables)
    
    # ── Follow Queries ──
    
    async def create_follow(
        self,
        follower_id: str,
        followee_id: str
    ) -> Dict[str, Any]:
        """
        Follow a profile.
        
        Args:
            follower_id: Follower profile ID
            followee_id: Profile to follow ID
            
        Returns:
            Follow result
        """
        mutation = """
        mutation CreateFollow($request: CreateFollowRequest!) {
            createFollow(request: $request) {
                ... on RelayerResult {
                    txId
                    txHash
                }
            }
        }
        """
        
        variables = {
            "request": {
                "follow": [
                    {
                        "profileId": followee_id
                    }
                ],
                "followerId": follower_id
            }
        }
        
        return await self._execute_query(mutation, variables)
    
    async def get_followers(
        self,
        profile_id: str,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Get followers of a profile.
        
        Args:
            profile_id: Profile ID
            limit: Number of followers to return
            
        Returns:
            Followers data
        """
        query = """
        query Followers($request: FollowersRequest!) {
            followers(request: $request) {
                items {
                    wallet {
                        address
                    }
                    follower {
                        id
                        handle {
                            fullHandle
                        }
                    }
                }
                pageInfo {
                    next
                }
            }
        }
        """
        
        variables = {
            "request": {
                "forProfileId": profile_id,
                "limit": limit
            }
        }
        
        return await self._execute_query(query, variables)
    
    async def get_following(
        self,
        profile_id: str,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Get profiles that a profile is following.
        
        Args:
            profile_id: Profile ID
            limit: Number of profiles to return
            
        Returns:
            Following data
        """
        query = """
        query Following($request: FollowingRequest!) {
            following(request: $request) {
                items {
                    wallet {
                        address
                    }
                    profile {
                        id
                        handle {
                            fullHandle
                        }
                    }
                }
                pageInfo {
                    next
                }
            }
        }
        """
        
        variables = {
            "request": {
                "forProfileId": profile_id,
                "limit": limit
            }
        }
        
        return await self._execute_query(query, variables)
    
    # ── Comment Queries ──
    
    async def create_comment(
        self,
        profile_id: str,
        publication_id: str,
        content: str,
        metadata_uri: str
    ) -> Dict[str, Any]:
        """
        Create a comment on a publication.
        
        Args:
            profile_id: Commenter profile ID
            publication_id: Publication to comment on
            content: Comment content
            metadata_uri: URI to comment metadata
            
        Returns:
            Created comment data
        """
        mutation = """
        mutation CreateComment($request: CreateCommentRequest!) {
            createComment(request: $request) {
                ... on RelayerResult {
                    txId
                    txHash
                }
                ... on CreateCommentResult {
                    id
                }
            }
        }
        """
        
        variables = {
            "request": {
                "profileId": profile_id,
                "publicationId": publication_id,
                "contentURI": metadata_uri,
            }
        }
        
        return await self._execute_query(mutation, variables)
    
    # ── Mirror Queries ──
    
    async def create_mirror(
        self,
        profile_id: str,
        publication_id: str
    ) -> Dict[str, Any]:
        """
        Mirror a publication.
        
        Args:
            profile_id: Mirroring profile ID
            publication_id: Publication to mirror
            
        Returns:
            Mirror result
        """
        mutation = """
        mutation CreateMirror($request: CreateMirrorRequest!) {
            createMirror(request: $request) {
                ... on RelayerResult {
                    txId
                    txHash
                }
                ... on CreateMirrorResult {
                    id
                }
            }
        }
        """
        
        variables = {
            "request": {
                "profileId": profile_id,
                "publicationId": publication_id
            }
        }
        
        return await self._execute_query(mutation, variables)


# Global GraphQL client instance
_lens_graphql_client: Optional[LensGraphQLClient] = None


def get_lens_graphql_client() -> LensGraphQLClient:
    """Get or create the global Lens GraphQL client instance."""
    global _lens_graphql_client
    if _lens_graphql_client is None:
        _lens_graphql_client = LensGraphQLClient()
    return _lens_graphql_client
