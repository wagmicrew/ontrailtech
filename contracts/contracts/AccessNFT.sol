// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AccessNFT
 * @notice Soulbound-style ERC-721 used to grant platform access tiers.
 *         Deployed on Base (low fees).
 *
 * Access tiers stored in the token metadata URI:
 *   - "runner"         — verified runner
 *   - "premium"        — premium subscription
 *   - "ancient_holder" — ancient NFT holder
 *   - "trail_creator"  — authorized trail creator
 *   - "nft_holder"     — generic NFT holder tier
 *
 * Non-transferable by default (soulbound mode). Owner can toggle.
 */
contract AccessNFT is ERC721, ERC721URIStorage, Ownable, Pausable {
    uint256 private _nextTokenId;

    bool public soulbound = true;

    /// tier → (wallet → tokenId), 0 = none
    mapping(string => mapping(address => uint256)) public tierToken;
    /// tokenId → tier
    mapping(uint256 => string) public tokenTier;

    event AccessMinted(uint256 indexed tokenId, address indexed to, string tier);
    event AccessRevoked(uint256 indexed tokenId, address indexed from, string tier);

    constructor() ERC721("OnTrail Access", "OTACCESS") Ownable(msg.sender) {}

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setSoulbound(bool _soulbound) external onlyOwner { soulbound = _soulbound; }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /**
     * @notice Mint an access NFT. One per (tier, wallet).
     */
    function mint(address to, string calldata tier, string calldata uri)
        external onlyOwner whenNotPaused returns (uint256)
    {
        require(tierToken[tier][to] == 0, "Already has this tier");
        uint256 tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        tierToken[tier][to] = tokenId;
        tokenTier[tokenId] = tier;
        emit AccessMinted(tokenId, to, tier);
        return tokenId;
    }

    /**
     * @notice Revoke an access NFT (burn).
     */
    function revoke(address from, string calldata tier) external onlyOwner {
        uint256 tokenId = tierToken[tier][from];
        require(tokenId != 0, "No access token for this tier");
        delete tierToken[tier][from];
        delete tokenTier[tokenId];
        _burn(tokenId);
        emit AccessRevoked(tokenId, from, tier);
    }

    /**
     * @notice Check if a wallet holds a specific tier.
     */
    function hasAccess(address wallet, string calldata tier) external view returns (bool) {
        return tierToken[tier][wallet] != 0;
    }

    // ─── Soulbound enforcement ────────────────────────────────────────────────

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (soulbound && from != address(0) && to != address(0)) {
            revert("AccessNFT: soulbound — non-transferable");
        }
        return super._update(to, tokenId, auth);
    }

    // ─── Overrides ────────────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage) returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721URIStorage) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
