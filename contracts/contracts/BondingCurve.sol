// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract BondingCurve is Ownable, ReentrancyGuard, Pausable {
    uint256 public basePrice;
    uint256 public k;

    mapping(address => mapping(address => uint256)) public shares; // runner => investor => amount
    mapping(address => uint256) public totalSupply;
    mapping(address => uint256) public poolBalance;

    event SharesBought(address indexed runner, address indexed buyer, uint256 amount, uint256 cost);
    event SharesSold(address indexed runner, address indexed seller, uint256 amount, uint256 payout);

    constructor(uint256 _basePrice, uint256 _k) Ownable(msg.sender) {
        basePrice = _basePrice;
        k = _k;
    }

    function calculatePrice(address runner, uint256 amount) public view returns (uint256) {
        uint256 supply = totalSupply[runner];
        uint256 total = 0;
        for (uint256 i = 0; i < amount; i++) {
            total += basePrice + k * (supply + i) ** 2;
        }
        return total;
    }

    function buyShares(address runner, uint256 amount) external payable nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(msg.sender != runner, "Cannot buy own shares");
        uint256 cost = calculatePrice(runner, amount);
        require(msg.value >= cost, "Insufficient payment");

        shares[runner][msg.sender] += amount;
        totalSupply[runner] += amount;
        poolBalance[runner] += cost;

        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }
        emit SharesBought(runner, msg.sender, amount, cost);
    }

    function sellShares(address runner, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(shares[runner][msg.sender] >= amount, "Insufficient shares");

        uint256 supply = totalSupply[runner];
        uint256 payout = 0;
        for (uint256 i = 0; i < amount; i++) {
            payout += basePrice + k * (supply - 1 - i) ** 2;
        }
        require(poolBalance[runner] >= payout, "Insufficient pool");

        shares[runner][msg.sender] -= amount;
        totalSupply[runner] -= amount;
        poolBalance[runner] -= payout;

        payable(msg.sender).transfer(payout);
        emit SharesSold(runner, msg.sender, amount, payout);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
