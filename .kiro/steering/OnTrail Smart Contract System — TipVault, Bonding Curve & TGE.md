---
inclusion: always
---
<!------------------------------------------------------------------------------------
   Add rules to this file or a short description and have Kiro refine them for you.
   
   Learn about inclusion modes: https://kiro.dev/docs/steering/#inclusion-modes
-------------------------------------------------------------------------------------> 

# OnTrail Smart Contract System — TipVault, Bonding Curve & TGE

## Version: 1.0

## Date: 2026-03-26

---

# 1. System Overview

This system handles:

* Tip collection (non-withdrawable)
* Token creation (TGE)
* Bonding curve pricing
* Revenue distribution (Owner + NFTs + DAO)

---

# 2. Core Contracts

## 2.1 TipVault

### Purpose

* Collect tips
* Track per-runner balances
* Trigger TGE

---

### Storage

```solidity
struct RunnerVault {
    uint256 totalTips;
    bool launched;
    address token;
}

mapping(address => RunnerVault) public runnerVaults;
```

---

### Tip Function

```solidity
function tipRunner(address runner) external payable {
    require(msg.value > 0, "No tip");

    uint256 ownerFee = (msg.value * OWNER_FEE) / 100;
    uint256 net = msg.value - ownerFee;

    // Send fee to protocol owner
    payable(ancientOwner).transfer(ownerFee);

    // Store remaining in vault
    runnerVaults[runner].totalTips += net;

    emit TipReceived(msg.sender, runner, net);

    // Auto-trigger TGE
    if (runnerVaults[runner].totalTips >= TGE_THRESHOLD) {
        _triggerTGE(runner);
    }
}
```

---

## 2.2 TGE Trigger

```solidity
function _triggerTGE(address runner) internal {
    RunnerVault storage vault = runnerVaults[runner];
    require(!vault.launched, "Already launched");

    vault.launched = true;

    // Create token
    address token = factory.createRunnerToken(runner);
    vault.token = token;

    // Initialize bonding curve
    bondingCurve.initialize(token, runner, vault.totalTips);

    emit TGECreated(runner, token, vault.totalTips);
}
```

---

# 3. Runner Token (ERC-20)

## Requirements

* Mintable by bonding curve only
* Fixed name per runner
* Example:

  * RUNNER_HANSEN
  * symbol: HANSEN

---

## Minimal Structure

```solidity
contract RunnerToken is ERC20 {
    address public bondingCurve;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        require(msg.sender == bondingCurve, "Unauthorized");
        _mint(to, amount);
    }
}
```

---

# 4. Bonding Curve Contract

## 4.1 State

```solidity
struct Curve {
    uint256 supply;
    uint256 reserve;
    uint256 P0;
    uint256 k;
}

mapping(address => Curve) public curves;
```

---

## 4.2 Initialize

```solidity
function initialize(
    address token,
    address runner,
    uint256 initialReserve
) external {
    Curve storage c = curves[token];

    c.P0 = 1e14; // 0.0001 ETH
    c.k = 5e11;  // slope
    c.reserve = initialReserve;
}
```

---

# 5. Bonding Curve Math

## Price Function

[
P(S) = P_0 + kS
]

---

## Cost Function

[
Cost = P_0 \Delta S + \frac{k}{2}(S_2^2 - S_1^2)
]

---

## Solidity Implementation

```solidity
function getCost(
    address token,
    uint256 amount
) public view returns (uint256) {
    Curve memory c = curves[token];

    uint256 S1 = c.supply;
    uint256 S2 = S1 + amount;

    uint256 cost = (c.P0 * amount) +
        (c.k * (S2 * S2 - S1 * S1)) / 2;

    return cost;
}
```

---

# 6. Buy Function

```solidity
function buy(address token, uint256 amount) external payable {
    Curve storage c = curves[token];

    uint256 cost = getCost(token, amount);
    require(msg.value >= cost, "Insufficient ETH");

    // Fees
    uint256 ownerFee = (cost * OWNER_FEE) / 100;
    uint256 daoFee = (cost * DAO_FEE) / 100;
    uint256 founderFee = (cost * FOUNDER_FEE) / 100;

    // Distribute
    payable(ancientOwner).transfer(ownerFee);
    payable(founderDAO).transfer(daoFee);
    payable(ancientNFTPool).transfer(founderFee);

    uint256 net = cost - ownerFee - daoFee - founderFee;

    // Update reserve
    c.reserve += net;
    c.supply += amount;

    // Mint tokens
    RunnerToken(token).mint(msg.sender, amount);

    emit Buy(msg.sender, token, amount, cost);
}
```

---

# 7. Reputation Integration

## Off-chain → On-chain

Backend provides:

```text
R = reputation (0 → 1)
```

Signed using EIP-712

---

## Adjusted Slope

```solidity
uint256 adjustedK = baseK * (1 + beta * R);
```

---

## Use in pricing

Replace:

```solidity
c.k
```

with:

```solidity
adjustedK
```

---

# 8. Token Distribution from Tips

When TGE happens:

## Allocation

* 70% → bonding curve liquidity
* 20% → tippers
* 10% → ecosystem (DAO + NFTs)

---

## Tipper Distribution

```solidity
mapping(address => uint256) public tipperContributions;
```

Each tipper gets:

[
tokens = \frac{userContribution}{totalTips} \times allocation
]

---

# 9. DAO + NFT Pools

## Ancient NFT Pool

* receives % of all buys

## Founders DAO

* receives % of all buys

## Implementation

* simple treasury contracts
* upgrade later to governance

---

# 10. Security Requirements

## MUST HAVE

* ReentrancyGuard
* SafeMath (or Solidity 0.8+)
* Access control (Ownable)

---

## Edge Cases

* Prevent double TGE
* Prevent zero-value buys
* Handle rounding errors

---

# 11. Gas Optimization

* Use uint128 where possible
* Cache storage variables
* Avoid loops in distribution

---

# 12. Events

```solidity
event TipReceived(address user, address runner, uint256 amount);
event TGECreated(address runner, address token, uint256 liquidity);
event Buy(address user, address token, uint256 amount, uint256 cost);
```

---

# 13. Future Extensions

* Sell function (optional)
* Uniswap auto-liquidity
* ZK reputation proofs
* Anti-bot throttling

---

# Final Summary

This system ensures:

* Tips → locked capital
* Capital → token launch
* Tokens → bonding curve economy
* Reputation → price acceleration
* Fees → sustainable protocol

---

## Core Principle

> No extraction. Only value creation and capitalization.
