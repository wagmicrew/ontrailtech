// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RunnerToken.sol";

contract TGEFactory is Ownable, ReentrancyGuard {
    struct TGEInfo {
        address tokenAddress;
        address runner;
        uint256 totalSupply;
        bool launched;
    }

    mapping(address => TGEInfo) public tgeRecords;
    address public treasury;
    address public dao;

    event TGETriggered(address indexed runner, address tokenAddress, uint256 totalSupply);

    constructor(address _treasury, address _dao) Ownable(msg.sender) {
        treasury = _treasury;
        dao = _dao;
    }

    function triggerTGE(
        address runner,
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) external onlyOwner nonReentrant returns (address) {
        require(!tgeRecords[runner].launched, "TGE already launched");

        RunnerToken token = new RunnerToken(name, symbol, totalSupply, address(this));

        // Allocations: 35% runner, 20% friend pool (held by factory), 25% liquidity, 10% DAO, 10% platform
        uint256 runnerAlloc = (totalSupply * 35) / 100;
        uint256 daoAlloc = (totalSupply * 10) / 100;
        uint256 platformAlloc = (totalSupply * 10) / 100;

        token.transfer(runner, runnerAlloc);
        token.transfer(dao, daoAlloc);
        token.transfer(treasury, platformAlloc);
        // Remaining 45% (friend pool + liquidity) stays in factory for distribution

        tgeRecords[runner] = TGEInfo({
            tokenAddress: address(token),
            runner: runner,
            totalSupply: totalSupply,
            launched: true
        });

        emit TGETriggered(runner, address(token), totalSupply);
        return address(token);
    }
}
