// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract RunnerToken is ERC20, Ownable, Pausable {
    constructor(string memory name, string memory symbol, uint256 totalSupply, address runner)
        ERC20(name, symbol) Ownable(msg.sender)
    {
        _mint(runner, totalSupply);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
