// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RunnerToken (EVM stub — canonical token is Solana SPL)
 *
 * @notice The canonical RunnerToken lives on Solana as an SPL token deployed
 *         via pump.fun's bonding curve programme.
 *         - Each runner gets their own SPL mint (1 billion tokens, 6 decimals).
 *         - Bonding curve runs until ~85% of supply is sold, then pump.fun
 *           automatically migrates liquidity to a Raydium AMM pool.
 *         - See contracts/scripts/runner-token-solana.ts for deployment helpers.
 *
 *         This EVM contract is kept for EVM bridging scenarios only.
 */

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

