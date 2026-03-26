// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract FriendShares is Ownable {
    mapping(address => mapping(address => uint256)) public shares;
    mapping(address => uint256) public totalShares;

    event SharesUpdated(address indexed runner, address indexed holder, uint256 amount);

    constructor() Ownable(msg.sender) {}

    function setShares(address runner, address holder, uint256 amount) external onlyOwner {
        shares[runner][holder] = amount;
        emit SharesUpdated(runner, holder, amount);
    }

    function getShares(address runner, address holder) external view returns (uint256) {
        return shares[runner][holder];
    }
}
