// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title FriendShares
 * @notice ERC-1155 FriendPass system — limited-access social investment NFTs per runner.
 *
 * Pricing: Price(n) = basePrice + slope * n (linear)
 * Revenue: 70% TipVault, 20% Founders DAO, 10% Ancient Owner
 * Anti-whale: max passes per wallet enforced
 * Self-purchase: buyer != runner enforced
 */
contract FriendShares is ERC1155, Ownable, ReentrancyGuard, Pausable {

    // ── Revenue recipients ──
    address public tipVault;
    address public foundersDAO;
    address public ancientOwner;

    // ── Pricing parameters ──
    uint256 public basePrice = 0.001 ether;
    uint256 public slope = 0.0001 ether;

    // ── Supply limits ──
    uint256 public maxSupplyPerRunner = 100;
    uint256 public maxPerWallet = 5;

    // ── Revenue split (basis points, total = 10000) ──
    uint256 public constant TIP_VAULT_BPS = 7000;   // 70%
    uint256 public constant DAO_BPS = 2000;          // 20%
    uint256 public constant ANCIENT_BPS = 1000;      // 10%

    // ── State ──
    mapping(address => uint256) public runnerTokenId;
    mapping(uint256 => address) public tokenIdToRunner;
    mapping(uint256 => uint256) public totalSupply;
    uint256 public nextTokenId = 1;

    // ── Events ──
    event FriendPassBought(address indexed buyer, address indexed runner, uint256 tokenId, uint256 price, uint256 supply);
    event RunnerRegistered(address indexed runner, uint256 tokenId);

    constructor(
        address _tipVault,
        address _foundersDAO,
        address _ancientOwner
    ) ERC1155("") Ownable(msg.sender) {
        tipVault = _tipVault;
        foundersDAO = _foundersDAO;
        ancientOwner = _ancientOwner;
    }

    // ── Runner registration ──

    function registerRunner(address runner) external onlyOwner {
        require(runnerTokenId[runner] == 0, "Already registered");
        uint256 tokenId = nextTokenId++;
        runnerTokenId[runner] = tokenId;
        tokenIdToRunner[tokenId] = runner;
        emit RunnerRegistered(runner, tokenId);
    }

    // ── Pricing ──

    function getPrice(address runner) public view returns (uint256) {
        uint256 tokenId = runnerTokenId[runner];
        require(tokenId != 0, "Runner not registered");
        uint256 supply = totalSupply[tokenId];
        return basePrice + slope * supply;
    }

    function getNextPrice(address runner) external view returns (uint256) {
        uint256 tokenId = runnerTokenId[runner];
        require(tokenId != 0, "Runner not registered");
        uint256 supply = totalSupply[tokenId];
        return basePrice + slope * (supply + 1);
    }

    // ── Buy (mint) ──

    function buy(address runner) external payable nonReentrant whenNotPaused {
        uint256 tokenId = runnerTokenId[runner];
        require(tokenId != 0, "Runner not registered");

        // Self-purchase prevention
        require(msg.sender != runner, "Cannot buy own FriendPass");

        // Supply check
        uint256 supply = totalSupply[tokenId];
        require(supply < maxSupplyPerRunner, "Supply exhausted");

        // Anti-whale check
        require(balanceOf(msg.sender, tokenId) < maxPerWallet, "Max passes per wallet reached");

        // Price check
        uint256 price = basePrice + slope * supply;
        require(msg.value >= price, "Insufficient ETH");

        // Mint
        totalSupply[tokenId] = supply + 1;
        _mint(msg.sender, tokenId, 1, "");

        // Distribute revenue: 70% TipVault, 20% DAO, 10% Ancient Owner
        uint256 toVault = (price * TIP_VAULT_BPS) / 10000;
        uint256 toDAO = (price * DAO_BPS) / 10000;
        uint256 toAncient = price - toVault - toDAO; // remainder to avoid rounding loss

        (bool s1,) = payable(tipVault).call{value: toVault}("");
        require(s1, "TipVault transfer failed");
        (bool s2,) = payable(foundersDAO).call{value: toDAO}("");
        require(s2, "DAO transfer failed");
        (bool s3,) = payable(ancientOwner).call{value: toAncient}("");
        require(s3, "Ancient transfer failed");

        // Refund excess
        if (msg.value > price) {
            (bool refund,) = payable(msg.sender).call{value: msg.value - price}("");
            require(refund, "Refund failed");
        }

        emit FriendPassBought(msg.sender, runner, tokenId, price, supply + 1);
    }

    // ── View helpers ──

    function getShares(address runner, address holder) external view returns (uint256) {
        uint256 tokenId = runnerTokenId[runner];
        if (tokenId == 0) return 0;
        return balanceOf(holder, tokenId);
    }

    function totalShares(address runner) external view returns (uint256) {
        uint256 tokenId = runnerTokenId[runner];
        if (tokenId == 0) return 0;
        return totalSupply[tokenId];
    }

    function hasPass(address user, address runner) external view returns (bool) {
        uint256 tokenId = runnerTokenId[runner];
        if (tokenId == 0) return false;
        return balanceOf(user, tokenId) > 0;
    }

    // ── Admin ──

    function setBasePrice(uint256 _basePrice) external onlyOwner {
        basePrice = _basePrice;
    }

    function setSlope(uint256 _slope) external onlyOwner {
        slope = _slope;
    }

    function setMaxSupply(uint256 _max) external onlyOwner {
        maxSupplyPerRunner = _max;
    }

    function setMaxPerWallet(uint256 _max) external onlyOwner {
        maxPerWallet = _max;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
