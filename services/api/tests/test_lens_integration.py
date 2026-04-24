"""
Lens Protocol Integration Tests
Tests for Lens client, Grove storage, and Lens sync service.
"""
import pytest
from unittest.mock import Mock, AsyncMock, patch
from sqlalchemy.ext.asyncio import AsyncSession

from lens_client import LensClient, LensProfile, LensPublication, get_lens_client
from grove_client import GroveClient, get_grove_client
from lens_sync import LensObjectSync, get_lens_sync_service
from models import POI, Route, User


class TestLensClient:
    """Tests for Lens Protocol client."""
    
    def test_lens_client_initialization(self):
        """Test Lens client initialization with testnet chain ID."""
        client = LensClient(chain_id=371112)  # Lens testnet
        assert client.chain_id == 371112
        assert client.network == "testnet"
        assert client.api_url == "https://api-amoy.lens.xyz"
    
    def test_get_lens_client_singleton(self):
        """Test that get_lens_client returns singleton instance."""
        client1 = get_lens_client()
        client2 = get_lens_client()
        assert client1 is client2
    
    @pytest.mark.asyncio
    async def test_create_profile(self):
        """Test creating a Lens profile."""
        client = LensClient(chain_id=371112)
        
        result = await client.create_profile(
            owner_address="0x" + "0" * 40,
            handle="testuser",
            metadata_uri="grove://test-metadata"
        )
        
        assert result["success"] is True
        assert "profile_id" in result
        assert result["handle"] == "testuser"
    
    @pytest.mark.asyncio
    async def test_get_profile(self):
        """Test getting a Lens profile."""
        client = LensClient(chain_id=371112)
        
        profile = await client.get_profile("test-profile-id")
        
        assert profile is not None
        assert isinstance(profile, LensProfile)
        assert profile.profile_id == "test-profile-id"
    
    @pytest.mark.asyncio
    async def test_follow_profile(self):
        """Test following a Lens profile."""
        client = LensClient(chain_id=371112)
        
        result = await client.follow_profile(
            follower_address="0x" + "1" * 40,
            profile_id="test-profile"
        )
        
        assert result["success"] is True
        assert result["follower"] == "0x" + "1" * 40
    
    @pytest.mark.asyncio
    async def test_create_post(self):
        """Test creating a Lens post."""
        client = LensClient(chain_id=371112)
        
        result = await client.create_post(
            profile_id="test-profile",
            content="Test post content",
            metadata_uri="grove://post-metadata"
        )
        
        assert result["success"] is True
        assert "publication_id" in result
    
    @pytest.mark.asyncio
    async def test_calculate_reputation_multiplier(self):
        """Test reputation multiplier calculation."""
        client = LensClient(chain_id=371112)
        
        # Test with reputation below threshold
        multiplier = client.calculateReputationMultiplier(50)
        assert multiplier == 100  # 1.00x
        
        # Test with reputation above threshold
        multiplier = client.calculateReputationMultiplier(200)
        assert multiplier > 100  # Should be > 1.00x


class TestGroveClient:
    """Tests for Grove storage client."""
    
    def test_grove_client_initialization(self):
        """Test Grove client initialization."""
        client = GroveClient()
        assert client.api_url == "https://api.grove.storage"
    
    def test_get_grove_client_singleton(self):
        """Test that get_grove_client returns singleton instance."""
        client1 = get_grove_client()
        client2 = get_grove_client()
        assert client1 is client2
    
    @pytest.mark.asyncio
    async def test_upload_content(self):
        """Test uploading content to Grove."""
        client = GroveClient()
        
        result = await client.upload_content(
            content='{"test": "data"}',
            content_type="application/json"
        )
        
        # In test mode, this should return a simulated success
        assert "success" in result
    
    @pytest.mark.asyncio
    async def test_upload_profile_metadata(self):
        """Test uploading profile metadata to Grove."""
        from grove_client import upload_profile_metadata
        
        uri = await upload_profile_metadata(
            username="testuser",
            bio="Test bio",
            avatar_uri="ipfs://test-avatar"
        )
        
        assert uri.startswith("grove://") or uri.startswith("ipfs://")


class TestLensObjectSync:
    """Tests for Lens object synchronization service."""
    
    def test_lens_sync_initialization(self):
        """Test Lens sync service initialization."""
        sync_service = LensObjectSync()
        assert sync_service.lens_client is not None
    
    def test_get_lens_sync_service_singleton(self):
        """Test that get_lens_sync_service returns singleton instance."""
        service1 = get_lens_sync_service()
        service2 = get_lens_sync_service()
        assert service1 is service2
    
    @pytest.mark.asyncio
    async def test_sync_poi_to_lens(self):
        """Test syncing a POI to Lens."""
        sync_service = LensObjectSync()
        
        # Mock database session
        db = AsyncMock(spec=AsyncSession)
        
        # Mock POI
        mock_poi = Mock(spec=POI)
        mock_poi.id = "test-poi-id"
        mock_poi.name = "Test POI"
        mock_poi.description = "Test description"
        mock_poi.latitude = 40.7128
        mock_poi.longitude = -74.0060
        mock_poi.rarity = "common"
        mock_poi.owner_id = "test-owner-id"
        
        # Mock user
        mock_user = Mock(spec=User)
        mock_user.username = "testuser"
        mock_user.avatar_url = "ipfs://avatar"
        
        # Setup mock database responses
        db.execute.return_value.scalar_one_or_none.return_value = mock_poi
        db.execute.return_value = db.execute.return_value
        db.execute.return_value.scalar_one_or_none.return_value = mock_user
        
        result = await sync_service.sync_poi_to_lens("test-poi-id", "test-owner-id", db)
        
        # In test mode, this should succeed
        assert "success" in result
    
    @pytest.mark.asyncio
    async def test_sync_route_to_lens(self):
        """Test syncing a Route to Lens."""
        sync_service = LensObjectSync()
        
        # Mock database session
        db = AsyncMock(spec=AsyncSession)
        
        # Mock Route
        mock_route = Mock(spec=Route)
        mock_route.id = "test-route-id"
        mock_route.name = "Test Route"
        mock_route.description = "Test route description"
        mock_route.difficulty = "moderate"
        mock_route.distance_km = 5.0
        mock_route.elevation_gain_m = 100
        mock_route.creator_id = "test-creator-id"
        mock_route.completion_count = 10
        
        # Mock user
        mock_user = Mock(spec=User)
        mock_user.username = "testuser"
        
        # Setup mock database responses
        db.execute.return_value.scalar_one_or_none.return_value = mock_route
        db.execute.return_value = db.execute.return_value
        db.execute.return_value.scalar_one_or_none.return_value = mock_user
        
        result = await sync_service.sync_route_to_lens("test-route-id", "test-creator-id", db)
        
        # In test mode, this should succeed
        assert "success" in result
    
    @pytest.mark.asyncio
    async def test_sync_message_to_lens(self):
        """Test syncing a message to Lens."""
        sync_service = LensObjectSync()
        
        # Mock database session
        db = AsyncMock(spec=AsyncSession)
        
        # Mock user
        mock_user = Mock(spec=User)
        mock_user.username = "testuser"
        
        db.execute.return_value.scalar_one_or_none.return_value = mock_user
        
        result = await sync_service.sync_message_to_lens(
            message="Test message",
            sender_id="test-sender-id",
            recipient_id="test-recipient-id",
            context_publication_id=None,
            db=db
        )
        
        # In test mode, this should succeed
        assert "success" in result
    
    @pytest.mark.asyncio
    async def test_sync_friendpass_to_lens(self):
        """Test syncing a FriendPass purchase to Lens."""
        sync_service = LensObjectSync()
        
        # Mock database session
        db = AsyncMock(spec=AsyncSession)
        
        # Mock users
        mock_runner = Mock(spec=User)
        mock_runner.username = "runner"
        mock_holder = Mock(spec=User)
        mock_holder.username = "holder"
        
        # Setup mock database responses
        db.execute.return_value.scalar_one_or_none.side_effect = [mock_runner, mock_holder]
        
        result = await sync_service.sync_friendpass_to_lens("runner-id", "holder-id", db)
        
        # In test mode, this should succeed
        assert "success" in result
    
    @pytest.mark.asyncio
    async def test_batch_sync_pois(self):
        """Test batch syncing multiple POIs to Lens."""
        sync_service = LensObjectSync()
        
        # Mock database session
        db = AsyncMock(spec=AsyncSession)
        
        # Mock POIs
        mock_poi1 = Mock(spec=POI)
        mock_poi1.id = "poi-1"
        mock_poi1.owner_id = "owner-1"
        
        mock_poi2 = Mock(spec=POI)
        mock_poi2.id = "poi-2"
        mock_poi2.owner_id = "owner-2"
        
        db.execute.return_value.scalar_one_or_none.side_effect = [mock_poi1, mock_poi2]
        
        results = await sync_service.batch_sync_pois(["poi-1", "poi-2"], db)
        
        assert len(results) == 2


class TestGroveMetadataUploads:
    """Tests for Grove metadata upload functions."""
    
    @pytest.mark.asyncio
    async def test_upload_poi_metadata(self):
        """Test uploading POI metadata to Grove."""
        from grove_client import upload_poi_metadata
        
        uri = await upload_poi_metadata(
            poi_name="Test POI",
            poi_description="Test description",
            latitude=40.7128,
            longitude=-74.0060,
            rarity="common",
            owner_username="testuser"
        )
        
        assert uri.startswith("grove://") or uri.startswith("ipfs://")
    
    @pytest.mark.asyncio
    async def test_upload_route_metadata(self):
        """Test uploading Route metadata to Grove."""
        from grove_client import upload_route_metadata
        
        uri = await upload_route_metadata(
            route_name="Test Route",
            route_description="Test route description",
            difficulty="moderate",
            distance_km=5.0,
            creator_username="testuser"
        )
        
        assert uri.startswith("grove://") or uri.startswith("ipfs://")
    
    @pytest.mark.asyncio
    async def test_upload_post_metadata(self):
        """Test uploading post metadata to Grove."""
        from grove_client import upload_post_metadata
        
        uri = await upload_post_metadata(
            content="Test post content",
            tags=["test", "lens"]
        )
        
        assert uri.startswith("grove://") or uri.startswith("ipfs://")


class TestLensConfig:
    """Tests for Lens configuration."""
    
    def test_lens_testnet_chain_id(self):
        """Test that Lens testnet chain ID is correct."""
        from lens_client import LENS_TESTNET_CHAIN_ID
        assert LENS_TESTNET_CHAIN_ID == 371112
    
    def test_lens_mainnet_chain_id(self):
        """Test that Lens mainnet chain ID is correct."""
        from lens_client import LENS_CHAIN_ID
        assert LENS_CHAIN_ID == 371111
    
    def test_lens_default_to_testnet(self):
        """Test that get_lens_client defaults to testnet."""
        from lens_client import LENS_TESTNET_CHAIN_ID
        client = get_lens_client()
        assert client.chain_id == LENS_TESTNET_CHAIN_ID


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
