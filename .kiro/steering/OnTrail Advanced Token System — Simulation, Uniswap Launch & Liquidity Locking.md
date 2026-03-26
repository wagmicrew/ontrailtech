---
inclusion: always
---
<!------------------------------------------------------------------------------------
   Add rules to this file or a short description and have Kiro refine them for you.
   
   Learn about inclusion modes: https://kiro.dev/docs/steering/#inclusion-modes
-------------------------------------------------------------------------------------> 

# OnTrail Advanced Token System — Simulation, Uniswap Launch & Liquidity Locking

## Version: 1.0

## Date: 2026-03-26

---

# 1. Token Economy Simulation

## 1.1 Purpose

Simulate:

* price growth
* user entry points
* market cap at TGE
* fairness of distribution

---

## 1.2 Base Curve

[
P(S) = P_0 + kS
]

---

## 1.3 Key Parameters

| Parameter             | Value (Start) |
| --------------------- | ------------- |
| P0                    | 0.0001 ETH    |
| k                     | 0.0000005     |
| TGE Threshold         | 1 ETH         |
| Initial Supply Target | 10,000 tokens |

---

## 1.4 Example Simulation

### Early Phase

* User A buys 100 tokens
  → very cheap (~0.01 ETH)

### Mid Phase

* User B buys 500 tokens
  → price rising

### Pre-TGE

* Total tips = 1 ETH
* Supply ≈ 8,000–12,000 tokens

---

## 1.5 Market Cap at Launch

[
MarketCap = P(S) \cdot S
]

Expected:

* ~2–5 ETH market cap at TGE

---

## 1.6 Key Insight

* Early users get best price
* Curve ensures organic growth
* No dead liquidity phase

---

# 2. Uniswap v3 Launch System

## 2.1 Trigger

On TGE:

```text
if runner_tip_balance >= threshold → launch pool
```

---

## 2.2 Contracts Needed

* UniswapV3Factory
* NonfungiblePositionManager
* WETH (Base)

---

## 2.3 Pool Creation

```solidity
function createPool(address token) internal {
    address pool = IUniswapV3Factory(factory).createPool(
        token,
        WETH,
        3000 // 0.3% fee tier
    );
}
```

---

## 2.4 Initial Price

Price must match bonding curve end price:

[
P_{launch} = P(S_{current})
]

---

## 2.5 Liquidity Allocation

From TipVault:

* 60% → liquidity pool
* 40% → bonding curve reserve

---

## 2.6 Add Liquidity

```solidity
function addLiquidity(
    address token,
    uint256 tokenAmount,
    uint256 ethAmount
) internal {
    INonfungiblePositionManager(manager).mint(
        MintParams({
            token0: token,
            token1: WETH,
            fee: 3000,
            tickLower: MIN_TICK,
            tickUpper: MAX_TICK,
            amount0Desired: tokenAmount,
            amount1Desired: ethAmount,
            recipient: address(this),
            deadline: block.timestamp
        })
    );
}
```

---

## 2.7 Result

* Token becomes tradable instantly
* Price anchored to bonding curve
* No manual intervention

---

# 3. Liquidity Locking System

## 3.1 Purpose

* Prevent rug pulls
* Build trust
* Signal long-term commitment

---

## 3.2 LP NFT Handling

Uniswap v3 returns:

* LP position NFT

---

## 3.3 Lock Contract

```solidity
struct Lock {
    uint256 tokenId;
    uint256 unlockTime;
    address owner;
}
```

---

## 3.4 Lock Logic

```solidity
function lockLP(uint256 tokenId, uint256 duration) external {
    locks[tokenId] = Lock({
        tokenId: tokenId,
        unlockTime: block.timestamp + duration,
        owner: msg.sender
    });
}
```

---

## 3.5 Unlock

```solidity
function unlock(uint256 tokenId) external {
    Lock memory l = locks[tokenId];

    require(block.timestamp >= l.unlockTime, "Still locked");
    require(msg.sender == l.owner, "Not owner");

    delete locks[tokenId];
}
```

---

## 3.6 Recommended Lock Duration

* Minimum: 30 days
* Recommended: 90–180 days

---

# 4. TGE Flow (Full Lifecycle)

## Step-by-step

1. Users tip runner
2. Tips accumulate in TipVault
3. Threshold reached
4. Token deployed
5. Bonding curve initialized
6. Liquidity pool created
7. LP locked
8. Token becomes tradable

---

# 5. Distribution Summary

## From Tips

* 60% → liquidity
* 40% → curve reserve

---

## From Buys

* 2% → Ancient Owner
* 2% → Founders DAO
* 2% → Ancient NFT Pool

---

# 6. Anti-Rug Guarantees

* LP locked
* No owner minting
* Fixed bonding curve rules
* Transparent fees

---

# 7. Optional Enhancements

## 7.1 Auto-liquidity expansion

* allocate % of buys to LP

## 7.2 Dynamic fee tiers

* higher fees early
* lower fees later

## 7.3 Reputation-based launch boost

* higher rep → more initial liquidity

---

# 8. Final System Behavior

## Before TGE

* tips build capital
* no token exists

## At TGE

* token created
* liquidity injected
* trading begins

## After TGE

* bonding curve + AMM coexist
* market decides price

---

# Final Principle

> Every token launch is backed by real user demand, locked capital, and provable activity.
