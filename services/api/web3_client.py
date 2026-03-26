"""Web3 client for interacting with OnTrail smart contracts."""
import json
import logging
from typing import Optional
from web3 import Web3
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Connect to RPC
w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url)) if settings.web3_rpc_url else None


def is_connected() -> bool:
    return w3 is not None and w3.is_connected()


class ContractClient:
    """Generic contract interaction client."""

    def __init__(self, address: str, abi: list):
        self.address = address
        self.abi = abi
        self.contract = w3.eth.contract(address=address, abi=abi) if w3 and address else None

    async def call(self, method: str, *args):
        if not self.contract:
            logger.warning(f"Contract not configured, skipping {method}")
            return None
        try:
            fn = getattr(self.contract.functions, method)
            return fn(*args).call()
        except Exception as e:
            logger.error(f"Contract call {method} failed: {e}")
            raise


# Minimal ABIs for our contracts
POI_NFT_ABI = [
    {"inputs": [{"name": "to", "type": "address"}, {"name": "uri", "type": "string"},
                {"name": "rarity", "type": "string"}],
     "name": "mint", "outputs": [{"name": "", "type": "uint256"}],
     "stateMutability": "nonpayable", "type": "function"},
]

ROUTE_NFT_ABI = [
    {"inputs": [{"name": "to", "type": "address"}, {"name": "uri", "type": "string"},
                {"name": "difficulty", "type": "string"}],
     "name": "mint", "outputs": [{"name": "", "type": "uint256"}],
     "stateMutability": "nonpayable", "type": "function"},
]


BONDING_CURVE_ABI = [
    {"inputs": [{"name": "runner", "type": "address"}, {"name": "amount", "type": "uint256"}],
     "name": "calculatePrice", "outputs": [{"name": "", "type": "uint256"}],
     "stateMutability": "view", "type": "function"},
    {"inputs": [{"name": "runner", "type": "address"}, {"name": "amount", "type": "uint256"}],
     "name": "buyShares", "outputs": [],
     "stateMutability": "payable", "type": "function"},
]

FRIEND_SHARES_ABI = [
    {"inputs": [{"name": "runner", "type": "address"}],
     "name": "getPrice", "outputs": [{"name": "", "type": "uint256"}],
     "stateMutability": "view", "type": "function"},
    {"inputs": [{"name": "runner", "type": "address"}],
     "name": "totalShares", "outputs": [{"name": "", "type": "uint256"}],
     "stateMutability": "view", "type": "function"},
    {"inputs": [{"name": "runner", "type": "address"}, {"name": "holder", "type": "address"}],
     "name": "getShares", "outputs": [{"name": "", "type": "uint256"}],
     "stateMutability": "view", "type": "function"},
]


def get_poi_nft_client() -> Optional[ContractClient]:
    if settings.poi_nft_address:
        return ContractClient(settings.poi_nft_address, POI_NFT_ABI)
    return None


def get_route_nft_client() -> Optional[ContractClient]:
    if settings.route_nft_address:
        return ContractClient(settings.route_nft_address, ROUTE_NFT_ABI)
    return None


def get_bonding_curve_client() -> Optional[ContractClient]:
    if settings.bonding_curve_address:
        return ContractClient(settings.bonding_curve_address, BONDING_CURVE_ABI)
    return None


def get_friend_shares_client() -> Optional[ContractClient]:
    if settings.friend_shares_address:
        return ContractClient(settings.friend_shares_address, FRIEND_SHARES_ABI)
    return None


async def mint_poi_nft(to_address: str, metadata_uri: str, rarity: str) -> Optional[str]:
    """Mint POI NFT. Returns tx hash or None if contracts not configured."""
    client = get_poi_nft_client()
    if not client or not client.contract:
        logger.info("POI NFT contract not configured, skipping on-chain mint")
        return None
    try:
        tx_hash = client.contract.functions.mint(to_address, metadata_uri, rarity).transact()
        return tx_hash.hex()
    except Exception as e:
        logger.error(f"POI NFT mint failed: {e}")
        raise


async def mint_route_nft(to_address: str, metadata_uri: str, difficulty: str) -> Optional[str]:
    """Mint Route NFT. Returns tx hash or None if contracts not configured."""
    client = get_route_nft_client()
    if not client or not client.contract:
        logger.info("Route NFT contract not configured, skipping on-chain mint")
        return None
    try:
        tx_hash = client.contract.functions.mint(to_address, metadata_uri, difficulty).transact()
        return tx_hash.hex()
    except Exception as e:
        logger.error(f"Route NFT mint failed: {e}")
        raise
