---
inclusion: always
---
<!------------------------------------------------------------------------------------
   Add rules to this file or a short description and have Kiro refine them for you.
   
   Learn about inclusion modes: https://kiro.dev/docs/steering/#inclusion-modes
-------------------------------------------------------------------------------------> 

# OnTrail FriendPass System (Friend-Fi Engine)

## Kiro Steering Document (Inclusion Mode)

## Version: 1.0

## Date: 2026-03-26

---

# 1. Objective

Define the FriendPass system as:

* A social-financial primitive
* A viral growth driver
* A capital formation mechanism for runner tokens

---

# 2. Core Concept

FriendPass is:

> A limited-access NFT tied to a runner that grants early financial and social advantages.

It is NOT:

* a collectible NFT
* a passive asset

It IS:

* access
* status
* early positioning

---

# 3. Design Principles

## MUST

* Be simple to understand
* Be fast to purchase
* Create scarcity and urgency
* Directly contribute to runner token formation

---

## MUST NOT

* Allow withdrawals to runner
* Be unlimited supply
* Be purely cosmetic

---

# 4. Contract Architecture

## 4.1 Standard

* ERC-1155 (multi-token per runner)

---

## 4.2 Model

* One global contract
* Each runner = one tokenId

---

## 4.3 Mapping

```text
tokenId → runner address
runner → tokenId
```

---

# 5. Supply Model

Each runner has:

* Fixed max supply (e.g. 50–200)
* Increasing mint price
* One-way mint (no burn in MVP)

---

# 6. Pricing Model

## Linear Pricing

Price increases per mint:

[
Price(n) = basePrice + slope \cdot n
]

---

## Behavior

* early buyers → cheapest
* late buyers → expensive
* creates FOMO

---

# 7. Mint Flow

## User Action

1. User visits:

   ```
   runnername.ontrail.tech
   ```

2. Clicks:

   ```
   Buy FriendPass
   ```

3. Transaction:

   * pays ETH
   * receives NFT

---

## Contract Behavior

* validates supply
* calculates dynamic price
* mints ERC-1155 token
* distributes funds

---

# 8. Revenue Distribution

## Split

* 70% → Runner TipVault (locked for TGE)
* 20% → Founders DAO
* 10% → Ancient Owner

---

## Rules

* Runner cannot withdraw funds
* Funds only used for:

  * token launch
  * bonding curve liquidity

---

# 9. Utility

FriendPass grants:

## Financial

* early bonding curve access
* better entry price

---

## Social

* visible supporter status
* stronger profile signal

---

## Functional

* unlock routes / POIs
* exclusive events

---

# 10. Reputation Impact

FriendPass contributes to reputation.

## Rule

* holding passes increases reputation score

---

## Suggested Model

[
Boost = \log(1 + passesHeld)
]

---

## Constraints

* diminishing returns
* prevents farming

---

# 11. Access Control

## Contract Function

```text
hasPass(user, runner) → bool
```

---

## Usage

* gate early token access
* unlock premium features

---

# 12. Anti-Whale Rules

## MUST

* limit max passes per wallet

Example:

```
max 3–5 per user
```

---

## Purpose

* fair distribution
* prevents domination

---

# 13. UX Requirements

## Display on Profile Page

* current supply (e.g. 23/100)
* current price
* next price
* benefits

---

## CTA

```
Buy FriendPass
```

---

## Messaging

* “Early access”
* “Limited supply”
* “Support this runner”

---

# 14. Viral Mechanics

FriendPass drives growth through:

* scarcity (limited supply)
* price increase (FOMO)
* social signaling (public ownership)

---

## Loop

1. User shares profile
2. New user visits
3. Buys FriendPass
4. Runner value increases
5. More users join

---

# 15. Integration Points

## With TipVault

* all revenue routed to runner TGE pool

---

## With Bonding Curve

* holders get early or better pricing

---

## With Reputation

* boosts reputation score

---

# 16. Constraints

## MUST

* no withdrawals for runner
* transparent pricing
* predictable behavior

---

## MUST NOT

* allow price manipulation
* allow unlimited minting
* allow hidden fees

---

# 17. Future Extensions

* secondary marketplace
* staking FriendPass
* DAO-based access control
* dynamic pricing curves

---

# 18. Final Principle

> FriendPass is the first step in turning social attention into financial value.
