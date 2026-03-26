// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract Treasury is Ownable, ReentrancyGuard, Pausable {
    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor() Ownable(msg.sender) {}

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable whenNotPaused {
        require(msg.value > 0, "Must send ETH");
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner nonReentrant whenNotPaused {
        require(amount <= address(this).balance, "Insufficient balance");
        to.transfer(amount);
        emit Withdrawn(to, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }
}
