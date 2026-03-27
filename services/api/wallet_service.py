"""Ethereum wallet generation and AES-256-GCM key encryption."""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from eth_account import Account

from config import get_settings


class WalletService:
    """Generate ETH wallets and encrypt/decrypt private keys with AES-256-GCM."""

    def __init__(self):
        self._settings = get_settings()

    def _get_aes_key(self) -> bytes:
        """Derive a 32-byte AES key from the configured encryption key."""
        raw = self._settings.wallet_encryption_key.encode("utf-8")
        # Pad or truncate to exactly 32 bytes
        return raw.ljust(32, b"\0")[:32]

    def generate_wallet(self) -> tuple[str, str]:
        """Generate an Ethereum keypair. Returns (address, private_key_hex)."""
        acct = Account.create()
        return acct.address, acct.key.hex()

    def encrypt_private_key(self, key_hex: str) -> str:
        """AES-256-GCM encrypt a hex private key. Returns base64(nonce + ciphertext)."""
        aes_key = self._get_aes_key()
        nonce = os.urandom(12)
        aesgcm = AESGCM(aes_key)
        ciphertext = aesgcm.encrypt(nonce, key_hex.encode("utf-8"), None)
        return base64.b64encode(nonce + ciphertext).decode("utf-8")

    def decrypt_private_key(self, encrypted: str) -> str:
        """AES-256-GCM decrypt. Returns hex private key."""
        aes_key = self._get_aes_key()
        raw = base64.b64decode(encrypted)
        nonce, ciphertext = raw[:12], raw[12:]
        aesgcm = AESGCM(aes_key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext.decode("utf-8")


wallet_service = WalletService()
