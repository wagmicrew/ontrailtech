// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NFTAccessControl
 * @notice Checks whether a user holds a qualifying NFT and emits access events.
 *         Deployed on Base (low fees). The OnTrail API server listens to
 *         AccessGranted / AccessRevoked events and updates user roles accordingly.
 *
 * Usage flow:
 *  1. Admin registers NFT contracts via registerRule().
 *  2. On user login / profile visit, the API calls checkAccess(wallet) off-chain
 *     via eth_call (no gas) to determine current role set.
 *  3. Users can also call claimAccess() on-chain to emit events the server indexes.
 */
contract NFTAccessControl is Ownable, Pausable {

    // ─── Types ────────────────────────────────────────────────────────────────

    enum TokenStandard { ERC721, ERC1155 }

    struct AccessRule {
        address nftContract;
        TokenStandard standard;
        uint256 tokenId;        // 0 = any token ID (ERC721) or required tokenId (ERC1155)
        uint256 minBalance;     // Minimum number of tokens required (1 for ERC721)
        string  roleName;       // e.g. "ancient_holder", "premium", "nft_holder"
        bool    active;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    AccessRule[] public rules;

    // Tracks last on-chain claim per wallet to avoid replay-style spam
    mapping(address => uint256) public lastClaim;

    uint256 public claimCooldown = 5 minutes;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AccessGranted(address indexed wallet, string roleName, address nftContract, uint256 tokenId);
    event AccessRevoked(address indexed wallet, string roleName, address nftContract);
    event RuleRegistered(uint256 indexed ruleId, address nftContract, string roleName);
    event RuleToggled(uint256 indexed ruleId, bool active);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── Admin ────────────────────────────────────────────────────────────────

    function registerRule(
        address nftContract,
        TokenStandard standard,
        uint256 tokenId,
        uint256 minBalance,
        string calldata roleName
    ) external onlyOwner {
        rules.push(AccessRule({
            nftContract: nftContract,
            standard: standard,
            tokenId: tokenId,
            minBalance: minBalance,
            roleName: roleName,
            active: true
        }));
        emit RuleRegistered(rules.length - 1, nftContract, roleName);
    }

    function toggleRule(uint256 ruleId, bool active) external onlyOwner {
        require(ruleId < rules.length, "Rule not found");
        rules[ruleId].active = active;
        emit RuleToggled(ruleId, active);
    }

    function setClaimCooldown(uint256 seconds_) external onlyOwner {
        claimCooldown = seconds_;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── Read (off-chain, no gas) ─────────────────────────────────────────────

    /**
     * @notice Returns the list of role names the wallet currently qualifies for.
     *         Intended for off-chain eth_call usage by the API server.
     */
    function checkAccess(address wallet) external view returns (string[] memory matchedRoles) {
        uint256 count;
        // First pass: count matches
        for (uint256 i = 0; i < rules.length; i++) {
            if (rules[i].active && _holdsNft(wallet, rules[i])) {
                count++;
            }
        }
        matchedRoles = new string[](count);
        uint256 idx;
        // Second pass: fill results
        for (uint256 i = 0; i < rules.length; i++) {
            if (rules[i].active && _holdsNft(wallet, rules[i])) {
                matchedRoles[idx++] = rules[i].roleName;
            }
        }
    }

    /**
     * @notice Returns total number of rules.
     */
    function rulesCount() external view returns (uint256) {
        return rules.length;
    }

    // ─── On-chain claim (emits events for indexing) ───────────────────────────

    /**
     * @notice User calls this to emit AccessGranted events for all qualifying rules.
     *         Subject to cooldown to prevent spam. Events are indexed by the API.
     */
    function claimAccess() external whenNotPaused {
        require(
            block.timestamp >= lastClaim[msg.sender] + claimCooldown,
            "Cooldown active"
        );
        lastClaim[msg.sender] = block.timestamp;

        for (uint256 i = 0; i < rules.length; i++) {
            AccessRule storage rule = rules[i];
            if (!rule.active) continue;
            if (_holdsNft(msg.sender, rule)) {
                emit AccessGranted(msg.sender, rule.roleName, rule.nftContract, rule.tokenId);
            } else {
                emit AccessRevoked(msg.sender, rule.roleName, rule.nftContract);
            }
        }
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _holdsNft(address wallet, AccessRule storage rule) internal view returns (bool) {
        if (rule.standard == TokenStandard.ERC721) {
            try IERC721(rule.nftContract).balanceOf(wallet) returns (uint256 bal) {
                return bal >= rule.minBalance;
            } catch {
                return false;
            }
        } else {
            // ERC1155 — check specific tokenId
            try IERC1155(rule.nftContract).balanceOf(wallet, rule.tokenId) returns (uint256 bal) {
                return bal >= rule.minBalance;
            } catch {
                return false;
            }
        }
    }
}
