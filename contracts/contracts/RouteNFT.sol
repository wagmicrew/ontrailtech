// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title RouteNFT
 * @notice ERC-721 that stores GPS waypoints on-chain (packed int32 pairs).
 *
 * GPS layout: each waypoint is (lat * 1e6, lng * 1e6) as int32 — 8 bytes/point.
 * 100 waypoints ≈ 800 bytes calldata, ~20k gas on Base.
 *
 * routeGps(tokenId) returns int32[] alternating [lat, lng, lat, lng, …].
 * Divide values by 1e6 to get decimal degrees.
 */
contract RouteNFT is ERC721, ERC721URIStorage, Ownable, Pausable {
    uint256 private _nextTokenId;

    struct RouteData {
        string   difficulty;
        uint32   distanceMeters;
        uint32   elevationGainMeters;
        int32[]  gpsWaypoints; // [lat0*1e6, lng0*1e6, lat1*1e6, lng1*1e6, …]
    }

    mapping(uint256 => RouteData) private _routeData;

    event RouteMinted(uint256 indexed tokenId, address indexed owner, string difficulty, uint256 waypointCount);
    event RouteGpsUpdated(uint256 indexed tokenId, uint256 waypointCount);

    constructor() ERC721("OnTrail Route", "OTROUTE") Ownable(msg.sender) {}

    // ─── Mint ─────────────────────────────────────────────────────────────────

    /**
     * @param gpsWaypoints  Packed: [lat0*1e6, lng0*1e6, lat1*1e6, lng1*1e6, …]
     */
    function mint(
        address to,
        string calldata uri,
        string calldata difficulty,
        uint32 distanceM,
        uint32 elevationGain,
        int32[] calldata gpsWaypoints
    ) external onlyOwner whenNotPaused returns (uint256) {
        require(gpsWaypoints.length % 2 == 0, "GPS must be even lat/lng pairs");
        uint256 tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        _routeData[tokenId] = RouteData({
            difficulty: difficulty,
            distanceMeters: distanceM,
            elevationGainMeters: elevationGain,
            gpsWaypoints: gpsWaypoints
        });
        emit RouteMinted(tokenId, to, difficulty, gpsWaypoints.length / 2);
        return tokenId;
    }

    /// @notice Update GPS for an existing token (owner correction / enrichment)
    function updateGps(uint256 tokenId, int32[] calldata gpsWaypoints) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(gpsWaypoints.length % 2 == 0, "GPS must be even lat/lng pairs");
        _routeData[tokenId].gpsWaypoints = gpsWaypoints;
        emit RouteGpsUpdated(tokenId, gpsWaypoints.length / 2);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /// @notice All GPS waypoints. Divide by 1e6 for decimal degrees.
    function routeGps(uint256 tokenId) external view returns (int32[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _routeData[tokenId].gpsWaypoints;
    }

    /// @notice Route metadata without GPS array (cheaper read).
    function routeMeta(uint256 tokenId) external view returns (
        string memory difficulty, uint32 distanceMeters, uint32 elevationGainMeters, uint256 waypointCount
    ) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        RouteData storage rd = _routeData[tokenId];
        return (rd.difficulty, rd.distanceMeters, rd.elevationGainMeters, rd.gpsWaypoints.length / 2);
    }

    /// @notice Get a single waypoint by index.
    function waypointAt(uint256 tokenId, uint256 index) external view returns (int32 lat, int32 lng) {
        int32[] storage wp = _routeData[tokenId].gpsWaypoints;
        require(index * 2 + 1 < wp.length, "Index out of bounds");
        return (wp[index * 2], wp[index * 2 + 1]);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
