// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract RouteNFT is ERC721, ERC721URIStorage, Ownable, Pausable {
    uint256 private _nextTokenId;

    event RouteMinted(uint256 indexed tokenId, address indexed owner, string difficulty);

    constructor() ERC721("OnTrail Route", "OTROUTE") Ownable(msg.sender) {}

    function mint(address to, string memory uri, string memory difficulty)
        external onlyOwner whenNotPaused returns (uint256)
    {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        emit RouteMinted(tokenId, to, difficulty);
        return tokenId;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
